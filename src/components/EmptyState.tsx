import { Button } from './ui';

const STEPS = [
  {
    title: 'Drop your files',
    body:
      'KML, KMZ, zipped shapefiles and GeoJSON, as many at once as you like. Anything not ' +
      'already in WGS84 is reprojected on the way in.',
  },
  {
    title: 'Group into fields',
    body:
      'A field is whatever set of polygons you decide belongs together. Select them, combine ' +
      'them into one field, and give it a Client, Farm and Field name.',
  },
  {
    title: 'Clean and fix flags',
    body:
      'The quality panel checks each field against the boundary criteria. Every flag offers ' +
      'an automatic fix and a manual route, and everything is undoable.',
  },
  {
    title: 'Export one file',
    body:
      'A single zipped shapefile with one row per field, ready to upload to CropForce.',
  },
];

export default function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-xl font-semibold text-ink-100">Prepare field boundaries for CropForce</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          Load boundary files from anywhere, group them into fields, clean them up against the
          boundary criteria, and export one merged shapefile. Everything happens in this browser
          tab.
        </p>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-lg border border-ink-800 bg-ink-900 p-3.5"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-crop-500/15
                  text-[11px] font-semibold text-crop-300">
                  {index + 1}
                </span>
                <h2 className="text-xs font-semibold text-ink-100">{step.title}</h2>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg border border-dashed border-ink-700 bg-ink-900/50 p-6 text-center">
          <p className="text-xs text-ink-300">
            Drop files anywhere on this window to begin.
          </p>
          <Button tone="primary" onClick={onBrowse} className="mt-3">
            Choose files
          </Button>
          <p className="mt-3 text-[10px] text-ink-500">
            .kml · .kmz · .zip (shapefile) · .geojson · .json · or a loose .shp/.shx/.dbf/.prj set
          </p>
        </div>
      </div>
    </div>
  );
}
