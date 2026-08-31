import buffer from '@turf/buffer';
import type { BBox } from 'geojson';
import { ambientT } from '../i18n/translator';
import type { StringKey, Translator } from '../i18n/translator';
import { deleteFields } from '../state/ops';
import { hasNonAscii, nonAsciiCharacters, toAscii } from './text';
import type {
  FieldId,
  FlagKind,
  PolyGeom,
  QAFlag,
  WFeature,
  WField,
  Workspace,
} from '../types';
import type { InvalidReason } from './geo';
import {
  areaHa,
  areaM2,
  bboxOf,
  bboxesOverlap,
  bufferMeters,
  checkValidity,
  differenceGeom,
  feat,
  formatHa,
  formatNum,
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
  /**
   * Share of the smaller field that two fields must share before they stop being an
   * overlap and start being the same boundary twice.
   */
  duplicateAreaShare: number;
}

export const DEFAULT_THRESHOLDS: QaThresholds = {
  sliverAreaHa: 0.05,
  overlapMinM2: 1,
  jaggedMinVertices: 50,
  jaggedMaxSpacingM: 4,
  protrusionWidthM: 8,
  protrusionAreaShare: 0.04,
  duplicateAreaShare: 0.9,
};

/* -------------------------------------------------------------------------- */
/* Guidance — Arva, "What Makes a Good Field Boundary?"                        */
/* -------------------------------------------------------------------------- */

export const guidanceFor = (kind: FlagKind, t: Translator = ambientT()): string =>
  t(`guidance.${kind}` as const);

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
const dissolveCache = new Map<
  FieldId,
  { field: WField; members: PolyGeom[]; entry: FieldGeometry }
>();

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

    // The whole entry is returned unchanged when nothing about the field moved, not
    // just the dissolved geometry. Callers hand these to React as props, so a fresh
    // object for an unchanged field would re-render a row for someone else's edit.
    const cached = dissolveCache.get(field.id);
    if (cached && cached.field === field && sameMembers(cached.members, geometries)) {
      return cached.entry;
    }

    const geometry =
      cached && sameMembers(cached.members, geometries)
        ? cached.entry.geometry
        : unionAll(geometries);

    const entry: FieldGeometry = {
      field,
      featureIds: members.map((f) => f.id),
      geometry,
      bbox: geometry ? bboxOf(geometry) : null,
      areaHa: geometry ? areaHa(geometry) : 0,
    };
    dissolveCache.set(field.id, { field, members: geometries, entry });
    return entry;
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
  t: Translator = ambientT(),
  thresholds: QaThresholds = DEFAULT_THRESHOLDS,
): QAFlag[] {
  const flags: QAFlag[] = [];
  const fields = fieldGeometries(workspace);
  const labels = featureLabels(workspace, t);

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
        title: t.n('flag.missing.title', missing.length, { field: describeField(field, t) }),
        detail: t.n('flag.missing.detail', missing.length, {
          columns: missing.map((key) => t(`fields.${key}` as const)).join(', '),
        }),
        guidance: guidanceFor('missing-attributes', t),
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
        title: t('flag.empty.title', { field: describeField(field, t) }),
        detail: t('flag.empty.detail'),
        guidance: guidanceFor('empty-field', t),
        featureIds: [],
        fieldIds: [field.id],
        autoFix: { kind: 'delete-fields' },
        manual: 'attributes',
      });
    }

    if (field.field.trim() !== '') {
      const reason = namingProblem(field.field, t);
      if (reason) {
        flags.push({
          id: `naming:${field.id}`,
          kind: 'naming',
          severity: 'warning',
          title: t('flag.naming.title', { field: describeField(field, t) }),
          detail: reason,
          guidance: guidanceFor('naming', t),
          featureIds,
          fieldIds: [field.id],
          manual: 'attributes',
        });
      }
    }
  }

  /*
   * Values that will not survive the 30-character column. The export truncates them
   * silently, which is the sort of loss you only notice months later, so it is stopped
   * here instead.
   */
  const overLong = fields.filter(({ field }) =>
    (['client', 'farm', 'field'] as const).some((key) => field[key].trim().length > NAME_LIMIT),
  );
  for (const entry of overLong) {
    const columns = (['client', 'farm', 'field'] as const)
      .filter((key) => entry.field[key].trim().length > NAME_LIMIT)
      .map((key) => `${t(`fields.${key}` as const)} (${entry.field[key].trim().length})`);
    flags.push({
      id: `toolong:${entry.field.id}`,
      kind: 'name-too-long',
      severity: 'blocking',
      title: t('flag.tooLong.title', { field: describeField(entry.field, t) }),
      detail: t.n('flag.tooLong.detail', columns.length, {
        columns: columns.join(', '),
        limit: NAME_LIMIT,
      }),
      guidance: guidanceFor('name-too-long', t),
      featureIds: entry.featureIds,
      fieldIds: [entry.field.id],
      autoFix: { kind: 'shorten-names' },
      manual: 'attributes',
    });
  }

  /*
   * Characters CropForce will not take. Same class of problem as a name that is too
   * long: nothing to do with the geometry, everything to do with what the destination
   * will accept, and silent damage if it goes unnoticed.
   */
  for (const entry of fields) {
    const columns = (['client', 'farm', 'field'] as const).filter((key) =>
      hasNonAscii(entry.field[key]),
    );
    if (columns.length === 0) continue;
    const characters = [
      ...new Set(columns.flatMap((key) => nonAsciiCharacters(entry.field[key]))),
    ];
    flags.push({
      id: `nonascii:${entry.field.id}`,
      kind: 'non-ascii',
      severity: 'blocking',
      title: t('flag.nonAscii.title', { field: describeField(entry.field, t) }),
      detail: t.n('flag.nonAscii.detail', columns.length, {
        columns: columns.map((key) => t(`fields.${key}` as const)).join(', '),
        characters: characters.join(' '),
        example: toAscii(entry.field[columns[0]]),
      }),
      guidance: guidanceFor('non-ascii', t),
      featureIds: entry.featureIds,
      fieldIds: [entry.field.id],
      autoFix: { kind: 'asciify-names' },
      manual: 'attributes',
    });
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
      title: t('flag.duplicate.title', {
        count: group.length,
        field: describeField(first, t),
      }),
      detail: t('flag.duplicate.detail', {
        combination: `${first.client} / ${first.farm} / ${first.field}`,
        count: group.length,
      }),
      guidance: guidanceFor('duplicate-name', t),
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
      title: t.n('flag.unassigned.title', unassigned.length),
      detail: t('flag.unassigned.detail'),
      guidance: guidanceFor('unassigned', t),
      featureIds: unassigned.map((f) => f.id),
      fieldIds: [],
      manual: 'attributes',
    });
  }

  /* -- Per-feature geometry ------------------------------------------------ */

  for (const feature of workspace.features) {
    const label = labels.get(feature.id) ?? t('flag.polygon');
    const validity = checkValidity(feature.geometry);
    if (!validity.ok) {
      flags.push({
        id: `invalid:${feature.id}`,
        kind: 'invalid-geometry',
        severity: 'blocking',
        title: t('flag.invalid.title', { feature: label }),
        detail: t('flag.invalid.detail', {
          reason:
            validity.reason === 'kinks'
              ? t.n('flag.invalid.kinks', validity.kinkCount)
              : t(INVALID_KEYS[validity.reason]),
        }),
        guidance: guidanceFor('invalid-geometry', t),
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
        title: t('flag.sliver.title', { feature: label, area: formatHa(ha) }),
        detail: t('flag.sliver.detail', { threshold: formatHa(thresholds.sliverAreaHa) }),
        guidance: guidanceFor('sliver', t),
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
        title: t('flag.jagged.title', { feature: label, count: vertices }),
        detail: t('flag.jagged.detail', {
          spacing: formatNum(spacing, 1),
          perimeter: formatNum(perimeter),
          density: formatNum(vertices / ha),
          tolerance,
        }),
        guidance: guidanceFor('jagged-edges', t),
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
        title: t('flag.noncrop.title', { feature: label }),
        detail: t('flag.noncrop.detail', {
          percent: formatNum(protrusion * 100),
          width: thresholds.protrusionWidthM * 2,
        }),
        guidance: guidanceFor('non-crop-area', t),
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

      // Two fields sitting almost exactly on top of each other are not neighbours whose
      // edges disagree; they are one field imported twice, and clipping the shared area
      // out of one would leave a sliver rather than fix anything.
      const smaller = Math.min(areaM2(a.geometry!), areaM2(b.geometry!));
      const share = smaller > 0 ? shared / smaller : 0;
      if (share >= thresholds.duplicateAreaShare) {
        flags.push({
          id: `duplicate-geometry:${a.field.id}:${b.field.id}`,
          kind: 'duplicate-geometry',
          severity: 'blocking',
          title: t('flag.duplicateGeometry.title', {
            a: describeField(a.field, t),
            b: describeField(b.field, t),
          }),
          detail: t('flag.duplicateGeometry.detail', {
            percent: formatNum(share * 100),
            area: formatHa(shared / 10_000),
          }),
          guidance: guidanceFor('duplicate-geometry', t),
          featureIds: [...a.featureIds, ...b.featureIds],
          fieldIds: [a.field.id, b.field.id],
          autoFix: { kind: 'resolve-overlap' },
          manual: 'attributes',
        });
        continue;
      }

      flags.push({
        id: `overlap:${a.field.id}:${b.field.id}`,
        kind: 'overlap',
        severity: 'blocking',
        title: t('flag.overlap.title', {
          a: describeField(a.field, t),
          b: describeField(b.field, t),
        }),
        detail: t('flag.overlap.detail', {
          area: formatHa(shared / 10_000),
          squareMetres: formatNum(shared),
        }),
        guidance: guidanceFor('overlap', t),
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
/**
 * One compiled alternation rather than a fresh RegExp per crop word per name. The
 * per-word version cost thirty compilations for every field on every pass, which on a
 * few hundred fields was the single most expensive thing the checks did.
 */
const CROP_PATTERN = new RegExp(`[^a-z](${CROP_WORDS.join('|')})[^a-z]`);

export function namingProblem(name: string, t: Translator = ambientT()): string | null {
  const year = /\b(19|20)\d{2}\b/.exec(name);
  if (year) {
    return t('flag.naming.year', { name, year: year[0] });
  }
  const words = ` ${name.toLowerCase()} `.replace(/[^a-z0-9]/g, ' ');
  const crop = CROP_PATTERN.exec(words);
  if (crop) {
    return t('flag.naming.crop', { name, crop: crop[1] });
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

/** Validity codes mapped onto the phrases that complete "The outline has …". */
const INVALID_KEYS = {
  none: 'flag.invalid.noRings',
  'no-rings': 'flag.invalid.noRings',
  'short-ring': 'flag.invalid.shortRing',
  'not-closed': 'flag.invalid.notClosed',
  kinks: 'flag.invalid.noRings',
} as const satisfies Record<InvalidReason, StringKey>;

export function describeField(field: WField, t: Translator = ambientT()): string {
  const name = field.field.trim();
  const farm = field.farm.trim();
  if (name && farm) return `${farm} / ${name}`;
  return name || farm || field.client.trim() || t('flag.untitled');
}

/**
 * Labels every feature as "source file #n", prefixed with its field where it has one.
 * Built in a single pass because the per-feature alternative rescans the whole feature
 * list for each label.
 */
export function featureLabels(workspace: Workspace, t: Translator = ambientT()): Map<string, string> {
  const fieldsById = new Map(workspace.fields.map((field) => [field.id, field]));
  const counters = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const feature of workspace.features) {
    const n = (counters.get(feature.source) ?? 0) + 1;
    counters.set(feature.source, n);
    const base = `${feature.source} #${n}`;
    const field = feature.fieldId ? fieldsById.get(feature.fieldId) : undefined;
    labels.set(feature.id, field ? `${describeField(field, t)} · ${base}` : base);
  }
  return labels;
}

export function describeFeature(
  workspace: Workspace,
  featureId: string,
  t: Translator = ambientT(),
): string {
  return featureLabels(workspace, t).get(featureId) ?? t('flag.polygon');
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

/** DBF character width for every attribute, mirrored from the export schema. */
export const NAME_LIMIT = 30;

/**
 * Numbers a duplicated field name apart: "Long Acre" becomes "Long Acre (2)", trimmed
 * to fit the column if it has to be, and never landing on a name already in use.
 */
export function uniqueFieldName(field: WField, taken: ReadonlySet<string>): string {
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const base = field.field.trim().slice(0, NAME_LIMIT - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!taken.has(nameKey({ ...field, field: candidate }))) return candidate;
  }
  return field.field;
}

/**
 * Renames every field after the first in each colliding group. The first keeps the name
 * it has, so the user's own naming survives and only the surplus is disturbed.
 */
export function autoUniquifyNames(
  workspace: Workspace,
  fieldIds: FieldId[],
  t: Translator = ambientT(),
): FixOutcome {
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
    message: t.n('fix.renamed', renamed),
    ok: renamed > 0,
  };
}

/**
 * Trims a value to the column width, cutting at a word boundary where one is close
 * enough to the end to be worth using. Cutting mid-word reads as a mistake; cutting at
 * a space reads as an abbreviation.
 */
export function shortenToLimit(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (collapsed.length <= NAME_LIMIT) return collapsed;

  const cut = collapsed.slice(0, NAME_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');
  // Only honour a word boundary in the last third; earlier than that loses too much.
  return (lastSpace > NAME_LIMIT * 0.66 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Shortens every over-length value on the named fields, then makes sure the results are
 * still distinct — two long names cut at the same point would otherwise become one row.
 */
export function autoShortenNames(
  workspace: Workspace,
  fieldIds: FieldId[],
  t: Translator = ambientT(),
): FixOutcome {
  const target = new Set(fieldIds);
  let shortened = 0;

  const fields = workspace.fields.map((field) => {
    if (!target.has(field.id)) return field;
    const next = { ...field };
    for (const key of ['client', 'farm', 'field'] as const) {
      if (next[key].trim().length <= NAME_LIMIT) continue;
      next[key] = shortenToLimit(next[key]);
      shortened++;
    }
    return next;
  });

  if (shortened === 0) {
    return { workspace, message: t('fix.alreadyFits'), ok: false };
  }

  // Shortening can turn two distinct names into the same one, so settle that here
  // rather than leaving the user with a fresh duplicate flag to chase.
  const settled = autoUniquifyNames({ ...workspace, fields }, fields.map((f) => f.id), t);
  const collisions = settled.ok ? t('fix.shortenedCollided') : '';

  return {
    workspace: settled.ok ? settled.workspace : { ...workspace, fields },
    message: t.n('fix.shortened', shortened, { limit: NAME_LIMIT }) + collisions,
    ok: true,
  };
}

/**
 * Folds every accented or non-Latin character out of the named fields' attributes.
 *
 * Run after shortening rather than before, where both apply: folding can only make a
 * value shorter or the same length, so it can never push one back over the limit.
 */
export function autoAsciiNames(
  workspace: Workspace,
  fieldIds: FieldId[],
  t: Translator = ambientT(),
): FixOutcome {
  const target = new Set(fieldIds);
  let changed = 0;

  const fields = workspace.fields.map((field) => {
    if (!target.has(field.id)) return field;
    const next = { ...field };
    for (const key of ['client', 'farm', 'field'] as const) {
      if (!hasNonAscii(next[key])) continue;
      next[key] = toAscii(next[key]);
      changed++;
    }
    return next;
  });

  if (changed === 0) return { workspace, message: t('fix.alreadyPlain'), ok: false };

  // Folding can turn two names that differed only by an accent into the same name,
  // which would be a silently dropped boundary on upload.
  const settled = autoUniquifyNames({ ...workspace, fields }, fields.map((f) => f.id), t);
  const collisions = settled.ok ? t('fix.shortenedCollided') : '';

  return {
    workspace: settled.ok ? settled.workspace : { ...workspace, fields },
    message: t.n('fix.asciified', changed) + collisions,
    ok: true,
  };
}

/** Deletes the named field rows. Used to clear away rows left with no geometry. */
export function autoDeleteFields(
  workspace: Workspace,
  fieldIds: FieldId[],
  t: Translator = ambientT(),
): FixOutcome {
  const next = deleteFields(workspace, fieldIds);
  const removed = workspace.fields.length - next.fields.length;
  return { workspace: next, message: t.n('fix.deletedFields', removed), ok: removed > 0 };
}

/* -------------------------------------------------------------------------- */
/* Reviewed warnings                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Identity of a flag *as the user saw it when they dismissed it*.
 *
 * The detail line is part of the key on purpose. Marking a jagged boundary as reviewed
 * settles that boundary at 250 vertices; if it is later edited into something else the
 * detail changes, the key stops matching, and the flag comes back to be looked at again.
 * Dismissing a judgement call should not silence the check forever.
 */
export const reviewKey = (flag: QAFlag): string => `${flag.id}::${flag.detail}`;

/** Only soft warnings can be waved through: a blocking flag would break the upload. */
export const canReview = (flag: QAFlag): boolean => flag.severity === 'warning';

/* -------------------------------------------------------------------------- */
/* Blocking status                                                             */
/* -------------------------------------------------------------------------- */

export const BLOCKING_KINDS: FlagKind[] = [
  'missing-attributes',
  'invalid-geometry',
  'overlap',
  'empty-field',
  'duplicate-name',
  'name-too-long',
  'non-ascii',
  'duplicate-geometry',
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
export function autoFixGeometry(
  workspace: Workspace,
  featureIds: string[],
  t: Translator = ambientT(),
): FixOutcome {
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
    repaired > 0 ? t.n('fix.repaired', repaired) : '',
    dropped > 0 ? t('fix.dropped', { count: dropped }) : '',
  ].filter(Boolean);
  return {
    workspace: { ...workspace, features },
    message: parts.join(t('fix.and')) + '.',
    ok: repaired > 0 || dropped > 0,
  };
}

export function autoDeleteFeatures(
  workspace: Workspace,
  featureIds: string[],
  t: Translator = ambientT(),
): FixOutcome {
  const features = workspace.features.filter((f) => !featureIds.includes(f.id));
  const removed = workspace.features.length - features.length;
  return {
    workspace: { ...workspace, features },
    message: t.n('fix.deletedSlivers', removed),
    ok: removed > 0,
  };
}

export function autoSimplify(
  workspace: Workspace,
  featureIds: string[],
  toleranceMeters: number,
  t: Translator = ambientT(),
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
    message: t('fix.smoothed', { tolerance: toleranceMeters, before, after }),
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
  t: Translator = ambientT(),
): FixOutcome {
  const keeper = unionAll(
    workspace.features.filter((f) => f.fieldId === keeperId).map((f) => f.geometry),
  );
  if (!keeper) {
    return { workspace, message: t('fix.noKeeper'), ok: false };
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
    return { workspace, message: t('fix.noOverlap'), ok: false };
  }
  const note = removed > 0 ? t.n('fix.clippedRemoved', removed) : '';
  return {
    workspace: { ...workspace, features },
    message: t('fix.clipped') + note,
    ok: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Overlap strategies                                                          */
/* -------------------------------------------------------------------------- */

/**
 * How an overlap between two fields is settled.
 *
 * `trim-larger` needs no decision from anyone, which is what makes it the one an
 * unattended bulk run is allowed to use.
 */
export type OverlapStrategy = 'trim-larger' | 'trim-chosen' | 'shrink-both';

/** The area of everything filed under one field, in square metres. */
export function fieldAreaM2(workspace: Workspace, fieldId: FieldId): number {
  const merged = unionAll(
    workspace.features.filter((f) => f.fieldId === fieldId).map((f) => f.geometry),
  );
  return merged ? areaM2(merged) : 0;
}

/**
 * Which of two overlapping fields should give up the shared ground.
 *
 * The larger one: losing half a hectare off a hundred barely moves its total, while the
 * same half hectare off a forty-hectare neighbour is a real dent in what gets planted.
 * A tie falls to the first, so the answer never depends on the order they were checked.
 */
export function largerOf(workspace: Workspace, a: FieldId, b: FieldId): FieldId {
  return fieldAreaM2(workspace, b) > fieldAreaM2(workspace, a) ? b : a;
}

/** Deepest inset the search will consider, and the step it rounds up to. */
export const MAX_INSET_M = 10;
const INSET_STEP_M = 0.1;
/** Slack for arithmetic noise: a square decimetre of leftover is not an overlap. */
const CLEARED_M2 = 0.05;

/**
 * The shallowest inset, in metres, that pulls two overlapping boundaries apart when it
 * is applied to both.
 *
 * Shrinking both by `d` opens the strip between them by `2d`, so an edge disagreement of
 * a metre or two clears at well under a metre each. Anything needing more than
 * `MAX_INSET_M` is not two surveys disagreeing about a fence line — it is a real
 * double-claim, and shaving ten metres off both fields would be the wrong answer to it,
 * so the search gives up and says so.
 */
export function minimalInset(a: PolyGeom, b: PolyGeom): number | null {
  const cleared = (inset: number): boolean => {
    const shrunkA = bufferMeters(a, -inset);
    const shrunkB = bufferMeters(b, -inset);
    if (!shrunkA || !shrunkB) return false;
    return overlapAreaM2(shrunkA, shrunkB) <= CLEARED_M2;
  };

  if (!cleared(MAX_INSET_M)) return null;

  let low = 0;
  let high = MAX_INSET_M;
  // Seven halvings take a ten-metre bracket under the tenth of a metre the answer is
  // rounded to, so the last step is the rounding rather than the search.
  for (let i = 0; i < 7; i++) {
    const mid = (low + high) / 2;
    if (cleared(mid)) high = mid;
    else low = mid;
  }

  const answer = Math.ceil(high / INSET_STEP_M) * INSET_STEP_M;
  return Math.min(MAX_INSET_M, Math.round(answer * 10) / 10);
}

/**
 * Pulls two overlapping fields apart by insetting both, rather than making one of them
 * pay for the whole disagreement.
 *
 * Only the polygons actually caught in the overlap are moved. Insetting the rest would
 * open gaps inside a field between members that were never in dispute.
 */
export function shrinkApart(
  workspace: Workspace,
  aId: FieldId,
  bId: FieldId,
  t: Translator = ambientT(),
): FixOutcome {
  const result = computeShrink(workspace, aId, bId);
  if (result === 'no-geometry') return { workspace, message: t('fix.noKeeper'), ok: false };
  if (result === 'no-overlap') return { workspace, message: t('fix.noOverlap'), ok: false };
  if (result === 'too-deep') {
    return { workspace, message: t('fix.insetTooDeep', { max: MAX_INSET_M }), ok: false };
  }
  return {
    workspace: result.workspace,
    message: t('fix.shrunkApart', {
      inset: formatNum(result.inset, 1),
      gap: formatNum(result.inset * 2, 1),
      area: formatHa(result.areaLostM2 / 10_000),
    }),
    ok: true,
  };
}

export interface ShrinkPreview {
  /** How far each boundary comes in, in metres. */
  inset: number;
  /** The clearance that opens between them — twice the inset. */
  gap: number;
  lostHa: number;
}

/** What `shrinkApart` would cost, for showing before it is committed. */
export function previewShrinkApart(
  workspace: Workspace,
  aId: FieldId,
  bId: FieldId,
): ShrinkPreview | null {
  const result = computeShrink(workspace, aId, bId);
  if (typeof result === 'string') return null;
  return {
    inset: result.inset,
    gap: result.inset * 2,
    lostHa: result.areaLostM2 / 10_000,
  };
}

type ShrinkFailure = 'no-geometry' | 'no-overlap' | 'too-deep';

function computeShrink(
  workspace: Workspace,
  aId: FieldId,
  bId: FieldId,
): { workspace: Workspace; inset: number; areaLostM2: number } | ShrinkFailure {
  const unionFor = (id: FieldId) =>
    unionAll(workspace.features.filter((f) => f.fieldId === id).map((f) => f.geometry));
  const a = unionFor(aId);
  const b = unionFor(bId);
  if (!a || !b) return 'no-geometry';
  if (overlapAreaM2(a, b) <= 0) return 'no-overlap';

  const inset = minimalInset(a, b);
  if (inset === null) return 'too-deep';

  const before = areaM2(a) + areaM2(b);
  let failed = false;
  const features = workspace.features.map((feature) => {
    if (feature.fieldId !== aId && feature.fieldId !== bId) return feature;
    const other = feature.fieldId === aId ? b : a;
    if (overlapAreaM2(feature.geometry, other) <= 0) return feature;
    const shrunk = bufferMeters(feature.geometry, -inset);
    if (!shrunk) {
      failed = true;
      return feature;
    }
    return { ...feature, geometry: shrunk };
  });
  if (failed) return 'too-deep';

  const next = { ...workspace, features };
  const after = fieldAreaM2(next, aId) + fieldAreaM2(next, bId);
  return { workspace: next, inset, areaLostM2: Math.max(0, before - after) };
}
