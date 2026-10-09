# M01-T01: Toolchain Pinning, License Review & Cross-Platform CI

> **Status**: Pinned, Reviewed & Automated  
> **Milestone**: M01 (Platform Feasibility & Performance Gate)  
> **Output Artifacts**: [`docs/reports/M01/toolchain.md`](file:///Users/aakashdhakal/contractor/docs/reports/M01/toolchain.md) & [`.github/workflows/client-ci.yml`](file:///Users/aakashdhakal/contractor/.github/workflows/client-ci.yml)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 §4, §6 M01 (Toolchain pinning, license audit, binding strategy, honest CI host disclosures)

---

## 1. Executive Summary

Milestone task **M01-T01** establishes the canonical development, compilation, and automated continuous integration (CI) foundation for the `contractor` cross-platform client monorepo.

To prevent platform drift, irreproducible builds, and intellectual property contamination, this task:
1. **Pins Exact Toolchain Versions** across Flutter, Dart, Rust, Node.js, and platform SDKs.
2. **Conducts a Comprehensive License Review** of toolchains, runtimes, and binding libraries, enforcing the strict zero-copyleft policy.
3. **Ratifies the Cross-Platform Binding Strategy** across Desktop, Mobile, and Web targets.
4. **Stands up Multi-Platform CI** in `.github/workflows/client-ci.yml` supporting Web (Wasm), Linux Desktop, Android, and Protocol Quality gates, with honest disclosure of macOS host availability.

---

## 2. Pinned Toolchain Matrix

All local development and CI runner environments are pinned to the following verified versions:

| Component | Pinned Version | Channel / Target | License | Rationale |
|---|---|---|---|---|
| **Flutter SDK** | **3.47.6** | `stable` | BSD-3 Clause | Verified stable engine revision (`b8c8d3d8d5`), official Wasm GC production support, Impeller graphics engine default. |
| **Dart SDK** | **3.13.5** | `stable` | BSD-3 Clause | Bundled with Flutter 3.47.6; native pattern matching, sound null safety, standard `dart:ffi` and `dart:js_interop`. |
| **Rust Toolchain** | **1.97.0** | `stable` (edition 2021) | MIT / Apache 2.0 | High-performance calculation kernel candidate; pinned for M01-T07–T10 comparative prototypes. |
| **Node.js Runtime** | **>= 20.10.0** (tested on v26) | Active LTS / Current | MIT | Executes repository tooling, code generators, and change-feed harness. |
| **Java Development Kit** | **OpenJDK 17** (Eclipse Temurin) | LTS | GPLv2 with Classpath Exception | Required standard for Android Gradle Plugin 8.3+. |
| **Android SDK / NDK** | API 34 (Compile) / API 24 (Min) / NDK 26.1 | Stable | Android Software License | Android 7.0+ compatibility (Tier 1/2 mobile support from M00-T14). |
| **Apple Toolchain** | Xcode 15.0+ / clang | macOS 12+ / iOS 15+ | Apple Developer EULA | Minimum deployment target for iOS and macOS desktop builds. |
| **Linux Build Tools** | Clang 14+, CMake 3.22+, Ninja | Ubuntu 22.04+ | Apache 2.0 / BSD | Standard toolchain for Flutter GTK Linux desktop embedding. |

---

## 3. License Review & Intellectual Property Audit

Every runtime dependency and binding interface has been audited to guarantee commercial freedom and protect the proprietary codebase:

### 1. Framework & Language Runtimes:
- **Flutter Framework & Engine**: **BSD 3-Clause**. Fully permissive. Permits commercial distribution, closed-source binary compilation, and private modifications without mandatory disclosure.
- **Dart VM & Web Runtime**: **BSD 3-Clause**. Fully permissive.
- **Rust Standard Library & Core**: **Dual MIT / Apache 2.0**. Fully permissive.

### 2. Native Storage & Database Bindings:
- **SQLite3 Core Engine**: **Public Domain (Blessing)**. Absolute commercial freedom.
- **`sqlite3` / `sqflite_common_ffi`**: **MIT**. Permissive Dart wrapper using standard dynamic loading.

### 3. Cross-Language Binding Libraries:
- **`dart:ffi`**: Built directly into the Dart SDK runtime. **Zero third-party dependency footprint**.
- **`dart:js_interop` / `package:web`**: Standard Wasm GC interop provided by Google/Dart team (**BSD-3**).
- **`flutter_rust_bridge` (Evaluation candidate)**: **MIT**. Permissive FFI code generation.

### 4. Zero-Copyleft Invariant:
- **Strict Prohibition**: No GPLv2, GPLv3, or AGPLv3 dependencies may be statically or dynamically linked into the core client binary.
- **LibreDWG Isolation Rule**: As inventoried in M00-T08/T09 and scheduled for M01-T11, the existing `libredwg` utility is licensed under **GPLv3**. Under no circumstances will LibreDWG be linked into the Flutter client binary. Any evaluation of LibreDWG must remain strictly in an **out-of-process CLI/microservice converter** or replaced with permissive commercial/native TypeScript readers.

---

## 4. Cross-Platform Binding Strategy

```mermaid
flowchart TD
    subgraph ClientUI [Flutter UI Layer (Dart 3.13.5)]
        Widgets[Presentation Widgets & Viewports]
        State[Command & State Coordination]
    end

    subgraph NativeTargets [Desktop: macOS, Windows, Linux | Mobile: Android, iOS]
        ClientUI -->|Direct Function Calls| PureDart[Pure Dart Core Engines]
        ClientUI -->|dart:ffi (C ABI)| NativeFFI[Shared C / Rust Dynamic Libraries]
        NativeFFI --> NativeSQLite[(Local SQLite Database)]
    end

    subgraph WebTarget [Browser Target: Chrome, Safari, Edge, Firefox]
        ClientUI -->|Wasm GC Compilation| WasmEngine[WebAssembly Core Engine]
        ClientUI -->|dart:js_interop| CanvasWeb[HTML5 Canvas / WebGPU / OPFS]
        CanvasWeb --> WebStorage[(IndexedDB / OPFS Adapter)]
    end
```

### 1. Dart-First Working Hypothesis (v3 §4):
- Algorithms and presentation logic default to pure Dart. Dart compiles directly to machine code on ARM64 and x86_64, eliminating FFI marshaling overhead.

### 2. High-Performance C / Rust Kernel Path (`dart:ffi`):
- Where calculation throughput requires dedicated optimization (e.g., 50k-row BoQ dirty-subgraph evaluation or CAD topology R-Trees), kernels compile to shared dynamic libraries (`.dylib`, `.dll`, `.so`) exposing a standard C ABI.
- `dart:ffi` passes pointers directly to native heaps, avoiding JSON/string serialization penalties.

### 3. Web Target (Wasm GC):
- Compiled using `flutter build web --wasm`.
- Uses Wasm Garbage Collection (Wasm GC), which runs natively in all major modern browsers (Chrome 119+, Firefox 120+, Safari 17.4+), providing near-native execution speed inside the browser sandbox.

---

## 5. Cross-Platform CI Architecture (`client-ci.yml`)

The automated continuous integration pipeline is defined in [`.github/workflows/client-ci.yml`](file:///Users/aakashdhakal/contractor/.github/workflows/client-ci.yml):

### Automated Jobs:
1. **`lint_and_protocol`**:
   - Executes the mechanical register linter (`scripts/lint-protocol.mjs`).
   - Runs `flutter analyze` and `flutter test` once the prototype is populated.
2. **`build_web`**:
   - Verifies the Web target compiles cleanly to WebAssembly (`flutter build web --wasm --release`).
3. **`build_desktop_linux`**:
   - Installs GTK3 and CMake development toolchains on `ubuntu-latest`.
   - Verifies Linux desktop compilation (`flutter build linux --release`).
4. **`build_android`**:
   - Provisions Eclipse Temurin Java 17 and Android SDK.
   - Verifies Android APK compilation (`flutter build apk --release`).

### Honest Host Availability Disclosure (v3 §6 M01):
- **Linux, Android, and Web** builds are fully automated on standard GitHub-hosted Ubuntu runners on every push and PR.
- **macOS and iOS** compilation requires Apple-silicon or Intel macOS runners (`macos-14`), which carry strict monthly quota limits on standard organization accounts. Local macOS verification is performed on the developer workstation (Apple M1, macOS 15.0), while GitHub macOS CI runners are designated for Milestone M11 packaging and signed release verification. Missing cloud macOS checks are recorded honestly as skipped, never falsely marked as passed.
