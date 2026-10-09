/**
 * Crash-report sanitization (M03-T08) — the fail-safe gate every Dart,
 * native, and Rust panic path reports through.
 *
 * Rules (tested per component):
 *   - drop-first, never pass-through: only allow-listed attribute keys
 *     survive; every surviving value is scrubbed of secret-like substrings
 *     and length-capped.
 *   - stack FRAMES never export — only the frame count.
 *   - the message is reduced to its safe prefix with secret-like substrings
 *     redacted; payload-like content (long token runs, JSON bodies, private
 *     draft markers) cannot ride through.
 *   - a malformed context is STILL reduced to the safe shape (fail-safe).
 */

import {
  CRASH_ATTRIBUTE_MAX_LEN,
  CRASH_SAFE_ATTRIBUTE_KEYS,
  RawCrashContext,
  SanitizedCrashReport,
  observabilityError,
} from "./contract.js";

/**
 * Secret-like substrings redacted from any surviving text. Same vocabulary
 * discipline as the M03-T02 identity package's `redactSecret` (re-declared
 * for zero-dep isolation; the mount may bind that implementation).
 */
const SECRET_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{20,}/g,        // GitHub tokens
  /gho_[A-Za-z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9._\-]{10,}/gi,
  /eyJ[A-Za-z0-9._\-]{20,}/g,     // JWT segments
  /[A-Fa-f0-9]{32,}/g,            // long hex secrets
  /password[=:]\S+/gi,
  /refresh[_-]?token[=:]\S+/gi,
  /access[_-]?token[=:]\S+/gi,
];

/** Payload-like content: JSON bodies and long opaque runs. */
const PAYLOAD_LIKE: RegExp[] = [
  /\{[\s\S]{20,}\}/g,             // JSON-ish bodies
  /"[a-zA-Z_]+"\s*:\s*"[^"]{24,}"/g,
];

export function redactSecret(text: string): string {
  let out = text;
  for (const p of SECRET_PATTERNS) out = out.replace(p, "[REDACTED]");
  for (const p of PAYLOAD_LIKE) out = out.replace(p, "[PAYLOAD]");
  return out;
}

function safeAttribute(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const t = typeof value === "string" ? value : JSON.stringify(value);
  if (t === undefined) return null;
  return redactSecret(t).slice(0, CRASH_ATTRIBUTE_MAX_LEN);
}

/** Redact payload bodies and secrets, THEN cap — order matters (tested). */
function safeMessage(message: string): string {
  return redactSecret(message).slice(0, 160);
}

/**
 * Reduce ANY captured crash context to the sanitized report shape.
 * Throws `misconfigured` only when the context is not even an object —
 * the caller then reports the minimal component-free fallback.
 */
export function scrubCrashReport(raw: RawCrashContext): SanitizedCrashReport {
  if (typeof raw !== "object" || raw === null) {
    throw observabilityError("misconfigured", "crash context must be an object");
  }
  const component = raw.component === "dart" || raw.component === "native" || raw.component === "rust" ? raw.component : "native";
  const attributes: Record<string, string> = {};
  const attrs = typeof raw.attributes === "object" && raw.attributes !== null ? raw.attributes : {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!CRASH_SAFE_ATTRIBUTE_KEYS.has(k)) continue; // drop-first
    const safe = safeAttribute(v);
    if (safe !== null) attributes[k] = safe;
  }
  return {
    component,
    errorKind: redactSecret(String(raw.errorKind ?? "unknown")).slice(0, 64),
    message: safeMessage(String(raw.message ?? "")),
    frameCount: Array.isArray(raw.frames) ? raw.frames.length : 0,
    attributes,
    appVersion: redactSecret(String(raw.appVersion ?? "")).slice(0, 32),
    schemaVersion: redactSecret(String(raw.schemaVersion ?? "")).slice(0, 32),
    occurredAtMs: Number.isFinite(raw.occurredAtMs) ? raw.occurredAtMs : 0,
  };
}

/** Minimal fallback when even the context cannot be scrubbed. */
export function fallbackCrashReport(component: CrashFallbackComponent, occurredAtMs: number): SanitizedCrashReport {
  return {
    component,
    errorKind: "unreportable",
    message: "[REDACTED]",
    frameCount: 0,
    attributes: {},
    appVersion: "",
    schemaVersion: "",
    occurredAtMs,
  };
}

export type CrashFallbackComponent = "dart" | "native" | "rust";
