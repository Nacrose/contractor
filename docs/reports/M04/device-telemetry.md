# M04-T07 device telemetry and capacity re-baseline progress

- **Status:** blocked on the ratified mobile device profile and live daily-report server binding; no telemetry or capacity-band proposal is claimed.
- **Date checked:** 2026-10-10.
- **Capture host:** macOS 27.0, Apple Silicon.

## Device inventory

`flutter devices` found macOS desktop and Chrome 154 only. It found no wireless devices. `flutter emulators` reported no configured emulator sources. This host therefore cannot provide the Android/iOS real-device sessions required by M04-T07.

## Required session evidence not captured

- Sync latency, battery/background behavior, and crash-free rate during the ratified device workflow.
- Correlated M03-T08 server outcome counters, feed lag, checkpoint age, and attachment retries for one full sync session.
- End-to-end crash-report sanitization from an installed app.
- Measured throughput to support a capacity re-baseline proposal.

The contractor-side Flutter test suite uses SQLite and a deterministic fake transport; those results are not device telemetry or server metrics. No effort bands are proposed for change without measurements. Resume this task after the mobile device profile is available and the product binding is merged.

## Current device/build checkpoint (2026-10-11)

The owner has a paired iPhone 15 Pro Max on iOS 26.6.2 with Developer Mode enabled, based on the device details and `flutter doctor` output the owner provided. This agent did not launch the app, inspect the device screen, or collect device logs, following the owner’s request to handle device review personally. The updated iOS release target compiled successfully with code signing disabled; the macOS debug app and web release bundle also compiled. Compilation is not device telemetry.

No real workflow session, sync-latency sample, battery/background observation, crash-free session data, sanitized crash sample, or correlated server metrics has been captured. The user-checked `:3108/login` page confirms only that the local login page renders. Keep the capacity-band proposal open until those measurements exist.
