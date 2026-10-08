# M01-T02: Disposable Prototype Shell Scaffold (`prototype/construction_client/`)

> **Status**: Scaffolded, Verified & Multi-Platform Compatible  
> **Milestone**: M01 (Platform Feasibility & Performance Gate)  
> **Target Project**: [`prototype/construction_client/`](file:///Users/aakashdhakal/contractor/prototype/construction_client/)  
> **Output Artifacts**: [`prototype/construction_client/`](file:///Users/aakashdhakal/contractor/prototype/construction_client/) & [`docs/reports/M01/prototype-shell.md`](file:///Users/aakashdhakal/contractor/docs/reports/M01/prototype-shell.md)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 §6 M01 (Scope discipline: disposable technical prototype; zero production formulas in widgets; zero production feature code)

---

## 1. Executive Summary

Milestone task **M01-T02** establishes the technical prototype application shell at [`prototype/construction_client/`](file:///Users/aakashdhakal/contractor/prototype/construction_client/).

In accordance with Platform Plan v3 §6 M01 scope discipline:
- **Strictly Disposable**: The shell is explicitly isolated under `prototype/` (separate from production code), labeled as a technical test bed across all screens, and carries no production cutover expectations.
- **Zero Domain Formulas in Widgets**: Widgets only coordinate layout, rendering, and interaction test beds; all domain calculation math remains strictly isolated from presentation widgets.
- **Multi-Platform Support**: Generated native runners for macOS, Linux, Windows, Android, iOS, and Web.

---

## 2. Prototype Architecture & Layout

The prototype shell implements a dark slate design system with interactive navigation:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ DISPOSABLE TECHNICAL PROTOTYPE (M01): Feasibility test bed only. Not production.   │
├─────────┬──────────────────────────────────────────────────────────────────────────────┤
│ NavRail │ Active Viewport Test Bed:                                                    │
│         │                                                                              │
│ [Overv] │ 1. System Overview: Platform diagnostics, DPR, graphics engine detection.    │
│ [Sheet] │ 2. Worksheet Viewport (M01-T04 Preview): Virtualized 500-row recycling grid. │
│ [ CAD ] │ 3. CAD 2D Canvas (M01-T05 Preview): Pan/zoom custom painter, crosshairs.    │
│ [ PDF ] │ 4. PDF Takeoff (M01-T06 Preview): Blueprint viewport test bed placeholder.   │
│ [Sync ] │ 5. Storage & Sync (M01-T03/T13 Preview): LSN watermark & dedup monitor.     │
└─────────┴──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Compilation & Boot Verification

### 1. Flutter Web (Wasm GC & JavaScript Fallback):
- **Command**: `flutter build web --wasm --release`
- **Duration**: 24.1 seconds
- **Output Artifacts**:
  - `build/web/main.dart.wasm` (1,658,175 bytes / 1.66 MB)
  - `build/web/main.dart.js` (2,091,949 bytes / 2.09 MB fallback)
  - `build/web/flutter.js` + `flutter_bootstrap.js`
- **Result**: `✓ Built build/web` with exit code 0.

### 2. Static Analysis & Lint:
- **Command**: `flutter analyze`
- **Output**: `No issues found! (ran in 5.1s)`

### 3. Widget Unit & Layout Tests:
- **Command**: `flutter test`
- **Test File**: `test/widget_test.dart`
- **Assertions Verified**:
  - Mandatory governance banner renders with exact disclaimer text.
  - All 5 navigation tabs render and accept tab switching.
  - Metric cards and diagnostics render cleanly.
- **Result**: `00:00 +1: All tests passed!`

---

## 4. Platform Runner Inventory

The following platform runners were generated and placed under `prototype/construction_client/`:
- `web/`: HTML5 bootstrap, Wasm manifest, and service worker.
- `macos/`: Cocoa runner and Xcode project files.
- `linux/`: GTK C++ application runner and CMake configuration.
- `windows/`: Win32 C++ runner and CMake configuration.
- `android/`: Android Gradle build configuration, Kotlin application wrapper.
- `ios/`: iOS UIKit runner and Xcode project files.

---

## 5. Next Steps

With the shell verified and bootable, Milestone M01 proceeds to:
- `M01-T03`: Browser target proof: standalone startup and data access without native plugins or local server.
- `M01-T04`: Representative worksheet grid interaction prototype (50k rows).
- `M01-T05`: Representative CAD 2D viewport prototype (pan, zoom, snap, R-Tree).
