# Prior art — mlightcad/cad-viewer (evaluated 2026-10-09)

Reference: https://github.com/mlightcad/cad-viewer — "the first web-based DXF/DWG viewer and editor that operates entirely in browser, without relying on any backend services." Cloned and inspected at HEAD (Oct 2026). Evaluation requested by the owner; feeds M06/M07 refinement.

Relevance to this program: it is a live, production-grade proof of the same architecture family our v3 plan bets on — client-side parsing, geometry processing, and rendering with no CAD backend — and it solves several problems we have registered as risks (large-file rendering, GPL isolation, mobile touch).

## Repository facts

- **Monorepo, 18 packages**, pnpm + Nx. Repo license **MIT**.
- Layering: `data-model` (unified entity model, published npm) → `libredwg-converter` (DWG→model, **GPL-3.0**, separate npm package) → `three-renderer` (MIT, Three.js 0.172, no hard deps beyond peers) → `cad-simple-viewer` (vanilla TS core: app/doc/command/editor/plugin/spatialIndex) → `cad-viewer` (full Vue 3 + Element Plus UI) → plugins (html/pdf/svg export, diff, Google Drive/OneDrive, AI agent).
- AutoCAD-convention naming throughout: `AcDb*` (database/entities), `AcGe*` (geometry), `AcTr*` (view/transaction), `AcAp*` (application), command-line interaction with aliased commands, selection prompts, layer freeze/lock.

## Patterns worth adopting (mapped to our milestones)

1. **GPL parser isolation behind a worker-asset boundary (M07; reinforces M01 spike).** The MIT core never depends on the GPL converter. DWG parsing runs in a dedicated worker (`libredwg-parser-worker.js` + `libredwg-web.wasm`) deployed as an opt-in asset; canonical filenames and a readiness handshake are codified in one file (`AcApWorkerAssets.ts`); a proprietary parser swaps into the same interface (we reject that arm — ADR-0014 — but the *interface* pattern is the point). For us: LibreDWG stays a server-side subprocess (per M01 spike), and any client-side converter integration must follow this boundary shape (isolate/worker + narrow interchange contract + drop-in replaceability).
2. **Renderer/batching techniques (M07-W03).** Geometry batching merges same-material points/lines/meshes to cut draw calls; instanced rendering for repeated block references (construction drawings are block-heavy); custom shaders for linetypes/hatch fills; material caching; buffer-geometry merging. Their three spatial-index implementations (hierarchical, linear, R-tree `rbush`) back selection/snapping/zoom-extents — direct design input for our Dart kernel's batch and index strategy, and a benchmark baseline for our "text, hatches, blocks, dimensions" requirement.
3. **Self-contained HTML export (candidate for M07 plot/share scope).** One-click export of drawing snapshot + lightweight viewer runtime (pan/zoom, layers, measure, EN/ZH) into a single offline `.html`. For contractor workflows: sending drawings to owners/consultants with no CAD install. MIT-licensed plugin (`cad-html-plugin`) — reuse or pattern-copy is legitimate; needs registering as a task if we adopt it.
4. **Mobile touch vocabulary (M05+).** Pinch-zoom, single-finger pan, tap-select in the simple viewer — matches our Flutter-native gesture expectations; useful as a cross-check for our field UX.
5. **Lazy plugin registration (M02 reference).** `AcApPluginManager` + lazy registration keeps the core small and lets heavy features (PDF, agent) load on demand — a pattern consistent with our contract-first component work in M02.
6. **Documented honesty about parser limits (M07-W04 precedent).** Their README publishes a known-issues table: LibreDWG-based path has limited entity coverage, ~13 MB WASM, high memory, OOM on very large DWG. We ship a similar explicit coverage/limitation matrix per the M01 spike outcome.

## What we do NOT adopt

- **The Vue 3 / Three.js stack as our production web UI** — ADR-0013 keeps the existing React/TS app as production authority and Flutter prototypes bounded; adopting a second web UI stack would violate that decision and the §1 parity gate.
- **Their AI-agent plugin's browser-side API keys** — security anti-pattern; conflicts with our ADR-0006 policy-engine philosophy and secrets rules.
- **Their proprietary DWG parser ($3,000)** — excluded by ADR-0014 (owner: open source only).
- **Bundling `@mlightcad/libredwg-converter` into any proprietary client** — that npm package is GPL-3.0 (the repo's MIT license does not cover it); client-side bundling would trigger GPL obligations for the client. Our LibreDWG usage stays server-side subprocess (M01 spike), which this repo's own "known issues" table corroborates as the pragmatic split.

## License nuance (recorded for M06/M07 refinement)

Repo MIT ≠ whole stack MIT: `libredwg-web`/`libredwg-converter` are GPL-3.0-derived npm packages. Any "borrow the web viewer" idea must quote licenses per package, not per repo. Consistent with ADR-0014: dependencies are adopted only with OSI-approved licenses and per-boundary GPL handling.

## Disposition

No checkbox is ticked by this note (R2). It is committed under R11 (repo-as-memory) so the M06/M07 refinement PRs can cite it; adoption of any pattern here (e.g., self-contained HTML export) must be registered as a task via `[PLAN-AMEND]`/refinement before implementation.
