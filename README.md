# CropForce Boundary Prep

A browser tool for turning whatever field boundary files you were sent into a single
zipped shapefile that CropForce will accept.

Load KML, KMZ, GeoJSON and shapefiles — loose, or packed in a `.zip`, `.rar` or `.7z`,
as many at once as you like — group the polygons into fields, clean them up against the
boundary criteria, and export one merged shapefile with one row per field.

## Languages

English, Portuguese (Brazil) and Spanish (Latin America). The picker sits in the header;
a fresh tab starts in whichever of the three your browser asks for and falls back to
English. The choice is not remembered anywhere — this app stores nothing at all, and a
saved preference would be the first exception to that.

Everything the interface says is translated, including the quality flags and the notes
the file readers produce. Three words are deliberately left in English wherever they name
the exported column: `Client`, `Farm` and `Field` are what the shapefile header actually
says, and translating them would send someone looking for a column that does not exist.
Areas and other numbers are formatted for the chosen locale, so a hectare figure reads
`12,34` in Portuguese and `12.34` in English.

## Everything stays on your machine

There is no backend. No server, no database, no serverless functions, no analytics, no
accounts. Vercel serves static files and nothing else.

Your files are read by JavaScript running in your tab. Unpacking, parsing, reprojection,
editing, geometry operations, quality checks and the shapefile writer all run locally, and
the download is produced from an in-memory blob. Nothing is uploaded, and nothing is written
to `localStorage`, `sessionStorage`, cookies or IndexedDB — **refreshing the page
discards the workspace, by design**.

The only third-party traffic the app makes after loading is basemap tiles from Esri (and
OpenStreetMap if you switch to the street layer). The first `.rar` or `.7z` you open also
fetches the archive decoder, but that is a static asset of the app itself, served from the
same origin as its JavaScript — no different from the rest of the page loading. There are
no API keys, secrets or environment variables anywhere in the project.

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
attempt reports it genuinely cannot place the device. The request always goes out: the
Permissions API is consulted only to word the waiting message, never to decide whether
to ask, because a stale reading there is indistinguishable from a browser that refused.

A desktop fix is often accurate to tens of kilometres rather than tens of metres, so the
button says how good the answer was — *you are here, to within 40 m*, or *approximate
position only… this is the right district rather than the right field*. It also refuses
to zoom out past a district view: framing the accuracy circle, which is what a map
library will do by default, means a vague fix throws away the close-in view you already
had and shows you half a country.

The usual reason a desktop cannot be placed at all is that the **operating system's**
location service is off, not the browser's — Windows: Settings › Privacy & security ›
Location; macOS: System Settings › Privacy & Security › Location Services, with the
browser ticked. Sites that still find you when this one cannot are looking your IP
address up on their own servers. This tool will not do that: it would be a request
carrying your address to a third party, and the whole point here is that nothing leaves
the tab. So when the browser cannot answer, the failure says all of that and hands you
the **go to coordinates** box instead of leaving you at a dead end. Every message carries
the browser's own error code and wording, so a report of one is something anyone can
act on.

Where it still cannot, there is a **go to coordinates** button beside it. Paste a latitude
and longitude, a `geo:` link, or a URL copied from Google Maps or OpenStreetMap, and the
map goes there. That parsing is local string handling, which is why a place *name* is not
accepted: looking one up would mean calling a geocoding service, and this tool does not
call anything.

## How it works

1. **Drop files.** Anything not already in WGS84 is reprojected on import. Before
   anything is added you get the list of files with a tick each — a file whose name is
   already in the workspace starts **unticked**, because loading the same one twice is
   how a boundary usually ends up in the export in duplicate — and the first few rows of
   the source table, so a column called `f_2` or `NOME` can be identified by what is in
   it rather than by its name. You then say
   which source column holds the Client, which the Farm and which the Field — whatever
   the file happens to call them, so a column named `organization` can feed Client. Any
   of the three can be left blank and filled in later. Each can also take a **second
   column** appended to the first, which is how an audit reference survives: a field
   called Long Acre carrying ID 293 arrives as `Long Acre (293)`, so the trace back to
   the source record is not lost the moment the boundary is exported. The format menu
   shows each option applied to the first real pair of values in the file being
   imported, rather than to an invented example.
2. **Group into fields.** A *field* is the CropForce unit: one row in the attribute
   table and one MultiPolygon in the export. It can be built from any number of
   polygons, from any number of source files, with holes cut into any of them. What
   counts as one field is always your decision — the tool never guesses. Two imported
   polygons that share a name are **not** merged: that is far more often two fields
   whose names collide than one field in two pieces, and the duplicate-name check puts
   the choice in front of you.

   Drawing is the exception, because there the intent is not in doubt. **Draw field**
   arms the draw tool; the moment you close the outline it becomes a field, selected
   with the cursor already in its name box. The toolbar shows where the next polygon
   will land — *Draws into: a new field*, or a field you pick — so a field farmed in
   four blocks is drawn four times into the same row rather than assembled afterwards.
   Arming the tool while a field is being worked on aims at that field automatically.
3. **Name in bulk where it helps.** Search the list by client, farm, field or source
   file, tick what you find, and set one Client or Farm name across all of it at once.
   Field names stay per-row, because each one names a different field. The same ticks
   drive a **Delete fields** button, which asks once for the whole batch whether the
   polygons go too — named apart from the polygon selection's own Delete, because both
   bars can be on screen at the same time.
4. **Work from the report.** The two panels are one workflow rather than two lists
   side by side. The counts in the quality panel are buttons: click "2 blocking" to
   select every polygon behind those flags and frame them on the map, or click a single
   flag's title to go straight to that one. Going the other way, picking a field in the
   list — its red badge, or its "select polygons" button — narrows the quality panel to
   that field's issues, and says so with a banner you can clear. The filter row above
   the table uses the same three words as the panel opposite it: **Blocking** and
   **To review** name the same sets of fields as the two counts there. Below it, a
   **Problem** menu narrows the list to one kind of flag — and it is the *same* filter as
   the quality panel's chips, so picking "slivers" in either place narrows both. When the
   last flag of that kind is fixed the filter lets go by itself, rather than leaving two
   empty panels and no clue why.
5. **Clean and fix.** The quality panel checks each field and offers two routes for
   every flag: an automatic correction, or a manual one that selects the offending
   geometry and arms the right editing tool. Everything, auto-fixes included, is one
   Ctrl+Z away from being undone. Chips across the top filter the panel by the kind of
   problem, so forty slivers can be dealt with as one job rather than in amongst
   everything else — tick them (or tick the section header to take the lot) and
   **Auto-fix** or **Mark reviewed** applies to the whole batch. A bulk fix is a single
   history entry, so one Ctrl+Z puts all of it back. Overlaps go through in a batch too,
   settled by the rule that needs nobody — the larger field gives up the shared ground —
   and the run says how many it trimmed. Two copies of one boundary are the one thing a
   batch will not touch, because that ends in a field being deleted. Some things are not worth fixing, so the same ticks also carry
   **Delete N fields**: the fields those issues are about, gone with their polygons, on
   the same confirmation and the same single undo as the field list's own bulk delete. A warning you have looked at and are happy with can be
   marked reviewed: it drops out of the working list into a collapsed "reviewed" section,
   stops counting against the "To review" filter, and can be put back with **Un-review**.
   Reviewing is a note about what you have read rather than a change to the boundaries,
   so it sits outside the undo history — and if the geometry behind a reviewed warning
   changes, the flag comes back to be looked at again.
6. **Export.** One button produces one `.zip` containing `.shp`, `.shx`, `.dbf`, `.prj`
   and `.cpg`, in WGS84, with `Client`, `Farm` and `Field` as 30-character text columns.

## Getting out of your own way

The map is the part of this tool that benefits from every pixel it can get, so neither
side panel holds a fixed share of the window. Drag either splitter to resize, double-click
it to fold the panel away, or use the chevron in the panel's own header; a folded panel
leaves a rail behind carrying its name and its worst number, so nothing goes quiet just
because it is out of sight. The splitters take arrow keys as well as the mouse. Neither
panel is allowed to squeeze the map below a width it can still be worked in, and a window
narrowed under them pulls them in rather than leaving a sliver.

An empty Client, Farm or Field box is dashed and grey, not red. It is a box you have not
filled in yet — three red boxes per row on a freshly imported file is a tool shouting
about nothing. They turn red the first time you ask to export and are stopped, which is
when "empty" actually becomes "this is the problem".

The header carries one line about the next thing to do rather than a permanent
reassurance: *3 fields need attention before they can be exported*, then *All 4 fields
ready to export*. The privacy note it replaced is one hover away, in the info dot beside
it. Above the field table a bar fills in as fields become exportable, so a list of
complaints also says how close the end is.

Pointing at a flag lights up the boundary it is about, and highlights the row it belongs
to, without changing what is selected — selecting is a commitment, pointing is just
looking. It works in both directions. Zoom in past about a field's width and the map
labels each boundary with its field name and area, which is what makes a screen of thirty
similar-looking blocks navigable; the colours cycle through ten hues and then through
lightness, so thirty fields all have their own.

`?` opens the keyboard shortcuts. The undo and redo buttons have a third button beside
them listing recent actions, so a bulk fix that went wrong can be stepped back past in
one click rather than ten.

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
| Field with no polygons assigned | yes | delete the row — and several at once from the panel |
| Self-intersecting or invalid geometry | yes | un-kink and re-merge the outline |
| Two fields overlapping | yes | three routes: trim the larger, trim one you pick, or shrink both apart |
| The same boundary twice | yes | you pick which to keep; the other field and its polygons go |
| Duplicate `Client`/`Farm`/`Field` | yes | number the surplus apart, or combine them if they are one field |
| A name longer than 30 characters | yes | trim at a word boundary, then keep the results distinct |
| Accented or non-Latin characters | yes | rewrite in plain ASCII, then keep the results distinct |
| Jagged, over-dense boundaries | no | simplify at a suggested tolerance, with preview |
| Non-crop area likely included | no | none — a heuristic hint, hand-corrected with the hole-cut tool |
| Slivers below 0.05 ha | no | delete |
| Season-specific field name | no | none — warning only |

Three of these checks are about the destination rather than the geometry.

Attributes are written as 30-character text columns, so a longer value is cut off when
the file is written — and two names cut at the same point become one row on upload. The
length check stops that happening silently; the auto-fix trims at a word boundary where
there is one close enough to the end to use, and then makes sure nothing has collided.

Accents are the third. CropForce takes plain letters, numbers and basic punctuation, so
**Améca** has to arrive as *Ameca* and **Caiçara** as *Caicara*. Values read from a file
are folded on the way in — the import dialog's preview shows the folded form, so what you
approve is what lands — and the check catches anything typed in afterwards. Most of the
work is Unicode's: an accented letter decomposes into its base plus a combining mark and
the mark is dropped; letters that are not accented forms of anything (ß, æ, ø) are spelled
out by hand. Anything that survives neither — Cyrillic, CJK — is dropped rather than
guessed at, because no invented transliteration would be recognisable to the grower whose
field it is. Two names that differed only by an accent become one name once folded, so the
fix numbers them apart, exactly as the length fix does.

### Three ways out of an overlap

Fields must not overlap, but *why* two of them do decides what should happen. The
auto-fix offers three routes and defaults to the first:

**Trim the larger field.** The larger of the two gives up the shared ground and its
neighbour keeps every hectare it had. Losing half a hectare off a hundred barely moves
that field's total, while the same half hectare off its forty-hectare neighbour is a real
dent in what gets planted. Nobody has to decide anything, which is why this is also the
route a bulk **Auto-fix** takes on its own.

**Trim a field you pick.** The original route, for when you know which survey is the
right one. The chosen field keeps the shared area and the other is clipped back to it.

**Shrink both apart.** Where the two are really one fence line surveyed twice, making
either side pay the whole difference is arbitrary. This pulls both boundaries in by the
same amount and leaves a gap between them instead of a shared edge. The inset is not a
setting to guess at: the tool searches for the shallowest one that actually parts the two,
usually well under a metre each for an ordinary edge disagreement, and reports the inset,
the gap it opens and the hectares it costs before you commit. Only the polygons caught in
the overlap move — insetting the rest of a multi-polygon field would open gaps inside it
between members that were never in dispute. If nothing under 10 m of inset separates the
two, the route is refused: that is a real double-claim, not a disagreement about a fence,
and shaving ten metres off both fields would be the wrong answer to it.

There is a second kind of duplicate, about the geometry rather than the name: two fields
covering the same ground. Any shared area at all is an overlap, but once two fields share
90% or more of the smaller one they are almost certainly one field imported twice — the
same file loaded again, or the same block present in two of them. Clipping the shared area
out of one would leave a sliver rather than fix anything, so that pair gets its own flag
and its own fix: pick the one to keep, and the other field goes with its polygons.

The name duplicate check is the second:
CropForce identifies a field by its Client/Farm/Field combination, so uploading the same
combination twice replaces the first with the second and a boundary disappears without
warning. Case and extra spacing are treated as the same name, because they collide in
practice even where they do not today.

Each check carries a tooltip explaining the boundary criterion behind it — single
continuous management zone, crop area only, exclusion zones, smoothing, multi-polygon
fields, no overlaps, consistent naming — so the tool doubles as guidance.

## Speed

Typing in the attribute table with a few hundred polygons loaded used to block for about
29 ms a keystroke, which is enough to feel sticky. It is now about 12 ms. The work was
not where it looked: profiling found the season-name check compiling thirty regular
expressions per field per pass, the map's label pass rebuilding every tooltip because it
looked field names up with a linear scan per polygon, and the whole field table
re-rendering for one edit. So the crop words became one compiled alternation, names and
areas are looked up rather than searched, tooltips and polygon styles are only rewritten
where the text or style actually changed, and each table row skips re-rendering when
nothing about it moved. There is a benchmark in the repository history if the numbers
need checking again.

## Seeing the whole session

The field table is flat, because that is the shape editing wants. The tree icon in the
Fields header opens the same data in the shape CropForce files it: **Client → Farm →
Field**, with area and blocking counts totalled up each branch. It is how you check that a
client's whole holding arrived, and that nothing is sitting under a farm that should not
exist — a typo in a Farm name is invisible in a sorted list of ninety rows and obvious as
a branch with one field hanging off it. Groups nobody has named yet sort to the bottom and
say they are empty rather than showing blank. Picking a field closes the tree and puts that
field in front of both panels; **Copy as text** puts the indented outline on the clipboard
for a mail or a ticket.

## Editing tools

Draw, vertex edit, move, cut exclusion zones, split with a drawn line, merge, smooth with
a live preview, and delete.

**Snapping** is the checkbox under the toolbar. While you are drawing or dragging a
vertex, a point that comes within about 18 pixels of an existing boundary jumps onto it
exactly, so two neighbouring fields share an edge instead of leaving a hairline gap or a
sliver of overlap between them — which is what the overlap check would otherwise flag. It
does nothing at all when you are not drawing or editing, and it can be turned off when you
want a vertex to land exactly where you put it.
The map carries a zoom-to-my-location button and a go-to-coordinates button beside it,
for when the boundaries you have been sent are somewhere you need to find.

Satellite imagery is not equally detailed everywhere. Past the depth Esri has for a
given place it serves a grey "map data not yet available" tile, so the imagery layer
stops requesting new tiles at zoom 18 and enlarges real imagery beyond that instead of
showing you a blank grid. The street layer goes one level deeper where that helps.

Keyboard: `V` select, `E` vertices, `M` move, `D` draw, `H` cut hole, `S` split,
`G` smooth, `Del` delete selection, `Esc` back to select, `Ctrl/Cmd+Z` undo,
`Ctrl/Cmd+Shift+Z` redo, `?` for this list in the app.

## Supported input

- `.kml`
- `.kmz` (the archive is unzipped and the KML inside is read)
- `.zip` containing a shapefile bundle — reprojected from whatever the `.prj` declares
- a loose `.shp` / `.shx` / `.dbf` / `.prj` set, selected together
- `.geojson` / `.json`, including files declaring a projected CRS in the legacy `crs`
  member (common EPSG families are resolved offline; anything exotic is reported rather
  than silently misplaced)
- `.rar` and `.7z`, unpacked in the browser — see below

### Archives

A `.zip`, `.rar` or `.7z` is opened and its members are read exactly as if you had
dropped them yourself, so a shapefile set inside a folder inside an archive works without
you having to unpack anything first. Each member is listed in the import dialog under the
archive it came from — `talhoes.rar › talhoes/talhoes.shp` — which is how two files with
the same name in different archives stay separable, and how the source column stays
traceable afterwards.

Only members the tool can read are decompressed; a folder of aerial imagery sitting next
to the boundaries costs nothing to skip past. An archive inside an archive is followed two
levels down and no further. Password-protected archives are refused rather than half-read:
unpack those yourself and load the files.

`.rar` and `.7z` are decoded by [libarchive](https://libarchive.org) compiled to
WebAssembly. The 600 KB decoder is served with the app and fetched the first time one of
those files is actually opened, so nobody who only ever loads a KML pays for it. Like
everything else here it runs in your browser — no file is uploaded to unpack it.

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

Interface text lives in `src/i18n`. `en.ts` is the canonical table and every other
language is typed against it, so a missing or misspelled key is a compile error rather
than an English word appearing unannounced in the middle of a translated screen; a test
checks that the tables agree on their keys and on the placeholders inside each string.
