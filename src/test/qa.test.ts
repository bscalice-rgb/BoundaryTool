import { describe, expect, it } from 'vitest';
import type { Position } from 'geojson';
import type { PolyGeom, Workspace } from '../types';
import {
  autoAsciiNames,
  autoDeleteFeatures,
  autoDeleteFields,
  autoFixGeometry,
  autoSimplify,
  largerOf,
  minimalInset,
  namingProblem,
  previewShrinkApart,
  resolveOverlap,
  runChecks,
  shrinkApart,
} from '../lib/qa';
import {
  areaHa,
  areaM2,
  checkValidity,
  ringCount,
  overlapAreaM2,
  repairGeometry,
  selfIntersections,
  unionAll,
  vertexCount,
} from '../lib/geo';
import { combineIntoField, deleteFeatures, newFeature, newField, updateField } from '../state/ops';
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

  /* -- What a real estate boundary throws at it --------------------------- */

  /** A block of `size` degrees with its bottom-left corner at (x, y). */
  const block = (x: number, y: number, size: number): PolyGeom =>
    poly([squareRing(x, y, size)]);

  /**
   * A bow-tie that pinches: the outline passes through the crossing point twice, so the
   * coordinate is repeated. Digitising software produces these constantly, and the
   * un-kinker refuses any polygon carrying one.
   */
  const pinchedBowTie = (x: number, y: number): PolyGeom =>
    poly([
      [
        [x, y],
        [x + 0.004, y],
        [x + 0.002, y + 0.002],
        [x + 0.004, y + 0.004],
        [x, y + 0.004],
        [x + 0.002, y + 0.002],
        [x, y],
      ],
    ]);

  const partsOf = (geometry: PolyGeom) =>
    geometry.type === 'MultiPolygon' ? geometry.coordinates.length : 1;

  it('does not call conjoined blocks self-intersecting', () => {
    // Four blocks of one field in a row, each sharing a whole edge with the next. This
    // is how an estate is drawn, and nothing about it is invalid — but comparing every
    // ring against every other, which is what a MultiPolygon kink count does by
    // default, reports a fault at every shared corner.
    const row: PolyGeom = {
      type: 'MultiPolygon',
      coordinates: [0, 1, 2, 3].map(
        (i) => (block(2.5 + i * 0.004, 48.8, 0.004) as { coordinates: Position[][] }).coordinates,
      ),
    };
    expect(selfIntersections(row)).toBe(0);
    expect(checkValidity(row).ok).toBe(true);
    expect(runChecks(oneField([row])).map((f) => f.kind)).not.toContain('invalid-geometry');
  });

  it('splits a bow-tie that pinches instead of giving up on it', () => {
    const geometry = pinchedBowTie(2.5, 48.8);
    expect(selfIntersections(geometry)).toBeGreaterThan(0);

    const fixed = repairGeometry(geometry)!;
    expect(fixed).not.toBeNull();
    expect(checkValidity(fixed).ok).toBe(true);
    // Both lobes survive: the repair splits the bow-tie, it does not throw one away.
    expect(areaHa(fixed)).toBeGreaterThan(areaHa(geometry) * 0.9);
  });

  it('fixes every bow-tie in a field of many blocks, not just the first', () => {
    // Two pinched bow-ties among plain blocks, all of them touching their neighbours —
    // the shape of a real estate file, where the fix used to clear some and stall.
    const coordinates = [
      block(2.5, 48.8, 0.004),
      pinchedBowTie(2.504, 48.8),
      block(2.508, 48.8, 0.004),
      pinchedBowTie(2.512, 48.8),
      block(2.516, 48.8, 0.004),
    ].map((p) => (p as { coordinates: Position[][] }).coordinates);
    const estate: PolyGeom = { type: 'MultiPolygon', coordinates };

    expect(selfIntersections(estate)).toBeGreaterThan(1);

    const fixed = repairGeometry(estate)!;
    expect(selfIntersections(fixed)).toBe(0);
    expect(checkValidity(fixed).ok).toBe(true);
    // Every block is still there. Blocks that shared a whole edge come back as one
    // outline rather than two, which is what uniting them means, so the area is what
    // says nothing was lost rather than the number of parts.
    expect(areaHa(fixed)).toBeGreaterThan(areaHa(estate) * 0.95);
  });

  it('keeps a small block that a big neighbour would dwarf', () => {
    // The artefact filter used to measure each piece against the whole field, so a
    // genuine block a fraction of the size of its neighbour was deleted as a sliver.
    const coordinates = [
      pinchedBowTie(2.5, 48.8),
      block(2.6, 48.8, 0.02),
      block(2.504, 48.8, 0.0002),
    ].map((p) => (p as { coordinates: Position[][] }).coordinates);
    const fixed = repairGeometry({ type: 'MultiPolygon', coordinates })!;

    expect(checkValidity(fixed).ok).toBe(true);
    const smallest = Math.min(
      ...(fixed.type === 'MultiPolygon' ? fixed.coordinates : [fixed.coordinates]).map((rings) =>
        areaHa({ type: 'Polygon', coordinates: rings } as PolyGeom),
      ),
    );
    expect(smallest).toBeLessThan(0.1);
  });

  /* -- What a plantation block throws at it -------------------------------- */

  /**
   * A block carrying a grid of exclusion zones — roads, buildings, unplantable ground —
   * which is what a palm estate looks like. `pinched` of them are drawn as figures of
   * eight, and `gap` says whether the zones butt up against each other or leave a strip
   * of crop between them.
   */
  function plantationBlock(pinched: number, gap = 0): PolyGeom {
    const step = 0.0004;
    const size = step - gap;
    const holes: Position[][] = [];
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        const x = 100.5 + col * step;
        const y = 0.8 + row * step;
        holes.push(
          holes.length < pinched
            ? // A zone drawn as a figure of eight, crossing itself in the middle.
              [[x, y], [x + size, y + size], [x + size, y], [x, y + size], [x, y]]
            : squareRing(x, y, size).slice().reverse(),
        );
      }
    }
    return poly([squareRing(100.4998, 0.7998, 0.0028), ...holes]);
  }

  it('does not call a block full of touching exclusion zones self-intersecting', () => {
    // Every zone shares an edge with its neighbours. Comparing rings pairwise — which
    // is what a polygon kink count does by default — reports a crossing at every shared
    // corner, hundreds of them, none of them a fault and none of them fixable. A real
    // estate file reaches two and a half thousand that way.
    const clean = plantationBlock(0);
    expect(ringCount(clean).holes).toBe(36);
    expect(selfIntersections(clean)).toBe(0);
    expect(checkValidity(clean).ok).toBe(true);
  });

  it('keeps the exclusion zones when it repairs the block around them', () => {
    // The repair used to unite the parts, which filled every hole in: a plantation
    // block came back with its roads and buildings counted as planted ground.
    const block = plantationBlock(2, 0.0001);
    const intact = plantationBlock(0, 0.0001);
    expect(selfIntersections(block)).toBeGreaterThan(0);

    const fixed = repairGeometry(block)!;
    expect(checkValidity(fixed).ok).toBe(true);
    // The two crossed zones are split or dropped; the other 34 are left alone.
    expect(ringCount(fixed).holes).toBeGreaterThanOrEqual(34);
    // And the ground is still carved out rather than paved over.
    expect(areaHa(fixed)).toBeLessThan(areaHa(intact) * 1.05);
  });

  it('repairs a boundary in one pass rather than most of one', () => {
    // Clicking the fix twice must not find more to do the second time.
    const fixed = repairGeometry(plantationBlock(4, 0.0001))!;
    const again = repairGeometry(fixed)!;
    expect(selfIntersections(fixed)).toBe(0);
    expect(areaHa(again)).toBeCloseTo(areaHa(fixed), 6);
  });

  it('calls out two blocks of one field overlapping each other', () => {
    const coordinates = [block(2.5, 48.8, 0.004), block(2.502, 48.8, 0.004)].map(
      (p) => (p as { coordinates: Position[][] }).coordinates,
    );
    const doubled: PolyGeom = { type: 'MultiPolygon', coordinates };

    // No ring crosses itself, so this is not a bow-tie — but the ground under the
    // overlap is counted twice, which the export would carry into CropForce.
    expect(selfIntersections(doubled)).toBe(0);
    const validity = checkValidity(doubled);
    expect(validity.ok).toBe(false);
    expect(validity.reason).toBe('self-overlap');

    const flag = runChecks(oneField([doubled])).find((f) => f.kind === 'invalid-geometry');
    expect(flag?.detail).toContain('twice');

    const fixed = repairGeometry(doubled)!;
    expect(checkValidity(fixed).ok).toBe(true);
    expect(partsOf(fixed)).toBe(1);
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

  /* -- The two automatic routes out of an overlap ------------------------- */

  /** Metres expressed as longitude degrees at the latitude these fixtures sit at. */
  const asDegrees = (metres: number) => metres / (111_320 * Math.cos((48.8 * Math.PI) / 180));

  /**
   * Two neighbouring fields whose shared edge was surveyed twice and disagrees by
   * `overlapM` metres — the ordinary case, as opposed to a real double-claim.
   */
  function edgeDisagreement(overlapM: number, widthB = 0.004): Workspace {
    const a = newField({ client: 'A', farm: 'B', field: 'West' });
    const b = newField({ client: 'A', farm: 'B', field: 'East' });
    const start = 2.5 + 0.004 - asDegrees(overlapM);
    return {
      fields: [a, b],
      features: [
        { ...newFeature(poly([squareRing(2.5, 48.8, 0.004)]), 'a.geojson'), fieldId: a.id },
        { ...newFeature(poly([squareRing(start, 48.8, widthB)]), 'b.geojson'), fieldId: b.id },
      ],
    };
  }

  it('names the larger field as the one to give up the shared ground', () => {
    const workspace = edgeDisagreement(3, 0.002);
    const [big, small] = workspace.fields;
    expect(areaHa(workspace.features[0].geometry)).toBeGreaterThan(
      areaHa(workspace.features[1].geometry),
    );
    // Asked either way round, the answer is the same field.
    expect(largerOf(workspace, big.id, small.id)).toBe(big.id);
    expect(largerOf(workspace, small.id, big.id)).toBe(big.id);
  });

  it('trims the larger field and leaves the smaller one whole', () => {
    const workspace = edgeDisagreement(3, 0.002);
    const [big, small] = workspace.fields;
    const smallBefore = areaHa(workspace.features[1].geometry);

    const larger = largerOf(workspace, big.id, small.id);
    const outcome = resolveOverlap(workspace, larger === big.id ? small.id : big.id, larger);

    expect(outcome.ok).toBe(true);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('overlap');
    expect(areaHa(outcome.workspace.features[1].geometry)).toBeCloseTo(smallBefore, 6);
    expect(areaHa(outcome.workspace.features[0].geometry)).toBeLessThan(
      areaHa(workspace.features[0].geometry),
    );
  });

  it('finds the shallowest inset that parts two boundaries', () => {
    const workspace = edgeDisagreement(3);
    const [a, b] = workspace.features.map((f) => f.geometry);
    const inset = minimalInset(a, b);

    // Both sides move, so a three-metre disagreement needs about a metre and a half each.
    expect(inset).not.toBeNull();
    expect(inset!).toBeGreaterThan(1.4);
    expect(inset!).toBeLessThan(2.1);
  });

  it('refuses to shave a real double-claim apart', () => {
    // The stock fixture overlaps by about 150 m — no inset worth applying fixes that.
    const workspace = overlapping();
    const [a, b] = workspace.features.map((f) => f.geometry);
    expect(minimalInset(a, b)).toBeNull();

    const outcome = shrinkApart(workspace, workspace.fields[0].id, workspace.fields[1].id);
    expect(outcome.ok).toBe(false);
    expect(outcome.workspace).toEqual(workspace);
    expect(previewShrinkApart(workspace, workspace.fields[0].id, workspace.fields[1].id)).toBeNull();
  });

  it('shrinks both fields apart, leaving a gap rather than a shared edge', () => {
    const workspace = edgeDisagreement(3);
    const [a, b] = workspace.fields;
    const before = workspace.features.map((f) => areaM2(f.geometry));

    const outcome = shrinkApart(workspace, a.id, b.id);
    expect(outcome.ok).toBe(true);
    expect(runChecks(outcome.workspace).map((f) => f.kind)).not.toContain('overlap');

    const [afterA, afterB] = outcome.workspace.features.map((f) => f.geometry);
    // Both gave ground, not just one of them.
    expect(areaM2(afterA)).toBeLessThan(before[0]);
    expect(areaM2(afterB)).toBeLessThan(before[1]);
    expect(overlapAreaM2(afterA, afterB)).toBeLessThanOrEqual(0.05);

    // And they are genuinely apart: the union covers more than the two do end to end
    // would if they still touched.
    const merged = unionAll([afterA, afterB])!;
    expect(merged.type).toBe('MultiPolygon');
  });

  it('reports what shrinking would cost before it is committed', () => {
    const workspace = edgeDisagreement(3);
    const [a, b] = workspace.fields;
    const preview = previewShrinkApart(workspace, a.id, b.id);

    expect(preview).not.toBeNull();
    expect(preview!.gap).toBeCloseTo(preview!.inset * 2, 6);
    expect(preview!.lostHa).toBeGreaterThan(0);
    // The same numbers the fix goes on to use.
    expect(shrinkApart(workspace, a.id, b.id).message).toContain(String(preview!.inset));
  });

  it('leaves a bystander field alone while shrinking two others apart', () => {
    const workspace = edgeDisagreement(3);
    const other = newField({ client: 'A', farm: 'B', field: 'Far' });
    const bystander = {
      ...newFeature(poly([squareRing(2.6, 48.9, 0.004)]), 'c.geojson'),
      fieldId: other.id,
    };
    const withThird: Workspace = {
      fields: [...workspace.fields, other],
      features: [...workspace.features, bystander],
    };

    const outcome = shrinkApart(withThird, workspace.fields[0].id, workspace.fields[1].id);
    expect(outcome.ok).toBe(true);
    expect(outcome.workspace.features[2].geometry).toBe(bystander.geometry);
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


describe('the same boundary imported twice', () => {
  const twoFields = (geometryA: PolyGeom, geometryB: PolyGeom) => {
    const a = newField({ client: 'Acme', farm: 'Home', field: 'West' });
    const b = newField({ client: 'Acme', farm: 'Home', field: 'West copy' });
    return {
      fields: [a, b],
      features: [
        { ...newFeature(geometryA, 'one.kml'), fieldId: a.id },
        { ...newFeature(geometryB, 'two.kml'), fieldId: b.id },
      ],
    };
  };

  it('calls two copies of one boundary a duplicate, not an overlap', () => {
    const workspace = twoFields(bigSquare(), bigSquare());
    const kinds = kindsOf(workspace);
    expect(kinds).toContain('duplicate-geometry');
    expect(kinds).not.toContain('overlap');
  });

  it('still calls a partial overlap an overlap', () => {
    // Shifted by half its width: they share far too little to be the same field.
    const workspace = twoFields(bigSquare(), bigSquare(0.0015));
    const kinds = kindsOf(workspace);
    expect(kinds).toContain('overlap');
    expect(kinds).not.toContain('duplicate-geometry');
  });

  it('catches a copy that is not quite pixel-identical', () => {
    const workspace = twoFields(bigSquare(), bigSquare(0.00005));
    expect(kindsOf(workspace)).toContain('duplicate-geometry');
  });

  it('leaves the fields alone when they merely touch', () => {
    const workspace = twoFields(bigSquare(), bigSquare(0.003));
    const kinds = kindsOf(workspace);
    expect(kinds).not.toContain('duplicate-geometry');
    expect(kinds).not.toContain('overlap');
  });
});

describe('rows with no geometry left', () => {
  it('offers to delete an empty field, and does', () => {
    const field = newField({ client: 'Acme', farm: 'Home', field: 'Ghost' });
    const workspace = { fields: [field], features: [] };
    const flag = runChecks(workspace).find((f) => f.kind === 'empty-field');
    expect(flag?.autoFix).toEqual({ kind: 'delete-fields' });

    const fixed = autoDeleteFields(workspace, [field.id]);
    expect(fixed.ok).toBe(true);
    expect(fixed.workspace.fields).toEqual([]);
  });

  it('takes a field away with its last polygon', () => {
    const field = newField({ client: 'Acme', farm: 'Home', field: 'West' });
    const feature = { ...newFeature(bigSquare(), 'a.kml'), fieldId: field.id };
    const workspace = { fields: [field], features: [feature] };

    const after = deleteFeatures(workspace, [feature.id]);
    expect(after.features).toEqual([]);
    expect(after.fields).toEqual([]);
  });

  it('leaves a field alone while it still has a polygon', () => {
    const field = newField({ client: 'Acme', farm: 'Home', field: 'West' });
    const one = { ...newFeature(bigSquare(), 'a.kml'), fieldId: field.id };
    const two = { ...newFeature(bigSquare(0.01), 'a.kml'), fieldId: field.id };

    const after = deleteFeatures({ fields: [field], features: [one, two] }, [one.id]);
    expect(after.fields).toHaveLength(1);
  });

  // A row created empty is the user's, not this action's leftover.
  it('does not sweep away a field that was already empty', () => {
    const empty = newField({ client: 'Acme', farm: 'Home', field: 'Planned' });
    const other = newField({ client: 'Acme', farm: 'Home', field: 'West' });
    const feature = { ...newFeature(bigSquare(), 'a.kml'), fieldId: other.id };

    const after = deleteFeatures({ fields: [empty, other], features: [feature] }, [feature.id]);
    expect(after.fields.map((f) => f.field)).toEqual(['Planned']);
  });
});
