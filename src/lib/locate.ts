import { formatNum } from './geo';

/**
 * Turning a geolocation fix into a map view.
 *
 * Leaflet's own `map.locate({ setView: true })` frames the accuracy circle and then
 * caps the result at `maxZoom`: `Math.min(fitZoom, maxZoom)`. On a phone that is right,
 * because the circle is a few metres across and the fit zoom is deeper than the cap. On
 * a desktop, where the position comes from a Wi-Fi or IP lookup and the circle is tens
 * of kilometres across, the fit zoom is regional — so pressing "zoom to my location"
 * while looking at a field zooms you *out* to the whole county. It looks broken because
 * for the purpose it looks broken.
 *
 * So the cap is applied at both ends: never deeper than a fix this vague can justify,
 * and never so far out that the button undoes the view the user already had.
 */

/** No fix is worth throwing away the user's working view for. */
export const MIN_LOCATE_ZOOM = 9;

/** Past this the imagery is being enlarged rather than resolved. */
export const MAX_LOCATE_ZOOM = 17;

/** Accuracy past which a fix is worth calling approximate in so many words. */
export const COARSE_ACCURACY_M = 5_000;

export const clampLocateZoom = (fitZoom: number): number =>
  Math.min(MAX_LOCATE_ZOOM, Math.max(MIN_LOCATE_ZOOM, fitZoom));

export const isCoarse = (accuracyM: number): boolean => accuracyM > COARSE_ACCURACY_M;

/** "45 m" / "1.2 km". Both units read the same in all three languages. */
export function describeAccuracy(accuracyM: number): string {
  if (!Number.isFinite(accuracyM) || accuracyM <= 0) return '—';
  return accuracyM < 1_000
    ? `${formatNum(accuracyM)} m`
    : `${formatNum(accuracyM / 1_000, accuracyM < 10_000 ? 1 : 0)} km`;
}

/** Geolocation's numeric codes, named. */
export const GEOLOCATION_DENIED = 1;
export const GEOLOCATION_UNAVAILABLE = 2;
export const GEOLOCATION_TIMEOUT = 3;
