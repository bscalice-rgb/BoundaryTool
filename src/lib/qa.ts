import buffer from '@turf/buffer';
import type { BBox } from 'geojson';
import type {
  FieldId,
  FlagKind,
  PolyGeom,
  QAFlag,
  WFeature,
  WField,
  Workspace,
} from '../types';
import {
  areaHa,
  areaM2,
  bboxOf,
  bboxesOverlap,
  checkValidity,
  differenceGeom,
  feat,
  formatHa,
  overlapAreaM2,
  perimeterMeters,
  repairGeometry,
  simplifyMeters,
  unionAll,
  vertexCount,
} from './geo';

/* -------------------------------------------------------------------------- */
/* Thresholds                                                                  */
/* -------------------------------------------------------------------------- */

export interface QaThresholds {
  /** Features below this area are treated as digitising slivers. */
  sliverAreaHa: number;
  /** Overlaps smaller than this are floating-point noise, not real double-counting. */
  overlapMinM2: number;
  /** A boundary is "jagged" when it has at least this many vertices ... */
  jaggedMinVertices: number;
  /** ... and they sit closer together than this along the boundary. */
  jaggedMaxSpacingM: number;
  /** Half-width of the protrusions the non-crop heuristic looks for. */
  protrusionWidthM: number;
  /** Share of area that must sit in thin protrusions before it is worth flagging. */
  protrusionAreaShare: number;
}

export const DEFAULT_THRESHOLDS: QaThresholds = {
  sliverAreaHa: 0.05,
  overlapMinM2: 1,
  jaggedMinVertices: 50,
  jaggedMaxSpacingM: 4,
  protrusionWidthM: 8,
  protrusionAreaShare: 0.04,
};

/* -------------------------------------------------------------------------- */
/* Guidance — Arva, "What Makes a Good Field Boundary?"                        */
/* -------------------------------------------------------------------------- */

export const GUIDANCE: Record<FlagKind, string> = {
  'missing-attributes':
    'Every field needs a consistent Client, Farm and Field name. These three values are ' +
    'the only attributes CropForce reads, and they are how the boundary is matched to the ' +
    'right grower and holding.',
  'invalid-geometry':
    'A boundary must be a single continuous management zone with a clean outline. ' +
    'Self-intersecting "bow-tie" rings have no well-defined inside, so area and overlap ' +
    'calculations cannot be trusted.',
  overlap:
    'Fields must not overlap. Overlapping boundaries double-count area and make it ' +
    'ambiguous which field an observation belongs to. Neighbouring fields should be ' +
    'conjoined — sharing an edge, not sharing area.',
  'jagged-edges':
    'Boundaries should be smoothed. Jagged edges usually come from tracing raster imagery ' +
    'or from raw GPS logs; they add noise without adding accuracy.',
  'non-crop-area':
    'A boundary should contain crop area only. Roads, tracks, waterways, headland buffers, ' +
    'wind turbines and tree islands belong outside the boundary or inside an exclusion ' +
    'zone cut into it.',
  sliver:
    'Stray fragments left over from digitising or from a bad clip are not management zones. ' +
    'Remove them so each field is the area actually farmed.',
  naming:
    'Field names should identify the place, not the season. A name carrying a crop or a ' +
    'year has to be renamed every time the rotation changes, which breaks year-on-year ' +
    'comparison.',
  unassigned:
    'Only polygons grouped into a field are exported. A field is whatever set of polygons ' +
    'you decide belongs together — several disjoint blocks farmed as one unit should be ' +
    'one field, not several.',
  'empty-field':
    'A field row needs geometry. Assign at least one polygon to it, or delete the field.',
  'duplicate-name':
    'CropForce identifies a field by its Client, Farm and Field combination, so that ' +
    'combination has to be unique. Upload two rows with the same one and the second ' +
    'replaces the first: a boundary goes missing without any warning. Either rename them ' +
    'so each is distinct, or — if they really are one field farmed in separate blocks — ' +
    'combine them into a single field with one name.',
};

/* -------------------------------------------------------------------------- */
/* Derived views over the workspace                                            */
/* -------------------------------------------------------------------------- */

export interface FieldGeometry {
  field: WField;
  featureIds: string[];
  /** Union of every member feature; null when the field has no members. */
  geometry: PolyGeom | null;
  bbox: BBox | null;
  areaHa: number;
}

/**
 * Cache of dissolved field geometry, keyed by field id.
 *
 * Dissolving is the expensive part of every QA pass, and it re-runs on each keystroke
 * in the attribute table where no geometry has moved at all. Member geometries are
 * immutable, so an entry stays valid as long as the same geometry objects are still
 * the field's members.
 */
const dissolveCache = new Map<FieldId, { members: PolyGeom[]; geometry: PolyGeom | null }>();

function sameMembers(a: PolyGeom[], b: PolyGeom[]): boolean {
  return a.length === b.length && a.every((geometry, index) => geometry === b[index]);
}

/** Merges each field's member features the same way the export does. */
export function fieldGeometries(workspace: Workspace): FieldGeometry[] {
  const membersByField = new Map<FieldId, WFeature[]>();
  for (const field of workspace.fields) membersByField.set(field.id, []);
  for (const feature of workspace.features) {
    if (feature.fieldId) membersByField.get(feature.fieldId)?.push(feature);
  }

  const live = new Set<FieldId>();
  const result = workspace.fields.map((field) => {
    live.add(field.id);
    const members = membersByField.get(field.id) ?? [];
    const geometries = members.map((f) => f.geometry);

    const cached = dissolveCache.get(field.id);
    const geometry =
      cached && sameMembers(cached.members, geometries)
        ? cached.geometry
        : unionAll(geometries);
    dissolveCache.set(field.id, { members: geometries, geometry });

    return {
      field,
      featureIds: members.map((f) => f.id),
      geometry,
      bbox: geometry ? bboxOf(geometry) : null,
      areaHa: geometry ? areaHa(geometry) : 0,
    };
  });

  for (const id of dissolveCache.keys()) {
    if (!live.has(id)) dissolveCache.delete(id);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

const CROP_WORDS = [
  'wheat', 'barley', 'maize', 'corn', 'soy', 'soya', 'soybean', 'rape', 'osr', 'canola',
  'oats', 'rye', 'beet', 'potato', 'potatoes', 'bean', 'beans', 'pea', 'peas', 'linseed',
  'sunflower', 'cotton', 'rice', 'sorghum', 'alfalfa', 'lucerne', 'clover', 'grass',
  'fallow', 'stubble', 'cover crop',
];

export function runChecks(
  workspace: Workspace,
  thresholds: QaThresholds = DEFAULT_THRESHOLDS,
): QAFlag[] {
  const flags: QAFlag[] = [];
  const fields = fieldGeometries(workspace);
  const labels = featureLabels(workspace);

  /* -- Attributes and field membership ------------------------------------ */

  for (const { field, geometry, featureIds } of fields) {
    const missing = (['client', 'farm', 'field'] as const).filter(
      (key) => field[key].trim() === '',
    );
    if (missing.length > 0) {
      flags.push({
        id: `missing:${field.id}`,
        kind: 'missing-attributes',
        severity: 'blocking',
        title: `${describeField(field)} — ${missing.length} attribute${
          missing.length === 1 ? '' : 's'
        } missing`,
        detail: `${missing.map(capitalise).join(', ')} ${
          missing.length === 1 ? 'is' : 'are'
        } empty. All three are required before export.`,
        guidance: GUIDANCE['missing-attributes'],
        featureIds,
        fieldIds: [field.id],
        manual: 'attributes',
      });
    }

    if (!geometry) {
      flags.push({
        id: `empty:${field.id}`,
        kind: 'empty-field',
        severity: 'blocking',
        title: `${describeField(field)} — no polygons assigned`,
        detail: 'This field would export as a row with no geometry.',
        guidance: GUIDANCE['empty-field'],
        featureIds: [],
        fieldIds: [field.id],
        manual: 'attributes',
      });
    }

    if (field.field.trim() !== '') {
      const reason = namingProblem(field.field);
      if (reason) {
        flags.push({
          id: `naming:${field.id}`,
          kind: 'naming',
          severity: 'warning',
          title: `${describeField(field)} — name looks season-specific`,
          detail: reason,
          guidance: GUIDANCE.naming,
          featureIds,
          fieldIds: [field.id],
          manual: 'attributes',
        });
      }
    }
  }

  /*
   * Duplicate Client/Farm/Field combinations. This is the one check that is about the
   * destination rather than the geometry: CropForce keys a field on the combination, so
   * a repeat silently overwrites whatever was uploaded first.
   *
   * Only fully-named fields are compared. A field still missing a name is already
   * blocked by the check above, and treating every half-empty row as a collision with
   * every other would bury that message in noise.
   */
  const named = fields.filter(
    ({ field, geometry }) =>
      // A field with no geometry writes no row, so it cannot collide with anything.
      // It has its own flag already, and counting it here would only add noise.
      geometry !== null && field.client.trim() && field.farm.trim() && field.field.trim(),
  );
  const byName = new Map<string, FieldGeometry[]>();
  for (const entry of named) {
    const key = nameKey(entry.field);
    byName.set(key, [...(byName.get(key) ?? []), entry]);
  }
  for (const [key, group] of byName) {
    if (group.length < 2) continue;
    const first = group[0].field;
    flags.push({
      id: `duplicate:${key}`,
      kind: 'duplicate-name',
      severity: 'blocking',
      title: `${group.length} fields share the name ${describeField(first)}`,
      detail:
        `${first.client} / ${first.farm} / ${first.field} is used ${group.length} times. ` +
        'CropForce would keep only the last one uploaded and drop the rest. Auto-fix ' +
        'numbers them apart; if they are one field in several blocks, select them and ' +
        'combine them instead.',
      guidance: GUIDANCE['duplicate-name'],
      featureIds: group.flatMap((entry) => entry.featureIds),
      fieldIds: group.map((entry) => entry.field.id),
      autoFix: { kind: 'uniquify-names' },
      manual: 'attributes',
    });
  }

  const unassigned = workspace.features.filter((f) => f.fieldId === null);
  if (unassigned.length > 0) {
    flags.push({
      id: 'unassigned',
      kind: 'unassigned',
      severity: 'warning',
      title: `${unassigned.length} polygon${
        unassigned.length === 1 ? '' : 's'
      } not assigned to a field`,
      detail:
        `These will not be exported. Select them and use “Combine into field”, ` +
        `or delete them if they are not needed.`,
      guidance: GUIDANCE.unassigned,
      featureIds: unassigned.map((f) => f.id),
      fieldIds: [],
      manual: 'attributes',
    });
  }

  /* -- Per-feature geometry ------------------------------------------------ */

  for (const feature of workspace.features) {
    const label = labels.get(feature.id) ?? 'Polygon';
    const validity = checkValidity(feature.geometry);
    if (!validity.ok) {
      flags.push({
        id: `invalid:${feature.id}`,
        kind: 'invalid-geometry',
        severity: 'blocking',
        title: `${label} — invalid geometry`,
        detail: `The outline has ${validity.reason}.`,
        guidance: GUIDANCE['invalid-geometry'],
        featureIds: [feature.id],
        fieldIds: feature.fieldId ? [feature.fieldId] : [],
        autoFix: { kind: 'unkink' },
        manual: 'vertex',
      });
      // A broken outline makes the measurements below meaningless, so stop here.
      continue;
    }

    const ha = areaHa(feature.geometry);
    if (ha < thresholds.sliverAreaHa) {
      flags.push({
        id: `sliver:${feature.id}`,
        kind: 'sliver',
        severity: 'warning',
        title: `${label} — sliver (${formatHa(ha)} ha)`,
        detail:
          `Smaller than the ${formatHa(thresholds.sliverAreaHa)} ha threshold, so this is ` +
          'probably a digitising fragment rather than a management zone.',
        guidance: GUIDANCE.sliver,
        featureIds: [feature.id],
        fieldIds: feature.fieldId ? [feature.fieldId] : [],
        autoFix: { kind: 'delete-features' },
        manual: 'review-delete',
      });
      continue;
    }

    const vertices = vertexCount(feature.geometry);
    const perimeter = perimeterMeters(feature.geometry);
    const spacing = vertices > 0 ? perimeter / vertices : Infinity;
    if (vertices >= thresholds.jaggedMinVertices && spacing < thresholds.jaggedMaxSpacingM) {
      const tolerance = suggestedTolerance(spacing);
      flags.push({
        id: `jagged:${feature.id}`,
        kind: 'jagged-edges',
        severity: 'warning',
        title: `${label} — jagged edges (${vertices} vertices)`,
        detail:
          `Vertices sit about ${spacing.toFixed(1)} m apart over ${Math.round(perimeter)} m ` +
          `of boundary — ${(vertices / ha).toFixed(0)} per hectare. Suggested smoothing ` +
          `tolerance: ${tolerance} m.`,
        guidance: GUIDANCE['jagged-edges'],
        featureIds: [feature.id],
        fieldIds: feature.fieldId ? [feature.fieldId] : [],
        autoFix: { kind: 'simplify', toleranceMeters: tolerance },
        manual: 'simplify',
      });
    }

    const protrusion = protrusionShare(feature.geometry, thresholds.protrusionWidthM);
    if (protrusion !== null && protrusion >= thresholds.protrusionAreaShare) {
      flags.push({
        id: `noncrop:${feature.id}`,
        kind: 'non-crop-area',
        severity: 'warning',
        title: `${label} — possible non-crop area included`,
        detail:
          `About ${(protrusion * 100).toFixed(0)}% of the area sits in strips narrower than ` +
          `${thresholds.protrusionWidthM * 2} m, which is the shape a track, watercourse or ` +
          'headland buffer makes. Check it against the imagery — this is a hint, not a verdict.',
        guidance: GUIDANCE['non-crop-area'],
        featureIds: [feature.id],
        fieldIds: feature.fieldId ? [feature.fieldId] : [],
        manual: 'cut-hole',
      });
    }
  }

  /* -- Overlaps between fields --------------------------------------------- */

  const withGeometry = fields.filter((f) => f.geometry && f.bbox);
  for (let i = 0; i < withGeometry.length; i++) {
    for (let j = i + 1; j < withGeometry.length; j++) {
      const a = withGeometry[i];
      const b = withGeometry[j];
      if (!bboxesOverlap(a.bbox!, b.bbox!)) continue;
      const shared = overlapAreaM2(a.geometry!, b.geometry!);
      if (shared <= thresholds.overlapMinM2) continue;
      flags.push({
        id: `overlap:${a.field.id}:${b.field.id}`,
        kind: 'overlap',
        severity: 'blocking',
        title: `${describeField(a.field)} overlaps ${describeField(b.field)}`,
        detail: `They share ${formatHa(shared / 10_000)} ha (${Math.round(shared)} m²).`,
        guidance: GUIDANCE.overlap,
        featureIds: [...a.featureIds, ...b.featureIds],
        fieldIds: [a.field.id, b.field.id],
        autoFix: { kind: 'resolve-overlap' },
        manual: 'vertex-snap',
      });
    }
  }

  return flags;
}

/* -------------------------------------------------------------------------- */
/* Heuristics                                                                  */
/* -------------------------------------------------------------------------- */

function suggestedTolerance(spacingM: number): number {
  return Math.min(10, Math.max(1, Math.round(spacingM * 3)));
}

/**
 * Morphological opening: shrink the polygon by `width` then grow it back. Anything
 * narrower than `2 × width` disappears and never returns, so the area lost is the
 * area sitting in thin strips — roads, tracks, buffers and spurs.
 *
 * Returns null when the shape is too small for the test to say anything useful.
 */
const protrusionCache = new WeakMap<object, Map<number, number | null>>();

export function protrusionShare(geometry: PolyGeom, widthM: number): number | null {
  // Two buffer operations per feature per pass is too much to repeat while someone is
  // typing in the attribute table, and the geometry object is a safe cache key.
  const byWidth = protrusionCache.get(geometry) ?? new Map<number, number | null>();
  if (byWidth.has(widthM)) return byWidth.get(widthM) ?? null;
  const result = computeProtrusionShare(geometry, widthM);
  byWidth.set(widthM, result);
  protrusionCache.set(geometry, byWidth);
  return result;
}

function computeProtrusionShare(geometry: PolyGeom, widthM: number): number | null {
  const total = areaM2(geometry);
  if (total < 5_000) return null; // below 0.5 ha the measure is dominated by shape noise
  try {
    const shrunk = buffer(feat(geometry), -widthM, { units: 'meters', steps: 8 });
    // The whole shape vanished: it is narrower than the probe everywhere, which makes
    // it a track or a hedge line rather than a field with a protrusion on it.
    if (!shrunk?.geometry || areaM2(shrunk.geometry as PolyGeom) <= 0) return 1;
    const grown = buffer(shrunk, widthM, { units: 'meters', steps: 8 });
    if (!grown?.geometry) return 1;
    const remaining = areaM2(grown.geometry as PolyGeom);
    return Math.max(0, Math.min(1, (total - remaining) / total));
  } catch {
    return null;
  }
}

/** Explains why a field name looks season-specific, or returns null if it is fine. */
export function namingProblem(name: string): string | null {
  const year = /\b(19|20)\d{2}\b/.exec(name);
  if (year) {
    return `“${name}” contains the year ${year[0]}. Field names should stay the same from ` +
      'season to season.';
  }
  const lower = ` ${name.toLowerCase()} `;
  const crop = CROP_WORDS.find((word) =>
    new RegExp(`[^a-z]${word}[^a-z]`).test(lower.replace(/[^a-z0-9]/g, ' ')),
  );
  if (crop) {
    return `“${name}” contains the crop name “${crop}”. Name the place, not what is ` +
      'growing in it this year.';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function describeField(field: WField): string {
  const name = field.field.trim();
  const farm = field.farm.trim();
  if (name && farm) return `${farm} / ${name}`;
  return name || farm || field.client.trim() || 'Untitled field';
}

/**
 * Labels every feature as "source file #n", prefixed with its field where it has one.
 * Built in a single pass because the per-feature alternative rescans the whole feature
 * list for each label.
 */
export function featureLabels(workspace: Workspace): Map<string, string> {
  const fieldsById = new Map(workspace.fields.map((field) => [field.id, field]));
  const counters = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const feature of workspace.features) {
    const n = (counters.get(feature.source) ?? 0) + 1;
    counters.set(feature.source, n);
    const base = `${feature.source} #${n}`;
    const field = feature.fieldId ? fieldsById.get(feature.fieldId) : undefined;
    labels.set(feature.id, field ? `${describeField(field)} · ${base}` : base);
  }
  return labels;
}

export function describeFeature(workspace: Workspace, featureId: string): string {
  return featureLabels(workspace).get(featureId) ?? 'Polygon';
}

/* -------------------------------------------------------------------------- */
/* Duplicate names                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The identity CropForce sees. Case and runs of whitespace are ignored, because
 * "North Field" and "north  field" are a collision waiting to happen even where they
 * are not one today.
 */
export function nameKey(field: Pick<WField, 'client' | 'farm' | 'field'>): string {
  return [field.client, field.farm, field.field]
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, ' '))
    .join(' | ');
}

/** DBF character width for a Field value, mirrored from the export schema. */
const FIELD_NAME_LIMIT = 30;

/**
 * Numbers a duplicated field name apart: "Long Acre" becomes "Long Acre (2)", trimmed
 * to fit the column if it has to be, and never landing on a name already in use.
 */
export function uniqueFieldName(field: WField, taken: ReadonlySet<string>): string {
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const base = field.field.trim().slice(0, FIELD_NAME_LIMIT - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!taken.has(nameKey({ ...field, field: candidate }))) return candidate;
  }
  return field.field;
}

/**
 * Renames every field after the first in each colliding group. The first keeps the name
 * it has, so the user's own naming survives and only the surplus is disturbed.
 */
export function autoUniquifyNames(workspace: Workspace, fieldIds: FieldId[]): FixOutcome {
  const target = new Set(fieldIds);
  const taken = new Set(workspace.fields.map(nameKey));
  const seen = new Set<string>();
  let renamed = 0;

  const fields = workspace.fields.map((field) => {
    if (!target.has(field.id)) return field;
    const key = nameKey(field);
    if (!seen.has(key)) {
      // First one through keeps its name.
      seen.add(key);
      return field;
    }
    const name = uniqueFieldName(field, taken);
    if (name === field.field) return field;
    const renamedField = { ...field, field: name };
    taken.add(nameKey(renamedField));
    seen.add(nameKey(renamedField));
    renamed++;
    return renamedField;
  });

  return {
    workspace: { ...workspace, fields },
    message: `Renamed ${renamed} field${renamed === 1 ? '' : 's'} so each combination is unique.`,
    ok: renamed > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Blocking status                                                             */
/* -------------------------------------------------------------------------- */

export const BLOCKING_KINDS: FlagKind[] = [
  'missing-attributes',
  'invalid-geometry',
  'overlap',
  'empty-field',
  'duplicate-name',
];

/** Field ids that cannot be exported, mapped to the reasons why. */
export function blockedFields(flags: QAFlag[]): Map<FieldId, QAFlag[]> {
  const blocked = new Map<FieldId, QAFlag[]>();
  for (const flag of flags) {
    if (flag.severity !== 'blocking') continue;
    for (const fieldId of flag.fieldIds) {
      const list = blocked.get(fieldId) ?? [];
      list.push(flag);
      blocked.set(fieldId, list);
    }
  }
  return blocked;
}

/* -------------------------------------------------------------------------- */
/* Auto-fixes                                                                  */
/* -------------------------------------------------------------------------- */

export interface FixOutcome {
  workspace: Workspace;
  message: string;
  ok: boolean;
}

/** Repairs self-intersections on the flagged features. */
export function autoFixGeometry(workspace: Workspace, featureIds: string[]): FixOutcome {
  let repaired = 0;
  let dropped = 0;
  const features = workspace.features.flatMap((feature) => {
    if (!featureIds.includes(feature.id)) return [feature];
    const fixed = repairGeometry(feature.geometry);
    if (!fixed) {
      dropped++;
      return [];
    }
    repaired++;
    return [{ ...feature, geometry: fixed }];
  });
  const parts = [
    repaired > 0 ? `Repaired ${repaired} polygon${repaired === 1 ? '' : 's'}` : '',
    dropped > 0 ? `removed ${dropped} that could not be repaired` : '',
  ].filter(Boolean);
  return {
    workspace: { ...workspace, features },
    message: parts.join(' and ') + '.',
    ok: repaired > 0 || dropped > 0,
  };
}

export function autoDeleteFeatures(workspace: Workspace, featureIds: string[]): FixOutcome {
  const features = workspace.features.filter((f) => !featureIds.includes(f.id));
  const removed = workspace.features.length - features.length;
  return {
    workspace: { ...workspace, features },
    message: `Deleted ${removed} sliver${removed === 1 ? '' : 's'}.`,
    ok: removed > 0,
  };
}

export function autoSimplify(
  workspace: Workspace,
  featureIds: string[],
  toleranceMeters: number,
): FixOutcome {
  let before = 0;
  let after = 0;
  const features = workspace.features.map((feature) => {
    if (!featureIds.includes(feature.id)) return feature;
    const simplified = simplifyMeters(feature.geometry, toleranceMeters);
    if (!simplified) return feature;
    before += vertexCount(feature.geometry);
    after += vertexCount(simplified);
    return { ...feature, geometry: simplified };
  });
  return {
    workspace: { ...workspace, features },
    message: `Smoothed at ${toleranceMeters} m: ${before} vertices reduced to ${after}.`,
    ok: after < before,
  };
}

/**
 * Removes the shared area from `loserId` so the two fields become conjoined rather
 * than overlapping. `keeperId` is left untouched.
 */
export function resolveOverlap(
  workspace: Workspace,
  keeperId: FieldId,
  loserId: FieldId,
): FixOutcome {
  const keeper = unionAll(
    workspace.features.filter((f) => f.fieldId === keeperId).map((f) => f.geometry),
  );
  if (!keeper) {
    return { workspace, message: 'The field to keep has no geometry.', ok: false };
  }

  let clipped = 0;
  let removed = 0;
  const features = workspace.features.flatMap((feature) => {
    if (feature.fieldId !== loserId) return [feature];
    if (overlapAreaM2(feature.geometry, keeper) <= 0) return [feature];
    const trimmed = differenceGeom(feature.geometry, keeper);
    if (!trimmed || areaM2(trimmed) < 1) {
      removed++;
      return [];
    }
    clipped++;
    return [{ ...feature, geometry: trimmed }];
  });

  if (clipped === 0 && removed === 0) {
    return { workspace, message: 'Nothing to clip — the overlap had already gone.', ok: false };
  }
  const note = removed > 0 ? ` ${removed} polygon${removed === 1 ? '' : 's'} was fully inside the kept field and was removed.` : '';
  return {
    workspace: { ...workspace, features },
    message: `Clipped the shared area out of the other field.${note}`,
    ok: true,
  };
}
