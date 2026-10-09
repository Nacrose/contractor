# Design tokens

`tokens.json` is the canonical platform-token source for M02-T04. Its values
are mapped from the adopted `Construction_Manager/docs/DESIGN_SYSTEM.md` v2
color, typography, spacing, and status rules. Rule IDs and the intentional
font-metric/font-family differences are recorded with the source.

Run the generator after changing the source:

```sh
node packages/design_tokens/tool/generate.mjs
```

CI runs the same generator with `--check`; it fails if any generated artifact
is missing or differs, including hand-edited output.

Generated outputs:

- `react/tokens.css` — CSS custom properties for light and dark mode.
- `react/tokens.ts` — typed React/TypeScript token data.
- `packages/construction_ui/lib/src/generated_tokens.dart` — Flutter constants
  consumed by the shared component package.

The React app can consume the stylesheet with `@import` and the typed module
with a relative package import. The Flutter package exports its constants
through `construction_ui.dart`. The source retains the product's design-system
IDs; status colors are presentation tokens and do not define domain state.
