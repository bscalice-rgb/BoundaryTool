import { describe, expect, it } from 'vitest';
import { applyMapping, collectColumns, guessMapping, importFiles } from '../lib/import';
import { areaHa, bboxOf } from '../lib/geo';
import {
  KML_DOC,
  fileFrom,
  kmzFile,
  poly,
  squareRing,
  utmShapefileZip,
  wgs84ShapefileZip,
} from './fixtures';

/** All imported coordinates must land in the valid WGS84 range. */
const isWgs84 = (bbox: number[]) =>
  bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90;

describe('KML and KMZ', () => {
  it('reads polygons and skips point placemarks', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    expect(report.errors).toEqual([]);
    expect(report.features).toHaveLength(2);
    expect(report.notes.join(' ')).toContain('skipped 1 non-polygon');
  });

  it('flattens a MultiGeometry placemark into its polygons', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    const multi = report.features.find((f) => f.geometry.type === 'MultiPolygon');
    expect(multi).toBeDefined();
    expect((multi!.geometry as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
  });

  it('carries KML ExtendedData through as source attributes', async () => {
    const report = await importFiles([fileFrom('fields.kml', KML_DOC)]);
    const church = report.features.find((f) => f.sourceProps.name === 'Church Field');
    expect(church!.sourceProps).toMatchObject({
      Client: 'Bell Farms',
      Farm: 'Manor',
      name: 'Church Field',
    });
  });

  it('unzips a KMZ and parses the KML inside', async () => {
    const report = await importFiles([fileFrom('fields.kmz', await kmzFile())]);
    expect(report.errors).toEqual([]);
    expect(report.features).toHaveLength(2);
    expect(report.features[0].source).toBe('fields.kmz');
  });

  it('reports a KMZ with no KML inside', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('readme.txt', 'nothing here');
    const report = await importFiles([fileFrom('empty.kmz', await zip.generateAsync({ type: 'arraybuffer' }))]);
    expect(report.errors[0]).toContain('no .kml file found');
  });
});

describe('zipped shapefiles', () => {
  it('reprojects a UTM shapefile to WGS84 on import', async () => {
    const report = await importFiles([fileFrom('parcelles.zip', await utmShapefileZip())]);
    expect(report.errors).toEqual([]);
    expect(report.features).toHaveLength(1);
    const bbox = bboxOf(report.features[0].geometry);
    expect(isWgs84(bbox)).toBe(true);
    // The fixture was built from a square at 2.5E, 48.8N.
    expect(bbox[0]).toBeCloseTo(2.5, 4);
    expect(bbox[1]).toBeCloseTo(48.8, 4);
    expect(report.notes.join(' ')).toContain('reprojected from WGS_1984_UTM_Zone_31N');
  });

  it('keeps the attributes of a reprojected shapefile', async () => {
    const report = await importFiles([fileFrom('parcelles.zip', await utmShapefileZip())]);
    const columns = collectColumns(report.features.map((f) => f.sourceProps));
    expect(applyMapping(report.features[0].sourceProps, guessMapping(columns))).toEqual({
      client: 'Ferme SA',
      farm: 'Nord',
      field: 'Parcelle 1',
    });
  });

  it('reads a WGS84 zipped shapefile unchanged and says so', async () => {
    const report = await importFiles([fileFrom('plots.zip', await wgs84ShapefileZip())]);
    expect(report.features).toHaveLength(1);
    expect(bboxOf(report.features[0].geometry)[0]).toBeCloseTo(1.0, 6);
    expect(report.notes.join(' ')).toContain('already in WGS84');
  });

  it('reads loose .shp/.dbf/.prj files selected together as one layer', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await utmShapefileZip());
    const parts = await Promise.all(
      ['shp', 'shx', 'dbf', 'prj'].map(async (ext) =>
        fileFrom(`parcelles.${ext}`, await zip.file(`parcelles.${ext}`)!.async('arraybuffer')),
      ),
    );
    const report = await importFiles(parts);
    expect(report.errors).toEqual([]);
    expect(report.features).toHaveLength(1);
    expect(bboxOf(report.features[0].geometry)[0]).toBeCloseTo(2.5, 4);
    expect(report.notes.join(' ')).toContain('reprojected from WGS_1984_UTM_Zone_31N');
  });
});

describe('GeoJSON', () => {
  it('reads a plain WGS84 FeatureCollection', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { Name: 'Long Acre' }, geometry: poly([squareRing(3, 45, 0.01)]) },
      ],
    });
    const report = await importFiles([fileFrom('fields.geojson', geojson)]);
    expect(report.features).toHaveLength(1);
    expect(report.features[0].source).toBe('fields.geojson');
  });

  it('reprojects a GeoJSON that declares a projected CRS', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32631' } },
      features: [
        {
          type: 'Feature',
          properties: {},
          // A 100 m square near the UTM 31N false easting.
          geometry: poly([squareRing(460000, 5400000, 100)]),
        },
      ],
    });
    const report = await importFiles([fileFrom('utm.geojson', geojson)]);
    expect(report.errors).toEqual([]);
    expect(isWgs84(bboxOf(report.features[0].geometry))).toBe(true);
    expect(areaHa(report.features[0].geometry)).toBeCloseTo(1, 1);
    expect(report.notes.join(' ')).toContain('reprojected from EPSG:32631');
  });

  it('refuses projected coordinates that declare no CRS instead of misplacing them', async () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: poly([squareRing(460000, 5400000, 100)]),
    });
    const report = await importFiles([fileFrom('mystery.geojson', geojson)]);
    expect(report.features).toHaveLength(0);
    expect(report.errors[0]).toContain('outside the valid longitude/latitude range');
  });

  it('accepts a bare geometry object', async () => {
    const report = await importFiles([
      fileFrom('one.json', JSON.stringify(poly([squareRing(3, 45, 0.01)]))),
    ]);
    expect(report.features).toHaveLength(1);
  });
});

describe('mixed batches', () => {
  it('loads a KMZ, a UTM shapefile and a GeoJSON in one drop', async () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: poly([squareRing(3, 45, 0.01)]) }],
    });
    const report = await importFiles([
      fileFrom('a.kmz', await kmzFile()),
      fileFrom('b.zip', await utmShapefileZip()),
      fileFrom('c.geojson', geojson),
    ]);
    expect(report.errors).toEqual([]);
    expect(report.features).toHaveLength(4);
    expect(new Set(report.features.map((f) => f.source))).toEqual(
      new Set(['a.kmz', 'b.zip', 'c.geojson']),
    );
    for (const feature of report.features) {
      expect(isWgs84(bboxOf(feature.geometry))).toBe(true);
    }
  });

  it('reports a bad file without losing the good ones beside it', async () => {
    const report = await importFiles([
      fileFrom('broken.geojson', '{ not json'),
      fileFrom('good.kml', KML_DOC),
    ]);
    expect(report.features).toHaveLength(2);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('broken.geojson');
  });

  it('rejects an unsupported file type', async () => {
    const report = await importFiles([fileFrom('notes.txt', 'hello')]);
    expect(report.errors[0]).toContain('unsupported file type');
  });
});

/* -------------------------------------------------------------------------- */
/* Column mapping                                                              */
/* -------------------------------------------------------------------------- */

describe('choosing which column is which', () => {
  const props = [
    { organization: 'Acme Ltd', holding: 'Manor', parcel_ref: 'Long Acre', area_ha: 12.4 },
    { organization: 'Acme Ltd', holding: 'Manor', parcel_ref: 'Short Acre', area_ha: 8.1 },
    { organization: '', holding: 'Manor', parcel_ref: 'Church Piece', area_ha: 3 },
  ];

  it('lists every populated column with a sample and a fill count', () => {
    const columns = collectColumns(props);
    expect(columns.map((c) => c.key).sort()).toEqual([
      'area_ha',
      'holding',
      'organization',
      'parcel_ref',
    ]);
    const organization = columns.find((c) => c.key === 'organization')!;
    expect(organization.filled).toBe(2);
    expect(organization.sample).toBe('Acme Ltd');
  });

  it('drops columns that are empty everywhere, since they cannot fill anything', () => {
    const columns = collectColumns([{ note: '', keep: 'yes' }]);
    expect(columns.map((c) => c.key)).toEqual(['keep']);
  });

  it('guesses the obvious synonyms, including organization for client', () => {
    expect(guessMapping(collectColumns(props))).toEqual({
      client: 'organization',
      farm: 'holding',
      field: 'parcel_ref',
    });
  });

  it('leaves an attribute unguessed rather than pointing it at the wrong column', () => {
    const columns = collectColumns([{ grower: 'Acme', ref: 'A1' }]);
    expect(guessMapping(columns)).toEqual({ client: 'grower', farm: null, field: null });
  });

  it('never points two attributes at the same column', () => {
    // "name" matches the field hint; nothing else matches, so farm stays blank.
    const columns = collectColumns([{ name: 'Long Acre' }]);
    const mapping = guessMapping(columns);
    const used = [mapping.client, mapping.farm, mapping.field].filter((k) => k !== null);
    expect(new Set(used).size).toBe(used.length);
  });

  it('reads a feature through whatever mapping the user picked', () => {
    expect(
      applyMapping(props[0], { client: 'organization', farm: null, field: 'parcel_ref' }),
    ).toEqual({ client: 'Acme Ltd', farm: '', field: 'Long Acre' });
  });

  it('stringifies numbers, so a numeric field reference still carries across', () => {
    expect(applyMapping({ ref: 42 }, { client: null, farm: null, field: 'ref' }).field).toBe('42');
  });

  it('counts values that the 30-character column would shorten', () => {
    const columns = collectColumns([{ long: 'X'.repeat(31) }, { long: 'short' }]);
    expect(columns[0].tooLong).toBe(1);
  });
});
