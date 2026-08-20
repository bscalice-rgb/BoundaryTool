/**
 * Field colours. Ten hues that stay distinguishable on satellite imagery, which
 * rules out the greens and browns the basemap is already full of.
 */
const PALETTE = [
  '#38bdf8',
  '#fb923c',
  '#c084fc',
  '#f472b6',
  '#facc15',
  '#2dd4bf',
  '#a3e635',
  '#f87171',
  '#818cf8',
  '#fdba74',
];

/** Stable colour for a field, taken from its position in the field list. */
export const fieldColor = (index: number): string => PALETTE[index % PALETTE.length];

/** Polygons not yet grouped into a field read as provisional, not as a colour. */
export const UNGROUPED_COLOR = '#cbd5e1';
