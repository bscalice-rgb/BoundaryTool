import { describe, expect, it } from 'vitest';
import shp from 'shpjs';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import {
  WGS84_WKT,
  buildShapefile,
  encodeFixed,
  orientRing,
  signedArea,
  writeDbf,
  writeShpShx,
} from '../lib/shapefile';
import type { PolyGeom } from '../types';

const square = (x: number, y: number, size = 0.01): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});

/** A square with a square hole punched out of the middle. */
const squareWithHole = (x: number, y: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    square(x, y, 0.02).coordinates[0],
    [
      [x + 0.005, y + 0.005],
      [x + 0.005, y + 0.015],
      [x + 0.015, y + 0.015],
      [x + 0.015, y + 0.005],
      [x + 0.005, y + 0.005],
    ],
  ],
});

const FIELDS = [
  { name: 'Client', length: 30 },
  { name: 'Farm', length: 30 },
  { name: 'Field', length: 30 },
];

async function roundTrip(rows: { geometry: PolyGeom; attributes: Record<string, string> }[]) {
  const bundle = buildShapefile(rows, FIELDS);
  // shpjs accepts the raw component buffers, which is exactly what QGIS reads.
  const parsed = (await shp({
    shp: bundle.shp.buffer.slice(
      bundle.shp.byteOffset,
      bundle.shp.byteOffset + bundle.shp.byteLength,
    ) as ArrayBuffer,
    dbf: bundle.dbf.buffer.slice(
      bundle.dbf.byteOffset,
      bundle.dbf.byteOffset + bundle.dbf.byteLength,
    ) as ArrayBuffer,
    prj: bundle.prj,
    cpg: bundle.cpg,
  })) as GeoJSON.FeatureCollection;
  return parsed;
}

describe('ring orientation', () => {
  it('reports counter-clockwise rings as positive signed area', () => {
    expect(signedArea(square(0, 0).coordinates[0])).toBeGreaterThan(0);
  });

  it('flips outer rings to clockwise and leaves holes counter-clockwise', () => {
    const ring = square(0, 0).coordinates[0];
    expect(signedArea(orientRing(ring, true))).toBeLessThan(0);
    expect(signedArea(orientRing(ring, false))).toBeGreaterThan(0);
  });

  it('closes an unclosed ring', () => {
    const open = square(0, 0).coordinates[0].slice(0, -1);
    expect(orientRing(open, true)).toHaveLength(5);
  });
});

describe('dbf', () => {
  it('pads values to the declared width and marks records as live', () => {
    const dbf = writeDbf([{ Client: 'Acme', Farm: 'North', Field: 'A1' }], FIELDS);
    const headerBytes = 32 + 3 * 32 + 1;
    expect(dbf[0]).toBe(0x03);
    expect(new DataView(dbf.buffer).getUint32(4, true)).toBe(1);
    expect(new DataView(dbf.buffer).getUint16(8, true)).toBe(headerBytes);
    expect(new DataView(dbf.buffer).getUint16(10, true)).toBe(1 + 90);
    expect(dbf[headerBytes]).toBe(0x20);
    expect(dbf[dbf.length - 1]).toBe(0x1a);
  });

  it('declares every field as a 30-byte character column', () => {
    const dbf = writeDbf([{ Client: 'a', Farm: 'b', Field: 'c' }], FIELDS);
    for (let i = 0; i < 3; i++) {
      const at = 32 + i * 32;
      expect(dbf[at + 11]).toBe(0x43); // 'C'
      expect(dbf[at + 16]).toBe(30);
    }
  });

  it('never cuts a multi-byte character in half', () => {
    // "é" is two bytes, so a width-5 field holds two of them and pads the rest.
    const out = encodeFixed('ééé', 5);
    expect(out).toHaveLength(5);
    expect(new TextDecoder().decode(out)).toBe('éé ');
  });
});

describe('shp/shx', () => {
  it('writes matching offsets and lengths in the index file', () => {
    const { shp: shpBytes, shx } = writeShpShx([square(0, 0), square(1, 1)]);
    const shpView = new DataView(shpBytes.buffer);
    const shxView = new DataView(shx.buffer);
    expect(shpView.getInt32(0, false)).toBe(9994);
    expect(shpView.getInt32(24, false) * 2).toBe(shpBytes.length);
    expect(shxView.getInt32(24, false) * 2).toBe(shx.length);
    expect(shx.length).toBe(100 + 2 * 8);

    for (let i = 0; i < 2; i++) {
      const offsetWords = shxView.getInt32(100 + i * 8, false);
      const lengthWords = shxView.getInt32(100 + i * 8 + 4, false);
      // The record header at that offset must agree with the index entry.
      expect(shpView.getInt32(offsetWords * 2, false)).toBe(i + 1);
      expect(shpView.getInt32(offsetWords * 2 + 4, false)).toBe(lengthWords);
    }
  });
});

describe('round trip through a shapefile reader', () => {
  it('preserves one row per field with all three attributes intact', async () => {
    const parsed = await roundTrip([
      { geometry: square(1, 51), attributes: { Client: 'Acme', Farm: 'North', Field: 'Home' } },
      { geometry: square(2, 52), attributes: { Client: 'Acme', Farm: 'South', Field: 'Mill' } },
    ]);
    expect(parsed.features).toHaveLength(2);
    expect(parsed.features.map((f) => f.properties)).toEqual([
      { Client: 'Acme', Farm: 'North', Field: 'Home' },
      { Client: 'Acme', Farm: 'South', Field: 'Mill' },
    ]);
  });

  it('keeps a hole as a hole', async () => {
    const parsed = await roundTrip([
      { geometry: squareWithHole(1, 51), attributes: { Client: 'A', Farm: 'B', Field: 'C' } },
    ]);
    const geom = parsed.features[0].geometry as Polygon | MultiPolygon;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates[0];
    expect(rings).toHaveLength(2);
  });

  it('keeps disjoint parts of one field together as a single multipolygon row', async () => {
    const multi: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [square(1, 51).coordinates, square(1.5, 51.5).coordinates],
    };
    const parsed = await roundTrip([
      { geometry: multi, attributes: { Client: 'A', Farm: 'B', Field: 'Split field' } },
    ]);
    expect(parsed.features).toHaveLength(1);
    const geom = parsed.features[0].geometry as MultiPolygon;
    expect(geom.type).toBe('MultiPolygon');
    expect(geom.coordinates).toHaveLength(2);
  });

  it('round-trips coordinates within a millimetre', async () => {
    const parsed = await roundTrip([
      { geometry: square(-1.234567, 51.987654), attributes: { Client: 'A', Farm: 'B', Field: 'C' } },
    ]);
    const geom = parsed.features[0].geometry as Polygon;
    const xs = geom.coordinates[0].map((c) => c[0]);
    expect(Math.min(...xs)).toBeCloseTo(-1.234567, 9);
  });

  it('preserves a value at the full 30-character width', async () => {
    const long = 'X'.repeat(30);
    const parsed = await roundTrip([
      { geometry: square(1, 51), attributes: { Client: long, Farm: 'B', Field: 'C' } },
    ]);
    expect((parsed.features[0] as Feature).properties?.Client).toBe(long);
  });
});

describe('prj', () => {
  it('is well-formed WGS84 WKT', () => {
    expect(WGS84_WKT).toContain('GEOGCS');
    expect(WGS84_WKT).toContain('WGS_1984');
    expect(WGS84_WKT).toContain('6378137.0');
    expect(WGS84_WKT).toContain('298.257223563');
    // Balanced brackets: a truncated .prj is the classic silent failure.
    const opens = (WGS84_WKT.match(/\[/g) ?? []).length;
    const closes = (WGS84_WKT.match(/\]/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
