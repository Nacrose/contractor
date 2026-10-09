# M00-T14: Platform Support Matrix (OS, Browser, Hardware, Disk & Retention)

> **Status**: Draft Proposal for M01 Gate Ratification  
> **Milestone**: M00 (Inventory, Fixtures & Baseline)  
> **Depends on**: M00-T10 (Feature Matrix As Implemented)  
> **Output Artifact**: [`docs/reports/M00/platform-support-matrix.md`](file:///Users/aakashdhakal/contractor/docs/reports/M00/platform-support-matrix.md)  
> **Compliance**: Strict AI-Agent Execution Protocol v3 §6 M00 & §1 Scope (Covers all 6 surfaces; explicit unsupported/best-effort tiers; draft budgets for memory/startup/download)

---

## 1. Executive Summary & Objective

To realize the vision defined in [Platform Plan v3 §1](file:///Users/aakashdhakal/contractor/docs/plans/native-web-platform-plan-v3.md#1-outcome-and-scope), `Nacrose/contractor` delivers a unified construction management system across **six primary execution surfaces**:
1. **macOS** (Apple Silicon native & Intel x86_64)
2. **Windows** (Windows 10 / 11 64-bit)
3. **Linux** (Modern glibc distributions x86_64 & aarch64)
4. **Android** (Smartphones & rugged site tablets)
5. **iOS / iPadOS** (iPhones & iPads with Apple Pencil)
6. **Web Browser** (Modern standards-compliant desktop & mobile browsers)

This document establishes the official support tiers, hardware envelopes, local storage retention guarantees, disk quotas, and initial resource budgets. It sets explicit boundaries between **Tier 1 (Committed / Certified)**, **Tier 2 (Best-Effort / Community)**, and **Tier 3 (Explicitly Unsupported)** platforms.

---

## 2. Six-Surface Platform Support Matrix

### 2.1. Operating System & Runtime Support Tiers

| Surface | Tier 1: Committed Support (CI Verified) | Tier 2: Best-Effort (Community / Monitored) | Tier 3: Unsupported (Blocked / No Fixes) |
|---|---|---|---|
| **macOS** | • macOS 14 Sonoma (Apple Silicon & Intel)<br>• macOS 15 Sequoia (Apple Silicon & Intel) | • macOS 12 Monterey (Intel/AS)<br>• macOS 13 Ventura (Intel/AS) | • macOS 11 Big Sur and earlier<br>• 32-bit x86 / PowerPC |
| **Windows** | • Windows 11 64-bit (22H2+)<br>• Windows 10 64-bit (21H2+, Build 19044+) | • Windows 11 ARM64 (Snapdragon X Elite native/emulated)<br>• Windows Server 2022 | • 32-bit Windows (x86)<br>• Windows 8.1, 7, Vista, XP<br>• Windows 10 S-mode |
| **Linux** | • Ubuntu 22.04 LTS & 24.04 LTS (x86_64)<br>• Debian 12 Bookworm (x86_64)<br>• Fedora 39 / 40 (x86_64) | • Arch Linux (rolling)<br>• openSUSE Leap 15.5+<br>• Ubuntu ARM64 (Raspberry Pi 5 / RK3588) | • 32-bit x86 Linux (i686)<br>• Musl-based distros (Alpine desktop)<br>• Kernel < 5.15 LTS |
| **Android** | • Android 13 (API 33)<br>• Android 14 (API 34)<br>• Android 15 (API 35)<br>*(ARM64-v8a architecture)* | • Android 10, 11, 12 (API 29–32)<br>• Rugged devices (Zebra, Honeywell, Cat phones) | • Android 9 Pie and older (API $\le 28$)<br>• 32-bit only devices (armeabi-v7a deprecated)<br>• Android Go edition |
| **iOS / iPadOS** | • iOS / iPadOS 17.x<br>• iOS / iPadOS 18.x | • iOS / iPadOS 16.x | • iOS 15.x and older<br>• 32-bit iOS devices |
| **Web Browser** | • Google Chrome / Chromium 120+ (Desktop)<br>• Safari 17+ (macOS & iPadOS)<br>• Microsoft Edge 120+ (Desktop)<br>• Mozilla Firefox 125+ / 115 ESR | • Mobile Safari (iOS 16+)<br>• Mobile Chrome (Android 10+)<br>• Opera 105+, Brave 1.60+ | • Internet Explorer (all versions)<br>• Legacy Edge (EdgeHTML)<br>• Safari 15 and older<br>• Browsers without WebGL 2.0 |

---

## 3. Minimum & Recommended Hardware Specifications

Construction operations combine field data logging in harsh physical environments with intensive desktop engineering (50,000-row BoQ calculations, dense CAD drawings, 100-page PDF blueprints). Hardware requirements are bifurcated accordingly:

### 3.1. Mobile & Field Tablet Specifications (Android & iOS)

| Component | Minimum Specification (Field Entry / Punchlist) | Recommended Specification (Takeoff & Drawing Viewer) |
|---|---|---|
| **CPU Architecture** | 64-bit Quad-Core ARM (e.g. Snapdragon 680, Helio G88, Apple A12) | 64-bit Octa-Core ARM (Snapdragon 8 Gen 2/3, Dimensity 9200, Apple A15 / M-series) |
| **System RAM** | **4 GB RAM** (Android) / **3 GB RAM** (iOS) | **8 GB RAM** (Android) / **6 GB+ RAM** (iPadOS) |
| **Storage Available** | 4 GB free internal flash storage | 16 GB+ free high-speed UFS 3.1 / NVMe storage |
| **GPU / Graphics** | Vulkan 1.1 / OpenGL ES 3.1 (Metal on iOS) | Vulkan 1.3 / Adreno 740+ / Mali-G715 / Apple Metal 3 |
| **Display** | 720p HD ($1280 \times 720$), 400 nits outdoor brightness | 1080p FHD+ ($2400 \times 1080$) or 2K Retina, 1000+ nits sunlight readable |
| **Camera & Sensors** | 12 MP camera with autofocus, GPS/GLONASS | 48 MP+ camera with optical stabilization, Dual-frequency GNSS (L1+L5) |
| **Input Methods** | Multi-touch screen | Multi-touch + Active Stylus (Apple Pencil, S-Pen, USI 2.0) for drawing takeoff |

### 3.2. Desktop & Workstation Specifications (macOS, Windows, Linux)

| Component | Minimum Specification (General Contracting & Billing) | Recommended Specification (Heavy CAD & 100k BoQ Modeling) |
|---|---|---|
| **CPU** | 64-bit Dual/Quad-Core 2.0 GHz (Intel Core i5 8th Gen, Ryzen 3 3200G, Apple M1) | Modern 8-Core+ 3.5 GHz+ (Apple M2/M3/M4 Pro, Intel Core i7 13th Gen, Ryzen 7 7800X) |
| **System RAM** | **8 GB RAM** | **16 GB – 32 GB RAM** |
| **Storage Available** | 10 GB free SSD storage | 50 GB+ free PCIe NVMe SSD |
| **GPU Acceleration** | Hardware-accelerated graphics (Intel UHD 630, Radeon Vega 8) | Dedicated GPU with 4 GB+ VRAM (NVIDIA RTX 3060+, Radeon RX 6600+, Apple Silicon 10-core GPU) |
| **Display Resolution**| $1366 \times 768$ (Laptop standard) | Dual $1920 \times 1080$ FHD or single $2560 \times 1440$ (2K / 4K) @ 60–120 Hz |

---

## 4. Local Storage, Disk Budgets & Eviction Semantics

A critical vulnerability identified in Milestone **M00-T09** was the fragile nature of web storage (Safari 7-day ITP deletion, browser eviction of IndexedDB, lack of quota negotiation). The native Flutter client replaces this with **durable SQLite storage** and explicit disk retention partitions:

```
[ Local Storage Allocation Budget ]
├── Partition A: Durable Primary DB (SQLite / Drift) [100 MB – 1 GB]
│   ├── User Drafts & Outbox Sync Queue (NEVER EVICTED)
│   ├── Tenant Entity Graph (Projects, BOQ, Tasks, Accounts)
│   └── Offline Audit Trail & Mutation Log
├── Partition B: Document & Media Cache [Quota Managed]
│   ├── Mobile Default Quota: 2.0 GB (Configurable 1 GB – 10 GB)
│   ├── Desktop Default Quota: 10.0 GB (Configurable 5 GB – 50 GB)
│   └── Eviction: Strictly Least-Recently-Used (LRU) on server-backed files only
└── Partition C: Transient Temporary Files [Auto-Pruned]
    ├── PDF Render Buffers & Vector Export Scratch (< 250 MB)
    └── Cleared automatically on application cold start
```

### 4.1. Data Classification & Durability Guarantees

| Category | Storage Engine | Eviction Behavior | Offline Retention Guarantee |
|---|---|---|---|
| **Pending Outbox Mutations** | SQLite (`outbox_mutations` table) | **NEVER EVICTED**. Retained indefinitely until server commits or user cancels. | Unsynchronized changes survive app restart, device reboot, and OS app updates. |
| **Private Drafts** | SQLite (`entity_drafts` table) | **NEVER EVICTED**. Managed explicitly by the user (discard or submit). | Retained locally until explicitly submitted or deleted. |
| **Active Project Records** | SQLite (Relational entities with RLS tag) | Retained while user is actively assigned to the project. Pruned only on project archive. | Full read/write offline access for active project portfolio. |
| **Downloaded Field Photos & Media** | Local File System (Application Sandbox) | **LRU Eviction** when cache exceeds quota. Only files confirmed uploaded to S3/MinIO may be purged. | Full offline availability for pinned / recent site logs. |
| **Downloaded CAD & PDF Drawings** | Local File System (`drawings_cache/`) | LRU Eviction with explicit *"Pin Offline"* option. Pinned sheets are never purged. | Pinned drawings remain offline indefinitely. |
| **Browser Storage Fallback** | IndexedDB via OPFS (Origin Private File System) | Subject to browser quota. Request `navigator.storage.persist()`. | Best-effort on web; native app recommended for guaranteed multi-month offline work. |

---

## 5. Draft Resource Budgets for M01 Finalization

Per [Platform Plan v3 §7](file:///Users/aakashdhakal/contractor/docs/plans/native-web-platform-plan-v3.md#7-performance-acceptance-and-measurement), the following draft targets are established as proposals for Milestone **M01** (Platform Feasibility Gate) to benchmark and ratify on declared minimum hardware:

### 5.1. Startup & Interactive Latency Budgets

| Metric | Target Specification (Minimum Hardware) | Measurement Method |
|---|---|---|
| **Cold Startup to Usable Shell** | $\le 1,500\text{ ms}$ (Mobile) / $\le 1,000\text{ ms}$ (Desktop) | From process spawn to first interactive frame render |
| **Warm Resume / Navigation** | $\le 250\text{ ms}$ across local screens | Page transition / route switch with local cached data |
| **Local Field Save (No byte copy)** | $\le 50\text{ ms}$ (p95) on declared minimum device | Transaction commit into local SQLite outbox queue |
| **Ordinary Cell Input Response** | $\le 50\text{ ms}$ (p95) | Keypress to visible character render on worksheet |
| **Viewport Frame Time (60 Hz)** | $\le 16.7\text{ ms}$ (p95 frame time) | CAD pan/zoom and BoQ scrolling on 60 Hz display |
| **High-Refresh Frame Time (120 Hz)**| $\le 8.3\text{ ms}$ (p95 frame time) | On ProMotion / 120 Hz supported devices (iPad Pro, Flagships) |

### 5.2. Memory (RAM) Footprint Budgets

| Target Execution Surface | Base Steady-State RAM | Peak Engineering RAM (50k BoQ / Dense CAD) | Background Idle RAM |
|---|---|---|---|
| **Mobile (Android & iOS)** | $\le 120\text{ MB}$ | $\le 350\text{ MB}$ (Stay below OS OOM termination threshold) | $\le 45\text{ MB}$ |
| **Desktop (macOS, Windows, Linux)** | $\le 180\text{ MB}$ | $\le 650\text{ MB}$ | $\le 75\text{ MB}$ |
| **Web Browser (Desktop)** | $\le 150\text{ MB}$ | $\le 500\text{ MB}$ (V8 heap limit safety) | Tab inactive |

### 5.3. Binary Download & Package Size Budgets

| Surface / Distribution Channel | Target Uncompressed Install Size | Target Download / Store Bundle Size |
|---|---|---|
| **Android (Google Play / Direct APK)** | $\le 75\text{ MB}$ on device | $\le 28\text{ MB}$ download (Android App Bundle, split ABIs) |
| **iOS / iPadOS (App Store)** | $\le 95\text{ MB}$ on device | $\le 38\text{ MB}$ download (App Thinning / bitcode stripped) |
| **macOS (Universal DMG / PKG)** | $\le 120\text{ MB}$ (Intel + Apple Silicon universal) | $\le 55\text{ MB}$ zipped download |
| **Windows (MSIX / InnoSetup Installer)**| $\le 90\text{ MB}$ on device | $\le 45\text{ MB}$ compressed installer |
| **Linux (AppImage / Flatpak / deb)** | $\le 110\text{ MB}$ | $\le 50\text{ MB}$ download |
| **Web Browser (Initial PWA Shell)** | N/A | $\le 3.5\text{ MB}$ Brotli-compressed initial load bundle |

---

## 6. Explicit Limitations & Non-Goals

1. **No Indestructible Local Storage**:
   Local SQLite provides crash-resilient ACID transactions, but physical device loss, deliberate OS factory reset, or hardware destruction cannot be mitigated without cloud synchronization.
2. **Server Financial Authority Remains Non-Negotiable**:
   Offline clients compute estimates, drafts, and preliminary valuations locally. However, official Interim Payment Certificates (IPC), tax invoices, journal entries, and payroll dispatches **cannot finalize offline**; they require server commit and sequential serial generation.
3. **No Unrestricted Mobile Background Execution**:
   iOS and Android aggressively suspend background network activities to preserve battery. Heavy multi-gigabyte photo synchronization or full database rebuilds cannot guarantee completion in the background without foreground user focus.
4. **CAD Entity Envelope**:
   The cross-platform client commits to civil construction 2D/3D site plans, structural drawings, and architectural layouts (up to 100,000 entities). It is explicitly **not** a replacement for full AutoCAD 3D solid modeling, photorealistic raytracing, or multi-gigabyte plant design models.

---

## 7. Sign-Off & Progression to M00-T15

With the completion of **M00-T14**, all preliminary inventory, fixture, baseline test, and support matrix prerequisites for Milestone M00 are established:
- Router & writer inventory complete (**M00-T07**, **M00-T08**).
- Client stores & document format inventory complete (**M00-T09**).
- Feature matrix as implemented complete (**M00-T10**).
- Behavior fixtures and manifest complete (**M00-T11**).
- Test baseline and known bugs captured (**M00-T12**).
- Hardware performance profile measured (**M00-T13**).
- Six-surface platform support matrix drafted (**M00-T14**).

The program is now prepared to advance to the **Change-Feed Spike Harness** (**M00-T15** through **M00-T18**).
