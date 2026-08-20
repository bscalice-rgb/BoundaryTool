import JSZip from 'jszip';
import type { Position } from 'geojson';
import type { PolyGeom } from '../types';
import { toMultiPolygon } from './geo';

/**
 * Minimal, dependency-free ESRI shapefile writer for polygon layers.
 *
 * Written by hand rather than pulled from a library because CropForce uploads are
 * unforgiving about three things the common writers get wrong: multi-part
 * geometries with holes collapsing to single rings, ring winding order, and a
 * missing or malformed `.prj`. Everything here is spelled out against the ESRI
 * Shapefile Technical Description (July 1998).
 */

/** ESRI-flavoured WGS84 WKT — the form ArcGIS and QGIS both recognise on sight. */
export const WGS84_WKT =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const SHP_FILE_CODE = 9994;
const SHP_VERSION = 1000;
const SHAPE_TYPE_POLYGON = 5;
const HEADER_BYTES = 100;

export interface ShapefileRow {
  geometry: PolyGeom;
  attributes: Record<string, string>;
}

export interface DbfFieldSpec {
  /** Max 10 characters — the classic DBF header limit. */
  name: string;
  /** Character field width in bytes. */
  length: number;
}

/* -------------------------------------------------------------------------- */
/* Ring handling                                                               */
/* -------------------------------------------------------------------------- */

/** Shoelace signed area. Positive means counter-clockwise in screen/GeoJSON terms. */
export function signedArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  return fx === lx && fy === ly ? ring : [...ring, [fx, fy]];
}

/**
 * Shapefiles want outer rings clockwise and holes counter-clockwise — the exact
 * opposite of the GeoJSON right-hand rule, so every ring gets checked and flipped
 * rather than trusted.
 */
export function orientRing(ring: Position[], clockwise: boolean): Position[] {
  const closed = closeRing(ring);
  const isCounterClockwise = signedArea(closed) > 0;
  const needsFlip = clockwise ? isCounterClockwise : !isCounterClockwise;
  return needsFlip ? [...closed].reverse() : closed;
}

interface PartedShape {
  parts: Position[][];
  bbox: [number, number, number, number];
}

/** Flattens a Polygon/MultiPolygon into the flat, correctly wound part list a record needs. */
export function toParts(geometry: PolyGeom): PartedShape {
  const multi = toMultiPolygon(geometry);
  const parts: Position[][] = [];
  for (const rings of multi.coordinates) {
    rings.forEach((ring, index) => {
      if (ring.length < 4) return;
      // Index 0 is the outer ring; everything after it is a hole.
      parts.push(orientRing(ring, index === 0));
    });
  }
  if (parts.length === 0) {
    throw new Error('Cannot write a shapefile record with no rings.');
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    for (const [x, y] of part) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { parts, bbox: [minX, minY, maxX, maxY] };
}

/* -------------------------------------------------------------------------- */
/* .shp / .shx                                                                 */
/* -------------------------------------------------------------------------- */

function writeMainHeader(
  view: DataView,
  fileLengthWords: number,
  bbox: [number, number, number, number],
): void {
  view.setInt32(0, SHP_FILE_CODE, false);
  // Bytes 4..23 are unused and must be zero, which they already are.
  view.setInt32(24, fileLengthWords, false);
  view.setInt32(28, SHP_VERSION, true);
  view.setInt32(32, SHAPE_TYPE_POLYGON, true);
  view.setFloat64(36, bbox[0], true);
  view.setFloat64(44, bbox[1], true);
  view.setFloat64(52, bbox[2], true);
  view.setFloat64(60, bbox[3], true);
  // Z and M ranges stay 0 for a 2D polygon layer.
}

interface ShpShx {
  shp: Uint8Array;
  shx: Uint8Array;
}

export function writeShpShx(geometries: PolyGeom[]): ShpShx {
  const shapes = geometries.map(toParts);

  const contentBytes = shapes.map((shape) => {
    const pointCount = shape.parts.reduce((n, p) => n + p.length, 0);
    return 4 + 32 + 4 + 4 + 4 * shape.parts.length + 16 * pointCount;
  });

  const shpBytes = HEADER_BYTES + contentBytes.reduce((s, n) => s + n + 8, 0);
  const shxBytes = HEADER_BYTES + shapes.length * 8;

  const shp = new ArrayBuffer(shpBytes);
  const shx = new ArrayBuffer(shxBytes);
  const shpView = new DataView(shp);
  const shxView = new DataView(shx);

  const layerBbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const shape of shapes) {
    layerBbox[0] = Math.min(layerBbox[0], shape.bbox[0]);
    layerBbox[1] = Math.min(layerBbox[1], shape.bbox[1]);
    layerBbox[2] = Math.max(layerBbox[2], shape.bbox[2]);
    layerBbox[3] = Math.max(layerBbox[3], shape.bbox[3]);
  }

  writeMainHeader(shpView, shpBytes / 2, layerBbox);
  writeMainHeader(shxView, shxBytes / 2, layerBbox);

  let offset = HEADER_BYTES;
  shapes.forEach((shape, index) => {
    const content = contentBytes[index];

    // .shx entry: offset and content length, both in 16-bit words, big-endian.
    shxView.setInt32(HEADER_BYTES + index * 8, offset / 2, false);
    shxView.setInt32(HEADER_BYTES + index * 8 + 4, content / 2, false);

    // Record header, big-endian; record numbers are 1-based.
    shpView.setInt32(offset, index + 1, false);
    shpView.setInt32(offset + 4, content / 2, false);

    let p = offset + 8;
    shpView.setInt32(p, SHAPE_TYPE_POLYGON, true);
    p += 4;
    for (const value of shape.bbox) {
      shpView.setFloat64(p, value, true);
      p += 8;
    }
    const pointCount = shape.parts.reduce((n, part) => n + part.length, 0);
    shpView.setInt32(p, shape.parts.length, true);
    p += 4;
    shpView.setInt32(p, pointCount, true);
    p += 4;

    // Part index: the position of each ring's first point within the point array.
    let pointIndex = 0;
    for (const part of shape.parts) {
      shpView.setInt32(p, pointIndex, true);
      p += 4;
      pointIndex += part.length;
    }
    for (const part of shape.parts) {
      for (const [x, y] of part) {
        shpView.setFloat64(p, x, true);
        shpView.setFloat64(p + 8, y, true);
        p += 16;
      }
    }

    offset += 8 + content;
  });

  return { shp: new Uint8Array(shp), shx: new Uint8Array(shx) };
}

/* -------------------------------------------------------------------------- */
/* .dbf                                                                        */
/* -------------------------------------------------------------------------- */

const encoder = new TextEncoder();

/** Truncates on a UTF-8 byte boundary so a multi-byte character is never cut in half. */
export function encodeFixed(value: string, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength).fill(0x20); // space-padded, per dBase
  const bytes = encoder.encode(value);
  let usable = Math.min(bytes.length, byteLength);
  while (usable > 0 && (bytes[usable] & 0b1100_0000) === 0b1000_0000) usable--;
  out.set(bytes.subarray(0, usable));
  return out;
}

export function writeDbf(rows: Record<string, string>[], fields: DbfFieldSpec[]): Uint8Array {
  const headerBytes = 32 + fields.length * 32 + 1;
  const recordBytes = 1 + fields.reduce((s, f) => s + f.length, 0);
  const total = headerBytes + rows.length * recordBytes + 1;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const now = new Date();
  view.setUint8(0, 0x03); // dBase III without a memo file
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerBytes, true);
  view.setUint16(10, recordBytes, true);
  // Bytes 12..31 stay zero; the encoding is declared in the .cpg file instead.

  fields.forEach((field, index) => {
    const at = 32 + index * 32;
    bytes.set(encodeName(field.name), at);
    view.setUint8(at + 11, 0x43); // 'C' — character field
    view.setUint8(at + 16, field.length);
    view.setUint8(at + 17, 0); // decimal count, unused for character fields
  });
  view.setUint8(32 + fields.length * 32, 0x0d); // field descriptor terminator

  let at = headerBytes;
  for (const row of rows) {
    view.setUint8(at, 0x20); // not deleted
    at += 1;
    for (const field of fields) {
      bytes.set(encodeFixed(row[field.name] ?? '', field.length), at);
      at += field.length;
    }
  }
  view.setUint8(total - 1, 0x1a); // end-of-file marker

  return bytes;
}

/** DBF field names are 11 bytes, null-terminated, ASCII, upper-case by convention. */
function encodeName(name: string): Uint8Array {
  const out = new Uint8Array(11);
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').slice(0, 10);
  out.set(encoder.encode(ascii).subarray(0, 10));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Zip bundle                                                                  */
/* -------------------------------------------------------------------------- */

export interface ShapefileBundle {
  shp: Uint8Array;
  shx: Uint8Array;
  dbf: Uint8Array;
  prj: string;
  cpg: string;
}

export function buildShapefile(rows: ShapefileRow[], fields: DbfFieldSpec[]): ShapefileBundle {
  if (rows.length === 0) {
    throw new Error('Nothing to export: no fields have been defined.');
  }
  const { shp, shx } = writeShpShx(rows.map((r) => r.geometry));
  const dbf = writeDbf(
    rows.map((r) => r.attributes),
    fields,
  );
  return { shp, shx, dbf, prj: WGS84_WKT, cpg: 'UTF-8' };
}

export async function zipShapefile(
  bundle: ShapefileBundle,
  baseName: string,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(`${baseName}.shp`, bundle.shp);
  zip.file(`${baseName}.shx`, bundle.shx);
  zip.file(`${baseName}.dbf`, bundle.dbf);
  zip.file(`${baseName}.prj`, bundle.prj);
  zip.file(`${baseName}.cpg`, bundle.cpg);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
