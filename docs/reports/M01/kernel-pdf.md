# M01-T10: PDF and Document Primitive Comparison

> **Status:** Comparative spike complete; no production dependency selected.
> **Scope:** PDF parsing/rendering adapters for the existing document measurement engine. Measurement semantics, annotations, page coordinates, and BoQ links remain owned by the existing TypeScript document engine; renderers provide page metadata and bounded raster output only.
> **Prototype baseline:** `prototype/construction_client/lib/pdf/` from M01-T06. It uses generated vector content and an LRU cache, not a PDF parser. Its timing and memory figures do not measure any candidate renderer.
> **Candidate harness:** `prototype/construction_client/lib/pdf/kernel_candidate_comparison.dart` and `prototype/construction_client/integration_test/kernel_pdf_integration_test.dart`, using locked `pdfrx 2.6.5` and `pdfx 2.11.0` packages in the disposable prototype only.

## Decision summary

The strongest candidate for the next disposable real-PDF spike is **pdfrx / pdfrx_engine over PDFium**. Its published platform matrix covers Android, iOS, macOS, Windows, Linux, and web (WASM), and it exposes lower-level document/page APIs in addition to viewer widgets. This is a candidate for measurement, not an adoption decision: the current prototype has only a generated one-page binary PDF, no representative large PDF fixture, no native device results, and no peak-memory or cancellation measurements.

Keep the existing `pdfjs-dist` path as the web reference during comparison. Evaluate `pdfx` as an alternative only if a split renderer backend provides a concrete advantage: its current published platform matrix omits Linux and its web setup directs users to install PDF.js from a CDN, which conflicts with self-contained offline web startup unless assets are vendored and verified. A custom per-platform stack (PDF.js, Apple PDFKit/CoreGraphics, Android PdfRenderer, Windows/Linux PDFium) has broad native primitives but incurs multiple rendering implementations and greater cross-platform fidelity risk.

Do not add a new Rust PDF kernel. These candidates already wrap mature PDF engines; a Rust bridge would add FFI/WASM and lifecycle complexity without evidence of a faster or more complete parser. The document model and takeoff calculations remain separate from the renderer, following the existing document-engine boundary.

## Candidate scorecard

Scores are engineering-fit assessments from published documentation and repository inventory, not measured runtime scores. **Unknown** means the candidate must be exercised against the real fixtures before it can pass the gate.

| Candidate | Memory bounds | Cancellation / disposal | Required platform coverage | Licensing / offline | Result |
|---|---|---|---|---|---|
| **A. pdfrx / PDFium** | **Good documented controls, runtime unknown.** Offers progressive/lazy loading and a rendering-cache limit; peak memory on dense sheets and 200 MB inputs is unmeasured. | **Good documented behavior, runtime unknown.** Changelog records cancellation of offscreen preview and partial-page render requests; explicit document/page close behavior still needs a lifecycle test. | **Strongest single-stack fit.** Published support includes Android, iOS, macOS, Windows, Linux, and web through PDFium WASM. Verify Intel macOS, browser WASM startup, and target packaging in our pinned toolchain. | Package reports MIT; PDFium is BSD-3-Clause. Bundle and audit all transitive notices/assets. WASM/native binaries can be packaged for offline use; verify actual build outputs and startup with network disabled. | **Advance to real-PDF prototype.** Best coverage with one engine family, subject to memory, cancellation, fidelity, and build evidence. |
| **B. pdfx** | **Unknown.** Renderer exposes page-to-image APIs; no evidence in the spike for the required bounded decoded-page budget on our workload. | **Unknown.** Must prove in-flight render cancellation and native/web resource release. | Published matrix covers Android, iOS, macOS, web, and Windows; no Linux target is listed. Web renderer uses PDF.js and setup documentation requests CDN installation, so vendoring/offline behavior must be proven. | Package reports MIT; audit engine-specific third-party notices and bundled PDF.js assets at the pinned version. | **Reserve alternative.** Weaker Linux/offline-web fit than A on current evidence. |
| **C. Existing web engine plus native platform APIs** | **Unknown across the combined stack.** Existing web `pdfjs-dist` is known product behavior; native cache and raster budgets do not exist yet. | **Mixed / unknown.** Each platform API has a separate cancellation and release model; one shared lifecycle contract would need adapters and platform tests. | Potentially covers all targets, but requires maintaining PDF.js, Apple frameworks, Android PdfRenderer, and a Windows/Linux engine. | Existing web renderer and OS APIs avoid a single new Flutter package, but engine/version differences and distribution notices must be tracked separately. Offline browser assets must be served locally. | **Retain as reference behavior, not preferred new stack.** High integration and semantic parity cost. |
| **D. Rust PDF kernel / custom FFI-WASM** | **Unknown.** No candidate implementation or evidence that Rust improves the PDFium-backed alternatives. | **Unknown and higher bridge risk.** Cancellation, async work, ownership, and WASM worker behavior would need custom integration. | Native FFI plus browser WASM are separate bindings and packaging paths. | License and transitive dependency review would be required after naming a real candidate. | **Reject for this milestone.** No identified advantage over binding an existing engine; reassess only against measured candidate failure. |

## Evidence and limits

- Current client prototype: `prototype/construction_client/lib/pdf/pdf_document_model.dart`, `pdf_page_cache.dart`, and `pdf_viewport.dart`. These synthesize vector shapes and validate viewport/cache behavior; they do not open a PDF file.
- Existing web behavior: M00 inventory records `pdfjs-dist` as the current PDF renderer and `src/lib/document-engine/` as the measurement/session engine. M00 inventory also records the 120-page generated specification fixture, but that is a CanvasDoc/specification fixture, not the required binary PDF workload.
- `pdfrx` package documentation reports Android, iOS, Windows, macOS, Linux, and Web (WASM) support, progressive/lazy loading, render-cache controls, and PDFium-backed rendering. Its changelog records cancellation of offscreen preview and partial-page rendering requests. These are vendor claims, not results reproduced in this repository.
- `pdfx` package documentation reports Android, iOS, macOS, Windows, and web support; identifies Android PdfRenderer, Apple CGPDFPage, Windows PDFium, and web PDF.js; and documents a web installation command that adds PDF.js from a CDN. Its Linux coverage is not listed.
- `pdfrx` publishes an MIT package license; PDFium lists BSD-3-Clause. These package-level labels do not replace an SBOM/third-party-notice audit for a pinned release.
- The two candidate packages were resolved and locked only in the disposable prototype. `flutter analyze` passed for the prototype and both candidate adapters. The adapters also rendered the generated fixture in a release-mode browser app.
- The shared fixture generated by the harness is a valid one-page PDF with vector strokes and text. It records open + first render + close duration and rendered output size; it does not represent the 100+ page / approximately 200 MB workload.
- A real Flutter web app build and release-mode browser run succeeded on the pinned Flutter 3.47.6 / Dart 3.13.5 toolchain. In 10 sequential opens of the same generated fixture at 640×480, pdfrx/PDFium completed the first open/render/close, including Flutter/PDFium WASM initialization, in **610.3 ms**; the remaining nine runs had **1.3 ms p50** and **11.2 ms p95**. pdfx completed the first measured open/render/close in **62.0 ms**; its remaining nine had **33.0 ms p50** and **33.8 ms p95**. These measurements cover a small one-page fixture and are directional only. PDF.js's module script is loaded from jsDelivr before the Flutter app starts, so pdfx's result excludes that script download/startup. Results were displayed by the prototype at `http://localhost:4304/`.
- Both candidates reported a 612×792-point page and completed explicit close calls. At the requested output size, pdfrx returned 1,228,800 raw BGRA bytes and pdfx returned a 14,797-byte compressed image; these output sizes are different formats and must not be compared as renderer memory use. The raw pdfrx buffer equals one 640×480×4 image; peak process memory was not measured.
- The first repeat harness exposed that PDF.js can transfer/detach its input `ArrayBuffer`; the adapters now pass a fresh byte copy per run and include copy time in the measured interval. Large-file copy/memory behavior still needs a file-backed or streaming test.
- `flutter test integration_test/kernel_pdf_integration_test.dart -d macos` could not start because Xcode is not installed on this host. Flutter's web integration-test runner also reports that web devices are not supported; the successful browser evidence came from the regular release app path.
- An attempted Chrome unit-runner execution could not load pdfrx's packaged `pdfium_client.js` through the unit-test asset server. The regular Flutter app path correctly bundled and ran the PDFium WASM worker. The pdfx candidate requires its PDF.js web script in `web/index.html`; the package installer points to jsDelivr, so the measured browser run required an external CDN. This is an offline-startup gap for pdfx unless PDF.js is vendored and verified.
- No representative large-PDF latency, peak RSS, cancellation latency, text/vector fidelity, or offline-startup result is claimed.

## Required follow-up evidence before dependency selection

M01-T12 owns the dependency matrix. Before a package is selected, its disposable prototype must use sanitized binary PDF fixtures representing: a 100+ page / approximately 200 MB package, a dense vector page, a scanned page, rotated/mixed-size pages, and malformed or encrypted files. Exercise native and web builds with network disabled, concurrent page requests, rapid navigation cancellation, explicit close/disposal, repeated open/close cycles, and a bounded decoded-page cache. Record cold first-page and warm-page p50/p95/p99, peak process memory, cache bytes, cancellation completion, build size, platform/compiler versions, and deviations from current PDF.js output. Include Intel macOS and browser WASM separately.

The renderer adapter must return normalized page dimensions/rotation and raster or vector output; it must not own takeoff measurements, calibration, annotation persistence, or authorization. Existing `src/lib/document-engine/measurement.ts`, PDF sessions, `DrawingMarkup`, and server permission checks stay authoritative. Keep the current synthetic M01-T06 prototype disposable.

## References

- [pdfrx package and platform documentation](https://pub.dev/packages/pdfrx)
- [pdfrx changelog](https://pub.dev/packages/pdfrx/changelog)
- [pdfx package and platform documentation](https://pub.dev/packages/pdfx)
- [PDFium project license](https://github.com/PDFium/PDFium)
- [PDF.js license and project overview](https://mozilla.github.io/pdf.js/)

## M01-T10 acceptance record

- Rendering/decoding candidates scored on memory bounds, cancellation, platform coverage (including web), and licensing: **scored as an evidence-based fit assessment in the table above**. Small-fixture browser timing and output-size evidence is recorded above; large-file memory, native runtime, cancellation latency, and offline startup remain unknown.
- Decision inputs consolidated for the M01 report: **pdfrx/PDFium advances as the lead candidate to the binary-fixture spike; no dependency is selected by name alone**.
- No production package or PDF implementation added. M01-T12 must establish real-device/browser and binary-fixture results before adoption.
