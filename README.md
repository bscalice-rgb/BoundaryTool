# CropForce Boundary Prep

A browser tool for turning whatever field boundary files you were sent into a single
zipped shapefile that CropForce will accept.

Load KML, KMZ, zipped shapefiles and GeoJSON — as many at once as you like — group the
polygons into fields, clean them up against the boundary criteria, and export one merged
shapefile with one row per field.

## Everything stays on your machine

There is no backend. No server, no database, no serverless functions, no analytics, no
accounts. Vercel serves static files and nothing else.

Your files are read by JavaScript running in your tab. Parsing, reprojection, editing,
geometry operations, quality checks and the shapefile writer all run locally, and the
download is produced from an in-memory blob. Nothing is uploaded, and nothing is written
to `localStorage`, `sessionStorage`, cookies or IndexedDB — **refreshing the page
discards the workspace, by design**.

The only network traffic the app makes after loading is basemap tiles from Esri (and
OpenStreetMap if you switch to the street layer). There are no API keys, secrets or
environment variables anywhere in the project.

One caveat worth stating plainly: the **zoom to my location** button asks your browser
where you are, and your browser may consult its own location service to answer that —
which is a request the app neither makes nor sees. Your boundary data is never part of
it, and the position it returns stays in the tab. Don't press the button if you would
rather your browser not do that. Geolocation also needs a secure context, so it works on
`https://` and on `localhost`, and nowhere else.

Locating can take a while. The browser's permission prompt sits on screen waiting to be
clicked, and that wait counts against the request, so the button allows thirty seconds
and shows what it is waiting for rather than giving up early. On a laptop with no GPS the
answer comes from a network lookup that is slow rather than absent — asking it for high
accuracy is a good way to turn slow into impossible, so that is only tried when the first
attempt reports it genuinely cannot place the device.

Where it still cannot, there is a **go to coordinates** button beside it. Paste a latitude
and longitude, a `geo:` link, or a URL copied from Google Maps or OpenStreetMap, and the
map goes there. That parsing is local string handling, which is why a place *name* is not
accepted: looking one up would mean calling a geocoding service, and this tool does not
call anything.

## How it works

1. **Drop files.** Anything not already in WGS84 is reprojected on import. You then say
   which source column holds the Client, which the Farm and which the Field — whatever
   the file happens to call them, so a column named `organization` can feed Client. Any
   of the three can be left blank and filled in later. Each can also take a **second
   column** appended to the first, which is how an audit reference survives: a field
   called Bruno carrying ID 293 arrives as `Bruno (293)`, so the trace back to the
   source record is not lost the moment the boundary is exported.
2. **Group into fields.** A *field* is the CropForce unit: one row in the attribute
   table and one MultiPolygon in the export. It can be built from any number of
   polygons, from any number of source files, with holes cut into any of them. What
   counts as one field is always your decision — the tool never guesses. Two imported
   polygons that share a name are **not** merged: that is far more often two fields
   whose names collide than one field in two pieces, and the duplicate-name check puts
   the choice in front of you.
3. **Name in bulk where it helps.** Search the list by client, farm, field or source
   file, tick what you find, and set one Client or Farm name across all of it at once.
   Field names stay per-row, because each one names a different field.
4. **Work from the report.** The counts in the quality panel are buttons: click
   "2 blocking" to select every polygon behind those flags and frame them on the map,
   or click a single flag's title to go straight to that one.
5. **Clean and fix.** The quality panel checks each field and offers two routes for
   every flag: an automatic correction, or a manual one that selects the offending
   geometry and arms the right editing tool. Everything, auto-fixes included, is one
   Ctrl+Z away from being undone.
6. **Export.** One button produces one `.zip` containing `.shp`, `.shx`, `.dbf`, `.prj`
   and `.cpg`, in WGS84, with `Client`, `Farm` and `Field` as 30-character text columns.

## The data model

Two levels, deliberately kept apart:

| | What it is | Editable |
|---|---|---|
| **Feature** | one polygon or multipolygon, as imported or drawn | geometry |
| **Field** | the CropForce unit — a set of features you grouped, plus `Client` / `Farm` / `Field` | attributes and membership |

At export each field's member features are dissolved into a single MultiPolygon, so a
field made of four disjoint blocks across three source files still exports as exactly one
row. Features that belong to no field are not exported, and the quality panel says so.

## Quality checks

| Check | Blocks export | Auto-fix |
|---|---|---|
| Missing `Client` / `Farm` / `Field` | yes | none — jumps to the empty cell |
| Field with no polygons assigned | yes | none |
| Self-intersecting or invalid geometry | yes | un-kink and re-merge the outline |
| Two fields overlapping | yes | you pick which field keeps the shared area; it is clipped out of the other |
| Duplicate `Client`/`Farm`/`Field` | yes | number the surplus apart, or combine them if they are one field |
| A name longer than 30 characters | yes | trim at a word boundary, then keep the results distinct |
| Jagged, over-dense boundaries | no | simplify at a suggested tolerance, with preview |
| Non-crop area likely included | no | none — a heuristic hint, hand-corrected with the hole-cut tool |
| Slivers below 0.05 ha | no | delete |
| Season-specific field name | no | none — warning only |

Two of these checks are about the destination rather than the geometry.

Attributes are written as 30-character text columns, so a longer value is cut off when
the file is written — and two names cut at the same point become one row on upload. The
length check stops that happening silently; the auto-fix trims at a word boundary where
there is one close enough to the end to use, and then makes sure nothing has collided.

The duplicate check is the second:
CropForce identifies a field by its Client/Farm/Field combination, so uploading the same
combination twice replaces the first with the second and a boundary disappears without
warning. Case and extra spacing are treated as the same name, because they collide in
practice even where they do not today.

Each check carries a tooltip explaining the boundary criterion behind it — single
continuous management zone, crop area only, exclusion zones, smoothing, multi-polygon
fields, no overlaps, consistent naming — so the tool doubles as guidance.

## Editing tools

Draw, vertex edit, move, cut exclusion zones, split with a drawn line, merge, smooth with
a live preview, and delete. Optional snapping keeps neighbouring fields meeting exactly.
The map carries a zoom-to-my-location button and a go-to-coordinates button beside it,
for when the boundaries you have been sent are somewhere you need to find.

Satellite imagery is not equally detailed everywhere. Past the depth Esri has for a
given place it serves a grey "map data not yet available" tile, so the imagery layer
stops requesting new tiles at zoom 18 and enlarges real imagery beyond that instead of
showing you a blank grid. The street layer goes one level deeper where that helps.

Keyboard: `V` select, `E` vertices, `M` move, `D` draw, `H` cut hole, `S` split,
`G` smooth, `Del` delete selection, `Esc` back to select, `Ctrl/Cmd+Z` undo,
`Ctrl/Cmd+Shift+Z` redo.

## Supported input

- `.kml`
- `.kmz` (the archive is unzipped and the KML inside is read)
- `.zip` containing a shapefile bundle — reprojected from whatever the `.prj` declares
- a loose `.shp` / `.shx` / `.dbf` / `.prj` set, selected together
- `.geojson` / `.json`, including files declaring a projected CRS in the legacy `crs`
  member (common EPSG families are resolved offline; anything exotic is reported rather
  than silently misplaced)

One mapping is applied to a whole batch. If the files you are loading name their columns
differently from each other — one calls it `Field`, another `name` — import them
separately, or map what you can and fill the rest in from the table.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # static output in dist/
npm run preview    # serve the built output
npm test           # unit and integration tests
npm run test:e2e   # browser end-to-end tests (builds first, then drives Chromium)
npm run typecheck  # TypeScript, no emit
```

## Deploying

`vite build` writes a static site to `dist/`. On Vercel, import the repository and take
the defaults — `vercel.json` already sets the build command, the output directory and the
SPA rewrite. There are no environment variables to set, and no serverless functions are
created.

## Why the shapefile writer is hand-written

`src/lib/shapefile.ts` implements the ESRI shapefile format directly rather than calling
a library. The common JavaScript writers get three things wrong that CropForce is
unforgiving about: multi-part geometries with holes collapsing to a single ring, ring
winding order (shapefiles want outer rings clockwise, the opposite of GeoJSON), and a
missing or malformed `.prj`. Writing the format directly makes all three checkable, and
the tests round-trip real output back through a shapefile reader to prove it.

## Stack

Vite, React, TypeScript, Tailwind. Leaflet with Leaflet-Geoman for editing, Turf for
geometry, proj4 for reprojection, shpjs and @tmcw/togeojson for reading, JSZip for
archives. All of it runs in the browser.
