import type { FeatureId, FieldId, PolyGeom, WFeature, WField, Workspace } from '../types';
import type { ColumnMapping, ImportedFeature } from '../lib/import';
import { applyMapping, mappingIsEmpty } from '../lib/import';
import { bboxOf, bboxesOverlap, differenceGeom, normalize, unionAll } from '../lib/geo';

let counter = 0;
const nextId = (prefix: string): string => {
  counter += 1;
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

/** Resets id numbering. Only used to keep test output readable. */
export const __resetIds = (): void => {
  counter = 0;
};

export const newField = (attrs: Partial<Omit<WField, 'id'>> = {}): WField => ({
  id: nextId('fld_'),
  client: attrs.client ?? '',
  farm: attrs.farm ?? '',
  field: attrs.field ?? '',
});

export const newFeature = (
  geometry: PolyGeom,
  source: string,
  sourceProps: Record<string, unknown> = {},
  seed: WFeature['seed'] = { client: '', farm: '', field: '' },
): WFeature => ({
  id: nextId('ftr_'),
  geometry,
  source,
  fieldId: null,
  sourceProps,
  seed,
});

/* -------------------------------------------------------------------------- */
/* Import                                                                      */
/* -------------------------------------------------------------------------- */



/**
 * Adds imported polygons to the workspace.
 *
 * When a mapping is requested each polygon becomes a field of its own, carrying the
 * names it arrived with. Polygons that share a Client/Farm/Field are deliberately NOT
 * merged: two blocks with the same name are far more often two fields whose names
 * collide than one field in two pieces, and merging them silently would destroy a
 * boundary. Deciding that two polygons are one field is the user's call, and the
 * duplicate-name check puts that choice in front of them.
 */
export function addImported(
  workspace: Workspace,
  imported: ImportedFeature[],
  mapping: ColumnMapping,
): Workspace {
  const features: WFeature[] = [];
  const fields: WField[] = [...workspace.fields];
  const useMapping = !mappingIsEmpty(mapping);

  for (const item of imported) {
    // Only the columns the user chose are read. Leaving one unmapped at import means
    // leaving it blank everywhere, including when the polygon is grouped later on.
    const attrs = applyMapping(item.sourceProps, mapping);
    const feature = newFeature(item.geometry, item.source, item.sourceProps, attrs);
    // A feature with nothing to map stays ungrouped rather than joining a blank field.
    if (useMapping && (attrs.client || attrs.farm || attrs.field)) {
      const field = newField(attrs);
      fields.push(field);
      feature.fieldId = field.id;
    }
    features.push(feature);
  }

  return { features: [...workspace.features, ...features], fields };
}

/* -------------------------------------------------------------------------- */
/* Features                                                                    */
/* -------------------------------------------------------------------------- */

export function addDrawnFeature(
  workspace: Workspace,
  geometry: PolyGeom,
  fieldId: FieldId | null = null,
): Workspace {
  const feature = { ...newFeature(geometry, 'Drawn'), fieldId };
  return { ...workspace, features: [...workspace.features, feature] };
}

/**
 * A polygon drawn on the map, landing in a field.
 *
 * Drawing and grouping used to be two separate jobs: the polygon arrived ungrouped and
 * had to be combined into a field afterwards, which is a step nobody wants and everybody
 * has to remember. A boundary someone drew by hand is a boundary they meant, so it
 * becomes a field there and then — a new one, or the one they said they were adding to.
 *
 * The caller gets the ids back because what happens next depends on them: a new field
 * wants selecting and naming, an existing one does not.
 */
export function addDrawnToField(
  workspace: Workspace,
  geometry: PolyGeom,
  target: FieldId | 'new',
): { workspace: Workspace; fieldId: FieldId; featureId: FeatureId; created: boolean } {
  const existing =
    target === 'new' ? undefined : workspace.fields.find((field) => field.id === target);
  // A target that has since been deleted falls back to a new field rather than
  // dropping the polygon into nothing.
  const field = existing ?? newField();
  const feature = { ...newFeature(geometry, 'Drawn'), fieldId: field.id };
  return {
    workspace: {
      fields: existing ? workspace.fields : [...workspace.fields, field],
      features: [...workspace.features, feature],
    },
    fieldId: field.id,
    featureId: feature.id,
    created: !existing,
  };
}

export function setGeometry(
  workspace: Workspace,
  featureId: FeatureId,
  geometry: PolyGeom,
): Workspace {
  const cleaned = normalize(geometry);
  if (!cleaned) return deleteFeatures(workspace, [featureId]);
  return {
    ...workspace,
    features: workspace.features.map((f) =>
      f.id === featureId ? { ...f, geometry: cleaned } : f,
    ),
  };
}

export function deleteFeatures(workspace: Workspace, featureIds: FeatureId[]): Workspace {
  const remove = new Set(featureIds);
  return { ...workspace, features: workspace.features.filter((f) => !remove.has(f.id)) };
}

/** Replaces one feature with several. Used by the split tool. */
export function replaceWithParts(
  workspace: Workspace,
  featureId: FeatureId,
  parts: PolyGeom[],
): Workspace {
  const original = workspace.features.find((f) => f.id === featureId);
  if (!original) return workspace;
  const replacements = parts.map((geometry) => ({
    ...newFeature(geometry, original.source, original.sourceProps, original.seed),
    fieldId: original.fieldId,
  }));
  return {
    ...workspace,
    features: workspace.features.flatMap((f) => (f.id === featureId ? replacements : [f])),
  };
}

/**
 * Cuts an exclusion zone out of the workspace: everything the drawn shape covers is
 * removed from the polygons underneath.
 *
 * With `restrictTo` the cut is confined to those features; without it, every polygon
 * the shape overlaps is cut, which is what someone drawing along a track that runs
 * between two fields expects. A polygon swallowed whole by the cut is deleted.
 */
export function cutExclusionZone(
  workspace: Workspace,
  hole: PolyGeom,
  restrictTo?: ReadonlySet<FeatureId>,
): Workspace {
  const holeBbox = bboxOf(hole);
  let changed = 0;

  const features = workspace.features.flatMap((feature) => {
    if (restrictTo && restrictTo.size > 0 && !restrictTo.has(feature.id)) return [feature];
    if (!bboxesOverlap(bboxOf(feature.geometry), holeBbox)) return [feature];

    const trimmed = differenceGeom(feature.geometry, hole);
    if (!trimmed) {
      changed += 1;
      return [];
    }
    if (trimmed === feature.geometry) return [feature];
    changed += 1;
    return [{ ...feature, geometry: trimmed }];
  });

  return changed > 0 ? { ...workspace, features } : workspace;
}

/** Dissolves several features into one. Leaves the workspace alone if they cannot unite. */
export function mergeFeatures(workspace: Workspace, featureIds: FeatureId[]): Workspace {
  const chosen = workspace.features.filter((f) => featureIds.includes(f.id));
  if (chosen.length < 2) return workspace;
  const merged = unionAll(chosen.map((f) => f.geometry));
  if (!merged) return workspace;
  const keep = chosen[0];
  const others = new Set(chosen.slice(1).map((f) => f.id));
  return {
    ...workspace,
    features: workspace.features
      .filter((f) => !others.has(f.id))
      .map((f) => (f.id === keep.id ? { ...f, geometry: merged } : f)),
  };
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Groups features into a field. With no `fieldId` a new field is created, seeded
 * from any attributes the source files already carried.
 */
export function combineIntoField(
  workspace: Workspace,
  featureIds: FeatureId[],
  fieldId?: FieldId,
): Workspace {
  if (featureIds.length === 0) return workspace;
  let fields = workspace.fields;
  let target = fieldId;

  if (!target) {
    const chosen = workspace.features.filter((f) => featureIds.includes(f.id));
    const field = newField(seedAttributes(chosen));
    fields = [...fields, field];
    target = field.id;
  }

  const move = new Set(featureIds);
  const next = {
    fields,
    features: workspace.features.map((f) => (move.has(f.id) ? { ...f, fieldId: target! } : f)),
  };
  return dropEmptyAnonymousFields(next, workspace);
}

/**
 * Takes the first non-empty Client/Farm/Field the selected features carried in. These
 * come from the import-time mapping, so a user who declined to carry attributes across
 * gets an empty field row here too.
 */
function seedAttributes(features: WFeature[]): Partial<Omit<WField, 'id'>> {
  const seed = { client: '', farm: '', field: '' };
  for (const feature of features) {
    if (!seed.client) seed.client = feature.seed.client;
    if (!seed.farm) seed.farm = feature.seed.farm;
    if (!seed.field) seed.field = feature.seed.field;
  }
  return seed;
}

export function assignToField(
  workspace: Workspace,
  featureIds: FeatureId[],
  fieldId: FieldId | null,
): Workspace {
  const move = new Set(featureIds);
  const next = {
    ...workspace,
    features: workspace.features.map((f) => (move.has(f.id) ? { ...f, fieldId } : f)),
  };
  return dropEmptyAnonymousFields(next, workspace);
}

/**
 * Removes fields whose last member has just moved somewhere else.
 *
 * Only this action's leftovers are swept, and only where the polygons were *moved*
 * rather than deleted: the row has been superseded by whichever field they went to, and
 * leaving a named ghost behind would put a row in the table that blocks the export for
 * having no geometry. A field created empty on purpose is untouched — the user made it
 * deliberately and the quality panel will ask them to give it polygons. Undo restores
 * either way.
 */
function dropEmptyAnonymousFields(next: Workspace, previous: Workspace): Workspace {
  const populated = new Set(next.features.map((f) => f.fieldId));
  const wasPopulated = new Set(previous.features.map((f) => f.fieldId));
  const fields = next.fields.filter(
    (field) => populated.has(field.id) || !wasPopulated.has(field.id),
  );
  return fields.length === next.fields.length ? next : { ...next, fields };
}

/** Breaks a field apart: members become ungrouped features again and the row goes. */
export function ungroupField(workspace: Workspace, fieldId: FieldId): Workspace {
  return {
    fields: workspace.fields.filter((f) => f.id !== fieldId),
    features: workspace.features.map((f) =>
      f.fieldId === fieldId ? { ...f, fieldId: null } : f,
    ),
  };
}

export function deleteField(
  workspace: Workspace,
  fieldId: FieldId,
  deleteMembers: boolean,
): Workspace {
  const features = deleteMembers
    ? workspace.features.filter((f) => f.fieldId !== fieldId)
    : workspace.features.map((f) => (f.fieldId === fieldId ? { ...f, fieldId: null } : f));
  return { fields: workspace.fields.filter((f) => f.id !== fieldId), features };
}

/**
 * A field row with no geometry. Nothing in the interface makes one of these any more —
 * drawing creates the field along with its first polygon — but the state can still be
 * reached by deleting a field's last member, which is what the empty-field check is for.
 */
export function createEmptyField(workspace: Workspace): Workspace {
  return { ...workspace, fields: [...workspace.fields, newField()] };
}

export function updateField(
  workspace: Workspace,
  fieldId: FieldId,
  patch: Partial<Omit<WField, 'id'>>,
): Workspace {
  return {
    ...workspace,
    fields: workspace.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
  };
}

/** Applies the same attribute value to several fields at once. */
export function updateFields(
  workspace: Workspace,
  fieldIds: FieldId[],
  patch: Partial<Omit<WField, 'id'>>,
): Workspace {
  const target = new Set(fieldIds);
  return {
    ...workspace,
    fields: workspace.fields.map((f) => (target.has(f.id) ? { ...f, ...patch } : f)),
  };
}
