import 'package:flutter/material.dart';

import 'generated_tokens.dart';

/// Semantic roles corresponding to the product's design-system tokens.
///
/// M02-T04 will provide generated values from the canonical token source.
/// Defaults use the host Material color scheme so this package does not own
/// a competing palette.
@immutable
class ConstructionSemanticColors
    extends ThemeExtension<ConstructionSemanticColors> {
  const ConstructionSemanticColors({
    required this.success,
    required this.info,
    required this.amber,
    required this.neutral,
  });

  final Color success;
  final Color info;
  final Color amber;
  final Color neutral;

  static ConstructionSemanticColors fromScheme(ColorScheme scheme) =>
      fromBrightness(scheme.brightness);

  static ConstructionSemanticColors fromBrightness(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    return ConstructionSemanticColors(
      success: dark
          ? ConstructionTokens.darkSuccess
          : ConstructionTokens.lightSuccess,
      info: dark ? ConstructionTokens.darkInfo : ConstructionTokens.lightInfo,
      amber: dark
          ? ConstructionTokens.darkAmber
          : ConstructionTokens.lightAmber,
      neutral: dark
          ? ConstructionTokens.darkMutedForeground
          : ConstructionTokens.lightMutedForeground,
    );
  }

  @override
  ConstructionSemanticColors copyWith({
    Color? success,
    Color? info,
    Color? amber,
    Color? neutral,
  }) => ConstructionSemanticColors(
    success: success ?? this.success,
    info: info ?? this.info,
    amber: amber ?? this.amber,
    neutral: neutral ?? this.neutral,
  );

  @override
  ConstructionSemanticColors lerp(
    covariant ConstructionSemanticColors? other,
    double t,
  ) {
    if (other == null) return this;
    return ConstructionSemanticColors(
      success: Color.lerp(success, other.success, t)!,
      info: Color.lerp(info, other.info, t)!,
      amber: Color.lerp(amber, other.amber, t)!,
      neutral: Color.lerp(neutral, other.neutral, t)!,
    );
  }
}

extension ConstructionThemeColors on BuildContext {
  ConstructionSemanticColors get constructionColors =>
      Theme.of(this).extension<ConstructionSemanticColors>() ??
      ConstructionSemanticColors.fromScheme(Theme.of(this).colorScheme);
}
