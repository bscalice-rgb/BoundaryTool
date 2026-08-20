import { describe, expect, it } from 'vitest';
import shp from 'shpjs';
import type { MultiPolygon } from 'geojson';
import type { Workspace } from '../types';
import { emptyWorkspace } from '../types';
import {
  addDrawnFeature,
  addImported,
  assignToField,
  combineIntoField,
  createEmptyField,
  cutExclusionZone,
  deleteField,
  mergeFeatures,
  newField,
  newFeature,
  replaceWithParts,
  setGeometry,
  ungroupField,
  updateField,
  updateFields,
} from '../state/ops';
import { __historyReducer, __initialHistory } from '../state/history';
import {
  buildExportZip,
  exportBlockers,
  planExport,
  suggestFileName,
} from '../lib/export';
import {
  autoShortenNames,
  autoUniquifyNames,
  fieldGeometries,
  runChecks,
  shortenToLimit,
} from '../lib/qa';
import { areaHa, splitByLine } from '../lib/geo';
import type { AttributeSource } from '../lib/import';
import { NO_COLUMNS, importFiles } from '../lib/import';

/** Shorthand for a mapping entry that reads one column and nothing else. */
const source = (column: string | null): AttributeSource => ({
  column,
  extra: null,
  format: 'parentheses',
});

/** How the sample KML's own attributes map onto the CropForce three. */
const KML_COLUMNS = {
  client: source('Client'),
  farm: source('Farm'),
  field: source('name'),
};
import { KML_DOC, fileFrom, poly, squareRing, utmShapefileZip, kmzFile } from './fixtures';

const square = (x: number, y: number, size = 0.003) => poly([squareRing(x, y, size)]);

/* -------------------------------------------------------------------------- */
/* Grouping                                                                    */
/* -------------------------------------------------------------------------- */

describe('field grouping', () => {
  it('combines features from different files into one field', () => {
    let workspace: Workspace = {
      fields: [],
      features: [newFeature(square(2.5, 48.8), 'a.kmz'), newFeature(square(2.51, 48.81), 'b.zip')],
    };
    workspace = combineIntoField(workspace, workspace.features.map((f) => f.id));

    expect(workspace.fields).toHaveLength(1);
    expect(workspace.features.every((f) => f.fieldId === workspace.fields[0].id)).toBe(true);
  });

  it('exports a multi-file field as one row holding one multipolygon', () => {
    let workspace: Workspace = {
      fields: [],
      features: [newFeature(square(2.5, 48.8), 'a.kmz'), newFeature(square(2.51, 48.81), 'b.zip')],
    };
    workspace = combineIntoField(workspace, workspace.features.map((f) => f.id));
    workspace = updateField(workspace, workspace.fields[0].id, {
      client: 'Acme',
      farm: 'Home',
      field: 'Long Acre',
    });

    const plan = planExport(workspace);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].geometry.type).toBe('MultiPolygon');
    expect(plan.rows[0].geometry.coordinates).toHaveLength(2);
    expect(plan.rows[0].attributes).toEqual({
      Client: 'Acme',
      Farm: 'Home',
      Field: 'Long Acre',
    });
  });

  it('moves a feature from one field to another', () => {
    let workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8), 'a')] };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    const first = workspace.fields[0].id;
    workspace = updateField(workspace, first, { field: 'West' });

    workspace = addDrawnFeature(workspace, square(2.6, 48.8));
    workspace = combineIntoField(workspace, [workspace.features[1].id]);
    const second = workspace.fields[1].id;
    workspace = updateField(workspace, second, { field: 'East' });

    workspace = assignToField(workspace, [workspace.features[0].id], second);
    expect(workspace.features.every((f) => f.fieldId === second)).toBe(true);
    // The field the polygon left behind is gone: its contents live in the other field
    // now, and a named row with no geometry would only block the export.
    expect(workspace.fields.map((f) => f.id)).not.toContain(first);
  });

  it('keeps a field that was created empty on purpose', () => {
    let workspace = createEmptyField(emptyWorkspace());
    const id = workspace.fields[0].id;
    workspace = updateField(workspace, id, { field: 'To be drawn' });
    workspace = addDrawnFeature(workspace, square(2.5, 48.8));
    // Assigning an unrelated polygon elsewhere must not sweep away the waiting row.
    workspace = assignToField(workspace, [workspace.features[0].id], null);
    expect(workspace.fields.map((f) => f.id)).toContain(id);
  });

  it('drops a field that is emptied before it was ever named', () => {
    let workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8), 'a')] };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    workspace = assignToField(workspace, [workspace.features[0].id], null);
    expect(workspace.fields).toHaveLength(0);
  });

  it('ungroups a field back into free-standing features', () => {
    let workspace: Workspace = {
      fields: [],
      features: [newFeature(square(2.5, 48.8), 'a'), newFeature(square(2.51, 48.8), 'a')],
    };
    workspace = combineIntoField(workspace, workspace.features.map((f) => f.id));
    workspace = ungroupField(workspace, workspace.fields[0].id);

    expect(workspace.fields).toHaveLength(0);
    expect(workspace.features).toHaveLength(2);
    expect(workspace.features.every((f) => f.fieldId === null)).toBe(true);
  });

  it('deletes a field without deleting the polygons unless asked', () => {
    let workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8), 'a')] };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    const kept = deleteField(workspace, workspace.fields[0].id, false);
    expect(kept.features).toHaveLength(1);

    const removed = deleteField(workspace, workspace.fields[0].id, true);
    expect(removed.features).toHaveLength(0);
  });

  it('leaves a new field blank when the user declined to carry attributes across', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    let workspace = addImported(emptyWorkspace(), report.features, NO_COLUMNS);
    const church = workspace.features.find((f) => f.sourceProps.name === 'Church Field')!;
    workspace = combineIntoField(workspace, [church.id]);
    // Declining at import means declining later too, however tempting the source data.
    expect(workspace.fields[0]).toMatchObject({ client: '', farm: '', field: '' });
  });

  it('restores the carried-over names when a field is ungrouped and rebuilt', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    let workspace = addImported(emptyWorkspace(), report.features, KML_COLUMNS);
    const church = workspace.features.find((f) => f.sourceProps.name === 'Church Field')!;
    const original = workspace.fields.find((f) => f.id === church.fieldId)!;
    expect(original).toMatchObject({
      client: 'Bell Farms',
      farm: 'Manor',
      field: 'Church Field',
    });

    workspace = ungroupField(workspace, original.id);
    workspace = combineIntoField(workspace, [church.id]);
    expect(workspace.fields.at(-1)).toMatchObject({
      client: 'Bell Farms',
      farm: 'Manor',
      field: 'Church Field',
    });
  });
});

describe('duplicate Client/Farm/Field combinations', () => {
  /** Two fields deliberately given the same three names. */
  function collidingWorkspace(name = 'Long Acre'): Workspace {
    let workspace: Workspace = {
      fields: [],
      features: [newFeature(square(2.5, 48.8), 'a.zip'), newFeature(square(2.6, 48.8), 'b.zip')],
    };
    for (const feature of [...workspace.features]) {
      workspace = combineIntoField(workspace, [feature.id]);
    }
    for (const field of workspace.fields) {
      workspace = updateField(workspace, field.id, {
        client: 'Acme',
        farm: 'Home',
        field: name,
      });
    }
    return workspace;
  }

  it('blocks the export, because CropForce would overwrite one with the other', () => {
    const workspace = collidingWorkspace();
    const flag = runChecks(workspace).find((f) => f.kind === 'duplicate-name');

    expect(flag?.severity).toBe('blocking');
    expect(flag?.fieldIds).toHaveLength(2);
    expect(flag?.detail).toContain('Acme / Home / Long Acre');
    expect(exportBlockers(runChecks(workspace), planExport(workspace)).blocked).toBe(true);
  });

  it('treats a difference of case or spacing as the same name', () => {
    let workspace = collidingWorkspace();
    workspace = updateField(workspace, workspace.fields[1].id, { field: 'long  ACRE' });
    expect(runChecks(workspace).map((f) => f.kind)).toContain('duplicate-name');
  });

  it('does not flag fields that are genuinely distinct', () => {
    let workspace = collidingWorkspace();
    workspace = updateField(workspace, workspace.fields[1].id, { field: 'Short Acre' });
    expect(runChecks(workspace).map((f) => f.kind)).not.toContain('duplicate-name');
  });

  it('stays quiet while a name is still being filled in', () => {
    // Two half-empty rows are not a collision; the missing-attribute flag covers them.
    const workspace: Workspace = {
      fields: [newField({ client: 'Acme' }), newField({ client: 'Acme' })],
      features: [],
    };
    expect(runChecks(workspace).map((f) => f.kind)).not.toContain('duplicate-name');
  });

  it('auto-fix numbers the surplus apart and leaves the first alone', () => {
    const workspace = collidingWorkspace();
    const flag = runChecks(workspace).find((f) => f.kind === 'duplicate-name')!;
    const outcome = autoUniquifyNames(workspace, flag.fieldIds);

    expect(outcome.ok).toBe(true);
    expect(outcome.workspace.fields.map((f) => f.field)).toEqual(['Long Acre', 'Long Acre (2)']);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('duplicate-name');
  });

  it('keeps renamed values inside the 30-character column', () => {
    const workspace = collidingWorkspace('X'.repeat(30));
    const flag = runChecks(workspace).find((f) => f.kind === 'duplicate-name')!;
    const outcome = autoUniquifyNames(workspace, flag.fieldIds);

    for (const field of outcome.workspace.fields) {
      expect(field.field.length).toBeLessThanOrEqual(30);
    }
    expect(new Set(outcome.workspace.fields.map((f) => f.field)).size).toBe(2);
  });

  it('does not rename onto a name that is already in use', () => {
    let workspace = collidingWorkspace();
    // A third field already holds the name the numbering would otherwise reach for.
    workspace = addDrawnFeature(workspace, square(2.7, 48.8));
    workspace = combineIntoField(workspace, [workspace.features[2].id]);
    workspace = updateField(workspace, workspace.fields[2].id, {
      client: 'Acme',
      farm: 'Home',
      field: 'Long Acre (2)',
    });

    const flag = runChecks(workspace).find((f) => f.kind === 'duplicate-name')!;
    const outcome = autoUniquifyNames(workspace, flag.fieldIds);
    const names = outcome.workspace.fields.map((f) => f.field);

    expect(new Set(names).size).toBe(names.length);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('duplicate-name');
  });

  it('clears once the user combines them into one field instead', () => {
    const workspace = collidingWorkspace();
    const flag = runChecks(workspace).find((f) => f.kind === 'duplicate-name')!;
    // The other resolution: they really were one field farmed in two blocks.
    const combined = combineIntoField(workspace, flag.featureIds, workspace.fields[0].id);

    expect(runChecks(combined).map((f) => f.kind)).not.toContain('duplicate-name');
    expect(planExport(combined).rows).toHaveLength(1);
    expect(planExport(combined).rows[0].geometry.coordinates).toHaveLength(2);
  });
});

describe('names too long for the 30-character column', () => {
  const LONG = 'North Field Behind The Old Barn At Manor Farm';

  function withLongName(name = LONG): Workspace {
    let workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8), 'a.zip')] };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    return updateField(workspace, workspace.fields[0].id, {
      client: 'Acme',
      farm: 'Home',
      field: name,
    });
  }

  it('blocks the export rather than letting the export cut the name off', () => {
    const workspace = withLongName();
    const flag = runChecks(workspace).find((f) => f.kind === 'name-too-long');

    expect(flag?.severity).toBe('blocking');
    expect(flag?.detail).toContain(`Field (${LONG.length})`);
    expect(exportBlockers(runChecks(workspace), planExport(workspace)).blocked).toBe(true);
  });

  it('names every attribute that is over, not just the first', () => {
    let workspace = withLongName();
    workspace = updateField(workspace, workspace.fields[0].id, { client: 'C'.repeat(40) });
    const flag = runChecks(workspace).find((f) => f.kind === 'name-too-long')!;
    expect(flag.detail).toContain('Client (40)');
    expect(flag.detail).toContain(`Field (${LONG.length})`);
  });

  it('trims at a word boundary rather than mid-word', () => {
    expect(shortenToLimit(LONG)).toBe('North Field Behind The Old');
    expect(shortenToLimit(LONG).length).toBeLessThanOrEqual(30);
  });

  it('falls back to a hard cut when there is no usable word boundary', () => {
    const solid = 'A'.repeat(45);
    expect(shortenToLimit(solid)).toBe('A'.repeat(30));
  });

  it('leaves a name that already fits completely alone', () => {
    expect(shortenToLimit('Long Acre')).toBe('Long Acre');
    expect(runChecks(withLongName('Long Acre')).map((f) => f.kind)).not.toContain('name-too-long');
  });

  it('collapses runs of whitespace, which can be enough on its own', () => {
    expect(shortenToLimit('  Long     Acre  ')).toBe('Long Acre');
  });

  it('auto-fix clears the flag and keeps the result inside the column', () => {
    const workspace = withLongName();
    const flag = runChecks(workspace).find((f) => f.kind === 'name-too-long')!;
    const outcome = autoShortenNames(workspace, flag.fieldIds);

    expect(outcome.ok).toBe(true);
    expect(outcome.workspace.fields[0].field.length).toBeLessThanOrEqual(30);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('name-too-long');
  });

  it('numbers apart two long names that shorten to the same thing', () => {
    // Both cut to "North Field Behind The Old", which would be one row in CropForce.
    let workspace = withLongName(`${LONG} West`);
    workspace = addDrawnFeature(workspace, square(2.6, 48.8));
    workspace = combineIntoField(workspace, [workspace.features[1].id]);
    workspace = updateField(workspace, workspace.fields[1].id, {
      client: 'Acme',
      farm: 'Home',
      field: `${LONG} East`,
    });

    const flags = runChecks(workspace).filter((f) => f.kind === 'name-too-long');
    const outcome = autoShortenNames(workspace, flags.flatMap((f) => f.fieldIds));

    const names = outcome.workspace.fields.map((f) => f.field);
    expect(new Set(names).size).toBe(2);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(30);
    const after = runChecks(outcome.workspace).map((f) => f.kind);
    expect(after).not.toContain('name-too-long');
    expect(after).not.toContain('duplicate-name');
  });

  it('survives the round trip through the exported file', async () => {
    const workspace = withLongName();
    const flag = runChecks(workspace).find((f) => f.kind === 'name-too-long')!;
    const fixed = autoShortenNames(workspace, flag.fieldIds).workspace;

    const blob = await buildExportZip(planExport(fixed), 'boundaries');
    const parsed = (await shp(await blob.arrayBuffer())) as GeoJSON.FeatureCollection;
    expect(parsed.features[0].properties?.Field).toBe(fixed.fields[0].field);
  });
});

describe('bulk attribute editing', () => {
  /** Three fields, each with its own name, sharing nothing yet. */
  function threeFields(): Workspace {
    let workspace: Workspace = {
      fields: [],
      features: [
        newFeature(square(2.5, 48.8), 'a.kml'),
        newFeature(square(2.6, 48.8), 'b.kml'),
        newFeature(square(2.7, 48.8), 'c.kml'),
      ],
    };
    for (const feature of [...workspace.features]) {
      workspace = combineIntoField(workspace, [feature.id]);
    }
    workspace.fields.forEach((field, index) => {
      workspace = updateField(workspace, field.id, { field: `Block ${index + 1}` });
    });
    return workspace;
  }

  it('applies one client name across every chosen field at once', () => {
    let workspace = threeFields();
    const ids = workspace.fields.map((f) => f.id);
    workspace = updateFields(workspace, ids, { client: 'Ferme SA' });

    expect(workspace.fields.map((f) => f.client)).toEqual(['Ferme SA', 'Ferme SA', 'Ferme SA']);
    // Field names are per-row and must survive a bulk client change untouched.
    expect(workspace.fields.map((f) => f.field)).toEqual(['Block 1', 'Block 2', 'Block 3']);
  });

  it('leaves fields that were not chosen alone', () => {
    let workspace = threeFields();
    const [first, , third] = workspace.fields;
    workspace = updateFields(workspace, [first.id, third.id], { farm: 'Nord' });

    expect(workspace.fields.map((f) => f.farm)).toEqual(['Nord', '', 'Nord']);
  });

  it('sets client and farm together without disturbing anything else', () => {
    let workspace = threeFields();
    workspace = updateFields(workspace, [workspace.fields[0].id], { client: 'Acme', farm: 'Home' });

    expect(workspace.fields[0]).toMatchObject({
      client: 'Acme',
      farm: 'Home',
      field: 'Block 1',
    });
  });

  it('does not move any polygon between fields', () => {
    const workspace = threeFields();
    const before = workspace.features.map((f) => f.fieldId);
    const after = updateFields(
      workspace,
      workspace.fields.map((f) => f.id),
      { client: 'Acme' },
    );
    expect(after.features.map((f) => f.fieldId)).toEqual(before);
  });

  it('clears the missing-attribute flags it fills in', () => {
    let workspace = threeFields();
    expect(runChecks(workspace).filter((f) => f.kind === 'missing-attributes')).toHaveLength(3);

    workspace = updateFields(
      workspace,
      workspace.fields.map((f) => f.id),
      { client: 'Ferme SA', farm: 'Nord' },
    );
    expect(runChecks(workspace).filter((f) => f.kind === 'missing-attributes')).toHaveLength(0);
  });
});

describe('attribute mapping on import', () => {
  it('gives every named polygon a field of its own', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    const workspace = addImported(emptyWorkspace(), report.features, KML_COLUMNS);
    // Church Field carries all three; Two Halves carries only a name.
    expect(workspace.fields).toHaveLength(2);
    expect(workspace.features.every((f) => f.fieldId !== null)).toBe(true);
  });

  it('never merges two polygons just because they share a name', () => {
    const same = { Client: 'Acme', Farm: 'Home', Field: 'Long Acre' };
    const workspace = addImported(
      emptyWorkspace(),
      [
        { geometry: square(2.5, 48.8), source: 'a.zip', sourceProps: same },
        { geometry: square(2.6, 48.8), source: 'a.zip', sourceProps: same },
      ],
      { client: source('Client'), farm: source('Farm'), field: source('Field') },
    );

    // Two blocks with one name are two fields whose names collide, not one field in
    // two pieces. Merging them would drop a boundary the user never agreed to lose.
    expect(workspace.fields).toHaveLength(2);
    expect(new Set(workspace.features.map((f) => f.fieldId)).size).toBe(2);
    expect(planExport(workspace).rows).toHaveLength(2);
  });

  it('leaves everything ungrouped when no mapping is requested', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    const workspace = addImported(emptyWorkspace(), report.features, NO_COLUMNS);
    expect(workspace.fields).toHaveLength(0);
    expect(workspace.features.every((f) => f.fieldId === null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Editing                                                                     */
/* -------------------------------------------------------------------------- */

describe('editing tools', () => {
  it('cuts a tree island out of a field and the area drops by the hole', () => {
    let workspace: Workspace = {
      fields: [],
      features: [newFeature(square(2.5, 48.8, 0.004), 'a.kml')],
    };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    const before = areaHa(workspace.features[0].geometry);

    const island = square(2.501, 48.801, 0.001);
    workspace = cutExclusionZone(workspace, island);

    const cut = workspace.features[0].geometry;
    expect(cut.type).toBe('Polygon');
    expect((cut as GeoJSON.Polygon).coordinates).toHaveLength(2); // outer ring plus hole
    expect(areaHa(cut)).toBeCloseTo(before - areaHa(island), 4);
    // The polygon stays in its field, so the field's area updates with it.
    expect(workspace.features[0].fieldId).toBe(workspace.fields[0].id);
    expect(fieldGeometries(workspace)[0].areaHa).toBeCloseTo(areaHa(cut), 6);
  });

  it('cuts every polygon a track crosses when nothing is selected', () => {
    const workspace: Workspace = {
      fields: [],
      features: [
        newFeature(square(2.5, 48.8, 0.003), 'a'),
        newFeature(square(2.503, 48.8, 0.003), 'a'),
      ],
    };
    // A north-south strip straddling the boundary between the two blocks.
    const track = poly([
      [
        [2.5028, 48.799],
        [2.5032, 48.799],
        [2.5032, 48.804],
        [2.5028, 48.804],
        [2.5028, 48.799],
      ],
    ]);
    const cut = cutExclusionZone(workspace, track);

    expect(cut.features).toHaveLength(2);
    for (const [index, feature] of cut.features.entries()) {
      expect(areaHa(feature.geometry)).toBeLessThan(areaHa(workspace.features[index].geometry));
    }
  });

  it('confines the cut to the selection when there is one', () => {
    const workspace: Workspace = {
      fields: [],
      features: [
        newFeature(square(2.5, 48.8, 0.003), 'a'),
        newFeature(square(2.5, 48.8, 0.003), 'b'),
      ],
    };
    const cut = cutExclusionZone(
      workspace,
      square(2.5005, 48.8005, 0.001),
      new Set([workspace.features[0].id]),
    );
    expect(areaHa(cut.features[0].geometry)).toBeLessThan(areaHa(workspace.features[0].geometry));
    expect(cut.features[1].geometry).toBe(workspace.features[1].geometry);
  });

  it('deletes a polygon the exclusion zone swallows whole', () => {
    const workspace: Workspace = {
      fields: [],
      features: [newFeature(square(2.5, 48.8, 0.001), 'a')],
    };
    expect(cutExclusionZone(workspace, square(2.49, 48.79, 0.05)).features).toHaveLength(0);
  });

  it('splits a polygon into two parts with a drawn line', () => {
    const parts = splitByLine(square(2.5, 48.8, 0.004), {
      type: 'LineString',
      coordinates: [
        [2.502, 48.7995],
        [2.502, 48.8045],
      ],
    });
    expect(parts).toHaveLength(2);
    const total = parts!.reduce((sum, part) => sum + areaHa(part), 0);
    expect(total).toBeCloseTo(areaHa(square(2.5, 48.8, 0.004)), 3);
  });

  it('keeps the split parts in the same field as the original', () => {
    let workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8, 0.004), 'a')] };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    const fieldId = workspace.fields[0].id;
    const parts = splitByLine(workspace.features[0].geometry, {
      type: 'LineString',
      coordinates: [
        [2.502, 48.7995],
        [2.502, 48.8045],
      ],
    })!;
    workspace = replaceWithParts(workspace, workspace.features[0].id, parts);

    expect(workspace.features).toHaveLength(2);
    expect(workspace.features.every((f) => f.fieldId === fieldId)).toBe(true);
  });

  it('merges two adjacent polygons into one', () => {
    let workspace: Workspace = {
      fields: [],
      features: [
        newFeature(square(2.5, 48.8, 0.003), 'a'),
        newFeature(square(2.503, 48.8, 0.003), 'a'),
      ],
    };
    const totalBefore = workspace.features.reduce((s, f) => s + areaHa(f.geometry), 0);
    workspace = mergeFeatures(workspace, workspace.features.map((f) => f.id));

    expect(workspace.features).toHaveLength(1);
    expect(workspace.features[0].geometry.type).toBe('Polygon');
    expect(areaHa(workspace.features[0].geometry)).toBeCloseTo(totalBefore, 4);
  });

  it('deletes a feature whose geometry is edited away to nothing', () => {
    const workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8), 'a')] };
    const next = setGeometry(workspace, workspace.features[0].id, {
      type: 'Polygon',
      coordinates: [[[2.5, 48.8], [2.5, 48.8], [2.5, 48.8], [2.5, 48.8]]],
    });
    expect(next.features).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Undo / redo                                                                 */
/* -------------------------------------------------------------------------- */

describe('undo and redo', () => {
  const apply = (state: ReturnType<typeof __initialHistory>, label: string, fn: (w: Workspace) => Workspace) =>
    __historyReducer(state, { type: 'apply', label, fn });

  it('restores the previous workspace exactly', () => {
    let state = __initialHistory();
    state = apply(state, 'Add polygon', (w) => addDrawnFeature(w, square(2.5, 48.8)));
    const afterAdd = state.present;
    state = apply(state, 'Delete polygon', (w) => ({ ...w, features: [] }));

    expect(state.present.features).toHaveLength(0);
    state = __historyReducer(state, { type: 'undo' });
    expect(state.present).toBe(afterAdd);
    expect(state.present.features).toHaveLength(1);
  });

  it('redoes what was undone', () => {
    let state = __initialHistory();
    state = apply(state, 'Add polygon', (w) => addDrawnFeature(w, square(2.5, 48.8)));
    state = __historyReducer(state, { type: 'undo' });
    state = __historyReducer(state, { type: 'redo' });
    expect(state.present.features).toHaveLength(1);
    expect(state.future).toHaveLength(0);
  });

  it('reverses an auto-fix', () => {
    let state = __initialHistory();
    state = apply(state, 'Import', (w) => addDrawnFeature(w, square(2.5, 48.8, 0.0001)));
    const beforeFix = state.present;
    state = apply(state, 'Auto-fix: delete slivers', (w) => ({ ...w, features: [] }));
    state = __historyReducer(state, { type: 'undo' });
    expect(state.present).toBe(beforeFix);
  });

  it('drops the redo stack once a new action is taken', () => {
    let state = __initialHistory();
    state = apply(state, 'A', (w) => addDrawnFeature(w, square(2.5, 48.8)));
    state = __historyReducer(state, { type: 'undo' });
    state = apply(state, 'B', (w) => addDrawnFeature(w, square(2.6, 48.8)));
    expect(state.future).toHaveLength(0);
  });

  it('does not record an action that changed nothing', () => {
    let state = __initialHistory();
    state = apply(state, 'No-op', (w) => w);
    expect(state.past).toHaveLength(0);
  });

  it('tracks labels for the undo and redo controls', () => {
    let state = __initialHistory();
    state = apply(state, 'Draw polygon', (w) => addDrawnFeature(w, square(2.5, 48.8)));
    expect(state.lastAction).toBe('Draw polygon');
    state = __historyReducer(state, { type: 'undo' });
    expect(state.nextAction).toBe('Draw polygon');
  });
});

/* -------------------------------------------------------------------------- */
/* Export gating and output                                                    */
/* -------------------------------------------------------------------------- */

describe('export gating', () => {
  function readyWorkspace(): Workspace {
    let workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8), 'a.kml')] };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    return updateField(workspace, workspace.fields[0].id, {
      client: 'Acme',
      farm: 'Home',
      field: 'Long Acre',
    });
  }

  it('blocks while an attribute is missing and unblocks once it is filled', () => {
    let workspace = readyWorkspace();
    workspace = updateField(workspace, workspace.fields[0].id, { farm: '' });

    let status = exportBlockers(runChecks(workspace), planExport(workspace));
    expect(status.blocked).toBe(true);
    expect(status.reasons.join(' ')).toContain('attribute');

    workspace = updateField(workspace, workspace.fields[0].id, { farm: 'Home' });
    status = exportBlockers(runChecks(workspace), planExport(workspace));
    expect(status.blocked).toBe(false);
  });

  it('does not block on soft warnings', () => {
    let workspace = readyWorkspace();
    workspace = updateField(workspace, workspace.fields[0].id, { field: 'Wheat 2024' });
    const status = exportBlockers(runChecks(workspace), planExport(workspace));
    expect(status.blocked).toBe(false);
    expect(status.warnings.join(' ')).toContain('season-specific');
  });

  it('blocks when there is nothing to export', () => {
    const status = exportBlockers([], planExport(emptyWorkspace()));
    expect(status.blocked).toBe(true);
    expect(status.reasons[0]).toContain('no fields to export');
  });

  it('counts polygons that would be left behind', () => {
    let workspace = readyWorkspace();
    workspace = addDrawnFeature(workspace, square(2.6, 48.8));
    expect(planExport(workspace).unassignedCount).toBe(1);
  });

  it('suggests a filename built from the single client name', () => {
    expect(suggestFileName(readyWorkspace())).toMatch(/^Acme_cropforce_\d{4}-\d{2}-\d{2}$/);
  });
});

describe('end-to-end: mixed import to CropForce zip', () => {
  it('produces one row per field, in WGS84, with the schema intact', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: square(2.52, 48.82) }],
    });
    const report = await importFiles([
      fileFrom('blocks.kmz', await kmzFile()),
      fileFrom('parcelles.zip', await utmShapefileZip()),
      fileFrom('extra.geojson', geojson),
    ]);
    expect(report.errors).toEqual([]);
    expect(report.features).toHaveLength(4);

    let workspace = addImported(emptyWorkspace(), report.features, NO_COLUMNS);

    // One field built from polygons that came out of three different files. The KMZ
    // contributes two features, one of which is itself a two-part multipolygon.
    const [first, second, third, fourth] = workspace.features;
    workspace = combineIntoField(workspace, [first.id, second.id, third.id]);
    workspace = updateField(workspace, workspace.fields[0].id, {
      client: 'Ferme SA',
      farm: 'Nord',
      field: 'Grande Piece',
    });
    workspace = combineIntoField(workspace, [fourth.id]);
    workspace = updateField(workspace, workspace.fields[1].id, {
      client: 'Ferme SA',
      farm: 'Nord',
      field: 'Petite Piece',
    });

    const plan = planExport(workspace);
    expect(exportBlockers(runChecks(workspace), plan).blocked).toBe(false);
    expect(plan.rows).toHaveLength(2);

    const blob = await buildExportZip(plan, 'cropforce');
    const parsed = (await shp(await blob.arrayBuffer())) as GeoJSON.FeatureCollection;

    expect(parsed.features).toHaveLength(2);
    expect(parsed.features.map((f) => f.properties)).toEqual([
      { Client: 'Ferme SA', Farm: 'Nord', Field: 'Grande Piece' },
      { Client: 'Ferme SA', Farm: 'Nord', Field: 'Petite Piece' },
    ]);

    // Three source features holding four polygons between them survive as one row.
    const grande = parsed.features[0].geometry as MultiPolygon;
    expect(grande.type).toBe('MultiPolygon');
    expect(grande.coordinates).toHaveLength(4);

    // Every coordinate is a plain WGS84 degree pair.
    for (const feature of parsed.features) {
      const geometry = feature.geometry as GeoJSON.Polygon | MultiPolygon;
      const rings =
        geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
      for (const ring of rings) {
        for (const [x, y] of ring) {
          expect(Math.abs(x)).toBeLessThanOrEqual(180);
          expect(Math.abs(y)).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it('writes all five sidecar files into the zip, with WGS84 in the .prj', async () => {
    let workspace: Workspace = { fields: [], features: [newFeature(square(2.5, 48.8), 'a')] };
    workspace = combineIntoField(workspace, [workspace.features[0].id]);
    workspace = updateField(workspace, workspace.fields[0].id, {
      client: 'A',
      farm: 'B',
      field: 'C',
    });

    const blob = await buildExportZip(planExport(workspace), 'boundaries');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual([
      'boundaries.cpg',
      'boundaries.dbf',
      'boundaries.prj',
      'boundaries.shp',
      'boundaries.shx',
    ]);
    const prj = await zip.file('boundaries.prj')!.async('string');
    expect(prj).toContain('GEOGCS');
    expect(prj).toContain('WGS_1984');
    expect(await zip.file('boundaries.cpg')!.async('string')).toBe('UTF-8');
  });
});
