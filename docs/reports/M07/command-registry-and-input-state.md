# M07-T02: CAD Command Registry, Input State Machines & Interaction Semantics

- **Task:** M07-T02 — Preserve central command registry and input state machines
- **Milestone:** M07 CAD kernel, topology, rendering & plot
- **Status:** Complete (contract tests passed; zero production route cutover)
- **Normative References:** Platform Plan v3 §3 CAD row, §6 M07; ADR-0013, ADR-0016, ADR-0018.
- **Package:** [`@contractor/native-cad`](file:///Users/aakashdhakal/contractor/packages/native_cad/)
- **Date:** 2026-10-12

---

## 1. Executive Summary

Milestone task **M07-T02** establishes the central command boundary and input state machines for CAD in Contractor. In accordance with ADR-0018 (reuse upstream capabilities while retaining Contractor authority and governance), full editor and embedded drawing review hosts dispatch user commands exclusively through this authoritative registry. Direct entity mutations outside the command boundary are prevented.

Key deliverables implemented in [`packages/native_cad/`](file:///Users/aakashdhakal/contractor/packages/native_cad/):
1. **Central Command Registry (`CadCommandRegistry`)**:
   - Canonical command mapping and alias resolution (`L` $\to$ `LINE`, `C` $\to$ `CIRCLE`, `A` $\to$ `ARC`, `PL` $\to$ `PLINE`, `M` $\to$ `MOVE`, `CO`/`CP` $\to$ `COPY`, `E`/`DELETE` $\to$ `ERASE`, `U` $\to$ `UNDO`, `REDO`, `ORTHO`, `UNITS`).
   - Single dispatch pipeline (`registry.execute(doc, commandLine, context)`).
2. **Interactive Coordinate Parser & State Machine (`CadInputStateMachine`)**:
   - Absolute coordinates: `"150.5, 200.25"` and 3D `"10, 20, 5"`.
   - Relative Cartesian coordinates: `"@20, -30"`.
   - Relative Polar coordinates: `"@50<90"` (radius and angle in degrees).
   - Direct distance entry: `"50"` oriented along active cursor hint and ortho vector.
   - Cancel / Repeat state: `Escape` cancels active command prompt and resets buffer to `Command:`; `Enter` / `Space` on empty input repeats the last executed command.
3. **Drafting Constraints & Snaps**:
   - Ortho mode (`ORTHO ON`/`OFF`): Restricts cursor deltas to nearest 90-degree orthogonal axes ($0^\circ, 90^\circ, 180^\circ, 270^\circ$).
   - Geometric snapping: Identifies endpoint, midpoint, center, and quadrant snap anchors within configurable tolerance radii.
4. **Selection and Grip Semantics (`CadSelectionEngine`, `CadGripEngine`)**:
   - Window selection (left-to-right box): Selects entities strictly fully enclosed within the bounding rectangle.
   - Crossing selection (right-to-left box): Selects entities enclosed within or intersecting the bounding rectangle.
   - Grip generation: Endpoints and midpoints on lines, centers and quadrants on circles, vertices on polylines.
   - Hot grip manipulation: Dragging and stretching entities with geometric update preservation.
5. **Compensating Undo / Redo (`CadUndoEngine`)**:
   - Generates compensating actions for every executed mutating command (e.g. erasing un-does line creation; restoring un-does erasure).
   - Reversible without state corruption across bounded transactional history.

---

## 2. Verification & Contract Test Coverage

The test suite at [`packages/native_cad/test/command_registry.test.ts`](file:///Users/aakashdhakal/contractor/packages/native_cad/test/command_registry.test.ts) executed via `node packages/native_cad/tool/check.mjs`:

| Battery | Test Case | Outcome | Latency |
|---|---|---|---|
| **Command Registry** | Resolves canonical names and standard aliases (`L`, `C`, `PL`, `E`, `M`, `U`) | **PASS** | 3.15 ms |
| **Command Execution** | Creates entities strictly through command boundary with handle assignment | **PASS** | 0.64 ms |
| **Coordinate Parser** | Parses absolute, relative Cartesian (`@dx,dy`), and relative polar (`@r<theta`) coordinates | **PASS** | 0.14 ms |
| **Input State Machine** | Escape cancels in-flight command; Enter/Space repeats last command | **PASS** | 0.15 ms |
| **Ortho Constraints** | Restricts cursor deltas to 90-degree orthogonal axes | **PASS** | 0.15 ms |
| **Object Snapping** | Detects endpoint, midpoint, center, and quadrant anchors | **PASS** | 0.31 ms |
| **Selection Engine** | Window selection (full enclosure) vs crossing selection (intersection) | **PASS** | 1.35 ms |
| **Grip Engine** | Grip extraction and hot grip stretching/manipulation | **PASS** | 0.29 ms |
| **Compensating Undo** | Reverts and reapplies command actions across multi-step mutations | **PASS** | 0.31 ms |

---

## 3. Governance Invariants (Protocol Compliance)

1. **No Production Route Cutover:**
   This task establishes the TypeScript command registry package and contract suites. No existing production route was cut over in this task.
2. **Fail-Closed Boundary:**
   Entities in [`CadDocument`](file:///Users/aakashdhakal/contractor/packages/native_cad/src/cad_document.ts) cannot be modified directly; all structural mutations must pass through `CadCommandRegistry.execute()`.
3. **Zero-Fork Posture:**
   This layer defines Contractor's authoritative command dispatch boundary, which will bridge to CADCraft's headless tools and native input handlers in subsequent milestone tasks (M07-T03 through M07-T11).
