# Shared UI foundations

Brand colors are Tailwind v4 theme tokens in `web/src/index.css`. Use `tsPrimary`, `tsNavy`, `tsGold`, `tsAmber`, `tsText` and `tsSurface` through normal utilities, including opacity, gradient, border, ring and focus variants. Legacy CSS variables alias these tokens; avoid adding hand-written copies of individual utility classes.

Body text uses DM Sans and headings use Satoshi, matching the font stylesheets already linked by `web/index.html`. Base typography stays in `@layer base`, so component utility colors and type sizes take precedence. In particular, a white dialog heading remains white on a dark surface.

Muted text uses `warm-400` (#626C58) or darker on white and `warm-50`. Contrast for `warm-400` is 5.52:1 on white and 5.22:1 on `warm-50`; `warm-500` is darker. Pale shades such as `warm-300` are for borders and decoration. Check contrast again on other backgrounds. Gold is an accent, not a default text color on light surfaces.

The cart header uses an explicit `bg-tsPrimary`/white pair (12.41:1). Its close control and Remove action have 44px hit areas. Shared dialog behavior and keyboard focus management are documented with the dialog primitive separately.
