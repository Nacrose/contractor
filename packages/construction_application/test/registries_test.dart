import 'package:construction_application/construction_application.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final documents = CapabilityId('documents.viewer');
  late CapabilityRegistry capabilities;

  setUp(() {
    capabilities = CapabilityRegistry([
      CapabilityDefinition(
        id: documents,
        supportedPlatforms: {
          ConstructionPlatform.web,
          ConstructionPlatform.macos,
        },
        fallbacks: {
          ConstructionPlatform.android: const ShowUnavailable(
            'Document viewing is not available on this platform yet.',
          ),
          ConstructionPlatform.ios: const ShowUnavailable(
            'Document viewing is not available on this platform yet.',
          ),
          ConstructionPlatform.windows: const ShowUnavailable(
            'Document viewing is not available on this platform yet.',
          ),
          ConstructionPlatform.linux: const ShowUnavailable(
            'Document viewing is not available on this platform yet.',
          ),
        },
      ),
    ]);
  });

  test(
    'capabilities require an explicit fallback on every unsupported target',
    () {
      expect(
        () => CapabilityDefinition(
          id: documents,
          supportedPlatforms: {ConstructionPlatform.web},
          fallbacks: const {},
        ),
        throwsArgumentError,
      );
    },
  );

  test('capability availability returns the declared fallback', () {
    final result = capabilities.availability(
      documents,
      ConstructionPlatform.android,
    );

    expect(result.available, isFalse);
    expect(result.fallback, isA<ShowUnavailable>());
    expect(
      (result.fallback! as ShowUnavailable).message,
      contains('not available'),
    );
  });

  test('navigation retains unsupported routes and their fallback data', () {
    final route = RouteDefinition(
      id: RouteId('documents.open'),
      path: '/documents',
      label: 'Documents',
      requiredCapabilities: [documents],
    );
    final registry = RouteRegistry(routes: [route], capabilities: capabilities);

    final entries = registry.navigationFor(
      ConstructionPlatform.android,
      capabilities,
    );

    expect(entries, hasLength(1));
    expect(entries.single.route.id, route.id);
    expect(entries.single.available, isFalse);
    expect(
      entries.single.unavailableCapabilities.single.fallback,
      isA<ShowUnavailable>(),
    );
  });

  test(
    'routes resolve only stable identities and reject unknown capabilities',
    () {
      final routeId = RouteId('documents.open');
      final registry = RouteRegistry(
        routes: [
          RouteDefinition(
            id: routeId,
            path: '/documents',
            label: 'Documents',
            requiredCapabilities: [documents],
          ),
        ],
        capabilities: capabilities,
      );

      expect(registry[routeId].path, '/documents');
      expect(() => RouteId('Documents Open'), throwsArgumentError);
      expect(
        () => RouteRegistry(
          routes: [
            RouteDefinition(
              id: routeId,
              path: '/documents',
              label: 'Documents',
              requiredCapabilities: [CapabilityId('unknown.capability')],
            ),
          ],
          capabilities: capabilities,
        ),
        throwsStateError,
      );
    },
  );

  test('registries reject duplicate stable identities', () {
    expect(
      () => CapabilityRegistry([
        CapabilityDefinition(
          id: documents,
          supportedPlatforms: ConstructionPlatform.values.toSet(),
          fallbacks: const {},
        ),
        CapabilityDefinition(
          id: documents,
          supportedPlatforms: ConstructionPlatform.values.toSet(),
          fallbacks: const {},
        ),
      ]),
      throwsArgumentError,
    );
  });

  test('command availability is platform metadata, not authorization', () {
    final command = CommandDefinition(
      id: CommandId('documents.export'),
      label: 'Export document',
      requiredCapabilities: [documents],
    );
    final registry = CommandRegistry(
      commands: [command],
      capabilities: capabilities,
    );

    final desktop = registry.availableFor(
      ConstructionPlatform.macos,
      capabilities,
    );
    final mobile = registry.availableFor(
      ConstructionPlatform.ios,
      capabilities,
    );

    expect(desktop.single.available, isTrue);
    expect(mobile.single.available, isFalse);
    expect(
      mobile.single.unavailableCapabilities.single.fallback,
      isA<ShowUnavailable>(),
    );
  });
}
