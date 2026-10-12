import test from "node:test";
import assert from "node:assert/strict";
import {
  PwaRetirementGate,
  PwaRetirementGateError,
  ALLOWED_RETIRED_PATHS,
  PROTECTED_RETAINED_PATTERNS,
  type RetirementChangeset,
} from "../src/pwa_retirement.js";
import type { DrainDisposition } from "../src/browser_drain.js";

test("PWA Retirement Gate: blocks retirement if any un-drained items remain pending", () => {
  const incompleteDispositions: DrainDisposition[] = [
    {
      recordId: "rec-001",
      store: "outbox",
      action: "acknowledged_and_archived",
      reason: "Drained successfully",
    },
    {
      recordId: "rec-002",
      store: "outbox",
      action: "retained_pending",
      reason: "Network timeout; retained in IndexedDB",
    },
  ];

  assert.throws(
    () => PwaRetirementGate.verifyDrainPrerequisites(incompleteDispositions),
    (err: any) => {
      assert.ok(err instanceof PwaRetirementGateError);
      assert.ok(err.message.includes("1 unsynchronized records remain pending"));
      return true;
    }
  );
});

test("PWA Retirement Gate: approves retirement when 100% of outbox records are drained", () => {
  const completeDispositions: DrainDisposition[] = [
    {
      recordId: "rec-001",
      store: "outbox",
      action: "acknowledged_and_archived",
      reason: "Server acknowledged with seq 101",
    },
    {
      recordId: "rec-002",
      store: "outbox",
      action: "skipped_already_synced",
      reason: "Already synced",
    },
    {
      recordId: "query-old",
      store: "queries",
      action: "discarded_stale",
      reason: "Age > 7 days",
    },
    {
      recordId: "leg-001",
      store: "legacy_queue",
      action: "legacy_mapped_and_drained",
      reason: "Mapped to expense envelope",
    },
  ];

  const result = PwaRetirementGate.verifyDrainPrerequisites(completeDispositions);
  assert.equal(result.isSafeToRetire, true);
  assert.equal(result.retainedPendingCount, 0);
  assert.equal(result.drainedCount, 4);
});

test("PWA Retirement Gate: validates canonical changeset against allowed field paths", () => {
  const canonicalChangeset = PwaRetirementGate.getCanonicalRetirementChangeset();
  const audit = PwaRetirementGate.auditChangeset(canonicalChangeset);

  assert.equal(audit.isValid, true);
  assert.equal(audit.violations.length, 0);
  assert.equal(audit.approvedFiles.length, canonicalChangeset.changes.length);
});

test("PWA Retirement Gate: rejects changesets attempting to retire protected web surfaces", () => {
  const maliciousChangeset: RetirementChangeset = {
    id: "ILLEGAL-CHANGE",
    name: "Illegal Removal of Office Surface",
    description: "Touches protected office surfaces",
    changes: [
      {
        path: "src/app/admin/field-submissions/page.tsx",
        action: "delete",
        diffSummary: "Illegal delete of office review dashboard",
      },
      {
        path: "src/components/worksheet/virtual-grid.tsx",
        action: "delete",
        diffSummary: "Illegal delete of worksheet grid",
      },
      {
        path: "src/lib/pdf-canvas/renderer.ts",
        action: "delete",
        diffSummary: "Illegal delete of PDF canvas takeoff",
      },
      {
        path: "src/lib/field-outbox.ts",
        action: "delete",
        diffSummary: "Valid delete of outbox",
      },
    ],
  };

  const audit = PwaRetirementGate.auditChangeset(maliciousChangeset);
  assert.equal(audit.isValid, false);
  assert.equal(audit.violations.length, 3);
  assert.ok(audit.violations.some((v) => v.includes("field-submissions")));
  assert.ok(audit.violations.some((v) => v.includes("virtual-grid")));
  assert.ok(audit.violations.some((v) => v.includes("pdf-canvas")));
  assert.equal(audit.approvedFiles.length, 1);
  assert.equal(audit.approvedFiles[0], "src/lib/field-outbox.ts");
});

test("PWA Retirement Gate: verifies service worker cleanup removes field sync while keeping asset caching", () => {
  const dirtySw = `
    self.addEventListener("install", (e) => {
      e.waitUntil(caches.open("v1").then((c) => c.addAll(["/"])));
    });
    self.addEventListener("activate", (e) => {});
    self.addEventListener("sync", (event) => {
      if (event.tag === "cm-field-outbox") {
        runFlush();
      }
    });
    function runFlush() { /* flush cm-field-outbox */ }
  `;

  const dirtyAudit = PwaRetirementGate.verifyServiceWorkerCleanup(dirtySw);
  assert.equal(dirtyAudit.isSanitized, false);
  assert.equal(dirtyAudit.hasFieldSyncArtifacts, true);
  assert.ok(dirtyAudit.detectedViolations.length >= 2);

  const cleanedSw = `
    self.addEventListener("install", (e) => {
      e.waitUntil(caches.open("v1").then((c) => c.addAll(["/"])));
    });
    self.addEventListener("activate", (e) => {});
    self.addEventListener("fetch", (event) => {
      event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
    });
  `;

  const cleanAudit = PwaRetirementGate.verifyServiceWorkerCleanup(cleanedSw);
  assert.equal(cleanAudit.isSanitized, true);
  assert.equal(cleanAudit.hasFieldSyncArtifacts, false);
  assert.equal(cleanAudit.hasStaticCaching, true);
  assert.equal(cleanAudit.hasLifecycleHandlers, true);
  assert.equal(cleanAudit.detectedViolations.length, 0);
});

test("PWA Retirement Gate: documents rollback protocol and data continuity guarantees", () => {
  const protocol = PwaRetirementGate.getRollbackProtocol();
  assert.ok(protocol.revertCommand.includes("git revert"));
  assert.ok(protocol.databasePolicy.includes("cm-field-outbox"));
  assert.ok(protocol.dataContinuityGuarantee.includes("Flutter native client"));
  assert.ok(protocol.steps.length >= 5);
});
