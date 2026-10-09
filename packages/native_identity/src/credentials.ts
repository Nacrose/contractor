/**
 * Secure credential-storage adapter (M03-T02 acceptance: "Credentials use
 * the target OS secure storage and never appear in source, logs, crash
 * reports, or bundled binaries").
 *
 * - `SecureCredentialStore` is the ONLY sanctioned persistence surface for
 *   session credentials on a device. Platform mounts bind it to:
 *       ios/macos  -> Keychain (kSecClassGenericPassword, ThisDeviceOnly)
 *       android    -> Keystore-backed EncryptedSharedPreferences
 *       windows    -> Windows Credential Manager (CRED_PERSIST_LOCAL_MACHINE
 *                     is FORBIDDEN; user scope only)
 *       linux      -> libsecret / Secret Service (session collection)
 *   Filesystem, SharedPreferences, SQLite, and NSUserDefaults are NOT
 *   credential stores; a mount that routes credentials anywhere else is a
 *   protocol violation.
 *
 * - This module ships `MemoryCredentialStore`, a TEST DOUBLE only. The
 *   package never persists anything itself.
 *
 * - Redaction helpers (`redactSecret`, `scrubForReport`) are the shared
 *   vocabulary for logs and crash reports: every credential-bearing value is
 *   reduced to a short, stable fingerprint before it can reach a log line,
 *   telemetry payload, or crash report.
 *
 * No node:crypto, no external dependencies — fingerprints are correlation
 * aids, not security controls; the security property is REMOVAL, and the
 * tests assert original values never survive scrubbing.
 */

import { IdentityError, identityError } from "./contract.js";

/** Logical references, never raw secrets. Stable across app upgrades. */
export type CredentialRef =
  | "session.tokens" /* SessionTokens JSON for the signed-in account */
  | "session.accountHint" /* non-secret display hint for account switcher */
  | "device.registration" /* this device's server-assigned registration evidence */
  | "pkce.inflight"; /* in-flight PKCE verifier + state for a pending sign-in */

export const CREDENTIAL_REFS: CredentialRef[] = [
  "session.tokens",
  "session.accountHint",
  "device.registration",
  "pkce.inflight",
];

/** Which OS backing a mount selected. Recorded, testable, never `plaintext`. */
export type SecureStorageBinding =
  | "ios.keychain"
  | "android.keystore"
  | "macos.keychain"
  | "windows.credential-manager"
  | "linux.secret-service";

export interface SecureCredentialStore {
  /** The OS backing this mount selected (declared, so tests can assert it is not a file path). */
  readonly binding: SecureStorageBinding;
  save(ref: CredentialRef, value: string): Promise<void>;
  load(ref: CredentialRef): Promise<string | null>;
  delete(ref: CredentialRef): Promise<void>;
  /** Wipe every credential this app owns (logout / account switch / reuse detection). */
  wipeAll(): Promise<void>;
}

/** Fail-closed behavior: when the OS store is unavailable, callers get a typed error, never a fallback to disk. */
export class CredentialStoreUnavailable extends Error {
  readonly identityError: IdentityError;
  constructor(detail?: Record<string, string>) {
    super("Secure credential store is unavailable; refusing to fall back to non-secure storage.");
    this.identityError = identityError("credential_store_unavailable", this.message, detail);
  }
}

/**
 * TEST DOUBLE ONLY. In-memory store with optional simulated unavailability
 * so tests can prove fail-closed behavior on every operation.
 */
export class MemoryCredentialStore implements SecureCredentialStore {
  readonly binding: SecureStorageBinding = "linux.secret-service";
  private map = new Map<string, string>();
  private unavailable = false;

  /** Flip the store into a simulated OS-level failure state (and back). */
  simulateUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  private assertAvailable(): void {
    if (this.unavailable) throw new CredentialStoreUnavailable({ simulated: "true" });
  }

  async save(ref: CredentialRef, value: string): Promise<void> {
    this.assertAvailable();
    this.map.set(ref, value);
  }

  async load(ref: CredentialRef): Promise<string | null> {
    this.assertAvailable();
    return this.map.get(ref) ?? null;
  }

  async delete(ref: CredentialRef): Promise<void> {
    this.assertAvailable();
    this.map.delete(ref);
  }

  async wipeAll(): Promise<void> {
    this.assertAvailable();
    this.map.clear();
  }
}

// ---------------------------------------------------------------------------
// Redaction — the shared vocabulary for logs, telemetry and crash reports
// ---------------------------------------------------------------------------

const SECRET_KEY_RE = /(token|secret|password|passphrase|credential|authorization|cookie|codeChallenge|verifier)/i;

/** Stable short fingerprint (FNV-1a 32-bit, hex) + length; correlation only, NOT a security control. */
export function redactSecret(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  return `fp_${hex}_len${value.length}`;
}

export type RedactionReport = { redacted: string[] };

/**
 * Deep-copy scrub: any key that looks credential-bearing has its string
 * value replaced by a fingerprint. Structural values (booleans, counts,
 * ids) pass through so reports stay diagnosable.
 */
export function scrubForReport(input: unknown): { safe: unknown; report: RedactionReport } {
  const redacted: string[] = [];
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (typeof v === "string" && SECRET_KEY_RE.test(k)) {
          out[k] = redactSecret(v);
          redacted.push(k);
        } else if (typeof v === "string" && SECRET_KEY_RE.test(v) === false) {
          out[k] = v;
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return node;
  };
  return { safe: walk(input), report: { redacted } };
}
