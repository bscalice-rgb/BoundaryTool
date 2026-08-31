/**
 * The canonical string table. Every other language is typed against this one, so a
 * missing or misspelled key is a compile error rather than an English word appearing
 * unannounced in the middle of a translated screen.
 *
 * Placeholders are `{name}` and are substituted at render time. Anything that varies
 * with a count is spelled out as separate `.one` / `.other` keys rather than assembled
 * from fragments, because the word order around a number is not the same in every
 * language.
 */
export const en = {
  'app.title': 'CropForce Boundary Prep',
  'app.privacy': 'Files are processed only in your browser. Nothing is uploaded or stored.',
  'app.privacyTooltip':
    'No server, no database, no analytics. Refreshing this page discards everything.',
  'app.addFiles': 'Add files',
  'app.clear': 'Clear',
  'app.clearConfirm': 'Discard everything in the workspace? This cannot be undone.',
  'app.reading': 'Reading files…',
  'app.undo': 'Undo: {label} (Ctrl+Z)',
  'app.undoEmpty': 'Nothing to undo (Ctrl+Z)',
  'app.redo': 'Redo: {label} (Ctrl+Shift+Z)',
  'app.redoEmpty': 'Nothing to redo (Ctrl+Shift+Z)',
  'app.language': 'Language',

  'empty.heading': 'Prepare field boundaries for CropForce',
  'empty.intro':
    'Load boundary files from anywhere, group them into fields, clean them up against the ' +
    'boundary criteria, and export one merged shapefile. Everything happens in this browser tab.',
  'empty.step1.title': 'Drop your files',
  'empty.step1.body':
    'KML, KMZ, zipped shapefiles and GeoJSON, as many at once as you like. Anything not ' +
    'already in WGS84 is reprojected on the way in.',
  'empty.step2.title': 'Group into fields',
  'empty.step2.body': 'A field is whatever set of polygons you decide belongs together. Draw one and it becomes a field as soon as you close it; group imported ones by selecting them and combining them into a field. Then give it a Client, Farm and Field name.',
  'empty.step3.title': 'Clean and fix flags',
  'empty.step3.body':
    'The quality panel checks each field against the boundary criteria. Every flag offers ' +
    'an automatic fix and a manual route, and everything is undoable.',
  'empty.step4.title': 'Export one file',
  'empty.step4.body':
    'A single zipped shapefile with one row per field, ready to upload to CropForce.',
  'empty.dropHere': 'Drop files anywhere on this window to begin.',
  'empty.choose': 'Choose files',
  'empty.formats':
    '.kml · .kmz · .geojson · .json · .zip / .rar / .7z · or a loose .shp/.shx/.dbf/.prj set',
  'empty.dropOverlay': 'Drop boundary files to load them',

  'tool.select': 'Select',
  'tool.select.hint': 'Click a polygon to select it. Shift-click to add to the selection.',
  'tool.edit': 'Vertices',
  'tool.edit.hint':
    'Drag a vertex to move it, click the midpoint markers to add one, right-click a vertex to delete it.',
  'tool.move': 'Move',
  'tool.move.hint': 'Drag the whole polygon without changing its shape.',
  'tool.draw': 'Draw',
  'tool.draw.hint':
    'Click to place each vertex, then double-click or click the first vertex again to close the polygon.',
  'tool.cutHole': 'Cut hole',
  'tool.cutHole.hint':
    'Draw around an area to exclude it — a tree island, a track, a watercourse, a turbine ' +
    'pad. Double-click to close the shape; anything it covers is cut out of the polygons ' +
    'underneath, or out of the selected polygons only when there is a selection.',
  'tool.split': 'Split',
  'tool.split.hint':
    'Draw a line across the selected polygon to cut it in two. Double-click to finish the line.',
  'tool.simplify': 'Smooth',
  'tool.simplify.hint': 'Reduce vertex noise with a live preview before anything is committed.',

  'toolbar.merge': 'Merge selected polygons',
  'toolbar.mergeHint':
    'Merge the selected polygons into one (they should be adjacent or overlapping)',
  'toolbar.delete': 'Delete selected polygons',
  'toolbar.deleteHint': 'Delete the selected polygons (Del)',
  'toolbar.snapping': 'Snapping',
  'toolbar.snappingHint':
    'While you draw or drag a vertex, it jumps to any nearby boundary point so neighbouring ' +
    'fields meet exactly instead of leaving a hairline gap or overlap. It does nothing when ' +
    'you are not drawing or editing.',
  'toolbar.imagery': 'Imagery',
  'toolbar.imageryHint': 'Esri World Imagery — the layer to trace boundaries against',
  'toolbar.street': 'Street',
  'toolbar.streetHint': 'OpenStreetMap — roads and place names for context',
  'toolbar.nothingSelected': 'Nothing selected',
  'toolbar.selected': '{count} selected · {area} ha',

  'map.locate': 'Zoom to my location',
  'map.locateHint':
    'Zoom to my location. Your browser asks you for permission first, and may consult its ' +
    'own location service to answer. Your boundary data is never part of that.',
  'map.coordinates': 'Go to coordinates',
  'map.coordinatesHint': 'Jump to a latitude and longitude, or a map link you have pasted',
  'map.locating': 'Asking your browser where you are…',
  'map.locatingPrompt': 'Your browser is asking whether to share your location — choose Allow.',
  'map.locatingPrecise': 'Trying again with a more precise fix…',
  'map.error.unsupported': 'Could not get your location: this browser does not support geolocation.',
  'map.error.insecure':
    'Could not get your location: browsers only allow it over https:// or on localhost.',
  'map.error.blocked':
    'Could not get your location: this site is blocked from using it. Click the icon at the ' +
    'left of the address bar, set Location to Allow, then try again.',
  'map.error.denied':
    'Could not get your location: the browser blocked it. Allow location access for this ' +
    'site in the address bar, then try again.',
  'map.error.timeout':
    'Could not get your location: the browser did not answer in time. If it asked for ' +
    'permission, accept the prompt and press the button again — the wait counts against ' +
    'the request.',
  'map.error.unavailable': "Could not get your location: the browser's location service could not place this device. On a desktop that usually means the operating system's location is switched off — Windows: Settings › Privacy & security › Location. macOS: System Settings › Privacy & Security › Location Services, with Chrome ticked. Sites that still find you are looking up your IP on their own servers, which this tool does not do.",

  'status.empty': 'Drop boundary files anywhere to begin',
  'status.group.one': '1 polygon waiting to be grouped into a field',
  'status.group.other': '{count} polygons waiting to be grouped into fields',
  'status.blocked.one': '1 field needs attention before it can be exported',
  'status.blocked.other': '{count} fields need attention before they can be exported',
  'status.ready.one': '1 field ready to export',
  'status.ready.other': 'All {count} fields ready to export',
  'fields.progress': '{ready} of {total} ready',
  'fields.progressLabel': 'Fields ready to export',
  'panel.hideFields': 'Hide the field list',
  'panel.showFields': 'Show the field list',
  'panel.hideChecks': 'Hide the quality panel',
  'panel.showChecks': 'Show the quality panel',
  'panel.resizeFields': 'Drag to resize the field list',
  'panel.resizeChecks': 'Drag to resize the quality panel',
  'shortcuts.title': 'Keyboard shortcuts',
  'shortcuts.open': 'Keyboard shortcuts',
  'shortcuts.tools': 'Tools',
  'shortcuts.actions': 'Actions',
  'shortcuts.deleteSelection': 'Delete the selection',
  'shortcuts.backToSelect': 'Cancel — back to Select',
  'shortcuts.help': 'Show this list',
  'shortcuts.note': 'Shortcuts are off while you are typing in a box.',
  'history.title': 'Recent actions',
  'history.open': 'Recent actions',
  'history.now': 'Now',
  'history.jumpBack': 'Undo back to here',
  'history.jumpForward': 'Redo up to here',
  'history.empty': 'Nothing done yet.',

  'toolbar.drawInto': 'Draws into',
  'toolbar.drawIntoNew': 'A new field',
  'toolbar.drawIntoHint': 'Where the next polygon you draw will land. Pick a field to add another block to it.',
  'tool.draw.hintNew': 'Click to place each vertex, then double-click to close. The polygon becomes a new field, ready to name.',
  'tool.draw.hintField': 'Click to place each vertex, then double-click to close. The polygon joins {field}.',
  'toast.drewNewField': 'New field drawn. Name it to make it exportable.',
  'toast.drewIntoField': 'Added a polygon to {field}.',
  'action.drawField': 'Draw a field',
  'action.drawIntoField': 'Draw into {field}',

  'map.error.diagnostic': ' The browser reported code {code}: {message}',
  'map.located': 'You are here, to within {accuracy}.',
  'map.locatedCoarse': 'Approximate position only: your browser placed you to within {accuracy}, so this is the right district rather than the right field. Pan from here.',

  'flag.nonAscii.title': '{field} — characters CropForce will not take',
  'flag.nonAscii.detail.one': '{columns} contains {characters}. CropForce accepts plain letters and numbers only. Auto-fix writes it as “{example}”.',
  'flag.nonAscii.detail.other': '{columns} contain {characters}. CropForce accepts plain letters and numbers only. Auto-fix writes the first as “{example}”.',
  'guidance.non-ascii': 'Accented and non-Latin characters do not survive the upload: CropForce takes plain letters, numbers and basic punctuation. Améca has to arrive as Ameca and Caiçara as Caicara. Names read from a file are folded on the way in; this catches the ones typed in afterwards. Two names that differed only by an accent become the same name once folded, so the fix numbers them apart if that happens.',
  'category.non-ascii': 'Accents',
  'fix.asciified.one': 'Rewrote 1 name without accents.',
  'fix.asciified.other': 'Rewrote {count} names without accents.',
  'fix.alreadyPlain': 'Every name is already plain.',
  'tree.open': 'Client / Farm / Field overview',
  'tree.title': 'Client / Farm / Field',
  'tree.intro': 'Everything in this session, in the order CropForce files it. Pick any row to work on it.',
  'tree.empty': 'Nothing loaded yet.',
  'tree.noClient': '(no client)',
  'tree.noFarm': '(no farm)',
  'tree.noField': '(unnamed field)',
  'tree.counts.one': '1 field',
  'tree.counts.other': '{count} fields',
  'tree.farms.one': '1 farm',
  'tree.farms.other': '{count} farms',
  'tree.ungrouped.one': '1 polygon not in any field',
  'tree.ungrouped.other': '{count} polygons not in any field',
  'tree.blocking': '{count} blocking',
  'tree.expandAll': 'Expand all',
  'tree.collapseAll': 'Collapse all',
  'tree.copy': 'Copy as text',
  'tree.copied': 'Overview copied to the clipboard.',

  'import.chooseFiles': 'Which files?',
  'import.chooseHelp': 'Untick anything you do not want. Files whose name is already in the workspace start unticked, because loading one twice is the usual way a boundary ends up duplicated.',
  'import.alreadyLoaded': 'already loaded',
  'import.selectFile': 'Include {file}',
  'import.selectAllFiles': 'Include every file',
  'import.noneChosen': 'No files ticked.',
  'import.preview': 'What is in the files',
  'import.previewHelp': 'The first few rows, as they were read. Mapped columns are highlighted.',
  'import.previewMore': 'and {count} more rows',
  'flag.duplicateGeometry.title': '{a} and {b} are the same boundary',
  'flag.duplicateGeometry.detail': 'They share {percent}% of the smaller one ({area} ha). That is usually the same field loaded twice. Auto-fix keeps the one you pick and deletes the other.',
  'guidance.duplicate-geometry': 'Two fields covering the same ground is almost always one field imported twice — a file loaded again, or the same block present in two of them. Uploading both double-counts the area and leaves two rows competing for the same place. Keep whichever has the better name and geometry and delete the other; if they really are two neighbouring fields that merely overlap, fix the overlap instead.',
  'category.duplicate-geometry': 'Same boundary twice',
  'overlap.duplicateTitle': 'Keep one of two identical boundaries',
  'overlap.duplicateIntro': 'These two cover the same ground. Choose the one to keep — the other field and its polygons are deleted. Ctrl+Z brings it back.',
  'overlap.duplicateConfirm': 'Delete the other field',
  'overlap.duplicateLoses': '{field} will be deleted, polygons and all.',
  'fix.duplicateDeleted': 'Deleted {field}.',
  'fix.deletedFields.one': 'Deleted 1 empty field.',
  'fix.deletedFields.other': 'Deleted {count} empty fields.',

  'bulk.delete': 'Delete fields',
  'bulk.deleteHint': 'Delete every ticked field',
  'bulk.deleteConfirm.one': 'Delete 1 field and its polygons?\n\nOK deletes both. Cancel keeps the polygons and only removes the field row.',
  'bulk.deleteConfirm.other': 'Delete {count} fields and their polygons?\n\nOK deletes both. Cancel keeps the polygons and only removes the field rows.',
  'toast.bulkDeleted.one': 'Deleted 1 field.',
  'toast.bulkDeleted.other': 'Deleted {count} fields.',
  'action.deleteFields': 'Delete {count} fields',

  'filter.issueLabel': 'Problem',
  'filter.anyIssue': 'Any problem',
  'filter.issueHint': 'Show only fields carrying this kind of flag. The quality panel narrows with it, so the two lists stay about the same thing.',
  'qa.bulkDelete': 'Delete {count} fields',
  'qa.bulkDeleteHint': 'Delete the fields these issues are about',

  'fields.title': 'Fields',
  'fields.new': 'Draw field',
  'fields.newHint': 'Draw a boundary on the map; it becomes a new field the moment you close it',
  'fields.attributeGuidance':
    'Client, Farm and Field are the only attributes CropForce reads, and they are how a ' +
    'boundary is matched to the right grower and holding. Keep the spelling identical ' +
    'across every field belonging to the same client and farm.',
  'fields.attributeLabel': 'Client / Farm / Field',
  'fields.empty':
    'Nothing loaded yet. Drop boundary files anywhere on the window, or draw a polygon with ' +
    'the map toolbar.',
  'fields.search': 'Search client, farm, field or file',
  'fields.searchLabel': 'Search fields',
  'fields.clearSearch': 'Clear search',
  'fields.zoomMatches': 'Zoom to matching fields',
  'fields.zoomMatchesHint': 'Zoom the map to the matching fields',
  'fields.zoom': 'Zoom',
  'fields.noMatches': 'Nothing matches “{search}”.',
  'fields.matchCount': '{shown} of {total} fields',
  'fields.hiddenCount': '{count} hidden',
  'fields.ungroupedCount': '{shown} of {total} ungrouped',
  'fields.shownOf': '{shown} shown of {total}',
  'fields.toExport.one': '1 field to export',
  'fields.toExport.other': '{count} fields to export',
  'fields.client': 'Client',
  'fields.farm': 'Farm',
  'fields.field': 'Field',
  'fields.fieldPlaceholder': 'Field name',
  'fields.ha': 'ha',
  'fields.selectAllFields': 'Select all fields',
  'fields.selectAllFieldsHint': 'Select every field for bulk editing',
  'fields.selectForBulk': 'Select {name} for bulk editing',
  'fields.selectMembers': "Select this field's polygons",
  'fields.zoomToField': 'Zoom to field',
  'fields.zoomToPolygon': 'Zoom to polygon',
  'fields.blockingBadge.one': '1 issue blocking export',
  'fields.blockingBadge.other': '{count} issues blocking export',
  'fields.polygonCount.one': '1 polygon',
  'fields.polygonCount.other': '{count} polygons',
  'fields.noMembers':
    'No polygons assigned. Select polygons on the map and add them to this field.',
  'fields.ungroup': 'Ungroup',
  'fields.ungroupHint': 'Release the polygons and remove the field row',
  'fields.deleteField': 'Delete field',
  'fields.deleteFieldHint': 'Delete the field and its polygons',
  'fields.deleteFieldConfirm':
    'Delete this field and its polygons?\n\nOK deletes both. Cancel keeps the polygons and ' +
    'only removes the field row.',

  'fields.showIssues': 'Show the issues on {name}',

  'filter.all': 'All',
  'filter.allHint': 'Every field',
  'filter.blocking': 'Blocking',
  'filter.blockingHint': 'Fields that cannot be exported as they are',
  'filter.review': 'To review',
  'filter.reviewHint': 'Fields with warnings you have not marked reviewed',
  'filter.clean': 'Clean',
  'filter.cleanHint': 'Fields with nothing outstanding',

  'ungrouped.title': 'Ungrouped polygons',
  'ungrouped.selectAll': 'Select all',

  'selection.count.one': '1 polygon selected',
  'selection.count.other': '{count} polygons selected',
  'selection.zoom': 'Zoom to selection',
  'selection.combine': 'Combine into one field',
  'selection.moveTo': 'Move to field…',
  'selection.moveToLabel': 'Move selection to a field',
  'selection.ungroupOption': 'Ungroup (no field)',
  'selection.untitled': 'Untitled field',
  'selection.merge': 'Merge',
  'selection.mergeHint': 'Dissolve the selected polygons into a single polygon',
  'selection.delete': 'Delete',
  'selection.deleteHint': 'Delete the selected polygons',

  'bulk.ticked.one': '1 field ticked',
  'bulk.ticked.other': '{count} fields ticked',
  'bulk.label': 'Bulk naming',
  'bulk.guidance':
    'Set the same Client or Farm across every ticked field in one go. A box left empty is ' +
    'not applied, so you can set the Client without touching the Farm names already there. ' +
    'Field names stay per-row, because each one names a different field.',
  'bulk.clear': 'Clear ticks',
  'bulk.clientPlaceholder': 'Client for all',
  'bulk.clientLabel': 'Client for all ticked fields',
  'bulk.farmPlaceholder': 'Farm for all',
  'bulk.farmLabel': 'Farm for all ticked fields',
  'bulk.apply': 'Apply',

  'qa.title': 'Quality checks',
  'qa.criteriaLabel': 'What makes a good field boundary',
  'qa.criteria':
    'A boundary should cover a single continuous management zone, contain crop area only, ' +
    'exclude tracks, watercourses, turbines and tree islands, carry smoothed edges, group ' +
    'multiple blocks farmed as one unit into one field, never overlap a neighbouring field, ' +
    'and use consistent Client / Farm / Field naming.',
  'qa.blockingCount': '{count} blocking',
  'qa.reviewCount': '{count} to review',
  'qa.selectHint': 'Select these polygons and frame them on the map',
  'qa.selectAllFlagged': 'Select all flagged',
  'qa.selectAllFlaggedHint':
    'Select every polygon that has a flag against it, and frame them on the map',
  'qa.export': 'Export merged shapefile for CropForce',
  'qa.readyNone': 'Group some polygons into fields to enable the export.',
  'qa.ready.one': '1 field ready. Warnings do not block the export.',
  'qa.ready.other': '{count} fields ready. Warnings do not block the export.',
  'qa.blocked': 'Blocking issues must be resolved before the file can be written.',
  'qa.noIssues': 'No issues found. Checks re-run automatically after every edit.',
  'qa.sectionBlocking': 'Blocking export',
  'qa.sectionWarnings': 'Worth reviewing',
  'qa.sectionReviewed': '{count} reviewed',
  'qa.autoFix': 'Auto-fix',
  'qa.autoFixHint': 'Apply the programmatic correction — undo with Ctrl+Z if it is wrong',
  'qa.noAutoFix': 'No auto-fix',
  'qa.noAutoFixHint':
    'This one needs a human eye — there is no correction that is right often enough to ' +
    'apply automatically.',
  'qa.fixManually': 'Fix manually',
  'qa.markReviewed': 'Mark reviewed',
  'qa.markReviewedHint': 'You have looked at this and it is fine — drop it off the list',
  'qa.unreview': 'Un-review',
  'qa.unreviewHint': 'Put this back on the list of things to look at',
  'qa.selectFlagHint': "Select this field's polygons and frame them on the map",

  'qa.scope.one': 'Showing 1 selected field',
  'qa.scope.other': 'Showing {count} selected fields',
  'qa.scopeClear': 'Show all fields',
  'qa.scopeEmpty': 'Nothing is flagged on the fields you have selected.',
  'qa.categoryAll': 'All',
  'qa.categoryLabel': 'Filter by problem',
  'qa.selectForBulk': 'Select this issue for a bulk action',
  'qa.selectAllShown': 'Select every issue shown',
  'qa.bulkSelected.one': '1 issue selected',
  'qa.bulkSelected.other': '{count} issues selected',
  'qa.bulkAutoFix': 'Auto-fix {count}',
  'qa.bulkAutoFixHint': 'Apply every automatic correction at once — one Ctrl+Z undoes the lot',
  'qa.bulkReview': 'Mark {count} reviewed',
  'qa.bulkReviewHint': 'Drop every selected warning off the list',
  'qa.bulkClear': 'Clear',
  'category.missing-attributes': 'Missing names',
  'category.invalid-geometry': 'Invalid geometry',
  'category.overlap': 'Overlaps',
  'category.jagged-edges': 'Jagged edges',
  'category.non-crop-area': 'Non-crop area',
  'category.sliver': 'Slivers',
  'category.naming': 'Season names',
  'category.unassigned': 'Ungrouped',
  'category.empty-field': 'Empty fields',
  'category.duplicate-name': 'Duplicate names',
  'category.name-too-long': 'Names too long',

  'flag.missing.title.other': '{field} — {count} attributes missing',
  'flag.missing.title.one': '{field} — 1 attribute missing',
  'flag.missing.detail.one': '{columns} is empty. All three are required before export.',
  'flag.missing.detail.other': '{columns} are empty. All three are required before export.',
  'flag.empty.title': '{field} — no polygons assigned',
  'flag.empty.detail': 'This field would export as a row with no geometry.',
  'flag.naming.title': '{field} — name looks season-specific',
  'flag.naming.year':
    '“{name}” contains the year {year}. Field names should stay the same from season to season.',
  'flag.naming.crop':
    '“{name}” contains the crop name “{crop}”. Name the place, not what is growing in it this year.',
  'flag.unassigned.title.one': '1 polygon not assigned to a field',
  'flag.unassigned.title.other': '{count} polygons not assigned to a field',
  'flag.unassigned.detail':
    'These will not be exported. Select them and use “Combine into field”, or delete them ' +
    'if they are not needed.',
  'flag.invalid.title': '{feature} — invalid geometry',
  'flag.invalid.detail': 'The outline has {reason}.',
  'flag.invalid.noRings': 'geometry has no rings',
  'flag.invalid.shortRing': 'a ring with fewer than 3 distinct points',
  'flag.invalid.notClosed': 'a ring that is not closed',
  'flag.invalid.kinks.one': '1 self-intersection (bow-tie)',
  'flag.invalid.kinks.other': '{count} self-intersections (bow-tie)',
  'flag.sliver.title': '{feature} — sliver ({area} ha)',
  'flag.sliver.detail':
    'Smaller than the {threshold} ha threshold, so this is probably a digitising fragment ' +
    'rather than a management zone.',
  'flag.jagged.title': '{feature} — jagged edges ({count} vertices)',
  'flag.jagged.detail':
    'Vertices sit about {spacing} m apart over {perimeter} m of boundary — {density} per ' +
    'hectare. Suggested smoothing tolerance: {tolerance} m.',
  'flag.noncrop.title': '{feature} — possible non-crop area included',
  'flag.noncrop.detail':
    'About {percent}% of the area sits in strips narrower than {width} m, which is the ' +
    'shape a track, watercourse or headland buffer makes. Check it against the imagery — ' +
    'this is a hint, not a verdict.',
  'flag.overlap.title': '{a} overlaps {b}',
  'flag.overlap.detail': 'They share {area} ha ({squareMetres} m²).',
  'flag.duplicate.title': '{count} fields share the name {field}',
  'flag.duplicate.detail':
    '{combination} is used {count} times. CropForce would keep only the last one uploaded ' +
    'and drop the rest. Auto-fix numbers them apart; if they are one field in several ' +
    'blocks, select them and combine them instead.',
  'flag.tooLong.title': '{field} — name too long for the column',
  'flag.tooLong.detail.one':
    '{columns} exceeds the {limit}-character limit and would be cut off on export. Auto-fix ' +
    'trims at a word boundary and keeps every name distinct.',
  'flag.tooLong.detail.other':
    '{columns} exceed the {limit}-character limit and would be cut off on export. Auto-fix ' +
    'trims at a word boundary and keeps every name distinct.',
  'flag.untitled': 'Untitled field',
  'flag.polygon': 'Polygon',

  'guidance.missing-attributes':
    'Every field needs a consistent Client, Farm and Field name. These three values are the ' +
    'only attributes CropForce reads, and they are how the boundary is matched to the right ' +
    'grower and holding.',
  'guidance.invalid-geometry':
    'A boundary must be a single continuous management zone with a clean outline. ' +
    'Self-intersecting "bow-tie" rings have no well-defined inside, so area and overlap ' +
    'calculations cannot be trusted.',
  'guidance.overlap':
    'Fields must not overlap. Overlapping boundaries double-count area and make it ambiguous ' +
    'which field an observation belongs to. Neighbouring fields should be conjoined — ' +
    'sharing an edge, not sharing area.',
  'guidance.jagged-edges':
    'Boundaries should be smoothed. Jagged edges usually come from tracing raster imagery or ' +
    'from raw GPS logs; they add noise without adding accuracy.',
  'guidance.non-crop-area':
    'A boundary should contain crop area only. Roads, tracks, waterways, headland buffers, ' +
    'wind turbines and tree islands belong outside the boundary or inside an exclusion zone ' +
    'cut into it.',
  'guidance.sliver':
    'Stray fragments left over from digitising or from a bad clip are not management zones. ' +
    'Remove them so each field is the area actually farmed.',
  'guidance.naming':
    'Field names should identify the place, not the season. A name carrying a crop or a year ' +
    'has to be renamed every time the rotation changes, which breaks year-on-year comparison.',
  'guidance.unassigned':
    'Only polygons grouped into a field are exported. A field is whatever set of polygons you ' +
    'decide belongs together — several disjoint blocks farmed as one unit should be one ' +
    'field, not several.',
  'guidance.empty-field':
    'A field row needs geometry. Assign at least one polygon to it, or delete the field.',
  'guidance.duplicate-name':
    'CropForce identifies a field by its Client, Farm and Field combination, so that ' +
    'combination has to be unique. Upload two rows with the same one and the second replaces ' +
    'the first: a boundary goes missing without any warning. Either rename them so each is ' +
    'distinct, or — if they really are one field farmed in separate blocks — combine them ' +
    'into a single field with one name.',
  'guidance.name-too-long':
    'Client, Farm and Field are written as 30-character text columns. Anything longer is cut ' +
    'off when the file is written, and a name that has been cut off can collide with another ' +
    'that was cut off at the same point — so two fields become one on upload. Shorten them ' +
    'here, where you can see what you are losing.',

  'label.consistentNaming': 'Consistent naming',
  'label.singleZone': 'Single continuous zone',
  'label.noOverlaps': 'No overlaps',
  'label.smoothing': 'Smoothing',
  'label.cropOnly': 'Crop area only',
  'label.multiPolygon': 'Multi-polygon fields',

  'ui.whatThisChecks': 'What this checks',
  'ui.close': 'Close {title}',

  'import.title': 'Import boundaries',
  'import.read.one': 'Read 1 polygon from {files}.',
  'import.read.other': 'Read {count} polygons from {files}.',
  'import.files.one': '1 file',
  'import.files.other': '{count} files',
  'import.notes': 'Notes',
  'import.errors': 'Could not be read',
  'import.mappingTitle': 'Which column is which?',
  'import.mappingNone':
    'These files carry no attributes, so every polygon arrives unnamed for you to group and ' +
    'name yourself.',
  'import.mappingHelp':
    'Point each CropForce attribute at the column that holds it — whatever the file happens ' +
    'to call it. Anything left blank you fill in yourself. Each polygon still arrives as its ' +
    'own field; nothing is merged on your behalf.',
  'import.leaveBlank': '— leave blank —',
  'import.noSecond': '— no second column —',
  'import.columnLabel': '{target} column',
  'import.secondColumnLabel': '{target} second column',
  'import.joinLabel': '{target} join format',
  'import.example': 'e.g. “{value}”',
  'import.tooLong': ' · {count} characters, over the {limit}-character column',
  'import.cancel': 'Cancel',
  'import.confirm': 'Add to workspace',
  'import.added.one': 'Added 1 polygon to the workspace.',
  'import.added.other': 'Added {count} polygons to the workspace.',
  'import.nothing': 'Nothing to import: no polygons were found in those files.',
  'import.failed': 'Import failed: {message}',

  'overlap.title': 'Resolve overlap',
  'overlap.intro':
    'Three ways out of this. Whichever you take, the two end up conjoined — sharing an edge ' +
    'rather than sharing area.',
  'overlap.strategy': 'How should this be settled?',
  'overlap.noDecision': 'no decision needed',
  'overlap.trimLarger': 'Trim the larger field',
  'overlap.trimLarger.detail':
    '{field} is the larger of the two at {area} ha, so it gives up the shared ground and its ' +
    'neighbour keeps every hectare it had.',
  'overlap.trimChosen': 'Trim a field I choose',
  'overlap.trimChosen.detail':
    'Pick the field that keeps the shared area. The other is clipped back to it.',
  'overlap.shrinkBoth': 'Shrink both apart',
  'overlap.shrinkBoth.detail':
    'Pulls both boundaries in by {inset} m, opening a {gap} m gap along the disputed edge. ' +
    'Costs {area} ha across the two.',
  'overlap.shrinkBoth.measuring': 'Working out how deep the inset has to be…',
  'overlap.shrinkBoth.tooDeep':
    'Neither comes free of the other under {max} m of inset, so this is a real double-claim ' +
    'rather than two surveys disagreeing about a fence line.',
  'overlap.confirmShrink': 'Shrink both apart',
  'overlap.polygons.one': '1 polygon',
  'overlap.polygons.other': '{count} polygons',
  'overlap.noClient': 'no client',
  'overlap.loses':
    '{field} will lose the shared area. Ctrl+Z restores it if the result is not what you wanted.',
  'overlap.confirm': 'Clip the overlap',

  'export.title': 'Export for CropForce',
  'export.blockedIntro':
    'The export is blocked until these are resolved. Every one of them would produce a ' +
    'boundary file CropForce cannot use as it stands.',
  'export.noFields': 'There are no fields to export yet.',
  'export.rows': 'Rows',
  'export.polygons': 'Polygons',
  'export.projection': 'Projection',
  'export.summary':
    "One row per field, each field's polygons merged into a single MultiPolygon, with " +
    'Client, Farm and Field written as 30-character text columns. The zip contains .shp, ' +
    '.shx, .dbf, .prj and .cpg.',
  'export.unassigned.one': '1 polygon not assigned to a field will not be included.',
  'export.unassigned.other': '{count} polygons not assigned to a field will not be included.',
  'export.warnings.one': '1 warning left unresolved',
  'export.warnings.other': '{count} warnings left unresolved',
  'export.andMore': 'and {count} more.',
  'export.acknowledge': 'Download anyway — I have reviewed these warnings.',
  'export.fileName': 'File name',
  'export.localNote': 'Written in your browser. Nothing is uploaded.',
  'export.close': 'Close',
  'export.download': 'Download zip',
  'export.done': 'Downloaded {name} with {count} field rows.',
  'export.failed': 'Export failed: {message}',

  'coords.title': 'Go to coordinates',
  'coords.intro':
    'Paste a latitude and longitude, or a link from Google Maps or OpenStreetMap. The map ' +
    'jumps there; nothing is looked up online.',
  'coords.label': 'Latitude and longitude',
  'coords.readsAs': 'Reads as {value}',
  'coords.invalid':
    'Not a position. A place name needs an online lookup, which this tool does not do.',
  'coords.help': 'Also accepts 48°51′23.8″N 2°21′07.9″E, geo: links, and pasted map URLs.',
  'coords.go': 'Go',
  'coords.moved': 'Moved the map to {value}.',

  'history.undo': 'Undo',
  'history.redo': 'Redo',

  'action.import': 'Import {count} polygons',
  'action.draw': 'Draw polygon',
  'action.cutHole': 'Cut exclusion zone',
  'action.split': 'Split {count} polygons',
  'action.editGeometry': 'Edit geometry',
  'action.deletePolygons': 'Delete {count} polygons',
  'action.mergePolygons': 'Merge polygons',
  'action.combine': 'Combine {count} polygons into a field',
  'action.moveToField': 'Move polygons to field',
  'action.removeFromField': 'Remove polygons from field',
  'action.editAttributes': 'Edit attributes',
  'action.bulkNaming': 'Set {columns} on {count} fields',
  'action.ungroupField': 'Ungroup field',
  'action.deleteField': 'Delete field',
  'action.addField': 'Add field',
  'action.autoFix': 'Auto-fix: {title}',
  'action.clipOverlap': 'Auto-fix: clip overlap',
  'action.shrinkApart': 'Auto-fix: shrink apart',
  'action.smooth': 'Smooth at {tolerance} m',

  'action.autoFixMany': 'Auto-fix {count} issues',

  'toast.combined': 'Created a field. Fill in Client, Farm and Field to make it exportable.',
  'toast.merged': 'Merged the selected polygons into one.',
  'toast.splitDone.one': 'Split 1 polygon.',
  'toast.splitDone.other': 'Split {count} polygons.',
  'toast.splitNone': 'The line did not cut cleanly through the selected polygon.',
  'toast.splitSelect': 'Select the polygon to split first.',
  'toast.cutNothing': 'That shape does not overlap any polygon, so nothing was cut.',
  'toast.undoHint': '{message} Ctrl+Z undoes it.',
  'toast.smoothNothing': 'Nothing to smooth at that tolerance.',
  'toast.bulkApplied.one': 'Applied {columns} to 1 field.',
  'toast.bulkApplied.other': 'Applied {columns} to {count} fields.',
  'toast.flagsWithoutPolygons': 'Those flags are about field rows rather than polygons on the map.',

  'note.unsupported': '{file}: unsupported file type (.kml, .kmz, .geojson, .json and .zip, .rar or .7z archives are accepted).',
  'note.nothingInArchive': 'the archive holds no boundary files (.shp, .kml, .kmz, .geojson or .json).',
  'note.archiveEncrypted': 'the archive is password-protected. Unpack it on your own computer and load the files from inside it.',
  'note.archiveTruncated': '{entry} could not be unpacked. The archive looks damaged, or it is one part of a set split across several volumes.',
  'note.archiveTooDeep': '{file}: archives inside archives are only opened two levels down. Unpack this one and load the files from inside it.',
  'note.badKml': 'the KML is not well-formed XML.',
  'note.noKmlInArchive': 'no .kml file found inside the archive.',
  'note.mergedKml': '{file}: merged {count} KML documents from the archive.',
  'note.noPrj': '{file}: no .prj found — coordinates were read as WGS84. Check the result on the map.',
  'note.alreadyWgs84': '{file}: already in WGS84 ({crs}).',
  'note.reprojected': '{file}: reprojected from {crs} to WGS84.',
  'note.needShp': 'a .shp file is required alongside the other shapefile parts.',
  'note.noDbf': '{file}: no .dbf selected, so no attributes were carried over.',
  'note.badPrj': '{file}: the .prj could not be read; coordinates assumed to be WGS84.',
  'note.noPrjSelected': '{file}: no .prj selected — coordinates were read as WGS84.',
  'note.epsgUnsupported': '{file}: declares EPSG:{code}, which this tool cannot convert offline. Re-export the file as WGS84 (EPSG:4326) or as a zipped shapefile with a .prj.',
  'note.epsgFailed': '{file}: EPSG:{code} could not be initialised.',
  'note.outOfRange': '{file}: coordinates fall outside the valid longitude/latitude range and the file declares no CRS, so it cannot be placed on the map. Re-export it as WGS84.',
  'note.noPolygons': '{file}: no polygons found (points and lines cannot become fields).',
  'note.skipped.one': '{file}: skipped 1 non-polygon feature.',
  'note.skipped.other': '{file}: skipped {count} non-polygon features.',
  'note.degenerate.one': '{file}: dropped 1 empty or degenerate polygon.',
  'note.degenerate.other': '{file}: dropped {count} empty or degenerate polygons.',
  'join.parentheses': 'Name (extra)',
  'join.dash': 'Name - extra',
  'join.space': 'Name extra',
  'join.prefix': 'extra - Name',

  'toast.bulkFixed.one': 'Fixed 1 issue.',
  'toast.bulkFixed.other': 'Fixed {count} issues.',
  'toast.bulkOverlaps.one': ' 1 overlap was trimmed out of the larger field.',
  'toast.bulkOverlaps.other': ' {count} overlaps were trimmed out of the larger field.',
  'toast.bulkSkipped.one': ' 1 duplicate boundary still needs you to choose which copy stays.',
  'toast.bulkSkipped.other': ' {count} duplicate boundaries still need you to choose which copy stays.',
  'toast.bulkNothingFixed': 'None of the selected issues has an automatic fix.',
  'toast.bulkReviewed.one': 'Marked 1 warning reviewed.',
  'toast.bulkReviewed.other': 'Marked {count} warnings reviewed.',

  'smoothing.title': 'Smoothing preview',
  'smoothing.label': 'Smoothing',
  'smoothing.guidance':
    'Boundaries traced from imagery or logged by GPS carry far more vertices than the shape ' +
    'needs. Smoothing removes the noise without moving the boundary further than the ' +
    'tolerance you set. The dashed outline is the result; nothing is committed until you ' +
    'apply it.',
  'smoothing.tolerance': 'Smoothing tolerance in metres',
  'smoothing.vertices': 'Vertices',
  'smoothing.removed': 'Removed',
  'smoothing.areaChange': 'Area change',
  'smoothing.apply': 'Apply smoothing',
  'smoothing.cancel': 'Cancel',
  'smoothing.verticesValue': '{before} to {after}',

  'fix.repaired.one': 'Repaired 1 polygon',
  'fix.repaired.other': 'Repaired {count} polygons',
  'fix.and': ' and ',
  'fix.dropped': 'removed {count} that could not be repaired',
  'fix.deletedSlivers.one': 'Deleted 1 sliver.',
  'fix.deletedSlivers.other': 'Deleted {count} slivers.',
  'fix.smoothed': 'Smoothed at {tolerance} m: {before} vertices reduced to {after}.',
  'fix.clipped': 'Clipped the shared area out of the other field.',
  'fix.clippedRemoved.one': ' 1 polygon was fully inside the kept field and was removed.',
  'fix.clippedRemoved.other':
    ' {count} polygons were fully inside the kept field and were removed.',
  'fix.noOverlap': 'Nothing to clip — the overlap had already gone.',
  'fix.noKeeper': 'The field to keep has no geometry.',
  'fix.shrunkApart':
    'Pulled both boundaries in by {inset} m, opening a {gap} m gap. {area} ha came off across the two.',
  'fix.insetTooDeep':
    'Nothing under {max} m of inset separates these two, which makes it a real double-claim ' +
    'rather than an edge disagreement. Trim one of them instead.',
  'fix.renamed.one': 'Renamed 1 field so each combination is unique.',
  'fix.renamed.other': 'Renamed {count} fields so each combination is unique.',
  'fix.shortened.one': 'Shortened 1 name to {limit} characters.',
  'fix.shortened.other': 'Shortened {count} names to {limit} characters.',
  'fix.shortenedCollided': ' Two of them then matched, so they were numbered apart.',
  'fix.alreadyFits': 'Every name already fits.',
} as const;

export type StringKey = keyof typeof en;
export type Dictionary = Record<StringKey, string>;
