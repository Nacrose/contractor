# M00-T12: Reference Outputs and Honest Test Baseline

> **Status**: Verified & Recorded  
> **Milestone**: M00 (Inventory, Fixtures & Baseline)  
> **Target Authoritative Source**: `Nacrose/Construction_Manager` (branch `feat/autocad-parity-engine-v2`, commit `7d80083e2f205ef1dd4ca29578836f4cf81afb89`)  
> **Output Artifact**: [`docs/reports/M00/baseline-tests.md`](file:///Users/aakashdhakal/contractor/docs/reports/M00/baseline-tests.md)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 R10 (Never report unverified as passed, record skipped as skipped, record known bugs honestly without weakening tests)

---

## 1. Executive Summary & Purpose

The objective of Milestone task **M00-T12** is to establish an honest, unvarnished baseline of the test suite and verification commands preserved from the authoritative source repository (`Nacrose/Construction_Manager`). 

Per Protocol **R10**, reference outputs are recorded **as-is**:
- Passing suites are verified and enumerated with exact test and file counts.
- Skipped test suites are recorded as **skipped** (never passed), noting missing environment prerequisites.
- Failing suites are recorded with full stack traces, assertion messages, and root-cause analyses. Known bugs are explicitly logged as bugs, rather than being retroactively redefined as expected behavior.

---

## 2. Test Execution Environment

All suites were executed on the primary development workstation under identical environment conditions:

| Parameter | Recorded Value |
|---|---|
| **Operating System** | macOS 15.x / Darwin 27.0.0 (ARM64) |
| **Hardware** | Apple Silicon (Apple M1, 8 Cores, 8 GB Unified Memory) |
| **Node.js Runtime** | `v26.3.0` |
| **Package Manager** | `npm v11.1.0` |
| **Test Runner** | Vitest `v4.1.11` |
| **TypeScript Compiler** | `v5.8.2` |
| **Repository Path** | `/Users/aakashdhakal/Construction-manager-0.2` |
| **Authoritative Git Commit** | `7d80083e2f205ef1dd4ca29578836f4cf81afb89` |
| **Git Branch** | `feat/autocad-parity-engine-v2` |
| **Execution Timestamp** | `2026-10-08T22:34:00Z` – `2026-10-08T22:38:50Z` |

---

## 3. Preserved Verification Command Set Summary

The master test matrix summarizes the outcomes across all preserved CI and developer test commands:

| Command Executed | Target Scope | Exit Code | Duration | Files (P/F/S/Total) | Tests (P/F/S/Total) | Status Classification |
|---|---|---|---|---|---|---|
| `npm run check:permission-root-coverage` | tRPC Router Roots | `0` | 1.2s | 1 / 0 / 0 / 1 | 60 / 0 / 0 / 60 | **PASSED** (100% Coverage) |
| `npx tsc --noEmit` | Whole Repository Typecheck | `0` | 34.0s | N/A | N/A | **PASSED** (0 Type Errors) |
| `npx eslint . --max-warnings 15` | Static Lint & Code Style | `1` | 50.0s | N/A | 20 warnings (max 15) | **FAILED** (Warning Threshold Breached) |
| `npx vitest run src/lib/worksheet` | Worksheet & BoQ Engine | `0` | 5.95s | 25 / 0 / 0 / 25 | 422 / 0 / 0 / 422 | **PASSED** (All Unit Tests Green) |
| `npx vitest run src/lib/cad src/lib/dwg src/lib/dxf` | CAD, DWG & DXF Engine | `0` | 2.17s | 10 / 0 / 0 / 10 | 354 / 0 / 0 / 354 | **PASSED** (All Unit Tests Green) |
| `npx vitest run src/lib/pdf-canvas src/lib/__tests__/pdf-report.test.ts` | PDF & Canvas Takeoff Engine | `0` | 5.42s | 8 / 0 / 0 / 8 | 153 / 0 / 0 / 153 | **PASSED** (All Unit Tests Green) |
| `npx vitest run src/lib/__tests__/cpm*.test.ts src/lib/nepali-calendar.test.ts` | CPM Engine & Nepal Calendar | `0` | 0.70s | 4 / 0 / 0 / 4 | 232 / 0 / 0 / 232 | **PASSED** (All Unit Tests Green) |
| `npm run test:integration` | PostgreSQL RLS & Gate | `0` | 3.01s | 0 / 0 / 3 / 3 | 0 / 0 / 22 / 22 | **SKIPPED** (No `TEST_DATABASE_URL`) |
| `npm test` (`vitest run`) | Full Repository Test Suite | `1` | 178.58s | 345 / 2 / 3 / 350 | 5,860 / 2 / 22 / 5,884 | **FAILED** (2 Failing Tests) |

---

## 4. Detailed Suite Analysis & Findings

### 4.1. Core Domain Engines (100% Pass)
The core computation engines demonstrate rock-solid isolation and zero dependency on Next.js or browser DOM:
- **Worksheet Engine (`src/lib/worksheet`)**:
  - 25 test files, 422 passing tests.
  - Covers formula evaluation, topological DAG recalculation, Bikram Sambat date functions (`BS2AD`, `AD2BS`), conditional formatting, Excel XLSX import/export, and four-factor volume math.
- **CAD & DWG Engine (`src/lib/cad`, `src/lib/dwg`, `src/lib/dxf`)**:
  - 10 test files, 354 passing tests.
  - Golden decode tests in `dwg-native.test.ts` pass cleanly for `AC1012`, `AC1014`, and `AC1015` binary DWG fixtures.
  - Survey calculations (traverse adjustments, coordinate transformations) and DXF ASCII tokenization/rendering pass 100%.
- **PDF & Canvas Takeoff (`src/lib/pdf-canvas`)**:
  - 8 test files, 153 passing tests.
  - Model serialization, z-ordering, polygon point generation, table mutations, snapping, and vector export pipelines pass.
- **CPM Scheduling Engine (`src/lib/cpm*`, `src/lib/nepali-calendar`)**:
  - 4 test files, 232 passing tests.
  - Calendar snapshots (`nepal-std-2026.1`), 6-day work weeks, Saturday rest days, hour-to-day lag conversions, negative float, and MSP constraints (`MSO`, `SNET`, `FNLT`) pass completely.

### 4.2. Skipped Integration Suites (`TEST_DATABASE_URL` Unset)
The 3 files executed by `npm run test:integration` exited with code 0 but executed **zero assertions**:
- `src/server/routers/__tests__/raw-sql-gate.test.ts` (5 tests skipped)
- `src/server/routers/__tests__/rls-integration.test.ts` (10 tests skipped)
- `src/server/routers/__tests__/smoke-flow.test.ts` (7 tests skipped)

**Prerequisite Gap**:
These suites check PostgreSQL Row-Level Security (RLS) enforcement, advisory locking, and tamper-evident audit chains. They conditionally guard execution with:
```typescript
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
// Tests are skipped if TEST_DATABASE_URL is absent.
```
In developer environments without a live Postgres container provisioned, these critical gatekeepers are bypassed.

---

## 5. Explicit Record of Known Failures and Regressions

Two test suites failed during the full `npm test` run, and one CI command failed due to warning budget exhaustion. These are recorded as known upstream defects:

### Defect 1: Server Float-Money Ratchet Regression
- **Test File**: `src/server/utils/engine-ratchet.test.ts:222:7`
- **Suite**: `Engine ratchet — server security pipeline (shrink-only)`
- **Test**: `float-money coercions in server code never grow past the baseline`
- **Error**:
  ```
  AssertionError: Number(/parseFloat( coercions grew (54 > 46). 
  Server-side money math must ride Prisma Decimal or the currency engine, not float coercion.
  Expected: 54 <= 46
  ```
- **Root Cause**: On branch `feat/autocad-parity-engine-v2`, developers introduced 8 new occurrences of `Number(...)` or `parseFloat(...)` on financial fields in server routers/services, breaching the anti-regression ratchet threshold.
- **Architectural Impact**: This failure confirms why strict ADR-0002 compliance and Decimal precision are critical non-negotiables for the rewrite.

### Defect 2: Missing UI Command Attribute in CAD Editor
- **Test File**: `src/components/cad/cad-editor.test.tsx:116:18`
- **Test**: `CadEditor renders toolbar with registered commands`
- **Error**:
  ```
  AssertionError: expected html to contain 'aria-label="DIVIDE"'
  ```
- **Root Cause**: The CAD editor toolbar UI in `src/components/cad/cad-editor.tsx` does not render an accessibility label for the `DIVIDE` geometric command, causing the visual/DOM assertion to fail.

### Defect 3: ESLint Warning Budget Breach
- **Command**: `npx eslint . --max-warnings 15`
- **Error**: `ESLint found too many warnings (maximum: 15). 20 problems (0 errors, 20 warnings).`
- **Root Cause**: 20 warnings exist across the codebase:
  1. Unused imports in CAD engine files:
     - `src/lib/cad/block-commands.ts:14:10`: `DxfBlock`
     - `src/lib/cad/draw-commands.ts:16:3`: `midPoint`
     - `src/lib/dxf/dxf-parser.ts:467:11`: `linetype`
  2. Unused variables in settings & dialogs:
     - `src/app/(app)/settings/components/organization-accounting-section.tsx`
     - `src/app/(app)/settings/page.tsx`
     - `src/components/attendance-history-dialog.tsx`
  3. React 19 Compiler warnings in `src/app/(app)/projects/page.tsx`:
     - Line 525: `setOpen(true)` called synchronously within `useEffect`.
     - Line 584: `setSelectedId(...)` called directly within `useEffect`.

---

## 6. Verification Against Domain Expectations

| Domain | Existing Test Coverage | Independent Domain Requirement | Status & Assessment |
|---|---|---|---|
| **Worksheet Math** | 422 tests (vitest) | Exact 4-factor volume calculation ($L \times B \times H \times N$), cross-sheet VAT (13%), no IEEE 754 precision drift | **Verified Compatible**. Core engine math is sound. |
| **CAD Decoding** | 354 tests (vitest) | Clean binary decode of R13, R14, and R2000 DWG streams; DXF bulge polyline arc preservation | **Verified Compatible**. DWG bits decoder produces exact geometry matching LibreDWG. |
| **CPM Scheduling** | 232 tests (vitest) | Nepal calendar (Asia/Kathmandu), 6-day week, Saturday off, MSP constraint priority, negative float | **Verified Compatible**. CalendarSnapshot architecture functions deterministically. |
| **Server Financial Security** | `engine-ratchet.test.ts` (FAILED) | Server must never use float arithmetic for currency/IPC | **Regressed in Upstream**. Upstream breached ratchet (54 > 46). Client rewrite must strictly reject floats. |
| **Database RLS & Isolation** | 22 tests (SKIPPED) | Live Postgres tenant isolation gates | **Unverified Locally**. Requires PostgreSQL test container in M00-T15 spike harness. |

---

## 7. Sign-Off & Status

Task **M00-T12** is complete. The honest test baseline is preserved, categorized, and documented without weakening existing tests or masking known failures.
