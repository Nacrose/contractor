# M01-T11 — DWG dependency spike

**Status:** evidence and feasibility assessment; no converter selected.  
**Inspected:** product DWG reader and converter implementation in `Construction-manager-0.2` (read-only), plus official LibreDWG, GNU, ODA, and Autodesk documentation.  
**Scope:** format generations, platform coverage, extension feasibility, deployment isolation, licensing, and read/write capability.

## Existing product implementation

The product has an independent TypeScript reader at `src/lib/dwg/dwg-native.ts`. It recognizes the uncompressed DWG generations AC1012 (R13), AC1014 (R14), and AC1015 (R2000), and emits the existing DXF document model used by rendering/editing. Its comments document deliberate rejection of AC1018 and newer compressed generations. Unsupported object types are skipped and counted; structural corruption is reported as an error. The reader includes object/class/vertex safety caps. The committed tests exercise three small fixtures (R13, R14, R2000), compare expected geometry with LibreDWG output, and reject tags AC1018, AC1021, AC1024, AC1027, and AC1032. This is meaningful proof of those paths, not broad entity-fidelity or arbitrary-file compatibility.

For generations outside the native reader, the server has an out-of-process DWG-to-DXF service (`src/server/services/cad-converter.ts`). It discovers ODA File Converter first and LibreDWG `dwg2dxf` second through explicit environment variables, a local binary bundle, or `PATH`. The implementation uses `execFile` with argument arrays (no shell), bounded timeouts and input/output sizes, private temporary working directories, validates/re-parses converter output, and removes temporary files. ODA may be wrapped with `xvfb-run` on headless Linux. These are useful operational controls, but the repository alone does not prove that either binary is installed or supported in any production deployment.

The product has a DXF writer, not a DWG writer. A converted DWG can enter the DXF document/editing path and be saved as DXF; preserving or emitting the original DWG format is not demonstrated. DXF export should be treated as a format conversion with possible fidelity loss, especially for unsupported object types and newer/proprietary entities.

## Version and capability coverage

Coverage below distinguishes the client from the server host. “Conditional” means a compatible converter must be installed on the product server; no client-side binary is assumed.

| Client/platform | DWG read | DWG write | Notes |
| --- | --- | --- | --- |
| Web browser | AC1012/14/15 through native TypeScript reader | None | No browser-native modern DWG converter is present. Modern files require server conversion. |
| macOS desktop/browser client | AC1012/14/15 natively; modern versions conditional on server converter | None | ODA publishes a desktop converter for macOS; that does not establish in-app client coverage. |
| Windows desktop/browser client | AC1012/14/15 natively; modern versions conditional on server converter | None | ODA desktop converter and RealDWG are Windows options subject to licensing/deployment. |
| Linux desktop/browser client | AC1012/14/15 natively; modern versions conditional on server converter | None | ODA desktop converter and LibreDWG are candidates; headless ODA may need a virtual display. |
| iOS / Android client | AC1012/14/15 through product TypeScript path where app runtime supports it; modern versions conditional on server converter | None | No mobile DWG converter integration or DWG writer is evidenced in this product. Server deployment is the cross-platform route. |
| Server host (Linux/macOS/Windows, if deployed) | Native AC1012/14/15 plus converter-dependent coverage | No product DWG writer | Actual support is the intersection of host OS, installed converter build, input generation, and tested fidelity. |

The product capability matrix should therefore list **DWG** as a separate format row: native read support AC1012/AC1014/AC1015 on supported client runtimes; conditional server-side read/convert for other generations; no DWG write path; DXF export available. Do not label “DWG supported” without stating generation and whether conversion infrastructure is installed.

## Candidate approaches

### Extend the TypeScript reader

An in-process implementation can preserve browser/offline availability and avoid bundling a GPL converter. The current parser is a useful foundation for explicit legacy coverage, but modern DWG generations use compressed section structures and have a large evolving object vocabulary. Extending it would require generation-specific format work, fixtures from real drawings, entity/property coverage measurement, corruption/fuzz safety, and a sustained compatibility plan. The small existing golden fixture set does not establish that a native modern reader is a bounded M01 extension.

### Keep a server-side converter boundary

This matches the existing architecture for modern files and avoids shipping a native binary to every client. The current subprocess design already narrows interaction to input/output files and a DXF result; it is materially more isolated than linking LibreDWG into the application process. It still requires per-host packaging, patching, sandbox/resource controls, queue/concurrency limits, observability, and production-version tests. An out-of-process boundary is a technical mitigation, not a conclusion about copyright or license obligations.

### LibreDWG

LibreDWG is a free software DWG reader/writer project distributed under GPL-3.0-or-later. Its project documentation describes broad historical and modern version coverage (through R2018 in its documented scope), with known gaps and object-fidelity limitations; read/write coverage is not uniform across generations. The product currently uses `dwg2dxf` as a conversion executable, not as a linked library. Distributing that executable or a bundled build has GPL compliance obligations. Network deployment and the exact relationship between the product and converter require legal review; process separation alone is not a blanket exemption. The GNU GPL FAQ explains that whether programs form a combined work can depend on both communication mechanism and semantics. Avoid claiming the product is license-safe solely because it calls a subprocess.

### ODA

ODA offers a free standalone ODA File Converter for batch DWG/DXF translation and separately offers the proprietary/commercial Drawings SDK. The free converter is a potentially useful operational alternative, but “free download” does not by itself establish permission to redistribute, bundle, or deploy it as part of a hosted product. Confirm the applicable license and supported versions for the intended use before packaging. ODA lists Windows, macOS, and Linux builds for its converter; this is converter-host coverage, not browser/mobile integration or a DWG writer in the product.

### Autodesk RealDWG

RealDWG is Autodesk’s commercial DWG SDK and a possible licensed route where Autodesk format compatibility and supported host constraints justify its cost. It is not a drop-in web/Wasm solution: SDK terms, target platform support, deployment model, and commercial requirements must be confirmed with Autodesk. The product currently has no RealDWG integration.

## Licensing and isolation assessment

- The native TypeScript reader is documented as an independent implementation cross-checked against the published format specification; this spike does not determine legal provenance or provide a legal opinion.
- LibreDWG’s GPL-3.0-or-later terms are a material adoption constraint, especially for distribution of a bundled executable or combined work. The converter is invoked as a separate process using files/arguments and emits DXF, which reduces technical coupling but does not settle legal classification.
- The ODA File Converter and ODA SDK have distinct licensing models. Obtain written confirmation for hosted use, redistribution, and customer access; do not infer SDK rights from the free converter download.
- RealDWG is a commercial alternative that trades license cost and platform/deployment constraints for Autodesk’s supported SDK.
- Preserve the subprocess boundary for any converter: no shell interpolation; restrict filesystem access and network access; set CPU/memory/time/input/output caps; validate output; isolate untrusted documents; and test cleanup on failures. Existing code addresses some of these controls, but deployment hardening and license review remain open.

## Recommendation for M01 evidence

Retain the native reader as explicit legacy read coverage for AC1012, AC1014, and AC1015. Keep all modern DWG conversion conditional on a deliberately selected, licensed server backend; record per-host/version/fidelity coverage and disclose DXF output. Do not expand product scope into a complete native DWG parser or claim round-trip DWG editing based on the current evidence. Before choosing a converter, confirm GPL distribution/network obligations with counsel, obtain ODA redistribution/hosting terms in writing, and compare the resulting cost/platform constraints with a RealDWG quote. This is evidence for M01-T12 and the owner’s M01 gate, not an owner-approved scope decision.

## Evidence and references

- Product source: `src/lib/dwg/dwg-native.ts`, `src/lib/dwg/dwg-native.test.ts`, `src/server/services/cad-converter.ts`, `src/lib/cad/dxf-writer.ts` in `Construction-manager-0.2` (inspected read-only).
- [LibreDWG project documentation and license](https://github.com/LibreDWG/libredwg)
- [GNU GPL version 3](https://www.gnu.org/licenses/gpl-3.0.html)
- [GNU GPL FAQ: process communication and combined works](https://www.gnu.org/licenses/gpl-faq.en.html)
- [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter?language=en)
- [ODA Drawings SDK](https://www.opendesign.com/products/drawings)
- [ODA pricing and licensing overview](https://www.opendesign.com/pricing?language=en)
- Autodesk RealDWG product documentation and licensing to be reconfirmed before selection.

## Limitations

This spike inventories source and official vendor/project descriptions. It does not benchmark conversion speed, validate every DWG generation/entity, verify bundled binaries or production host installations, obtain vendor quotes, or constitute legal advice. Converter version support and terms can change; revalidate them at the dependency decision and before deployment.
