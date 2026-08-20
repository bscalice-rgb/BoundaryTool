import proj4 from 'proj4';
import JSZip from 'jszip';
import type { Polygon, Position } from 'geojson';
import { buildShapefile, writeDbf, writeShpShx } from '../lib/shapefile';

export const UTM31N_WKT =
  'PROJCS["WGS_1984_UTM_Zone_31N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",3.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const UTM31N = '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs';

/** Projects a WGS84 ring into UTM zone 31N so a fixture can be genuinely non-WGS84. */
export function toUtm31n(ring: Position[]): Position[] {
  return ring.map((p) => proj4('EPSG:4326', UTM31N, [p[0], p[1]]) as Position);
}

export const squareRing = (x: number, y: number, size: number): Position[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

export const poly = (rings: Position[][]): Polygon => ({ type: 'Polygon', coordinates: rings });

/** A zipped shapefile whose coordinates really are in UTM and whose .prj says so. */
export async function utmShapefileZip(): Promise<ArrayBuffer> {
  const geometry = poly([toUtm31n(squareRing(2.5, 48.8, 0.01))]);
  const { shp, shx } = writeShpShx([geometry]);
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
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** A WGS84 zipped shapefile, for the "already correct" import path. */
export async function wgs84ShapefileZip(name = 'plots'): Promise<ArrayBuffer> {
  const bundle = buildShapefile(
    [
      {
        geometry: poly([squareRing(1.0, 51.0, 0.01)]),
        attributes: { Client: 'Acme', Farm: 'Home', Field: 'Top' },
      },
    ],
    [
      { name: 'Client', length: 30 },
      { name: 'Farm', length: 30 },
      { name: 'Field', length: 30 },
    ],
  );
  const zip = new JSZip();
  zip.file(`${name}.shp`, bundle.shp);
  zip.file(`${name}.shx`, bundle.shx);
  zip.file(`${name}.dbf`, bundle.dbf);
  zip.file(`${name}.prj`, bundle.prj);
  return zip.generateAsync({ type: 'arraybuffer' });
}

export const KML_DOC = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark>
    <name>Church Field</name>
    <ExtendedData><Data name="Farm"><value>Manor</value></Data>
      <Data name="Client"><value>Bell Farms</value></Data></ExtendedData>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>
      -0.5,52.0 -0.49,52.0 -0.49,52.01 -0.5,52.01 -0.5,52.0
    </coordinates></LinearRing></outerBoundaryIs></Polygon>
  </Placemark>
  <Placemark>
    <name>Two Halves</name>
    <MultiGeometry>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -0.4,52.0 -0.39,52.0 -0.39,52.01 -0.4,52.01 -0.4,52.0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -0.38,52.0 -0.37,52.0 -0.37,52.01 -0.38,52.01 -0.38,52.0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </MultiGeometry>
  </Placemark>
  <Placemark><name>A marker</name><Point><coordinates>-0.45,52.005</coordinates></Point></Placemark>
</Document></kml>`;

export async function kmzFile(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('doc.kml', KML_DOC);
  return zip.generateAsync({ type: 'arraybuffer' });
}

export function fileFrom(name: string, data: ArrayBuffer | string): File {
  return new File([data as BlobPart], name);
}
