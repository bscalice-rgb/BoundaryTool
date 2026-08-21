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

/**
 * Lightness steps applied on each pass through the palette, so the eleventh field is
 * a lighter blue rather than the same blue as the first. Three passes give thirty
 * colours that can still be told apart; past that they do repeat, which is why the
 * map also labels fields by name once it is zoomed in.
 */
const SHIFTS = [0, 0.28, -0.24];

/** Stable colour for a field, taken from its position in the field list. */
export function fieldColor(index: number): string {
  const hue = PALETTE[index % PALETTE.length];
  const shift = SHIFTS[Math.floor(index / PALETTE.length) % SHIFTS.length];
  return shift === 0 ? hue : shiftLightness(hue, shift);
}

/** Moves a hex colour towards white (positive) or black (negative) by `amount`. */
function shiftLightness(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const moved = channels.map((channel) => {
    const target = amount > 0 ? 255 : 0;
    return Math.round(channel + (target - channel) * Math.abs(amount));
  });
  return `#${moved.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Polygons not yet grouped into a field read as provisional, not as a colour. */
export const UNGROUPED_COLOR = '#cbd5e1';
