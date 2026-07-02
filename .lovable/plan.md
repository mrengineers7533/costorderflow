# Infinity loading animation

Replace the current loading bar/pulse with an SVG infinity (∞) path animation, colored with the app's emerald primary token. UI-only change in `src/components/LoadingScreen.tsx`.

## Change

- Swap the horizontal loading bar for an inline SVG infinity curve.
- Animate a dash traveling along the path using `stroke-dasharray` + `stroke-dashoffset` keyframes (smooth continuous loop).
- Stroke color: `hsl(var(--primary))` (emerald). Track underlay: `hsl(var(--muted))`.
- Keep the logo card, fade-in wrapper, and label — just replace the bar block.
- Add the `infinity-dash` keyframe inline (same pattern as the existing `loading-bar` keyframe).

## Non-goals

- No other files touched.
- No token, layout, or logo changes.
