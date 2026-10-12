# M10-T03: Single Active Writer Contract & Route-by-Route Cutover Gateway

- **Milestone:** M10 (Full Feature Parity and Web Migration)
- **Task:** `M10-T03` — Single active writer contract per entity/document version & route-by-route cutover adapter (derived from `M10-W02`)
- **Status:** Complete · Core runtime gateway, concurrency guards, and test battery
- **Normative References:** Platform Plan v3 §6 M10, §6.0 maintenance posture; ADR-0010 (Progressive Extension), ADR-0018 (Upstream Capabilities & Construction Integration), `M10-T01` (Custom Tool Audit), `M10-T02` (Migration Waves).
- **Date:** 2026-10-12 (Asia/Kathmandu)

---

## 1. Executive Summary & Core Mandate

Milestone `M10-T03` delivers the **Cutover Gateway** and **Single Active Writer Contract** implemented in [`@contractor/native-runtime`](file:///Users/aakashdhakal/contractor/packages/native_runtime/).

As mandated by **Platform Plan v3 §6 M10**:
> *"Introduce one route at a time with one active writer contract per entity/document version. Do not duplicate authoritative business logic or silently downgrade old clients."*

### Key Guarantees Implemented
1. **Single Authoritative Writer Per Route:** At any point in the migration lifecycle, each route maps exclusively to one active writer target (`FLUTTER_NATIVE` or `NEXTJS_LEGACY`).
2. **Fail-Closed Superseded Client Rejection:** When a route cuts over to `FLUTTER_NATIVE`, write attempts from legacy `nextjs_web` clients are rejected fail-closed with a structured `SupersededClientError` containing actionable migration upgrade prompts, eliminating split-brain data corruption.
3. **No Silent Protocol Downgrades:** Clients submitting obsolete protocol versions are rejected with `ClientUpgradeRequiredError`, preventing subtle field sync degradation.
4. **Optimistic Concurrency Protection:** Mutations validate `lastServerSeq`. Stale writes throw `ConcurrentMutationConflictError`, preserving sequential consistency across mobile and desktop.
5. **In-Flight Entity Mutex:** Overlapping concurrent write requests to the same entity ID are serialized or rejected with `LockAcquisitionTimeoutError` via `EntityWriteLockManager`.
6. **Zero Logic Duplication:** The cutover gateway operates as a pure authorization, concurrency, and dispatch layer; domain calculations remain strictly in authoritative server services.
7. **Instant Emergency Rollback:** Route targets can be restored to `NEXTJS_LEGACY` in $<60\text{ ms}$ safely without schema or state corruption.

---

## 2. Cutover Gateway Architecture

```
                                  INCOMING MUTATION
                                         │
                                         ▼
                             ┌───────────────────────┐
                             │    CutoverGateway     │
                             └───────────┬───────────┘
                                         │
                    1. Protocol Version Check (minProtocol)
                    2. Read-Only / Archive Status Check
                    3. Target Platform Matching
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
            [Target: FLUTTER]                         [Target: NEXTJS]
        Client: nextjs_web?                       Client: flutter?
                    │                                         │
            YES ──► ❌ REJECT (SupersededClientError)         ▼
            NO  ──► 4. Optimistic Concurrency (lastServerSeq)
                    5. EntityWriteLockManager Mutex
                    6. Dispatch Authoritative Handler
                    7. Advance Sequence Atomically
```

### 2.1 Writer Target States (`ActiveWriterTarget`)
- `FLUTTER_NATIVE`: The route is cut over; authoritative writes flow exclusively through the native/Flutter engine. Legacy Next.js web writes are blocked fail-closed.
- `NEXTJS_LEGACY`: The route remains in its pre-cutover state, serviced by the legacy Next.js / tRPC handler.
- `READ_ONLY_ARCHIVED`: The entity or route is frozen (e.g. closed fiscal year or historical audit snapshot); all mutations are rejected.

### 2.2 Error Taxonomy & Structured Payloads

1. **`SupersededClientError` (`SUPERSEDED_CLIENT_WRITE`):**
   ```json
   {
     "code": "SUPERSEDED_CLIENT_WRITE",
     "routePath": "/billing/ipc",
     "targetPlatform": "FLUTTER_NATIVE",
     "upgradePrompt": {
       "title": "Application Update Required",
       "message": "The feature at \"/billing/ipc\" has been modernized. Your current client session is superseded.",
       "targetRoute": "/billing/ipc",
       "requiredAction": "REFRESH_OR_UPGRADE_CLIENT"
     }
   }
   ```
2. **`ClientUpgradeRequiredError` (`CLIENT_UPGRADE_REQUIRED`):**
   - Thrown when client protocol version is below `minProtocolVersion`.
3. **`ConcurrentMutationConflictError` (`CONCURRENT_MUTATION_CONFLICT`):**
   - Thrown when `ctx.lastServerSeq !== currentSeq`.
4. **`LockAcquisitionTimeoutError` (`LOCK_ACQUISITION_TIMEOUT`):**
   - Thrown when competing threads race to mutate the same `entityId` concurrently.

---

## 3. Package Deliverables (`@contractor/native-runtime`)

1. [`cutover_gateway.ts`](file:///Users/aakashdhakal/contractor/packages/native_runtime/src/cutover_gateway.ts):
   - `CutoverGateway`: Route registry, target negotiation, protocol verification, optimistic concurrency tracking, and atomic sequence advancement.
   - `SupersededClientError`, `ClientUpgradeRequiredError`, `ConcurrentMutationConflictError`.
2. [`concurrency_guards.ts`](file:///Users/aakashdhakal/contractor/packages/native_runtime/src/concurrency_guards.ts):
   - `EntityWriteLockManager`: Lease-based in-process mutex lock with automatic TTL expiration.
   - `LockAcquisitionTimeoutError`.
3. [`cutover_gateway.test.ts`](file:///Users/aakashdhakal/contractor/packages/native_runtime/test/cutover_gateway.test.ts):
   - 6 automated test scenarios verifying single-writer routing, superseded client rejection, optimistic concurrency, protocol upgrade enforcement, rollback, and entity mutex locking.
4. [`tool/check.mjs`](file:///Users/aakashdhakal/contractor/packages/native_runtime/tool/check.mjs):
   - Zero-install TypeScript compilation and test execution runner.

---

## 4. Automated Verification Results

All tests pass 100%:

```bash
node packages/native_runtime/tool/check.mjs
```

### Verification Output:
```text
✔ CutoverGateway: routes mutations exclusively to the single active writer and increments sequence (1.729667ms)
✔ CutoverGateway: rejects writes from superseded clients fail-closed with structured upgrade prompt (0.423166ms)
✔ CutoverGateway: rejects obsolete client protocol version without silent downgrading (0.149458ms)
✔ CutoverGateway: rejects stale optimistic concurrency sequences fail-closed (0.142625ms)
✔ CutoverGateway: emergency rollback restores legacy target instantly and allows fallback writes (0.54725ms)
✔ EntityWriteLockManager: prevents concurrent overlapping mutations to the same entity (0.187917ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7.7085
native_runtime: all single active writer, cutover gateway, and concurrency guard tests PASSED (M10-T03)
```

- **Protocol Linter (`node scripts/lint-protocol.mjs`):** Audited 13 milestone files, 142 task definitions. **PASSED (100% clean)**.
- **Migration Waves Suite (`node scripts/test-migration-waves.mjs`):** 5/5 waves passed.
- **Scheduling Suite (`node packages/native_scheduling/tool/check.mjs`):** 29/29 tests pass.

Milestone `M10-T03` is complete and verified.
