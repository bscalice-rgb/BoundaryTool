/**
 * Writes the sample boundary files the browser test drags into the app. Generating
 * them keeps the repository free of binary fixtures and proves the writer and the
 * reader agree.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import proj4 from 'proj4';
import type { Position } from 'geojson';
import { writeDbf, writeShpShx } from '../src/lib/shapefile';
import { UTM31N_WKT, KML_DOC } from '../src/test/fixtures';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(here, 'fixtures');

const UTM31N = '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs';

const ring = (x: number, y: number, size: number): Position[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

export async function writeFixtures(): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  // 1. A KMZ, in WGS84.
  const kmz = new JSZip();
  kmz.file('doc.kml', KML_DOC);
  writeFileSync(join(FIXTURE_DIR, 'blocks.kmz'), await kmz.generateAsync({ type: 'nodebuffer' }));

  // 2. A zipped shapefile whose coordinates are in UTM zone 31N.
  const utmRing = ring(2.5, 48.8, 0.004).map(
    (p) => proj4('EPSG:4326', UTM31N, [p[0], p[1]]) as Position,
  );
  const { shp, shx } = writeShpShx([{ type: 'Polygon', coordinates: [utmRing] }]);
  const dbf = writeDbf([{ Client: 'Ferme SA', Farm: 'Nord', Field: 'Parcelle 1' }], [
    { name: 'Client', length: 30 },
    { name: 'Farm', length: 30 },
    { name: 'Field', length: 30 },
  ]);
  const zip = new JSZip();
  zip.file('parcelles.shp', shp);
  zip.file('parcelles.shx', shx);
  zip.file('parcelles.dbf', dbf);
  zip.file('parcelles.prj', UTM31N_WKT);
  writeFileSync(join(FIXTURE_DIR, 'parcelles.zip'), await zip.generateAsync({ type: 'nodebuffer' }));

  // 3. A plain WGS84 GeoJSON.
  writeFileSync(
    join(FIXTURE_DIR, 'extra.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          // Lower-case "name" matches what the KML placemarks produce, so one column
          // mapping covers both files — which is what a real batch usually looks like.
          properties: { name: 'Bottom Meadow' },
          geometry: { type: 'Polygon', coordinates: [ring(2.51, 48.81, 0.003)] },
        },
      ],
    }),
  );
}
