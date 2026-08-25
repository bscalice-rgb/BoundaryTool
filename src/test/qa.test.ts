import { describe, expect, it } from 'vitest';
import type { PolyGeom, Workspace } from '../types';
import {
  DEFAULT_THRESHOLDS,
  autoAsciiNames,
  autoDeleteFeatures,
  autoFixGeometry,
  autoSimplify,
  namingProblem,
  protrusionShare,
  resolveOverlap,
  runChecks,
} from '../lib/qa';
import { areaHa, checkValidity, vertexCount } from '../lib/geo';
import { combineIntoField, newFeature, newField, updateField } from '../state/ops';
import { poly, squareRing } from './fixtures';

/* -------------------------------------------------------------------------- */
/* Workspace builders                                                          */
/* -------------------------------------------------------------------------- */

/** Builds a workspace of one field holding the given geometries. */
function oneField(geometries: PolyGeom[], attrs = { client: 'A', farm: 'B', field: 'C' }): Workspace {
  const field = newField(attrs);
  return {
    fields: [field],
    features: geometries.map((g) => ({ ...newFeature(g, 'test.geojson'), fieldId: field.id })),
  };
}

const kindsOf = (workspace: Workspace) => runChecks(workspace).map((f) => f.kind);

/** A 300 m square near Paris, comfortably above every area threshold. */
const bigSquare = (offsetX = 0, offsetY = 0) =>
  poly([squareRing(2.5 + offsetX, 48.8 + offsetY, 0.003)]);

/* -------------------------------------------------------------------------- */

describe('missing attributes', () => {
  it('blocks a field with an empty attribute and clears once filled', () => {
    let workspace = oneField([bigSquare()], { client: 'Acme', farm: '', field: 'Home' });
    const flag = runChecks(workspace).find((f) => f.kind === 'missing-attributes');
    expect(flag?.severity).toBe('blocking');
    expect(flag?.detail).toContain('Farm');

    workspace = updateField(workspace, workspace.fields[0].id, { farm: 'North' });
    expect(kindsOf(workspace)).not.toContain('missing-attributes');
  });

  it('flags a field that has no polygons', () => {
    const workspace: Workspace = { fields: [newField({ client: 'A', farm: 'B', field: 'C' })], features: [] };
    expect(kindsOf(workspace)).toContain('empty-field');
  });
});

describe('invalid geometry', () => {
  // A bow-tie: the ring crosses itself, so it has no well-defined interior.
  const bowTie = poly([
    [
      [2.5, 48.8],
      [2.503, 48.803],
      [2.503, 48.8],
      [2.5, 48.803],
      [2.5, 48.8],
    ],
  ]);

  it('detects the self-intersection as a blocking flag', () => {
    const workspace = oneField([bowTie]);
    const flag = runChecks(workspace).find((f) => f.kind === 'invalid-geometry');
    expect(flag?.severity).toBe('blocking');
    expect(flag?.detail).toContain('self-intersection');
    expect(flag?.autoFix).toEqual({ kind: 'unkink' });
  });

  it('auto-fix produces a valid geometry and leaves the original untouched', () => {
    const workspace = oneField([bowTie]);
    const before = structuredClone(workspace);
    const outcome = autoFixGeometry(workspace, [workspace.features[0].id]);
    expect(outcome.ok).toBe(true);
    expect(checkValidity(outcome.workspace.features[0].geometry).ok).toBe(true);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('invalid-geometry');
    // The input workspace is untouched, which is what makes undo a plain swap.
    expect(workspace).toEqual(before);
  });
});

describe('overlapping fields', () => {
  function overlapping(): Workspace {
    const a = newField({ client: 'A', farm: 'B', field: 'West' });
    const b = newField({ client: 'A', farm: 'B', field: 'East' });
    return {
      fields: [a, b],
      features: [
        { ...newFeature(poly([squareRing(2.5, 48.8, 0.004)]), 'a.geojson'), fieldId: a.id },
        { ...newFeature(poly([squareRing(2.502, 48.8, 0.004)]), 'b.geojson'), fieldId: b.id },
      ],
    };
  }

  it('flags the pair as blocking and quantifies the shared area', () => {
    const flag = runChecks(overlapping()).find((f) => f.kind === 'overlap');
    expect(flag?.severity).toBe('blocking');
    expect(flag?.detail).toMatch(/share/);
    expect(flag?.fieldIds).toHaveLength(2);
  });

  it('auto-fix clips the overlap out of the loser, leaving conjoined fields', () => {
    const workspace = overlapping();
    const [keeper, loser] = workspace.fields;
    const keeperAreaBefore = areaHa(workspace.features[0].geometry);

    const outcome = resolveOverlap(workspace, keeper.id, loser.id);
    expect(outcome.ok).toBe(true);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('overlap');

    // The kept field is untouched and the other shrank by exactly the shared area.
    expect(areaHa(outcome.workspace.features[0].geometry)).toBeCloseTo(keeperAreaBefore, 6);
    expect(areaHa(outcome.workspace.features[1].geometry)).toBeLessThan(
      areaHa(workspace.features[1].geometry),
    );
  });

  it('leaves the fields conjoined rather than separated by a gap', () => {
    const workspace = overlapping();
    const [keeper, loser] = workspace.fields;
    const outcome = resolveOverlap(workspace, keeper.id, loser.id);
    const keeperArea = areaHa(outcome.workspace.features[0].geometry);
    const loserArea = areaHa(outcome.workspace.features[1].geometry);
    const combined = areaHa({
      type: 'MultiPolygon',
      coordinates: [
        (outcome.workspace.features[0].geometry as GeoJSON.Polygon).coordinates,
        (outcome.workspace.features[1].geometry as GeoJSON.Polygon).coordinates,
      ],
    });
    // No gap and no overlap: the parts sum to the whole.
    expect(combined).toBeCloseTo(keeperArea + loserArea, 6);
  });

  it('ignores hairline overlaps below the noise threshold', () => {
    const a = newField({ client: 'A', farm: 'B', field: 'West' });
    const b = newField({ client: 'A', farm: 'B', field: 'East' });
    const workspace: Workspace = {
      fields: [a, b],
      features: [
        { ...newFeature(poly([squareRing(2.5, 48.8, 0.004)]), 'a', {}), fieldId: a.id },
        // Overlapping by 1e-9 degrees: about a tenth of a millimetre.
        { ...newFeature(poly([squareRing(2.503999999, 48.8, 0.004)]), 'b', {}), fieldId: b.id },
      ],
    };
    expect(kindsOf(workspace)).not.toContain('overlap');
  });
});

describe('jagged edges', () => {
  /** A square boundary re-sampled into many closely spaced, slightly noisy vertices. */
  function noisyRing(steps: number): PolyGeom {
    const points: [number, number][] = [];
    const size = 0.004;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const jitter = (i % 2 === 0 ? 1 : -1) * 0.000012;
        const along = size * t;
        const p: [number, number] =
          side === 0
            ? [2.5 + along, 48.8 + jitter]
            : side === 1
              ? [2.5 + size + jitter, 48.8 + along]
              : side === 2
                ? [2.5 + size - along, 48.8 + size + jitter]
                : [2.5 + jitter, 48.8 + size - along];
        points.push(p);
      }
    }
    points.push(points[0]);
    return poly([points]);
  }

  it('flags a boundary with far more vertices than its shape needs', () => {
    const workspace = oneField([noisyRing(120)]);
    const flag = runChecks(workspace).find((f) => f.kind === 'jagged-edges');
    expect(flag?.severity).toBe('warning');
    expect(flag?.autoFix?.kind).toBe('simplify');
    expect(flag?.detail).toContain('per hectare');
  });

  it('does not flag an ordinary square', () => {
    expect(kindsOf(oneField([bigSquare()]))).not.toContain('jagged-edges');
  });

  it('auto-fix cuts the vertex count while keeping the area', () => {
    const workspace = oneField([noisyRing(120)]);
    const flag = runChecks(workspace).find((f) => f.kind === 'jagged-edges')!;
    const tolerance = (flag.autoFix as { toleranceMeters: number }).toleranceMeters;

    const outcome = autoSimplify(workspace, flag.featureIds, tolerance);
    expect(outcome.ok).toBe(true);
    const before = vertexCount(workspace.features[0].geometry);
    const after = vertexCount(outcome.workspace.features[0].geometry);
    expect(after).toBeLessThan(before / 2);
    expect(areaHa(outcome.workspace.features[0].geometry)).toBeCloseTo(
      areaHa(workspace.features[0].geometry),
      2,
    );
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('jagged-edges');
  });
});

describe('slivers', () => {
  it('flags a tiny fragment and auto-fix deletes it', () => {
    // A 10 m square: 0.01 ha, well under the 0.05 ha threshold.
    const workspace = oneField([bigSquare(), poly([squareRing(2.52, 48.82, 0.0001)])]);
    const flag = runChecks(workspace).find((f) => f.kind === 'sliver');
    expect(flag?.severity).toBe('warning');

    const outcome = autoDeleteFeatures(workspace, flag!.featureIds);
    expect(outcome.workspace.features).toHaveLength(1);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('sliver');
  });
});

describe('non-crop area heuristic', () => {
  it('flags a field with a long thin spur hanging off it', () => {
    // A block with a 10 m wide, 250 m long track attached along one edge.
    const spur: PolyGeom = {
      type: 'Polygon',
      coordinates: [
        [
          [2.5, 48.8],
          [2.504, 48.8],
          [2.504, 48.804],
          [2.5, 48.804],
          [2.5, 48.8045],
          [2.5001, 48.8045],
          [2.5001, 48.807],
          [2.50005, 48.807],
          [2.50005, 48.8045],
          [2.5, 48.8045],
          [2.5, 48.8],
        ],
      ],
    };
    const share = protrusionShare(spur, DEFAULT_THRESHOLDS.protrusionWidthM);
    expect(share).not.toBeNull();
    expect(share!).toBeGreaterThan(0);
  });

  it('does not flag a clean rectangular field', () => {
    const share = protrusionShare(bigSquare(), DEFAULT_THRESHOLDS.protrusionWidthM);
    expect(share).toBeLessThan(DEFAULT_THRESHOLDS.protrusionAreaShare);
  });

  it('stays quiet on shapes too small to judge', () => {
    expect(protrusionShare(poly([squareRing(2.5, 48.8, 0.0001)]), 8)).toBeNull();
  });
});

describe('naming hygiene', () => {
  it('warns about a year in the field name', () => {
    expect(namingProblem('North 2024')).toContain('2024');
  });

  it('warns about a crop name', () => {
    expect(namingProblem('Wheat Block')).toContain('wheat');
  });

  it('accepts an ordinary place name', () => {
    expect(namingProblem('Church Piece')).toBeNull();
    expect(namingProblem('Field 12')).toBeNull();
  });

  it('never blocks the export', () => {
    const workspace = oneField([bigSquare()], { client: 'A', farm: 'B', field: 'Maize 2023' });
    const flags = runChecks(workspace);
    expect(flags.filter((f) => f.kind === 'naming')[0].severity).toBe('warning');
    expect(flags.every((f) => f.severity === 'warning')).toBe(true);
  });
});

describe('unassigned features', () => {
  it('warns that ungrouped polygons will not be exported', () => {
    const workspace: Workspace = { fields: [], features: [newFeature(bigSquare(), 'a.kml')] };
    const flag = runChecks(workspace).find((f) => f.kind === 'unassigned');
    expect(flag?.severity).toBe('warning');
    expect(flag?.featureIds).toHaveLength(1);
  });

  it('clears once the polygons are combined into a field', () => {
    const workspace: Workspace = { fields: [], features: [newFeature(bigSquare(), 'a.kml')] };
    const grouped = combineIntoField(workspace, [workspace.features[0].id]);
    expect(runChecks(grouped).map((f) => f.kind)).not.toContain('unassigned');
  });
});

describe('guidance', () => {
  it('attaches boundary guidance to every flag it raises', () => {
    const workspace = oneField([bigSquare()], { client: '', farm: '', field: 'Wheat 2024' });
    const flags = runChecks(workspace);
    expect(flags.length).toBeGreaterThan(1);
    for (const flag of flags) {
      expect(flag.guidance.length).toBeGreaterThan(20);
    }
  });
});


describe('characters CropForce will not take', () => {
  it('blocks a name carrying an accent and folds it on request', () => {
    const workspace = oneField([bigSquare()], {
      client: 'Améca',
      farm: 'Caiçara',
      field: 'São João',
    });
    expect(kindsOf(workspace)).toContain('non-ascii');

    const fixed = autoAsciiNames(workspace, [workspace.fields[0].id]);
    expect(fixed.ok).toBe(true);
    expect(fixed.workspace.fields[0]).toMatchObject({
      client: 'Ameca',
      farm: 'Caicara',
      field: 'Sao Joao',
    });
    expect(kindsOf(fixed.workspace)).not.toContain('non-ascii');
  });

  it('leaves a plain name alone', () => {
    const workspace = oneField([bigSquare()], { client: 'Acme', farm: 'Home', field: 'West' });
    expect(kindsOf(workspace)).not.toContain('non-ascii');
    expect(autoAsciiNames(workspace, [workspace.fields[0].id]).ok).toBe(false);
  });

  // Two names that differed only by an accent become one name once folded, which on
  // upload is a boundary silently replacing another.
  it('numbers apart names that collide once the accents are gone', () => {
    const a = newField({ client: 'Acme', farm: 'Home', field: 'Açai' });
    const b = newField({ client: 'Acme', farm: 'Home', field: 'Acai' });
    const workspace = {
      fields: [a, b],
      features: [
        { ...newFeature(bigSquare(), 'a.kml'), fieldId: a.id },
        { ...newFeature(bigSquare(0.02), 'b.kml'), fieldId: b.id },
      ],
    };

    const fixed = autoAsciiNames(workspace, [a.id, b.id]);
    const names = fixed.workspace.fields.map((field) => field.field);
    expect(new Set(names).size).toBe(2);
    expect(names).toContain('Acai');
  });
});
