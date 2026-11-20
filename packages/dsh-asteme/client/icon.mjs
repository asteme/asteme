// Original Asteme settings-list glyph; shared by the inline and package icons.
export const ICON_PATH = 'm5 7 7 4 6-7M12 11l6 8M5 7l-2 11';
export const ICON_CIRCLES = [[5, 7, 2], [12, 11, 2], [18, 4, 1.5], [18, 19, 2], [3, 18, 1.5]];
export const ICON_STROKE = 1.6;
export function renderIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">
  <title>Asteme</title>
  <style>:root{color:#252525}@media(prefers-color-scheme:dark){:root{color:#ededed}}</style>
  <path d="${ICON_PATH}"/>
  ${ICON_CIRCLES.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('')}
</svg>\n`;
}
