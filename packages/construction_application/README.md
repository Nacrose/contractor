# construction_application

Shared application-level route, command, and capability registries. This
package contains typed identities and availability metadata; it does not
contain route widgets, command handlers, permissions, or domain logic.

Capabilities explicitly list supported platforms and a visible fallback for
each unsupported platform. Navigation projections retain unsupported routes
with their fallback data so consumers can explain availability instead of
hiding a feature behind an install prompt. Commands use the same capability
projection for feature availability. Authorization remains authoritative in
the service/server layer and is never inferred from these client registries.

## Consumer projection

Navigation and command surfaces consume the registry projections for the active
platform, then render every entry and its declared fallback. They must not drop
unavailable routes or use capability metadata to authorize a handler.

```dart
final entries = routes.navigationFor(platform, capabilities);
for (final entry in entries) {
  // Keep entry.route in navigation; show its fallback when !entry.available.
}

final commandsForPlatform = commands.availableFor(platform, capabilities);
```

`RouteRegistry` validates capability references at construction, while
`CapabilityDefinition` requires one explicit fallback for each unsupported
platform. The package defines this adapter contract without cutting existing
production routes over.

## Checks

```sh
flutter pub get
flutter analyze
flutter test
```
