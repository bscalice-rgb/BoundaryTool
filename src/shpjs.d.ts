/**
 * shpjs ships no type declarations. Only the three entry points this app uses are
 * declared, with the shapes they actually return.
 */
declare module 'shpjs' {
  import type { FeatureCollection, Geometry } from 'geojson';

  type ShpInput = ArrayBuffer | Uint8Array | DataView;

  /** Reads a zipped shapefile bundle. Returns one collection per layer in the zip. */
  function shp(
    input: ShpInput | { shp: ShpInput; dbf?: ShpInput; prj?: string; cpg?: string },
  ): Promise<(FeatureCollection & { fileName?: string }) | (FeatureCollection & { fileName?: string })[]>;

  /**
   * Parses a bare .shp. `prj` is the raw WKT of the source CRS; shpjs builds the
   * proj4 converter from it and reprojects to WGS84 while reading.
   */
  export function parseShp(buffer: ShpInput, prj?: string): Geometry[];

  export function parseDbf(buffer: ShpInput, cpg?: string): Record<string, unknown>[];

  export default shp;
}
