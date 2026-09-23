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

/**
 * Areas are asked for constantly — the table, the map tooltips, the checks, the export
 * plan — and geometries are immutable, so the answer is kept against the object itself.
 * With a few hundred polygons this is the difference between a responsive table and a
 * sticky one.
 */
const areaCache = new WeakMap<object, number>();

export const areaM2 = (geometry: PolyGeom): number => {
  const cached = areaCache.get(geometry);
  if (cached !== undefined) return cached;
  const value = area(feat(geometry));
  areaCache.set(geometry, value);
  return value;
};

export const areaHa = (geometry: PolyGeom): number => areaM2(geometry) / 10_000;

/**
 * Locale used for every number this module formats. Set once by the language provider;
 * kept module-level because area readouts are produced from Leaflet callbacks and from
 * the check engine, neither of which sits inside the React tree.
 */
let numberLocales: string[] = ['en-GB'];

export const setNumberLocale = (locales: string[]): void => {
  numberLocales = locales;
  formatters.clear();
};

/**
 * `Number.toLocaleString` builds a formatter on every call. Areas are formatted for
 * every row, every map tooltip and every flag, several times a second while someone
 * types, so the formatters are made once and kept.
 */
const formatters = new Map<number, Intl.NumberFormat>();

const formatterFor = (digits: number): Intl.NumberFormat => {
  const existing = formatters.get(digits);
  if (existing) return existing;
  const made = new Intl.NumberFormat(numberLocales, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  formatters.set(digits, made);
  return made;
};

export const formatHa = (ha: number): string => formatterFor(2).format(ha);

/** A plain number in the current locale, for readouts that are not areas. */
export const formatNum = (value: number, digits = 0): string => formatterFor(digits).format(value);

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

/**
 * Self-intersections, counted one part at a time.
 *
 * Handed a MultiPolygon, turf flattens every ring of every part into one list and
 * compares them pairwise, so two blocks of the same field that share a boundary — which
 * is exactly what conjoined blocks do — are reported as self-intersections. A field
 * digitised as thirty touching blocks can rack up dozens of them, none of them real and
 * none of them fixable, which is worse than not checking at all. Only a part crossing
 * itself is a fault, so each part is measured on its own.
 */
export function selfIntersections(geometry: PolyGeom): number {
  try {
    return explode(geometry).reduce(
      (sum, part) => sum + kinks(feat(part) as Feature<Polygon>).features.length,
      0,
    );
  } catch {
    return 0;
  }
}

/** Overlap between two parts below this is floating-point noise along a shared edge. */
export const SELF_OVERLAP_MIN_M2 = 1;

/**
 * Square metres two parts of one outline claim twice over.
 *
 * Parts that touch are fine — that is what conjoined blocks do, and it is the case the
 * kink count used to mistake for a bow-tie. Parts that genuinely overlap are ground
 * counted twice inside a single field, which the export would carry into the upload,
 * and which `repairGeometry` resolves by uniting them.
 *
 * Comparing every pair costs real time on a field of thirty blocks, so it stops as soon
 * as it has found more than the caller could ignore.
 */
export function selfOverlapM2(geometry: PolyGeom): number {
  const parts = explode(geometry);
  if (parts.length < 2) return 0;
  const boxes = parts.map((part) => bboxOf(part));
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!bboxesOverlap(boxes[i], boxes[j])) continue;
      total += overlapAreaM2(parts[i], parts[j]);
      if (total > SELF_OVERLAP_MIN_M2) return total;
    }
  }
  return total;
}

/** Why an outline is unusable, as a code the UI turns into words in its own language. */
export type InvalidReason =
  | 'none'
  | 'no-rings'
  | 'short-ring'
  | 'not-closed'
  | 'kinks'
  | 'self-overlap';

export interface ValidityReport {
  ok: boolean;
  kinkCount: number;
  /** Square metres the outline claims twice over, when parts of it overlap. */
  overlapM2: number;
  reason: InvalidReason;
}

/**
 * Validity results are cached against the geometry object. Detecting self-intersections
 * compares every segment with every other, which is the most expensive thing the QA pass
 * does; geometries are immutable, so a result stays true for the life of the object and
 * re-running the checks after an unrelated edit costs nothing.
 */
const validityCache = new WeakMap<object, ValidityReport>();

export function checkValidity(geometry: PolyGeom): ValidityReport {
  const cached = validityCache.get(geometry);
  if (cached) return cached;
  const report = computeValidity(geometry);
  validityCache.set(geometry, report);
  return report;
}

function computeValidity(geometry: PolyGeom): ValidityReport {
  const blank = { kinkCount: 0, overlapM2: 0 };
  const rings = allRings(geometry);
  if (rings.length === 0) return { ok: false, ...blank, reason: 'no-rings' };
  for (const ring of rings) {
    if (ring.length < 4) {
      return { ok: false, ...blank, reason: 'short-ring' };
    }
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx !== lx || fy !== ly) {
      return { ok: false, ...blank, reason: 'not-closed' };
    }
  }
  const kinkCount = selfIntersections(geometry);
  if (kinkCount > 0) {
    return { ok: false, kinkCount, overlapM2: 0, reason: 'kinks' };
  }
  const overlapM2 = selfOverlapM2(geometry);
  if (overlapM2 > SELF_OVERLAP_MIN_M2) {
    return { ok: false, kinkCount: 0, overlapM2, reason: 'self-overlap' };
  }
  return { ok: true, ...blank, reason: 'none' };
}

/**
 * Repairs a self-intersecting outline.
 *
 * Two different faults both read as "self-intersecting", and they need different
 * answers. A ring that crosses itself — a bow-tie — is split into its lobes. Two
 * separate blocks of the same field whose edges cross are not one ring's problem at
 * all, and no amount of un-kinking touches them; uniting the blocks is what resolves
 * those. A field digitised as thirty blocks usually has both, so both are applied.
 */
export function repairGeometry(geometry: PolyGeom): PolyGeom | null {
  const cleaned = normalize(geometry);
  if (!cleaned) return null;
  if (checkValidity(cleaned).ok) return cleaned;

  // Un-kinking sees one part at a time, and one bad part used to abort the whole
  // repair, so each is taken on its own and a part that cannot be split is kept as it
  // is rather than lost.
  const pieces = explode(cleaned).flatMap(unkinkPart);
  if (pieces.length === 0) return null;

  // And then the crossings between parts: where two blocks of one field overlap, the
  // union makes a single outline with no crossing edges, which is also what stops the
  // shared ground being counted twice.
  const merged = unionAll(pieces) ?? combineParts(pieces);
  const normalized = merged && normalize(merged);
  if (!normalized) return null;
  if (checkValidity(normalized).ok) return normalized;

  // What is left is a pinch: lobes that still meet at the point they crossed at, which
  // an OGC-valid polygon may not have. Pulling the outline in by a centimetre parts
  // them for good, at a cost of well under a tenth of a percent of the area.
  return separatePinchPoints(normalized) ?? normalized;
}

/** Slivers left along a crossing, as a share of the part they came out of. */
const ARTEFACT_SHARE = 0.001;
/** ... and never dropping anything above this, however small its parent part was. */
const ARTEFACT_MIN_M2 = 1;

/** Splits one part into non-crossing lobes, or returns it unchanged if it cannot be. */
function unkinkPart(part: Polygon): PolyGeom[] {
  const rings = withoutRepeatedVertices(part.coordinates);
  if (!rings) return [];
  const candidate: Polygon = { type: 'Polygon', coordinates: rings };
  const before = area(feat(candidate));
  try {
    const lobes = unkinkPolygon(feat(candidate) as Feature<Polygon>).features;
    if (lobes.length === 0) return [candidate];
    // Un-kinking leaves hair-thin artefacts along the crossing as well as the lobes.
    // They are measured against the part they came out of, never against the whole
    // field: a genuine half-hectare block beside a seventy-hectare one is not an
    // artefact, and judging it against the total is how it used to be deleted.
    const floor = Math.max(ARTEFACT_MIN_M2, before * ARTEFACT_SHARE);
    const kept = lobes
      .map((lobe) => ({ geom: lobe.geometry as PolyGeom, a: area(lobe) }))
      .filter((lobe) => lobe.a > floor)
      .map((lobe) => lobe.geom);
    return kept.length > 0 ? kept : [candidate];
  } catch {
    return [candidate];
  }
}

/**
 * Drops any coordinate a part visits more than once.
 *
 * A bow-tie that pinches — an outline returning to a point it has already passed
 * through — repeats that coordinate, and the un-kinker refuses a polygon with any
 * repeated vertex outright rather than splitting it, so a single pinch used to leave
 * the whole field untouched. Dropping the second visit joins the segments either side
 * of it, which loses nothing but the pinch. Rings are deduplicated together, because
 * that is how the un-kinker counts them: a vertex an outer ring shares with its own
 * hole trips it just the same.
 */
function withoutRepeatedVertices(rings: Position[][]): Position[][] | null {
  const seen = new Set<string>();
  const out: Position[][] = [];
  for (const ring of rings) {
    const body: Position[] = [];
    for (const point of ring.slice(0, -1)) {
      const key = `${point[0]},${point[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      body.push(point);
    }
    // A ring reduced below a triangle no longer encloses anything worth keeping.
    if (body.length < 3) {
      if (out.length === 0) return null;
      continue;
    }
    out.push([...body, body[0]]);
  }
  return out.length > 0 ? out : null;
}

/** Last resort when the union fails: the parts side by side, crossings and all. */
function combineParts(pieces: PolyGeom[]): PolyGeom | null {
  const coordinates = pieces.flatMap((piece) => toMultiPolygon(piece).coordinates);
  return coordinates.length > 0 ? simplifyGeomType({ type: 'MultiPolygon', coordinates }) : null;
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

/**
 * Grows or shrinks a boundary by a distance in metres. A negative distance insets it.
 *
 * Turf buffers through an azimuthal equidistant projection centred on the geometry, so
 * the metres are true metres at any latitude. An inset deep enough to consume the
 * polygon returns null rather than an empty shape.
 */
export function bufferMeters(geometry: PolyGeom, meters: number): PolyGeom | null {
  if (meters === 0) return geometry;
  try {
    const out = buffer(feat(geometry), meters, { units: 'meters', steps: 8 });
    if (!out?.geometry) return null;
    const result = normalize(out.geometry as PolyGeom);
    return result && areaM2(result) > 0 ? result : null;
  } catch {
    return null;
  }
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
