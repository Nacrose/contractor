# M04-T07 device telemetry and capacity re-baseline progress

- **Status:** open; a paired iPhone is available and the owner reports the daily-report page is visible. Connected authentication and a server-backed workflow session are not verified, so no telemetry or capacity-band proposal is claimed.
- **Date checked:** 2026-10-11.
- **Capture host:** macOS 27.0, Apple Silicon.

## Device inventory

The earlier 2026-10-10 device inventory found macOS desktop and Chrome 154 only, no wireless devices, and no configured emulator sources. That checkpoint could not provide real-device sessions.

## Required session evidence not captured

- Sync latency, battery/background behavior, and crash-free rate during the ratified device workflow.
- Correlated M03-T08 server outcome counters, feed lag, checkpoint age, and attachment retries for one full sync session.
- End-to-end crash-report sanitization from an installed app.
- Measured throughput to support a capacity re-baseline proposal.

## Server instrumentation audit

The central M03-T08 `SyncMetrics` implementation is present in the product repo's vendored Contractor package. The current product `/api/native/sync` and resumable photo-upload routes do not call it, and no authorized session-metrics read route is wired. Therefore the required server outcome counters, feed lag, checkpoint age, and attachment retry/error counts cannot yet be correlated with a device session. Approval to wire this existing package into the product routes and expose a scoped metrics read is pending.

The contractor-side Flutter test suite uses SQLite and a deterministic fake transport; those results are not device telemetry or server metrics. No effort bands are proposed for change without measurements. The owner has since provided `flutter doctor` output showing a paired iPhone 15 Pro Max on iOS 26.6.2. The current evidence gap is a verified connected native server session, followed by capturing a full device session and correlated server metrics.

## Current device/build checkpoint (2026-10-11)

The owner has a paired iPhone 15 Pro Max on iOS 26.6.2 with Developer Mode enabled, based on the device details and `flutter doctor` output the owner provided. This agent did not launch the app, inspect the device screen, or collect device logs, following the owner’s request to handle device review personally. The connected iOS release target compiled with code signing disabled; the connected macOS release app and web release bundle also compiled. Compilation is not device telemetry.

The local login route was rechecked from the Mac: `http://127.0.0.1:3108/login` and the Wi-Fi forwarder at `http://192.168.1.66:3000/login` both returned HTTP 200. The Next.js server and forwarder processes are listening. This verifies local route readiness only; it does not prove iPhone reachability, native sign-in, project access, or report sync.

No real workflow session, sync-latency sample, battery/background observation, crash-free session data, sanitized crash sample, or correlated server metrics has been captured. A later owner screenshot showed the actual server error: missing `DATABASE_URL`; the local database/server configuration has since been restored. The owner later reported that the daily-report page is open in the iPhone app, but this does not establish whether the build is connected or in local preview, or whether authentication and sync succeeded. The capacity-band proposal remains open until a connected workflow session and measurements exist.
