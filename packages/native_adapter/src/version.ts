/**
 * Minimal zero-dependency semver handling for adapter protocol versions.
 *
 * Versions follow the platform_contracts release policy (see
 * packages/platform_contracts/CHANGELOG.md): Git tags named
 * `platform-contracts/v<major>.<minor>.<patch>`. Consumers pin an exact tag.
 * This module never imports tRPC or any domain code — it is boundary plumbing.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse a strict `MAJOR.MINOR.PATCH` string. Returns null when malformed. */
export function parseVersion(raw: unknown): SemVer | null {
  if (typeof raw !== "string") return null;
  const m = SEMVER_RE.exec(raw);
  if (!m) return null;
  const [major, minor, patch] = [m[1], m[2], m[3]].map((s) => parseInt(s, 10));
  return { major, minor, patch };
}

export function formatVersion(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** -1 if a < b, 0 if equal, 1 if a > b (numeric field order). */
export function compareVersions(a: SemVer, b: SemVer): -1 | 0 | 1 {
  for (const field of ["major", "minor", "patch"] as const) {
    if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
  }
  return 0;
}

/** Contract tag name for a version, per the platform_contracts release policy. */
export function contractTag(v: SemVer): string {
  return `platform-contracts/v${formatVersion(v)}`;
}
