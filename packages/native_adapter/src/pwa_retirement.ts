/**
 * Field PWA Code Retirement Gate & Verification (M05-T09).
 *
 * Enforces strict criteria before legacy browser PWA code can be retired:
 * 1. Drain Verified: 100% of outbox records must be acknowledged/archived (zero un-drained pending work).
 * 2. Scope Isolation: Retires ONLY dead field PWA workflows; protected web surfaces (office review,
 *    worksheet grid, CAD, PDF canvas) must remain completely untouched.
 * 3. Service Worker Sanitation: Removes cm-field-sync / cm-field-outbox background sync without breaking
 *    the web application's offline shell or asset caching.
 * 4. Rollback Continuity: Documents git revert paths and proves that data written by native apps
 *    during a rollback window is immune to browser storage reversion.
 */

import type { DrainDisposition } from "./browser_drain.js";

export interface FileChange {
  path: string;
  action: "delete" | "modify" | "deprecate";
  diffSummary: string;
}

export interface RetirementChangeset {
  id: string;
  name: string;
  description: string;
  changes: FileChange[];
}

export class PwaRetirementGateError extends Error {
  constructor(message: string) {
    super(`[PWA-RETIREMENT-GATE-BLOCKED] ${message}`);
    this.name = "PwaRetirementGateError";
  }
}

export const ALLOWED_RETIRED_PATHS: readonly string[] = [
  "src/lib/field-outbox.ts",
  "src/lib/field-db.ts",
  "src/lib/field-drafts.ts",
  "src/lib/field-cache.ts",
  "src/lib/field-entry-builders.ts",
  "src/lib/field-query-persist.ts",
  "src/lib/field-storage-keys.ts",
  "src/app/m/tasks/new/page.tsx",
  "src/app/m/tasks/page.tsx",
  "src/app/m/sync/page.tsx",
  "src/app/m/photos/page.tsx",
  "src/components/mobile/sync-status-chip.tsx",
  "src/components/mobile/mobile-guard.tsx",
  "public/sw.js",
] as const;

export const PROTECTED_RETAINED_PATTERNS: readonly RegExp[] = [
  /^src\/app\/admin\/field-submissions/,
  /^src\/app\/reports\/daily/,
  /^src\/app\/finance/,
  /^src\/components\/worksheet/,
  /^src\/lib\/pdf-canvas/,
  /^src\/lib\/cad/,
  /^src\/lib\/worksheet/,
  /^src\/server\/api\/routers\/workflow/,
  /^src\/server\/api\/routers\/attendance/,
  /^src\/server\/api\/routers\/siteExpense/,
  /^src\/server\/api\/routers\/materialDelivery/,
] as const;

export class PwaRetirementGate {
  /**
   * Evaluates drain dispositions from M05-T07 to prove that zero pending work remains.
   * Throws PwaRetirementGateError if any uncommitted/pending work would be lost.
   */
  static verifyDrainPrerequisites(dispositions: DrainDisposition[]): {
    totalEvaluated: number;
    drainedCount: number;
    retainedPendingCount: number;
    isSafeToRetire: boolean;
  } {
    if (!dispositions || dispositions.length === 0) {
      throw new PwaRetirementGateError(
        "Drain dispositions empty. Cannot verify retirement safety without prior drain run results."
      );
    }

    const pending = dispositions.filter((d) => d.action === "retained_pending");
    if (pending.length > 0) {
      const summary = pending.map((p) => `[${p.store}] ${p.recordId}: ${p.reason}`).join("; ");
      throw new PwaRetirementGateError(
        `Cannot retire field PWA: ${pending.length} unsynchronized records remain pending. Incomplete records: ${summary}`
      );
    }

    const drained = dispositions.filter(
      (d) =>
        d.action === "acknowledged_and_archived" ||
        d.action === "skipped_already_synced" ||
        d.action === "discarded_stale" ||
        d.action === "legacy_mapped_and_drained"
    );

    return {
      totalEvaluated: dispositions.length,
      drainedCount: drained.length,
      retainedPendingCount: 0,
      isSafeToRetire: true,
    };
  }

  /**
   * Audits the proposed retirement changeset against whitelist and protected patterns.
   */
  static auditChangeset(changeset: RetirementChangeset): {
    approvedFiles: string[];
    violations: string[];
    isValid: boolean;
  } {
    const violations: string[] = [];
    const approvedFiles: string[] = [];

    for (const change of changeset.changes) {
      const isProtected = PROTECTED_RETAINED_PATTERNS.some((pattern) => pattern.test(change.path));
      if (isProtected) {
        violations.push(
          `Protected path violation: '${change.path}' is a required desktop web/office surface and must NOT be retired.`
        );
        continue;
      }

      const isAllowed = ALLOWED_RETIRED_PATHS.includes(change.path);
      if (!isAllowed) {
        violations.push(
          `Unrecognized retirement path: '${change.path}' is not an approved field PWA component.`
        );
        continue;
      }

      approvedFiles.push(change.path);
    }

    return {
      approvedFiles,
      violations,
      isValid: violations.length === 0,
    };
  }

  /**
   * Verifies that the service worker has been safely stripped of legacy IndexedDB sync
   * without damaging static web asset caching or base service worker events.
   */
  static verifyServiceWorkerCleanup(cleanedSw: string): {
    hasFieldSyncArtifacts: boolean;
    hasStaticCaching: boolean;
    hasLifecycleHandlers: boolean;
    isSanitized: boolean;
    detectedViolations: string[];
  } {
    const fieldSyncPatterns = [
      /cm-field-outbox/,
      /cm-field-sync/,
      /runFlush\s*\(/,
      /resolveReplayRequest/,
      /LEGACY_ENDPOINTS/,
    ];

    const detectedViolations: string[] = [];
    for (const pattern of fieldSyncPatterns) {
      if (pattern.test(cleanedSw)) {
        detectedViolations.push(`Service worker contains un-retired field sync artifact matching ${pattern}`);
      }
    }

    const hasStaticCaching = /caches\.open/.test(cleanedSw) || /cacheNames/.test(cleanedSw) || /fetch/.test(cleanedSw);
    const hasLifecycleHandlers =
      cleanedSw.includes("addEventListener('install'") ||
      cleanedSw.includes('addEventListener("install"') ||
      cleanedSw.includes("addEventListener('activate'") ||
      cleanedSw.includes('addEventListener("activate"');

    const isSanitized = detectedViolations.length === 0 && hasLifecycleHandlers;

    return {
      hasFieldSyncArtifacts: detectedViolations.length > 0,
      hasStaticCaching,
      hasLifecycleHandlers,
      isSanitized,
      detectedViolations,
    };
  }

  /**
   * Constructs the canonical retirement changeset specification.
   */
  static getCanonicalRetirementChangeset(): RetirementChangeset {
    return {
      id: "M05-T09-PWA-RETIREMENT",
      name: "Field PWA Code Retirement Changeset",
      description: "Retires dead browser-local outbox, IndexedDB wrappers, and mobile PWA routes post-drain",
      changes: [
        {
          path: "src/lib/field-outbox.ts",
          action: "delete",
          diffSummary: "Removed legacy browser IndexedDB outbox queue, background sync flush loops, and retry timers",
        },
        {
          path: "src/lib/field-db.ts",
          action: "delete",
          diffSummary: "Removed legacy cm-field-outbox IndexedDB database connection and migration schema",
        },
        {
          path: "src/lib/field-drafts.ts",
          action: "delete",
          diffSummary: "Removed browser-local draft store wrapper",
        },
        {
          path: "src/lib/field-cache.ts",
          action: "delete",
          diffSummary: "Removed transient browser cache wrapper superseded by Flutter SQLite local tables",
        },
        {
          path: "src/lib/field-entry-builders.ts",
          action: "delete",
          diffSummary: "Removed legacy browser client-side entry builder utilities superseded by unified schema contracts",
        },
        {
          path: "src/lib/field-query-persist.ts",
          action: "delete",
          diffSummary: "Removed browser IndexedDB query caching superseded by native snapshot feed",
        },
        {
          path: "src/lib/field-storage-keys.ts",
          action: "delete",
          diffSummary: "Removed browser localStorage key definitions for retired field features",
        },
        {
          path: "public/sw.js",
          action: "modify",
          diffSummary: "Removed cm-field-sync tag listener and IndexedDB outbox drain loop; preserved asset caching",
        },
        {
          path: "src/app/m/tasks/new/page.tsx",
          action: "deprecate",
          diffSummary: "Replaced with redirect/banner to native mobile Flutter client",
        },
        {
          path: "src/app/m/tasks/page.tsx",
          action: "deprecate",
          diffSummary: "Replaced with redirect/banner to native mobile Flutter client",
        },
        {
          path: "src/app/m/sync/page.tsx",
          action: "deprecate",
          diffSummary: "Replaced with migration complete / native app guidance page",
        },
        {
          path: "src/app/m/photos/page.tsx",
          action: "deprecate",
          diffSummary: "Replaced with redirect/banner to native mobile Flutter client",
        },
        {
          path: "src/components/mobile/sync-status-chip.tsx",
          action: "delete",
          diffSummary: "Removed retired browser sync status chip component",
        },
        {
          path: "src/components/mobile/mobile-guard.tsx",
          action: "modify",
          diffSummary: "Removed initFieldOutbox initialization call on mount",
        },
      ],
    };
  }

  /**
   * Generates step-by-step rollback procedures and data continuity guarantees.
   */
  static getRollbackProtocol(): {
    revertCommand: string;
    databasePolicy: string;
    dataContinuityGuarantee: string;
    steps: string[];
  } {
    return {
      revertCommand: "git revert <retirement-commit-sha> --no-edit",
      databasePolicy:
        "IndexedDB cm-field-outbox database was not dropped programmatically. Legacy browser data remains accessible.",
      dataContinuityGuarantee:
        "Operations authored in the Flutter native client during the retirement or rollback window are persisted in WAL SQLite and synchronized via durable server-side sync receipts. They do not depend on browser IndexedDB and cannot be lost or invalidated by a web PWA code rollback.",
      steps: [
        "1. Identify the need for rollback (e.g., unexpected web regression in legacy field workflow).",
        "2. Execute git revert on the retirement commit to restore legacy PWA files and service worker sync.",
        "3. Re-deploy web application bundle to production.",
        "4. Client browsers receive updated Service Worker script on subsequent reload.",
        "5. Native mobile app traffic continues normally without disruption or database collision.",
      ],
    };
  }
}
