/// Runtime targets supported by the Construction Manager clients.
enum ConstructionPlatform { web, android, ios, macos, windows, linux }

/// Stable identity used for a route. It is not a display label or permission.
final class RouteId {
  RouteId(this.value) {
    _validateIdentity(value, 'route');
  }

  final String value;

  @override
  bool operator ==(Object other) => other is RouteId && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => value;
}

/// Stable identity used for a user or system command.
final class CommandId {
  CommandId(this.value) {
    _validateIdentity(value, 'command');
  }

  final String value;

  @override
  bool operator ==(Object other) => other is CommandId && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => value;
}

/// Stable identity for a capability that may be presented on a platform.
/// Capabilities describe product availability only; they are not authorization.
final class CapabilityId {
  CapabilityId(this.value) {
    _validateIdentity(value, 'capability');
  }

  final String value;

  @override
  bool operator ==(Object other) =>
      other is CapabilityId && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => value;
}

void _validateIdentity(String value, String kind) {
  if (!RegExp(r'^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$').hasMatch(value)) {
    throw ArgumentError.value(
      value,
      kind,
      'Use a stable lowercase identifier such as project.list.',
    );
  }
}

/// Explicit behavior for platforms where a capability is unavailable.
sealed class CapabilityFallback {
  const CapabilityFallback();
}

/// Keep the feature visible and explain why the current platform cannot use it.
final class ShowUnavailable extends CapabilityFallback {
  const ShowUnavailable(this.message);

  final String message;
}

/// Route to an explicitly registered equivalent flow, commonly the web route.
final class UseFallbackRoute extends CapabilityFallback {
  const UseFallbackRoute(this.routeId);

  final RouteId routeId;
}

final class CapabilityDefinition {
  CapabilityDefinition({
    required this.id,
    required Set<ConstructionPlatform> supportedPlatforms,
    required Map<ConstructionPlatform, CapabilityFallback> fallbacks,
  }) : supportedPlatforms = Set.unmodifiable(supportedPlatforms),
       fallbacks = Map.unmodifiable(fallbacks) {
    if (this.supportedPlatforms.isEmpty) {
      throw ArgumentError.value(
        supportedPlatforms,
        'supportedPlatforms',
        'A capability must identify at least one supported platform.',
      );
    }
    final unsupported = ConstructionPlatform.values
        .where((platform) => !this.supportedPlatforms.contains(platform))
        .toSet();
    if (!setEquals(this.fallbacks.keys.toSet(), unsupported)) {
      throw ArgumentError.value(
        fallbacks,
        'fallbacks',
        'Declare exactly one visible fallback for every unsupported platform.',
      );
    }
    for (final fallback in this.fallbacks.values) {
      if (fallback case ShowUnavailable(:final message)
          when message.trim().isEmpty) {
        throw ArgumentError.value(
          message,
          'fallback message',
          'Explain why the feature is unavailable.',
        );
      }
    }
  }

  final CapabilityId id;
  final Set<ConstructionPlatform> supportedPlatforms;
  final Map<ConstructionPlatform, CapabilityFallback> fallbacks;

  CapabilityAvailability availabilityOn(ConstructionPlatform platform) {
    final fallback = fallbacks[platform];
    return CapabilityAvailability(
      available: fallback == null,
      fallback: fallback,
    );
  }
}

final class CapabilityAvailability {
  const CapabilityAvailability({required this.available, this.fallback});

  final bool available;
  final CapabilityFallback? fallback;
}

final class CapabilityRegistry {
  CapabilityRegistry(Iterable<CapabilityDefinition> definitions)
    : _byId = _indexUnique(definitions, (definition) => definition.id.value);

  final Map<String, CapabilityDefinition> _byId;

  Iterable<CapabilityDefinition> get all => _byId.values;

  CapabilityDefinition operator [](CapabilityId id) {
    final definition = _byId[id.value];
    if (definition == null) {
      throw StateError('Unknown capability: ${id.value}');
    }
    return definition;
  }

  CapabilityAvailability availability(
    CapabilityId id,
    ConstructionPlatform platform,
  ) => this[id].availabilityOn(platform);
}

final class RouteDefinition {
  RouteDefinition({
    required this.id,
    required this.path,
    required this.label,
    required Iterable<CapabilityId> requiredCapabilities,
  }) : requiredCapabilities = List.unmodifiable(requiredCapabilities) {
    if (!path.startsWith('/') || path.contains(' ')) {
      throw ArgumentError.value(path, 'path', 'Use a stable absolute route.');
    }
    if (label.trim().isEmpty) {
      throw ArgumentError.value(label, 'label', 'A route needs a label.');
    }
  }

  final RouteId id;
  final String path;
  final String label;
  final List<CapabilityId> requiredCapabilities;
}

final class NavigationEntry {
  const NavigationEntry({
    required this.route,
    required this.available,
    required this.unavailableCapabilities,
  });

  final RouteDefinition route;
  final bool available;

  /// Retained in the projection so navigation can show an explicit fallback
  /// instead of hiding the route or prompting for an installation.
  final List<CapabilityAvailability> unavailableCapabilities;
}

final class RouteRegistry {
  RouteRegistry({
    required Iterable<RouteDefinition> routes,
    required CapabilityRegistry capabilities,
  }) : _byId = _indexUnique(routes, (route) => route.id.value) {
    _validateCapabilityReferences(
      _byId.values.map((route) => route.requiredCapabilities),
      capabilities,
    );
  }

  final Map<String, RouteDefinition> _byId;

  Iterable<RouteDefinition> get all => _byId.values;

  RouteDefinition operator [](RouteId id) {
    final route = _byId[id.value];
    if (route == null) throw StateError('Unknown route: ${id.value}');
    return route;
  }

  /// Returns every route for navigation, carrying availability and fallback
  /// data instead of silently hiding unsupported features.
  List<NavigationEntry> navigationFor(
    ConstructionPlatform platform,
    CapabilityRegistry capabilities,
  ) => List.unmodifiable(
    _byId.values.map((route) {
      final unavailable = route.requiredCapabilities
          .map((id) => capabilities.availability(id, platform))
          .where((availability) => !availability.available)
          .toList(growable: false);
      return NavigationEntry(
        route: route,
        available: unavailable.isEmpty,
        unavailableCapabilities: List.unmodifiable(unavailable),
      );
    }),
  );
}

final class CommandDefinition {
  CommandDefinition({
    required this.id,
    required this.label,
    required Iterable<CapabilityId> requiredCapabilities,
  }) : requiredCapabilities = List.unmodifiable(requiredCapabilities) {
    if (label.trim().isEmpty) {
      throw ArgumentError.value(label, 'label', 'A command needs a label.');
    }
  }

  final CommandId id;
  final String label;
  final List<CapabilityId> requiredCapabilities;
}

final class CommandAvailability {
  const CommandAvailability({
    required this.command,
    required this.available,
    required this.unavailableCapabilities,
  });

  final CommandDefinition command;
  final bool available;
  final List<CapabilityAvailability> unavailableCapabilities;
}

final class CommandRegistry {
  CommandRegistry({
    required Iterable<CommandDefinition> commands,
    required CapabilityRegistry capabilities,
  }) : _byId = _indexUnique(commands, (command) => command.id.value) {
    _validateCapabilityReferences(
      _byId.values.map((command) => command.requiredCapabilities),
      capabilities,
    );
  }

  final Map<String, CommandDefinition> _byId;

  Iterable<CommandDefinition> get all => _byId.values;

  CommandDefinition operator [](CommandId id) {
    final command = _byId[id.value];
    if (command == null) throw StateError('Unknown command: ${id.value}');
    return command;
  }

  /// Provides feature availability only. Commands still require service-side
  /// authorization when executed; no authorization decision is encoded here.
  List<CommandAvailability> availableFor(
    ConstructionPlatform platform,
    CapabilityRegistry capabilities,
  ) => List.unmodifiable(
    _byId.values.map((command) {
      final unavailable = command.requiredCapabilities
          .map((id) => capabilities.availability(id, platform))
          .where((availability) => !availability.available)
          .toList(growable: false);
      return CommandAvailability(
        command: command,
        available: unavailable.isEmpty,
        unavailableCapabilities: List.unmodifiable(unavailable),
      );
    }),
  );
}

Map<String, T> _indexUnique<T>(
  Iterable<T> values,
  String Function(T) identity,
) {
  final indexed = <String, T>{};
  for (final value in values) {
    final key = identity(value);
    if (indexed.containsKey(key)) {
      throw ArgumentError('Duplicate registry identity: $key');
    }
    indexed[key] = value;
  }
  return Map.unmodifiable(indexed);
}

void _validateCapabilityReferences(
  Iterable<Iterable<CapabilityId>> references,
  CapabilityRegistry capabilities,
) {
  for (final ids in references) {
    for (final id in ids) {
      capabilities[id];
    }
  }
}

bool setEquals<T>(Set<T> left, Set<T> right) =>
    left.length == right.length && left.containsAll(right);
