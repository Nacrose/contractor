# M04-T07 device telemetry and capacity re-baseline progress

- **Status:** open; a paired iPhone is available, but live authentication and the server-backed workflow are not yet working, so no telemetry or capacity-band proposal is claimed.
- **Date checked:** 2026-10-11.
- **Capture host:** macOS 27.0, Apple Silicon.

## Device inventory

The earlier 2026-10-10 device inventory found macOS desktop and Chrome 154 only, no wireless devices, and no configured emulator sources. That checkpoint could not provide real-device sessions.

## Required session evidence not captured

- Sync latency, battery/background behavior, and crash-free rate during the ratified device workflow.
- Correlated M03-T08 server outcome counters, feed lag, checkpoint age, and attachment retries for one full sync session.
- End-to-end crash-report sanitization from an installed app.
- Measured throughput to support a capacity re-baseline proposal.

The contractor-side Flutter test suite uses SQLite and a deterministic fake transport; those results are not device telemetry or server metrics. No effort bands are proposed for change without measurements. The owner has since provided `flutter doctor` output showing a paired iPhone 15 Pro Max on iOS 26.6.2. The current blocker is the authenticated native server workflow, followed by capturing a full device session and correlated server metrics.

## Current device/build checkpoint (2026-10-11)

The owner has a paired iPhone 15 Pro Max on iOS 26.6.2 with Developer Mode enabled, based on the device details and `flutter doctor` output the owner provided. This agent did not launch the app, inspect the device screen, or collect device logs, following the owner’s request to handle device review personally. The updated iOS release target compiled successfully with code signing disabled; the macOS debug app and web release bundle also compiled. Compilation is not device telemetry.

No real workflow session, sync-latency sample, battery/background observation, crash-free session data, sanitized crash sample, or correlated server metrics has been captured. The user-checked `:3108/login` page confirmed only that the local login page renders. The latest iPhone sign-in attempt reloaded the login page; server logs show no login POST or native token exchange. Keep the capacity-band proposal open until authentication succeeds and those measurements exist.
