# Contractor OS Flutter client

This folder contains the shared Flutter client and the current M04 daily-report/photo vertical. It builds for iOS, macOS, and web from the same Dart UI. It is not the full original app yet; the remaining workflows are scheduled in later milestones.

`apps/construction_client/` is a separate Flutter starter scaffold and still shows the sample counter. Use this folder to run the M04 app.

## Run on the iPhone

Connect the iPhone to the Mac and keep both on the same Wi-Fi network. From this directory, run:

```sh
flutter pub get
flutter run -d 00008130-000945602132001C \
  --dart-define=CONTRACTOR_SERVER_URL=http://192.168.1.66:3108
```

Replace `192.168.1.66` with the Mac's current Wi-Fi IP if it has changed. Running with `flutter run` launches the debug app through Flutter tooling; a debug build will not start from the iPhone Home Screen by itself. If Xcode requests signing, open `ios/Runner.xcworkspace`, select the `Runner` target, enable automatic signing, and choose the Personal Team, then retry the command.

## Run on macOS

The Mac can use its loopback address for the local server:

```sh
flutter run -d macos \
  --dart-define=CONTRACTOR_SERVER_URL=http://127.0.0.1:3108
```

To run offline with a sample project and no server sign-in, omit `CONTRACTOR_SERVER_URL`; the app then opens in local-preview mode.
