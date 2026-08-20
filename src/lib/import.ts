import JSZip from 'jszip';
import shp, { parseDbf, parseShp } from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection,
  MultiPolygon,
  Polygon,
} from 'geojson';
import type { PolyGeom } from '../types';
import { normalize } from './geo';
import {
  crsNameFromWkt,
  defForEpsg,
  isWgs84Def,
  looksProjected,
  parseCrsName,
  reprojectGeometry,
  reprojectorFromDef,
} from './proj';

export interface ImportedFeature {
  geometry: PolyGeom;
  source: string;
  sourceProps: Record<string, unknown>;
}

export interface ImportReport {
  features: ImportedFeature[];
  /** Non-fatal notes: reprojections applied, non-polygon geometry skipped, and so on. */
  notes: string[];
  errors: string[];
}

const SHAPE_EXTENSIONS = ['shp', 'shx', 'dbf', 'prj', 'cpg'] as const;

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
};

const baseNameOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function importFiles(files: File[]): Promise<ImportReport> {
  const report: ImportReport = { features: [], notes: [], errors: [] };

  // A loose shapefile arrives as several sibling files that only mean something
  // together, so those are collected by base name before anything else is parsed.
  const looseShapeParts = new Map<string, Map<string, File>>();
  const standalone: File[] = [];

  for (const file of files) {
    const ext = extensionOf(file.name);
    if ((SHAPE_EXTENSIONS as readonly string[]).includes(ext)) {
      const base = baseNameOf(file.name);
      if (!looseShapeParts.has(base)) looseShapeParts.set(base, new Map());
      looseShapeParts.get(base)!.set(ext, file);
    } else {
      standalone.push(file);
    }
  }

  for (const file of standalone) {
    try {
      await importStandalone(file, report);
    } catch (error) {
      report.errors.push(`${file.name}: ${messageOf(error)}`);
    }
  }

  for (const [base, parts] of looseShapeParts) {
    try {
      await importLooseShapefile(base, parts, report);
    } catch (error) {
      report.errors.push(`${base}.shp: ${messageOf(error)}`);
    }
  }

  return report;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/* -------------------------------------------------------------------------- */
/* Per-format readers                                                          */
/* -------------------------------------------------------------------------- */

async function importStandalone(file: File, report: ImportReport): Promise<void> {
  const ext = extensionOf(file.name);
  switch (ext) {
    case 'kml':
      collect(parseKmlText(await file.text()), file.name, report);
      return;
    case 'kmz':
      collect(await parseKmz(await file.arrayBuffer(), file.name, report), file.name, report);
      return;
    case 'zip':
      await importZip(file, report);
      return;
    case 'geojson':
    case 'json': {
      const parsed = JSON.parse(await file.text());
      collect(await reprojectGeoJson(parsed, file.name, report), file.name, report);
      return;
    }
    default:
      report.errors.push(
        `${file.name}: unsupported file type (.kml, .kmz, .zip, .geojson and .json are accepted).`,
      );
  }
}

function parseKmlText(text: string): FeatureCollection {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('the KML is not well-formed XML.');
  }
  return kml(doc) as FeatureCollection;
}

async function parseKmz(
  buffer: ArrayBuffer,
  fileName: string,
  report: ImportReport,
): Promise<FeatureCollection> {
  const zip = await JSZip.loadAsync(buffer);
  const kmlEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && extensionOf(entry.name) === 'kml' && !entry.name.includes('__MACOSX'),
  );
  if (kmlEntries.length === 0) {
    throw new Error('no .kml file found inside the archive.');
  }
  // A KMZ usually holds one doc.kml; if it holds several, all of them are read.
  if (kmlEntries.length > 1) {
    report.notes.push(`${fileName}: merged ${kmlEntries.length} KML documents from the archive.`);
  }
  const collections = await Promise.all(
    kmlEntries.map(async (entry) => parseKmlText(await entry.async('text'))),
  );
  return {
    type: 'FeatureCollection',
    features: collections.flatMap((c) => c.features),
  };
}

/** A .zip is either a zipped shapefile bundle or an archive of other supported files. */
async function importZip(file: File, report: ImportReport): Promise<void> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && !entry.name.includes('__MACOSX'),
  );
  const hasShp = entries.some((entry) => extensionOf(entry.name) === 'shp');

  if (hasShp) {
    const result = await shp(buffer);
    const collections = Array.isArray(result) ? result : [result];
    await reportShapefileCrs(entries, file.name, report);
    for (const collection of collections) {
      // Only name the inner layer when the archive actually holds more than one,
      // so the common single-layer case reads as just the file the user dropped.
      const layer = (collection as { fileName?: string }).fileName;
      const source = collections.length > 1 && layer ? `${file.name} › ${layer}` : file.name;
      collect(collection as FeatureCollection, source, report);
    }
    return;
  }

  // Not a shapefile bundle: read any KML/KMZ/GeoJSON members it contains instead.
  const nested = entries.filter((entry) =>
    ['kml', 'kmz', 'geojson', 'json'].includes(extensionOf(entry.name)),
  );
  if (nested.length === 0) {
    throw new Error('the archive contains no .shp, .kml or .geojson files.');
  }
  for (const entry of nested) {
    const blob = await entry.async('blob');
    const nestedFile = new File([blob], entry.name.split('/').pop() ?? entry.name);
    await importStandalone(nestedFile, report);
  }
}

/**
 * Notes which CRS a zipped shapefile declared. shpjs reprojects to WGS84 while reading
 * and says nothing about it, so this is the only place the user finds out their UTM file
 * was converted — or that it had no .prj and was taken at face value.
 */
async function reportShapefileCrs(
  entries: JSZip.JSZipObject[],
  fileName: string,
  report: ImportReport,
): Promise<void> {
  const prj = entries.find((entry) => extensionOf(entry.name) === 'prj');
  if (!prj) {
    report.notes.push(
      `${fileName}: no .prj found — coordinates were read as WGS84. Check the result on the map.`,
    );
    return;
  }
  const wkt = await prj.async('text');
  if (isWgs84Def(wkt)) {
    report.notes.push(`${fileName}: already in WGS84 (${crsNameFromWkt(wkt)}).`);
  } else {
    report.notes.push(`${fileName}: reprojected from ${crsNameFromWkt(wkt)} to WGS84.`);
  }
}

async function importLooseShapefile(
  base: string,
  parts: Map<string, File>,
  report: ImportReport,
): Promise<void> {
  const shpFile = parts.get('shp');
  if (!shpFile) {
    throw new Error('a .shp file is required alongside the other shapefile parts.');
  }
  if (!parts.get('dbf')) {
    report.notes.push(`${base}: no .dbf selected, so no attributes were carried over.`);
  }

  const prjText = parts.has('prj') ? await parts.get('prj')!.text() : null;
  // shpjs takes the .prj as raw WKT and builds the proj4 converter itself; handing
  // it an already-constructed converter is silently ignored.
  let prjForShpjs: string | undefined;
  if (prjText && !isWgs84Def(prjText)) {
    if (reprojectorFromDef(prjText, '')) {
      prjForShpjs = prjText;
      report.notes.push(`${base}: reprojected from ${crsNameFromWkt(prjText)} to WGS84.`);
    } else {
      report.notes.push(`${base}: the .prj could not be read; coordinates assumed to be WGS84.`);
    }
  } else if (!prjText) {
    report.notes.push(`${base}: no .prj selected — coordinates were read as WGS84.`);
  }

  const geometries = parseShp(await shpFile.arrayBuffer(), prjForShpjs) as Geometry[];
  let attributes: Record<string, unknown>[] = [];
  if (parts.has('dbf')) {
    const cpg = parts.has('cpg') ? await parts.get('cpg')!.text() : undefined;
    attributes = parseDbf(await parts.get('dbf')!.arrayBuffer(), cpg) as Record<
      string,
      unknown
    >[];
  }

  collect(
    {
      type: 'FeatureCollection',
      features: geometries.map((geometry, index) => ({
        type: 'Feature',
        geometry,
        properties: attributes[index] ?? {},
      })),
    },
    `${base}.shp`,
    report,
  );
}

/* -------------------------------------------------------------------------- */
/* GeoJSON CRS handling                                                        */
/* -------------------------------------------------------------------------- */

interface LegacyCrs {
  crs?: { type?: string; properties?: { name?: string; href?: string } };
}

async function reprojectGeoJson(
  parsed: unknown,
  fileName: string,
  report: ImportReport,
): Promise<FeatureCollection> {
  const collection = asFeatureCollection(parsed);
  const crs = (parsed as LegacyCrs).crs;
  const name = crs?.properties?.name ?? crs?.properties?.href;
  const code = name ? parseCrsName(name) : null;

  if (code !== null && code !== 4326) {
    const def = defForEpsg(code);
    if (!def) {
      report.errors.push(
        `${fileName}: declares EPSG:${code}, which this tool cannot convert offline. ` +
          'Re-export the file as WGS84 (EPSG:4326) or as a zipped shapefile with a .prj.',
      );
      return { type: 'FeatureCollection', features: [] };
    }
    const reprojector = reprojectorFromDef(def, `EPSG:${code}`);
    if (!reprojector) {
      report.errors.push(`${fileName}: EPSG:${code} could not be initialised.`);
      return { type: 'FeatureCollection', features: [] };
    }
    report.notes.push(`${fileName}: reprojected from EPSG:${code} to WGS84.`);
    return {
      type: 'FeatureCollection',
      features: collection.features.map((feature) => ({
        ...feature,
        geometry: isPolygonal(feature.geometry)
          ? reprojectGeometry(feature.geometry, reprojector)
          : feature.geometry,
      })),
    };
  }

  const projectedLooking = collection.features.some(
    (feature) => isPolygonal(feature.geometry) && looksProjected(feature.geometry),
  );
  if (projectedLooking) {
    report.errors.push(
      `${fileName}: coordinates fall outside the valid longitude/latitude range and the file ` +
        'declares no CRS, so it cannot be placed on the map. Re-export it as WGS84.',
    );
    return { type: 'FeatureCollection', features: [] };
  }

  return collection;
}

function asFeatureCollection(parsed: unknown): FeatureCollection {
  const value = parsed as { type?: string };
  if (value?.type === 'FeatureCollection') return parsed as FeatureCollection;
  if (value?.type === 'Feature') {
    return { type: 'FeatureCollection', features: [parsed as Feature] };
  }
  if (typeof value?.type === 'string') {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: parsed as Geometry }],
    };
  }
  throw new Error('the file is not valid GeoJSON.');
}

/* -------------------------------------------------------------------------- */
/* Collecting polygonal geometry                                               */
/* -------------------------------------------------------------------------- */

const isPolygonal = (geometry: Geometry | null): geometry is Polygon | MultiPolygon =>
  geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';

/**
 * Pulls every polygon out of a parsed collection. Points and lines are counted and
 * reported rather than silently dropped — a KML of field markers that yields nothing
 * should say so.
 */
function collect(collection: FeatureCollection, source: string, report: ImportReport): void {
  let skipped = 0;
  let repaired = 0;
  let found = 0;

  for (const feature of collection.features ?? []) {
    const geometry = mergeGeometry(flattenGeometry(feature.geometry));
    if (!geometry) {
      if (feature.geometry) skipped++;
      continue;
    }
    found++;
    const cleaned = normalize(geometry);
    if (!cleaned) {
      repaired++;
      continue;
    }
    report.features.push({
      geometry: cleaned,
      source,
      sourceProps: (feature.properties ?? {}) as Record<string, unknown>,
    });
  }

  if (found === 0) {
    report.notes.push(`${source}: no polygons found (points and lines cannot become fields).`);
  } else if (skipped > 0) {
    report.notes.push(
      `${source}: skipped ${skipped} non-polygon feature${skipped === 1 ? '' : 's'}.`,
    );
  }
  if (repaired > 0) {
    report.notes.push(
      `${source}: dropped ${repaired} empty or degenerate polygon${repaired === 1 ? '' : 's'}.`,
    );
  }
}

/**
 * Collapses the polygons of one source feature into a single geometry. A KML
 * MultiGeometry placemark describes one thing in several pieces, so it stays one
 * feature the user can then group as they see fit.
 */
function mergeGeometry(geometries: PolyGeom[]): PolyGeom | null {
  if (geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0];
  return {
    type: 'MultiPolygon',
    coordinates: geometries.flatMap((g) =>
      g.type === 'Polygon' ? [g.coordinates] : g.coordinates,
    ),
  };
}

/** Unwraps GeometryCollections, which KML MultiGeometry commonly produces. */
function flattenGeometry(geometry: Geometry | null): PolyGeom[] {
  if (!geometry) return [];
  if (isPolygonal(geometry)) return [geometry];
  if (geometry.type === 'GeometryCollection') {
    return (geometry as GeometryCollection).geometries.flatMap(flattenGeometry);
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/* Attribute mapping                                                           */
/* -------------------------------------------------------------------------- */

/** Source attribute keys that plausibly hold a Client, Farm or Field name. */
const ATTRIBUTE_HINTS: Record<'client' | 'farm' | 'field', RegExp> = {
  client: /^(client|grower|customer|owner|account|producer)$/i,
  farm: /^(farm|farm_name|farmname|holding|ranch|estate)$/i,
  field: /^(field|field_name|fieldname|name|title|parcel|plot|block|tract|lot)$/i,
};

export interface AttributeGuess {
  client: string;
  farm: string;
  field: string;
}

/** Best-effort read of Client/Farm/Field out of a source file's own attributes. */
export function guessAttributes(props: Record<string, unknown>): AttributeGuess {
  const guess: AttributeGuess = { client: '', farm: '', field: '' };
  for (const target of ['client', 'farm', 'field'] as const) {
    const hit = Object.keys(props).find((key) => ATTRIBUTE_HINTS[target].test(key.trim()));
    if (hit !== undefined) guess[target] = stringify(props[hit]);
  }
  return guess;
}

/** Which of the three attributes any of the given features could supply a value for. */
export function availableAttributeSources(
  featuresProps: Record<string, unknown>[],
): { client: boolean; farm: boolean; field: boolean } {
  const any = { client: false, farm: false, field: false };
  for (const props of featuresProps) {
    const guess = guessAttributes(props);
    if (guess.client) any.client = true;
    if (guess.farm) any.farm = true;
    if (guess.field) any.field = true;
  }
  return any;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
