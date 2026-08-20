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
  deleteField,
  mergeFeatures,
  newFeature,
  replaceWithParts,
  setGeometry,
  ungroupField,
  updateField,
} from '../state/ops';
import { __historyReducer, __initialHistory } from '../state/history';
import {
  buildExportZip,
  exportBlockers,
  planExport,
  suggestFileName,
} from '../lib/export';
import { runChecks } from '../lib/qa';
import { areaHa, differenceGeom, splitByLine } from '../lib/geo';
import { importFiles } from '../lib/import';
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
    // The field left with nothing but a name is kept so QA can point at it.
    expect(workspace.fields.map((f) => f.id)).toContain(first);
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

  it('seeds a new field from the attributes the source file carried', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    let workspace = addImported(emptyWorkspace(), report.features, {
      client: false,
      farm: false,
      field: false,
    });
    const church = workspace.features.find((f) => f.sourceProps.name === 'Church Field')!;
    workspace = combineIntoField(workspace, [church.id]);
    expect(workspace.fields[0]).toMatchObject({
      client: 'Bell Farms',
      farm: 'Manor',
      field: 'Church Field',
    });
  });
});

describe('attribute mapping on import', () => {
  it('groups features that share the mapped attributes into one field', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    const workspace = addImported(emptyWorkspace(), report.features, {
      client: true,
      farm: true,
      field: true,
    });
    // Church Field carries all three; Two Halves carries only a name.
    expect(workspace.fields).toHaveLength(2);
    expect(workspace.features.every((f) => f.fieldId !== null)).toBe(true);
  });

  it('leaves everything ungrouped when no mapping is requested', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    const workspace = addImported(emptyWorkspace(), report.features, {
      client: false,
      farm: false,
      field: false,
    });
    expect(workspace.fields).toHaveLength(0);
    expect(workspace.features.every((f) => f.fieldId === null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Editing                                                                     */
/* -------------------------------------------------------------------------- */

describe('editing tools', () => {
  it('cuts a hole and reduces the area by the hole', () => {
    const field = square(2.5, 48.8, 0.004);
    const hole = square(2.501, 48.801, 0.001);
    const before = areaHa(field);
    const after = differenceGeom(field, hole)!;

    expect(after.type).toBe('Polygon');
    expect((after as GeoJSON.Polygon).coordinates).toHaveLength(2); // outer plus hole
    expect(areaHa(after)).toBeCloseTo(before - areaHa(hole), 4);
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
    expect(state.canRedo ?? state.future.length).toBe(0);
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

    let workspace = addImported(emptyWorkspace(), report.features, {
      client: false,
      farm: false,
      field: false,
    });

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
