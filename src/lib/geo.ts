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

/** Self-intersections of one ring taken on its own. */
function ringKinks(ring: Position[]): number {
  return kinks(feat({ type: 'Polygon', coordinates: [ring] }) as Feature<Polygon>).features.length;
}

/**
 * Self-intersections, counted one ring at a time.
 *
 * Handed anything with more than one ring, turf flattens them all into one list and
 * compares them pairwise, so every place two rings touch is reported as a crossing.
 * Both things that touch are ordinary: two blocks of one field sharing a boundary, and
 * — far more of them — the exclusion zones inside a plantation block, which sit against
 * each other and against the block edge in their hundreds. A real estate file racks up
 * thousands that way, none of them a fault and none of them fixable.
 *
 * A ring crossing *itself* is the fault, and that is what this counts. Whether rings sit
 * inside one another properly is a different question, and a zero-width buffer answers
 * it far better than a crossing count can.
 */
export function selfIntersections(geometry: PolyGeom): number {
  try {
    return allRings(geometry).reduce((sum, ring) => sum + ringKinks(ring), 0);
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

  // Nearly every outline is settled here: parts whose bounding boxes miss each other
  // cannot overlap, and on a field of separate blocks that is all of them.
  const boxes = parts.map((part) => bboxOf(part));
  const near = boxes.some((box, i) =>
    boxes.some((other, j) => j > i && bboxesOverlap(box, other)),
  );
  if (!near) return 0;

  // Otherwise: what the parts claim between them, against what they cover. Comparing
  // every pair instead would mean intersecting outlines that carry a thousand
  // exclusion zones each, which costs five times as long on the worst real file.
  const merged = unionAll(parts);
  return merged ? Math.max(0, areaM2(geometry) - areaM2(merged)) : 0;
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
 * The workhorse is a zero-width buffer, which is the canonical way to make a polygon
 * valid: JTS rebuilds the shape from its edges, so self-crossing and overlapping rings
 * come back as a proper outer-and-holes structure with the area unchanged. On a
 * plantation block carrying four hundred exclusion zones that is the only thing that
 * works — un-kinking each part instead either gives up or fills every hole in.
 *
 * Around it sit three corrections, each for something the buffer alone gets wrong: an
 * exclusion zone it hands back still crossing, parts of one outline that overlap each
 * other, and a ring drawn as a figure of eight, where it keeps the lobe wound the right
 * way and drops the other.
 */
export function repairGeometry(geometry: PolyGeom): PolyGeom | null {
  if (!hasAnyRing(geometry)) return null;
  const cleaned = normalize(geometry);
  if (cleaned && checkValidity(cleaned).ok) return cleaned;

  // The buffer is given the outline exactly as it stands, not a tidied copy. Tidying
  // strips vertices that sit in a straight line, and where two rings share those
  // vertices — which is most of a plantation block, holes packed against each other
  // and against the edge — dropping one moves the line and opens a crossing that was
  // never there. Measured across fifteen real estate files: buffering the untouched
  // outline clears every crossing, and buffering a tidied copy leaves dozens.
  const buffered = normalize(zeroWidthBuffer(geometry) ?? geometry) ?? cleaned;
  if (!buffered) return null;

  // The buffer derives the holes afresh, and the odd figure-of-eight exclusion zone
  // comes back out of it still crossing. Splitting one of those in two is a local edit
  // that cannot disturb anything else, so nothing is rebuilt or re-tidied afterwards.
  const split = splitCrossingRings(buffered);

  // Parts that overlap each other are ground counted twice inside one outline, and
  // uniting them is the only thing that resolves it. The check that finds them is the
  // expensive half of a validity report, so the report is what asks for it — and on
  // the usual outline, where there is nothing to dissolve, the answer is reused below
  // rather than worked out twice.
  const tidied =
    checkValidity(split).reason === 'self-overlap'
      ? (normalize(unionAll(explode(split)) ?? split) ?? split)
      : split;

  // The buffer's one blind spot is a ring drawn as a figure of eight: it keeps the lobe
  // wound the right way and drops the other, which halves the field. Un-kinking keeps
  // both, and on an outline with no exclusion zones it costs nothing to try, so the two
  // are compared on the ground they keep. A block carrying four hundred holes skips it:
  // un-kinking fills every one of them in, and outlines with holes do not lose area to
  // the buffer anyway.
  const alternative =
    ringCount(buffered).holes === 0 && cleaned ? normalize(unkinkEverything(cleaned)) : null;
  if (alternative && checkValidity(alternative).ok && areaM2(alternative) > areaM2(tidied) * 1.01) {
    return alternative;
  }
  if (checkValidity(tidied).ok) return tidied;

  // Still crossing. Un-kinking every part is the blunt answer and holes do not survive
  // it, so it has to be clearly better — not merely valid — before it is worth the
  // exclusion zones it costs.
  const forced = normalize(unkinkEverything(tidied));
  if (
    forced &&
    checkValidity(forced).ok &&
    ringCount(forced).holes >= ringCount(tidied).holes * FALLBACK_HOLE_FLOOR
  ) {
    return forced;
  }
  return tidied;
}

/**
 * Share of the exclusion zones the blunt fallback has to leave standing before its
 * result is worth taking. It fills them in, and four hundred of them are not worth
 * trading for the last two crossings; on an outline with no holes it costs nothing.
 */
const FALLBACK_HOLE_FLOOR = 0.5;

/** JTS's own polygon repair: rebuild the shape from its edges, changing nothing else. */
function zeroWidthBuffer(geometry: PolyGeom): PolyGeom | null {
  try {
    const out = buffer(feat(geometry), 0, { units: 'meters' });
    return (out?.geometry as PolyGeom) ?? null;
  } catch {
    return null;
  }
}

/**
 * Splits every ring that crosses itself into its lobes, in place.
 *
 * A hole's lobes stay holes of the same part, so an exclusion zone drawn as a figure of
 * eight becomes two exclusion zones rather than disappearing. When an outer ring
 * splits, each lobe becomes a part of its own and takes the holes that fall inside it.
 *
 * Nothing else about the shape is touched — sorting out which ring sits inside which is
 * the buffer's job, and it is far better at it than any ring-by-ring rule.
 */
function splitCrossingRings(geometry: PolyGeom): PolyGeom {
  const parts: Position[][][] = [];
  for (const part of explode(geometry)) {
    const [outer, ...holes] = part.coordinates;
    // A lobe of a hole that still crosses itself after splitting is beyond saving, and
    // an exclusion zone is a small thing to lose: dropping it puts that ground back
    // into the field and costs a fraction of a hectare. The outer ring is never
    // dropped — better a field that is still flagged than no field at all.
    const splitHoles = holes.flatMap((hole) =>
      splitRing(hole).filter((piece) => ringKinks(piece) === 0),
    );
    const lobes = splitRing(outer);
    if (lobes.length < 2) {
      parts.push([outer, ...splitHoles]);
      continue;
    }
    for (const lobe of lobes) {
      parts.push([lobe, ...splitHoles.filter((hole) => ringStartsInside(hole, lobe))]);
    }
  }
  return parts.length > 0
    ? simplifyGeomType({ type: 'MultiPolygon', coordinates: parts })
    : geometry;
}

/** One ring in, its non-crossing lobes out — or just itself when it does not cross. */
function splitRing(ring: Position[]): Position[][] {
  if (ringKinks(ring) === 0) return [ring];
  const deduped = withoutRepeatedVertices([ring]);
  if (!deduped) return [ring];
  try {
    const lobes = unkinkPolygon(
      feat({ type: 'Polygon', coordinates: deduped }) as Feature<Polygon>,
    ).features;
    const outers = lobes
      .map((lobe) => (lobe.geometry as Polygon).coordinates[0])
      .filter((lobe) => lobe.length >= 4);
    return outers.length > 0 ? outers : [ring];
  } catch {
    return [ring];
  }
}

/** Ray casting, to place a hole against the lobe of a split outer ring. */
function ringStartsInside(ring: Position[], outer: Position[]): boolean {
  const [x, y] = ring[0];
  let inside = false;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i];
    const [xj, yj] = outer[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Drops any coordinate a ring visits more than once.
 *
 * A bow-tie that pinches — an outline returning to a point it has already passed
 * through — repeats that coordinate, and the un-kinker refuses a polygon carrying any
 * repeated vertex outright rather than splitting it. Dropping the second visit joins
 * the segments either side of it, which loses nothing but the pinch.
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

/** Slivers left along a crossing, as a share of the part they came out of. */
const ARTEFACT_SHARE = 0.001;
/** ... and never dropping anything above this, however small its parent part was. */
const ARTEFACT_MIN_M2 = 1;

/** The blunt fallback: un-kink every part and unite the lobes. Holes do not survive. */
function unkinkEverything(geometry: PolyGeom): PolyGeom {
  const pieces: PolyGeom[] = [];
  for (const part of explode(geometry)) {
    const rings = withoutRepeatedVertices(part.coordinates);
    const candidate: Polygon = { type: 'Polygon', coordinates: rings ?? part.coordinates };
    try {
      const lobes = unkinkPolygon(feat(candidate) as Feature<Polygon>).features;
      const floor = Math.max(ARTEFACT_MIN_M2, area(feat(candidate)) * ARTEFACT_SHARE);
      const kept = lobes
        .map((lobe) => ({ geom: lobe.geometry as PolyGeom, a: area(lobe) }))
        .filter((lobe) => lobe.a > floor)
        .map((lobe) => lobe.geom);
      pieces.push(...(kept.length > 0 ? kept : [candidate]));
    } catch {
      pieces.push(candidate);
    }
  }
  return unionAll(pieces) ?? geometry;
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
