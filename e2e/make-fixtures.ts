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
import { buildShapefile, writeDbf, writeShpShx } from '../src/lib/shapefile';
import { UTM31N_WKT, KML_DOC } from '../src/test/fixtures';
import { make7z, makeRar5, member } from '../src/test/archives';

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

  // 3. A shapefile set packed into a .rar, folder and all, the way a grower's agronomist
  //     tends to send one from Windows.
  const talhoes = buildShapefile(
    [
      {
        geometry: { type: 'Polygon', coordinates: [ring(-47.9, -15.8, 0.004)] },
        attributes: { Client: 'Fazenda Boa Vista', Farm: 'Sede', Field: 'Talhao 1' },
      },
    ],
    [
      { name: 'Client', length: 30 },
      { name: 'Farm', length: 30 },
      { name: 'Field', length: 30 },
    ],
  );
  writeFileSync(
    join(FIXTURE_DIR, 'talhoes.rar'),
    Buffer.from(
      makeRar5([
        member('talhoes/talhoes.shp', talhoes.shp),
        member('talhoes/talhoes.shx', talhoes.shx),
        member('talhoes/talhoes.dbf', talhoes.dbf),
        member('talhoes/talhoes.prj', talhoes.prj),
      ]),
    ),
  );

  // 4. A GeoJSON packed into a .7z.
  writeFileSync(
    join(FIXTURE_DIR, 'lotes.7z'),
    Buffer.from(
      make7z([
        member(
          'lotes.geojson',
          JSON.stringify({
            type: 'Feature',
            properties: { Client: 'Rancho Sur', Farm: 'Norte', Field: 'Lote 4' },
            geometry: { type: 'Polygon', coordinates: [ring(-58.4, -34.6, 0.004)] },
          }),
        ),
      ]),
    ),
  );

  // 5. Two neighbours whose shared edge was surveyed twice and disagrees by three metres:
  //     a hundred hectares against forty, which is the shape the overlap routes are for.
  const M_PER_DEG_LAT = 110_574;
  const mPerDegLon = 111_320 * Math.cos((48.8 * Math.PI) / 180);
  const metresRing = (lon: number, lat: number, wide: number, tall: number): Position[] => {
    const dx = wide / mPerDegLon;
    const dy = tall / M_PER_DEG_LAT;
    return [
      [lon, lat],
      [lon + dx, lat],
      [lon + dx, lat + dy],
      [lon, lat + dy],
      [lon, lat],
    ];
  };
  const bigWide = 1000;
  const smallWide = 632.5;
  writeFileSync(
    join(FIXTURE_DIR, 'neighbours.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Client: 'Fazenda Boa Vista', Farm: 'Sede', Field: 'Talhao Grande' },
          geometry: { type: 'Polygon', coordinates: [metresRing(3, 48.8, bigWide, 1000)] },
        },
        {
          type: 'Feature',
          properties: { Client: 'Fazenda Boa Vista', Farm: 'Sede', Field: 'Talhao Pequeno' },
          geometry: {
            type: 'Polygon',
            // Starts three metres short of where the big one ends.
            coordinates: [
              metresRing(3 + (bigWide - 3) / mPerDegLon, 48.8, smallWide, smallWide),
            ],
          },
        },
      ],
    }),
  );

  // 6. A plain WGS84 GeoJSON.
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
