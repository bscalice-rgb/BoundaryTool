import proj4 from 'proj4';
import type { Position } from 'geojson';
import type { PolyGeom } from '../types';

export const WGS84 = 'EPSG:4326';

/**
 * Resolves an EPSG code to a proj4 definition without any network lookup — the tool
 * is fully offline, so there is no registry to call. Zipped shapefiles carry their
 * own `.prj` WKT and never come through here; this exists for GeoJSON files that
 * declare a projected CRS in the legacy `crs` member.
 */
export function defForEpsg(code: number): string | null {
  // Geographic CRSs close enough to WGS84 to pass straight through at field scale.
  if (code === 4326 || code === 4979 || code === 4269 || code === 4258) return WGS84;
  if (code === 3857 || code === 900913 || code === 3785) {
    return '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 ' +
      '+units=m +nadgrids=@null +no_defs';
  }
  // WGS84 / UTM north and south.
  if (code >= 32601 && code <= 32660) {
    return `+proj=utm +zone=${code - 32600} +datum=WGS84 +units=m +no_defs`;
  }
  if (code >= 32701 && code <= 32760) {
    return `+proj=utm +zone=${code - 32700} +south +datum=WGS84 +units=m +no_defs`;
  }
  // ETRS89 / UTM — the standard European grid family.
  if (code >= 25828 && code <= 25838) {
    return `+proj=utm +zone=${code - 25800} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 ` +
      '+units=m +no_defs';
  }
  if (code >= 25884 && code <= 25889) {
    return `+proj=tmerc +lat_0=0 +lon_0=${(code - 25884) * 3 + 6} +k=1 +x_0=${
      (code - 25884) * 1_000_000 + 2_500_000
    } +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  }
  // NAD83 / UTM.
  if (code >= 26901 && code <= 26923) {
    return `+proj=utm +zone=${code - 26900} +datum=NAD83 +units=m +no_defs`;
  }
  // NAD27 / UTM.
  if (code >= 26701 && code <= 26722) {
    return `+proj=utm +zone=${code - 26700} +datum=NAD27 +units=m +no_defs`;
  }
  const named: Record<number, string> = {
    // OSGB 1936 / British National Grid
    27700:
      '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
      '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
    // RGF93 / Lambert-93 (France)
    2154:
      '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 ' +
      '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    // Amersfoort / RD New (Netherlands)
    28992:
      '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 ' +
      '+x_0=155000 +y_0=463000 +ellps=bessel ' +
      '+towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs',
    // Belge 1972 / Belgian Lambert 72
    31370:
      '+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 ' +
      '+lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl ' +
      '+towgs84=-106.869,52.2978,-103.724,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs',
    // SWEREF99 TM (Sweden)
    3006:
      '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    // ETRS89 / LAEA Europe
    3035:
      '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 ' +
      '+towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    // GDA94 / MGA — Australian UTM zones live in the 283xx block.
    28348: '+proj=utm +zone=48 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28349: '+proj=utm +zone=49 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28350: '+proj=utm +zone=50 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28351: '+proj=utm +zone=51 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28352: '+proj=utm +zone=52 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28353: '+proj=utm +zone=53 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28354: '+proj=utm +zone=54 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28355: '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    28356: '+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  };
  return named[code] ?? null;
}

/** Pulls an EPSG code out of the many spellings that turn up in the wild. */
export function parseCrsName(name: string): number | null {
  const trimmed = name.trim();
  if (/CRS84|CRS:84/i.test(trimmed)) return 4326;
  const urn = /urn:ogc:def:crs:EPSG:[^:]*:(\d+)/i.exec(trimmed);
  if (urn) return Number(urn[1]);
  const short = /EPSG[:/]{1,2}(\d+)/i.exec(trimmed);
  if (short) return Number(short[1]);
  const bare = /^(\d{4,6})$/.exec(trimmed);
  if (bare) return Number(bare[1]);
  return null;
}

export interface Reprojector {
  label: string;
  /** Converts a source coordinate to [lon, lat] in WGS84. */
  toWgs84: (p: Position) => Position;
}

/** Builds a reprojector from WKT or a proj4 string. Returns null if it is unusable. */
export function reprojectorFromDef(def: string, label: string): Reprojector | null {
  try {
    const converter = proj4(def, WGS84);
    // A quick sanity probe: a definition that cannot round-trip is not worth trusting.
    const probe = converter.forward([0, 0]);
    if (!Number.isFinite(probe[0]) || !Number.isFinite(probe[1])) return null;
    return { label, toWgs84: (p) => converter.forward([p[0], p[1]]) as Position };
  } catch {
    return null;
  }
}

/** True when a WKT/proj4 definition already describes unprojected WGS84 degrees. */
export function isWgs84Def(def: string): boolean {
  const d = def.toUpperCase();
  const isProjected = d.includes('PROJCS') || (d.includes('+PROJ=') && !d.includes('+PROJ=LONGLAT'));
  if (isProjected) return false;
  return (
    d.includes('WGS_1984') ||
    d.includes('WGS 84') ||
    d.includes('WGS84') ||
    d.includes('EPSG:4326')
  );
}

/** Human-readable CRS name pulled from a WKT string, for the import report. */
export function crsNameFromWkt(wkt: string): string {
  const match = /^\s*(?:PROJCS|GEOGCS)\s*\[\s*"([^"]+)"/i.exec(wkt);
  return match ? match[1] : 'unknown CRS';
}

export function reprojectGeometry(geometry: PolyGeom, r: Reprojector): PolyGeom {
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => ring.map(r.toWgs84)),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ring.map(r.toWgs84))),
  };
}

/** Rough test for "these numbers are not degrees", used to catch a missing CRS. */
export function looksProjected(geometry: PolyGeom): boolean {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (Math.abs(x) > 180 || Math.abs(y) > 90) return true;
    }
  }
  return false;
}
