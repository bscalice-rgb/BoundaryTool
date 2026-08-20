import area from '@turf/area';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import buffer from '@turf/buffer';
import center from '@turf/center';
import cleanCoords from '@turf/clean-coords';
import difference from '@turf/difference';
import intersect from '@turf/intersect';
import kinks from '@turf/kinks';
import simplify from '@turf/simplify';
import truncate from '@turf/truncate';
import union from '@turf/union';
import unkinkPolygon from '@turf/unkink-polygon';
import { featureCollection, lineString, multiPolygon, polygon } from '@turf/helpers';
import type { BBox, Feature, LineString, MultiPolygon, Polygon, Position } from 'geojson';
import type { PolyFeature, PolyGeom } from '../types';

/** Coordinate precision kept everywhere: ~1 mm at the equator. */
const PRECISION = 8;

export const feat = (geometry: PolyGeom): PolyFeature => ({
  type: 'Feature',
  properties: {},
  geometry,
});

export const areaM2 = (geometry: PolyGeom): number => area(feat(geometry));

export const areaHa = (geometry: PolyGeom): number => areaM2(geometry) / 10_000;

export const formatHa = (ha: number): string =>
  ha.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const bboxOf = (geometry: PolyGeom): BBox => bbox(feat(geometry));

export const centerOf = (geometry: PolyGeom): Position =>
  center(feat(geometry)).geometry.coordinates;

/** Every ring of a Polygon or MultiPolygon, outer and inner alike. */
export function allRings(geometry: PolyGeom): Position[][] {
  return geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.coordinates.flat();
}

export function vertexCount(geometry: PolyGeom): number {
  // The closing coordinate repeats the first, so it is not a distinct vertex.
  return allRings(geometry).reduce((n, ring) => n + Math.max(0, ring.length - 1), 0);
}

export function ringCount(geometry: PolyGeom): { outer: number; holes: number } {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return {
    outer: polys.length,
    holes: polys.reduce((n, rings) => n + rings.length - 1, 0),
  };
}

/** Splits a Polygon/MultiPolygon into one Polygon geometry per outer ring. */
export function explode(geometry: PolyGeom): Polygon[] {
  if (geometry.type === 'Polygon') return [geometry];
  return geometry.coordinates.map((rings) => ({ type: 'Polygon', coordinates: rings }));
}

export function toMultiPolygon(geometry: PolyGeom): MultiPolygon {
  return geometry.type === 'MultiPolygon'
    ? geometry
    : { type: 'MultiPolygon', coordinates: [geometry.coordinates] };
}

/** Collapses a single-part MultiPolygon back to a Polygon so simple things stay simple. */
export function simplifyGeomType(geometry: PolyGeom): PolyGeom {
  if (geometry.type === 'MultiPolygon' && geometry.coordinates.length === 1) {
    return { type: 'Polygon', coordinates: geometry.coordinates[0] };
  }
  return geometry;
}

/** Drops duplicate/degenerate coordinates and clamps precision. Never throws. */
export function normalize(geometry: PolyGeom): PolyGeom | null {
  try {
    const cleaned = cleanCoords(feat(geometry)) as PolyFeature;
    const truncated = truncate(cleaned, { precision: PRECISION, coordinates: 2 }) as PolyFeature;
    const g = simplifyGeomType(truncated.geometry);
    if (!hasAnyRing(g)) return null;
    return g;
  } catch {
    return hasAnyRing(geometry) ? geometry : null;
  }
}

/** A geometry worth keeping has at least one ring that encloses something. */
function hasAnyRing(geometry: PolyGeom): boolean {
  return allRings(geometry).some(enclosesArea);
}

/**
 * True when a ring has three points that are not in a straight line.
 *
 * Signed area is deliberately not used here: the two lobes of a bow-tie wind in
 * opposite directions and cancel to exactly zero, and a bow-tie is precisely the
 * geometry that has to survive long enough to reach the repair step.
 */
function enclosesArea(ring: Position[]): boolean {
  const points: Position[] = [];
  for (const point of ring) {
    const previous = points[points.length - 1];
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point);
  }
  // The closing coordinate repeats the first, so drop it before counting.
  const last = points[points.length - 1];
  if (points.length > 1 && last[0] === points[0][0] && last[1] === points[0][1]) points.pop();
  if (points.length < 3) return false;

  const [ox, oy] = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const cross =
      (points[i][0] - ox) * (points[i + 1][1] - oy) -
      (points[i + 1][0] - ox) * (points[i][1] - oy);
    if (cross !== 0) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Boolean operations                                                          */
/* -------------------------------------------------------------------------- */

export function unionAll(geometries: PolyGeom[]): PolyGeom | null {
  const valid = geometries.filter(hasAnyRing);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  try {
    const result = union(featureCollection(valid.map(feat)));
    return result ? normalize(result.geometry) : null;
  } catch {
    return null;
  }
}

export function differenceGeom(a: PolyGeom, b: PolyGeom): PolyGeom | null {
  try {
    const result = difference(featureCollection([feat(a), feat(b)]));
    return result ? normalize(result.geometry) : null;
  } catch {
    return a;
  }
}

export function intersectGeom(a: PolyGeom, b: PolyGeom): PolyGeom | null {
  try {
    const result = intersect(featureCollection([feat(a), feat(b)]));
    return result ? normalize(result.geometry) : null;
  } catch {
    return null;
  }
}

export function overlapAreaM2(a: PolyGeom, b: PolyGeom): number {
  if (!booleanIntersects(feat(a), feat(b))) return 0;
  const shared = intersectGeom(a, b);
  return shared ? areaM2(shared) : 0;
}

/** True when the two geometries are close enough that a boolean op is worth trying. */
export function bboxesOverlap(a: BBox, b: BBox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

/* -------------------------------------------------------------------------- */
/* Validity                                                                    */
/* -------------------------------------------------------------------------- */

export function selfIntersections(geometry: PolyGeom): number {
  try {
    return kinks(feat(geometry) as Feature<Polygon | MultiPolygon>).features.length;
  } catch {
    return 0;
  }
}

export interface ValidityReport {
  ok: boolean;
  kinkCount: number;
  reason: string;
}

export function checkValidity(geometry: PolyGeom): ValidityReport {
  const rings = allRings(geometry);
  if (rings.length === 0) return { ok: false, kinkCount: 0, reason: 'geometry has no rings' };
  for (const ring of rings) {
    if (ring.length < 4) {
      return { ok: false, kinkCount: 0, reason: 'a ring has fewer than 3 distinct points' };
    }
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx !== lx || fy !== ly) {
      return { ok: false, kinkCount: 0, reason: 'a ring is not closed' };
    }
  }
  const kinkCount = selfIntersections(geometry);
  if (kinkCount > 0) {
    return {
      ok: false,
      kinkCount,
      reason: `${kinkCount} self-intersection${kinkCount === 1 ? '' : 's'} (bow-tie)`,
    };
  }
  return { ok: true, kinkCount: 0, reason: '' };
}

/**
 * Repairs a self-intersecting polygon by un-kinking it and re-uniting the pieces,
 * which keeps the outer shape while dropping the crossed-over slivers.
 */
export function repairGeometry(geometry: PolyGeom): PolyGeom | null {
  const cleaned = normalize(geometry);
  if (!cleaned) return null;
  if (checkValidity(cleaned).ok) return cleaned;
  try {
    const parts = unkinkPolygon(feat(cleaned) as Feature<Polygon | MultiPolygon>).features;
    if (parts.length === 0) return null;
    // Keep only the meaningful pieces: unkinking a bow-tie yields one large lobe and
    // often hair-thin artefacts, so discard parts under 0.1% of the total.
    const withArea = parts.map((p) => ({ geom: p.geometry as PolyGeom, a: area(p) }));
    const total = withArea.reduce((s, p) => s + p.a, 0);
    const keep = withArea.filter((p) => p.a > total * 0.001).map((p) => p.geom);
    const merged = unionAll(keep.length ? keep : withArea.map((p) => p.geom));
    if (!merged) return null;
    const normalized = normalize(merged);
    if (!normalized) return null;
    if (checkValidity(normalized).ok) return normalized;
    // The lobes of a bow-tie still meet at the crossing point, which is a pinch an
    // OGC-valid polygon may not have. Pulling the outline in by a centimetre parts
    // them for good, at a cost of well under a tenth of a percent of the area.
    return separatePinchPoints(normalized) ?? largestPart(withArea);
  } catch {
    return cleaned;
  }
}

function separatePinchPoints(geometry: PolyGeom): PolyGeom | null {
  try {
    const shrunk = buffer(feat(geometry), -0.01, { units: 'meters', steps: 2 });
    if (!shrunk?.geometry) return null;
    const result = normalize(shrunk.geometry as PolyGeom);
    return result && checkValidity(result).ok ? result : null;
  } catch {
    return null;
  }
}

function largestPart(parts: { geom: PolyGeom; a: number }[]): PolyGeom | null {
  const best = parts.reduce<{ geom: PolyGeom; a: number } | null>(
    (winner, part) => (!winner || part.a > winner.a ? part : winner),
    null,
  );
  return best ? normalize(best.geom) : null;
}

/* -------------------------------------------------------------------------- */
/* Local metric projection                                                     */
/* -------------------------------------------------------------------------- */

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON_EQ = 111_320;

/**
 * A local equirectangular projection anchored at the geometry's centre, so
 * tolerances and buffers can be expressed in metres regardless of latitude.
 */
export function localProjection(lat0: number, lon0: number) {
  const kx = M_PER_DEG_LON_EQ * Math.cos((lat0 * Math.PI) / 180);
  const ky = M_PER_DEG_LAT;
  return {
    forward: ([lon, lat]: Position): Position => [(lon - lon0) * kx, (lat - lat0) * ky],
    inverse: ([x, y]: Position): Position => [lon0 + x / kx, lat0 + y / ky],
  };
}

function mapCoords(geometry: PolyGeom, fn: (p: Position) => Position): PolyGeom {
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map((r) => r.map(fn)) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((poly) => poly.map((r) => r.map(fn))),
  };
}

/** Runs `fn` on the geometry expressed in local metres and projects the result back. */
export function inMeters(
  geometry: PolyGeom,
  fn: (metric: PolyGeom) => PolyGeom | null,
): PolyGeom | null {
  const [lon0, lat0] = centerOf(geometry);
  const proj = localProjection(lat0, lon0);
  const metric = mapCoords(geometry, proj.forward);
  const out = fn(metric);
  if (!out) return null;
  return normalize(mapCoords(out, proj.inverse));
}

/* -------------------------------------------------------------------------- */
/* Simplify / smoothing                                                        */
/* -------------------------------------------------------------------------- */

/** Douglas-Peucker simplification with the tolerance given in metres. */
export function simplifyMeters(geometry: PolyGeom, toleranceMeters: number): PolyGeom | null {
  if (toleranceMeters <= 0) return geometry;
  return inMeters(geometry, (metric) => {
    try {
      const out = simplify(feat(metric), {
        tolerance: toleranceMeters,
        highQuality: true,
        mutate: false,
      }) as PolyFeature;
      return out.geometry;
    } catch {
      return metric;
    }
  });
}

/** Perimeter of every ring, in metres. */
export function perimeterMeters(geometry: PolyGeom): number {
  const [lon0, lat0] = centerOf(geometry);
  const proj = localProjection(lat0, lon0);
  let total = 0;
  for (const ring of allRings(geometry)) {
    for (let i = 1; i < ring.length; i++) {
      const [x1, y1] = proj.forward(ring[i - 1]);
      const [x2, y2] = proj.forward(ring[i]);
      total += Math.hypot(x2 - x1, y2 - y1);
    }
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/* Splitting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Splits a polygon with a hand-drawn line.
 *
 * The line is first extended well past the polygon so the cut always goes right
 * through. The preferred method then intersects the polygon with the two half-planes
 * the line divides the world into, which leaves the pieces sharing an exact edge —
 * no sliver of area lost and no gap between the new fields. If the drawn line is
 * shaped such that those half-planes are not simple polygons, the fallback sweeps a
 * hair-thin blade through instead, which copes with any line at the cost of a 2 cm kerf.
 */
export function splitByLine(geometry: PolyGeom, line: LineString): PolyGeom[] | null {
  const coords = line.coordinates;
  if (coords.length < 2) return null;
  const extended = extendLine(coords, geometry);
  return splitByHalfPlanes(geometry, extended) ?? splitByBlade(geometry, extended);
}

function splitByHalfPlanes(geometry: PolyGeom, extended: Position[]): PolyGeom[] | null {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  const reach = Math.hypot(maxX - minX, maxY - minY) * 4 || 0.01;
  const start = extended[0];
  const end = extended[extended.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const nx = (-dy / length) * reach;
  const ny = (dx / length) * reach;

  const sides: PolyGeom[] = [];
  for (const sign of [1, -1]) {
    const ring: Position[] = [
      ...extended,
      [end[0] + nx * sign, end[1] + ny * sign],
      [start[0] + nx * sign, start[1] + ny * sign],
      start,
    ];
    const half: PolyGeom = { type: 'Polygon', coordinates: [ring] };
    // A wandering cut line can fold the half-plane over itself; that is the case
    // the blade fallback exists for.
    if (!checkValidity(half).ok) return null;
    sides.push(half);
  }

  const parts = sides
    .map((half) => intersectGeom(geometry, half))
    .filter((part): part is PolyGeom => part !== null && areaM2(part) > 0.5)
    .flatMap(explode);
  if (parts.length < 2) return null;

  const total = parts.reduce((sum, part) => sum + areaM2(part), 0);
  // The two sides must account for the whole polygon, or the cut went wrong.
  if (Math.abs(total - areaM2(geometry)) > areaM2(geometry) * 0.001) return null;

  return parts.map(normalize).filter((g): g is PolyGeom => g !== null);
}

function splitByBlade(geometry: PolyGeom, extended: Position[]): PolyGeom[] | null {
  let blade: Feature<Polygon | MultiPolygon> | undefined;
  try {
    blade = buffer(lineString(extended), 0.01, { units: 'meters', steps: 2 });
  } catch {
    return null;
  }
  if (!blade) return null;
  const remainder = differenceGeom(geometry, blade.geometry as PolyGeom);
  if (!remainder) return null;
  const parts = explode(remainder).filter((p) => areaM2(p) > 0.5);
  if (parts.length < 2) return null;
  return parts.map(normalize).filter((g): g is PolyGeom => g !== null);
}

/** Pushes both ends of the line past the polygon so the cut always goes right through. */
function extendLine(coords: Position[], geometry: PolyGeom): Position[] {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  const diag = Math.hypot(maxX - minX, maxY - minY) || 0.001;
  const push = (from: Position, to: Position): Position => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return to;
    const scale = diag / len;
    return [to[0] + dx * scale, to[1] + dy * scale];
  };
  const head = push(coords[1], coords[0]);
  const tail = push(coords[coords.length - 2], coords[coords.length - 1]);
  return [head, ...coords, tail];
}

/* -------------------------------------------------------------------------- */
/* Constructors                                                                */
/* -------------------------------------------------------------------------- */

export const makePolygon = (rings: Position[][]): Polygon => polygon(rings).geometry;
export const makeMultiPolygon = (polys: Position[][][]): MultiPolygon =>
  multiPolygon(polys).geometry;
