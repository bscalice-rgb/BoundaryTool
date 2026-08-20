import type { Position } from 'geojson';

/**
 * Parses a latitude/longitude out of whatever someone has to hand.
 *
 * This exists because a browser cannot always answer "where am I" — a desktop with no
 * GPS depends on a location service that is often missing — and the honest fallback is
 * to let the user say where to go. Everything here is local string handling: no
 * geocoding service is contacted, so a place *name* is deliberately not supported.
 *
 * Accepted forms:
 *   48.8566, 2.3522              decimal degrees, comma or whitespace separated
 *   48.8566 N, 2.3522 E          with hemisphere letters, in either order
 *   48°51'23.8"N 2°21'07.9"E     degrees/minutes/seconds
 *   geo:48.8566,2.3522
 *   https://www.google.com/maps/@48.8566,2.3522,15z
 *   https://www.google.com/maps?q=48.8566,2.3522
 *   https://www.openstreetmap.org/#map=15/48.8566/2.3522
 */
export function parseLatLon(input: string): Position | null {
  const text = input.trim();
  if (text === '') return null;

  for (const parse of [fromOsmHash, fromUrl, fromDms, fromDecimal]) {
    const result = parse(text);
    if (result && isValid(result)) return result;
  }
  return null;
}

/** Returns [lon, lat] in GeoJSON order, or null. */
const isValid = ([lon, lat]: Position): boolean =>
  Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/* -------------------------------------------------------------------------- */

/** OpenStreetMap puts the pair in a fragment: #map=15/48.8566/2.3522 */
function fromOsmHash(text: string): Position | null {
  const match = /#map=[\d.]+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i.exec(text);
  return match ? [Number(match[2]), Number(match[1])] : null;
}

/** Google Maps and friends: an @lat,lon segment, a q=/ll= parameter, or a geo: URI. */
function fromUrl(text: string): Position | null {
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|center|daddr|sll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /^geo:(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return [Number(match[2]), Number(match[1])];
  }
  return null;
}

/** 48°51'23.8"N 2°21'07.9"E, with the symbols optional and spacing forgiving. */
function fromDms(text: string): Position | null {
  const part =
    String.raw`(\d+(?:\.\d+)?)\s*[°d:\s]\s*(?:(\d+(?:\.\d+)?)\s*['m:\s]\s*)?` +
    String.raw`(?:(\d+(?:\.\d+)?)\s*["s]?\s*)?([NSEW])`;
  const matches = [...text.matchAll(new RegExp(part, 'gi'))];
  if (matches.length !== 2) return null;

  const values = matches.map((match) => {
    const degrees = Number(match[1]) + Number(match[2] ?? 0) / 60 + Number(match[3] ?? 0) / 3600;
    const hemisphere = match[4].toUpperCase();
    return {
      value: hemisphere === 'S' || hemisphere === 'W' ? -degrees : degrees,
      axis: hemisphere === 'N' || hemisphere === 'S' ? 'lat' : 'lon',
    };
  });

  const lat = values.find((v) => v.axis === 'lat');
  const lon = values.find((v) => v.axis === 'lon');
  return lat && lon ? [lon.value, lat.value] : null;
}

/**
 * Plain decimal degrees, optionally with hemisphere letters. Latitude comes first
 * unless the letters say otherwise, which is the convention every mapping tool prints
 * and the order people paste.
 */
function fromDecimal(text: string): Position | null {
  const match =
    /^\s*([NS])?\s*(-?\d+(?:\.\d+)?)\s*([NS])?\s*[,;\s]\s*([EW])?\s*(-?\d+(?:\.\d+)?)\s*([EW])?\s*$/i.exec(
      text,
    );
  if (!match) return null;

  const first = Number(match[2]);
  const second = Number(match[5]);
  const firstSign = /s/i.test(`${match[1] ?? ''}${match[3] ?? ''}`) ? -1 : 1;
  const secondSign = /w/i.test(`${match[4] ?? ''}${match[6] ?? ''}`) ? -1 : 1;
  return [second * secondSign, first * firstSign];
}

/** Renders a position the same way it is accepted, for echoing a jump back to the user. */
export const formatLatLon = ([lon, lat]: Position): string =>
  `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
