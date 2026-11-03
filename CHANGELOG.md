# Changelog

All notable changes to this project. The plugin version lives in `package.json`; the client
bundle also prints its own build id (for example `v0.13-r6`) in the panel footer.

## 1.0.0

First public release.

- Left-sidebar workbench: thumbnail rail, 16:9 preview, proportional splitter, in-place editing.
- Element-faithful PPTX import: absolute geometry, theme colours, gradients with per-stop alpha,
  rounded corners and ellipses, pictures, tables, group transforms, master/layout decorations.
- Chart / SmartArt / OLE pages rasterized through LibreOffice so nothing goes missing.
- AI chat column with Markdown, attachments, process timeline and change highlighting.
- Host routes are loopback-only; uploads are size-capped and never overwrite files.

## 0.13.x

- **Fixed** inline editor text turning invisible on light slides: the Harness shell sets a pale
  `-webkit-text-fill-color` on form controls, which overrode the editor's text colour. Forced back
  to `currentColor` (CSS `!important` + inline override), so text is readable on any slide.
- **Fixed** editor readability for small type: minimum 130 × 30 box, at least 11 px font,
  contrast-aware surface (dark for light text, light for dark text) and a two-tone text outline.
- **Fixed** themed shapes losing their fill: `p:style` `fillRef` / `lnRef` are now resolved
  through the theme fill/line style matrices, so cards and panels no longer vanish.
- Added mixed run styles per text box (`spans`) and rounded-corner/ellipse shapes (`radiusPct`).
- Added raster fallback for chart / SmartArt / OLE pages (LibreOffice → PDF → PNG).

## 0.12.x

- Gradients with per-stop alpha for fills and text colours; backgrounds read from
  `p:bg` on slide → layout → master.
- `wrap="none"` text boxes keep a single line (`nowrap`) instead of wrapping and clipping.
- Stale injected `<style>` nodes are removed before injecting, so old CSS cannot win the cascade.

## 0.11.x

- PPTX import: master/layout decorations, theme colour modifiers, fonts, pictures, tables, groups.
- In-place editing (text and table cells), change highlighting, splitter, chat attachments,
  process timeline, Markdown rendering.
