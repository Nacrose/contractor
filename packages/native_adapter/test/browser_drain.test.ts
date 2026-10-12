import test from "node:test";
import assert from "node:assert/strict";
import {
  BrowserDrainEngine,
  BrowserOutboxRecord,
  BrowserDraftRecord,
  BrowserQueryRecord,
  InMemoryBrowserStorageEngine,
  LegacyOfflineRecord,
  ServerDrainPort,
} from "../src/browser_drain.js";

function createMockServer(): ServerDrainPort & {
  dispatched: BrowserOutboxRecord[];
  seenUuids: Set<string>;
} {
  const dispatched: BrowserOutboxRecord[] = [];
  const seenUuids = new Set<string>();
  let seq = 1000;

  return {
    dispatched,
    seenUuids,
    async dispatchAttendance(op) {
      dispatched.push(op);
      const isDedup = seenUuids.has(op.clientUuid);
      seenUuids.add(op.clientUuid);
      return { serverSeq: ++seq, id: `att-${op.id}`, deduplicated: isDedup };
    },
    async dispatchSiteExpense(op) {
      dispatched.push(op);
      const isDedup = seenUuids.has(op.clientUuid);
      seenUuids.add(op.clientUuid);
      return { serverSeq: ++seq, id: `exp-${op.id}`, deduplicated: isDedup };
    },
    async dispatchMaterialDelivery(op) {
      dispatched.push(op);
      const isDedup = seenUuids.has(op.clientUuid);
      seenUuids.add(op.clientUuid);
      return { serverSeq: ++seq, id: `mrr-${op.id}`, deduplicated: isDedup };
    },
    async dispatchDailyReport(op) {
      dispatched.push(op);
      const isDedup = seenUuids.has(op.clientUuid);
      seenUuids.add(op.clientUuid);
      return { serverSeq: ++seq, id: `rep-${op.id}`, deduplicated: isDedup };
    },
  };
}

test("M05-T07: operationId and clientUuid are preserved intact across drain", async () => {
  const sampleOutbox: BrowserOutboxRecord[] = [
    {
      id: "outbox-op-1",
      clientUuid: "uuid-orig-101",
      userId: "user-42",
      type: "attendance",
      status: "pending",
      payload: { projectId: "proj-1", date: "2026-10-12" },
      createdAt: 1700000000,
    },
    {
      id: "outbox-op-2",
      clientUuid: "uuid-orig-102",
      userId: "user-42",
      type: "expense",
      status: "pending",
      payload: { projectId: "proj-1", amount: 5000, currency: "NPR" },
      createdAt: 1700000010,
    },
    {
      id: "outbox-op-3",
      clientUuid: "uuid-orig-103",
      userId: "user-42",
      type: "material_delivery",
      status: "pending",
      payload: { projectId: "proj-1", challanNumber: "CH-999" },
      createdAt: 1700000020,
    },
  ];

  const store = new InMemoryBrowserStorageEngine({ outbox: sampleOutbox });
  const server = createMockServer();

  const dispositions = await BrowserDrainEngine.executeSafeDrain(store, server);

  assert.equal(dispositions.length, 3);
  assert.equal(server.dispatched.length, 3);

  // Assert operation IDs and clientUuids match originals exactly
  assert.equal(server.dispatched[0].id, "outbox-op-1");
  assert.equal(server.dispatched[0].clientUuid, "uuid-orig-101");
  assert.equal(server.dispatched[1].id, "outbox-op-2");
  assert.equal(server.dispatched[1].clientUuid, "uuid-orig-102");
  assert.equal(server.dispatched[2].id, "outbox-op-3");
  assert.equal(server.dispatched[2].clientUuid, "uuid-orig-103");

  // In the store, all records are updated to synced with server receipt
  const updatedOutbox = await store.getOutbox();
  assert.equal(updatedOutbox.every((r) => r.status === "synced"), true);
  assert.ok(updatedOutbox[0].receipt);
  assert.equal(updatedOutbox[0].receipt?.serverSeq, 1001);
});

test("M05-T07: server dedup treats migrated submission and original identically", async () => {
  const store = new InMemoryBrowserStorageEngine({
    outbox: [
      {
        id: "outbox-dupe-1",
        clientUuid: "already-posted-uuid-555",
        userId: "user-1",
        type: "attendance",
        status: "pending",
        payload: { projectId: "proj-1" },
        createdAt: 1700000000,
      },
    ],
  });

  const server = createMockServer();
  // Simulate that the server already saw this UUID previously
  server.seenUuids.add("already-posted-uuid-555");

  const dispositions = await BrowserDrainEngine.executeSafeDrain(store, server);
  assert.equal(dispositions.length, 1);
  assert.equal(dispositions[0].action, "acknowledged_and_archived");
  assert.equal(dispositions[0].serverReceipt?.deduplicated, true);
  assert.ok(dispositions[0].reason.includes("idempotent duplicate"));
});

test("M05-T07: no blanket IndexedDB deletion — per-store, per-record disposition rule", async () => {
  const outbox: BrowserOutboxRecord[] = [
    {
      id: "op-success",
      clientUuid: "uuid-s",
      userId: "u1",
      type: "attendance",
      status: "pending",
      payload: {},
      createdAt: 1000,
    },
    {
      id: "op-failing",
      clientUuid: "uuid-f",
      userId: "u1",
      type: "expense",
      status: "pending",
      payload: {},
      createdAt: 2000,
    },
  ];

  const drafts: BrowserDraftRecord[] = [
    {
      id: "draft-1",
      userId: "u1",
      type: "daily_report",
      payload: { weather: "Rainy", notes: "Excavation delayed" },
      updatedAt: 3000,
    },
  ];

  const queries: BrowserQueryRecord[] = [
    { hash: "q-recent", queryKey: "activeProjects", data: [{ id: "p1" }], savedAt: Date.now() - 3600000 },
    { hash: "q-stale", queryKey: "pastAudits", data: [], savedAt: Date.now() - 10 * 86400000 }, // 10 days old
  ];

  const legacyQueue: LegacyOfflineRecord[] = [
    { id: "leg-1", userId: "u1", url: "/api/trpc/siteExpense.create", method: "POST", body: '{"amount": 100}', status: "queued", createdAt: 4000 },
    { id: "leg-2", userId: "u1", url: "/api/custom/unknown", method: "POST", body: "{}", status: "queued", createdAt: 4100 },
  ];

  const store = new InMemoryBrowserStorageEngine({ outbox, drafts, queries, legacyQueue });

  const server: ServerDrainPort = {
    async dispatchAttendance() {
      return { serverSeq: 10, id: "ack-att" };
    },
    async dispatchSiteExpense(op) {
      if (op.id === "op-failing") throw new Error("Server temporary 503");
      return { serverSeq: 11, id: "ack-exp" };
    },
    async dispatchMaterialDelivery() {
      return { serverSeq: 12, id: "ack-mrr" };
    },
    async dispatchDailyReport() {
      return { serverSeq: 13, id: "ack-rep" };
    },
  };

  const dispositions = await BrowserDrainEngine.executeSafeDrain(store, server);

  // Disposition checks:
  const successOutbox = dispositions.find((d) => d.recordId === "op-success")!;
  assert.equal(successOutbox.action, "acknowledged_and_archived");

  const failingOutbox = dispositions.find((d) => d.recordId === "op-failing")!;
  assert.equal(failingOutbox.action, "retained_pending");
  assert.ok(failingOutbox.reason.includes("Server temporary 503"));

  // Check store state: failing record was NOT deleted!
  const finalOutbox = await store.getOutbox();
  assert.equal(finalOutbox.length, 2);
  const retainedItem = finalOutbox.find((o) => o.id === "op-failing")!;
  assert.equal(retainedItem.status, "failed");

  // Drafts: retained intact, 0 wholesale deletion
  const finalDrafts = await store.getDrafts();
  assert.equal(finalDrafts.length, 1);
  assert.equal(finalDrafts[0].id, "draft-1");

  // Queries: stale evicted, recent retained
  const finalQueries = await store.getQueries();
  assert.equal(finalQueries.length, 1);
  assert.equal(finalQueries[0].hash, "q-recent");

  // Legacy queue: leg-1 mapped and drained, leg-2 retained
  const finalLegacy = await store.getLegacyQueue();
  assert.equal(finalLegacy.length, 2);
  assert.equal(finalLegacy.find((l) => l.id === "leg-1")?.status, "drained");
  assert.equal(finalLegacy.find((l) => l.id === "leg-2")?.status, "queued");
});

test("M05-T07: crash-safety and resumability — interrupted drain resumes with 0 loss and 0 duplicates", async () => {
  const items: BrowserOutboxRecord[] = [
    { id: "i1", clientUuid: "u1", userId: "u", type: "attendance", status: "pending", payload: {}, createdAt: 1 },
    { id: "i2", clientUuid: "u2", userId: "u", type: "attendance", status: "pending", payload: {}, createdAt: 2 },
    { id: "i3", clientUuid: "u3", userId: "u", type: "attendance", status: "pending", payload: {}, createdAt: 3 },
    { id: "i4", clientUuid: "u4", userId: "u", type: "attendance", status: "pending", payload: {}, createdAt: 4 },
  ];

  const store = new InMemoryBrowserStorageEngine({ outbox: items });
  const server = createMockServer();

  // Run 1: Crash after acknowledging 2 items
  await assert.rejects(
    async () => {
      await BrowserDrainEngine.executeSafeDrain(store, server, { crashAfterCount: 2 });
    },
    /Process crashed after acknowledging 2 items/
  );

  assert.equal(server.dispatched.length, 2);
  const interimOutbox = await store.getOutbox();
  assert.equal(interimOutbox.filter((i) => i.status === "synced").length, 2);
  assert.equal(interimOutbox.filter((i) => i.status === "pending").length, 2);

  // Run 2: Resume drain after crash
  const secondRunDispositions = await BrowserDrainEngine.executeSafeDrain(store, server);

  // i1 and i2 were already synced, so they are safely skipped
  const skipped = secondRunDispositions.filter((d) => d.action === "skipped_already_synced");
  assert.equal(skipped.length, 2);

  // i3 and i4 are acknowledged and archived
  const acked = secondRunDispositions.filter((d) => d.action === "acknowledged_and_archived");
  assert.equal(acked.length, 2);

  // Server only dispatched i3 and i4 during run 2 (total 4 dispatches, 0 duplicates!)
  assert.equal(server.dispatched.length, 4);
  const dispatchedIds = server.dispatched.map((d) => d.id);
  assert.deepEqual(dispatchedIds, ["i1", "i2", "i3", "i4"]);

  const finalOutbox = await store.getOutbox();
  assert.equal(finalOutbox.every((i) => i.status === "synced"), true);
});

test("M05-T07: exportBundle produces compliant cm-field-drain-v1 schema", async () => {
  const store = new InMemoryBrowserStorageEngine({
    outbox: [
      { id: "o1", clientUuid: "c1", userId: "u1", type: "attendance", status: "pending", payload: {}, createdAt: 100 },
    ],
    drafts: [
      { id: "d1", userId: "u1", type: "attendance", payload: {}, updatedAt: 200 },
    ],
    queries: [
      { hash: "h1", queryKey: "users", data: [], savedAt: 300 },
    ],
    legacyQueue: [
      { id: "l1", userId: "u1", url: "/api/test", method: "GET", status: "queued", createdAt: 400 },
    ],
  });

  const bundle = await BrowserDrainEngine.exportBundle(store);

  assert.equal(bundle.version, "cm-field-drain-v1");
  assert.equal(bundle.summary.outboxCount, 1);
  assert.equal(bundle.summary.draftsCount, 1);
  assert.equal(bundle.summary.queriesCount, 1);
  assert.equal(bundle.summary.legacyQueueCount, 1);
  assert.equal(bundle.outbox[0].id, "o1");
  assert.equal(bundle.drafts[0].id, "d1");
});
