import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { BBox, LineString, Polygon } from 'geojson';
import type {
  Basemap,
  FeatureId,
  FieldId,
  PolyGeom,
  QAFlag,
  Tool,
  WFeature,
  WField,
} from './types';
import { useWorkspaceHistory } from './state/history';
import {
  type AttributeMapping,
  addDrawnFeature,
  addImported,
  assignToField,
  combineIntoField,
  createEmptyField,
  cutExclusionZone,
  deleteFeatures,
  deleteField,
  mergeFeatures,
  replaceWithParts,
  setGeometry,
  ungroupField,
  updateField,
} from './state/ops';
import { type ImportReport, importFiles } from './lib/import';
import { areaHa, bboxOf, simplifyMeters, splitByLine, vertexCount } from './lib/geo';
import {
  autoDeleteFeatures,
  autoFixGeometry,
  autoSimplify,
  resolveOverlap,
  runChecks,
} from './lib/qa';
import {
  buildExportZip,
  downloadBlob,
  exportBlockers,
  planExport,
  suggestFileName,
} from './lib/export';
import { UNGROUPED_COLOR, fieldColor } from './lib/colors';
import MapView, { type FocusRequest } from './components/MapView';
import Toolbar, { SmoothingPanel } from './components/Toolbar';
import LeftPanel, { type AttributeFocus } from './components/LeftPanel';
import QAPanel from './components/QAPanel';
import EmptyState from './components/EmptyState';
import { ExportDialog, ImportDialog, OverlapDialog } from './components/dialogs';
import { ToastStack, type Toast } from './components/ui';

const ACCEPTED = '.kml,.kmz,.zip,.geojson,.json,.shp,.shx,.dbf,.prj,.cpg';

export default function App() {
  const history = useWorkspaceHistory();
  const { workspace, apply } = history;

  const [selection, setSelection] = useState<ReadonlySet<FeatureId>>(new Set());
  const [tool, setTool] = useState<Tool>('select');
  const [snapping, setSnapping] = useState(true);
  const [basemap, setBasemap] = useState<Basemap>('imagery');
  const [tolerance, setTolerance] = useState(3);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [attributeFocus, setAttributeFocus] = useState<AttributeFocus | null>(null);
  const [activeFlagId, setActiveFlagId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportReport | null>(null);
  const [overlapPair, setOverlapPair] = useState<[WField, WField] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  /** Once the user types their own file name, stop re-suggesting one over the top of it. */
  const [fileNameEdited, setFileNameEdited] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nonceRef = useRef(0);

  /* ------------------------------------------------------------- feedback */

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 6000);
  }, []);

  /* ------------------------------------------------------ derived workspace */

  // QA runs against a deferred copy so a long check pass never blocks typing in the
  // attribute table; the map and the table always show the live workspace.
  const deferredWorkspace = useDeferredValue(workspace);
  const flags = useMemo<QAFlag[]>(() => runChecks(deferredWorkspace), [deferredWorkspace]);

  const colorByField = useMemo(() => {
    const map = new Map<FieldId, string>();
    workspace.fields.forEach((field, index) => map.set(field.id, fieldColor(index)));
    return map;
  }, [workspace.fields]);

  const colorFor = useCallback(
    (feature: WFeature) =>
      feature.fieldId ? (colorByField.get(feature.fieldId) ?? UNGROUPED_COLOR) : UNGROUPED_COLOR,
    [colorByField],
  );

  const selectedFeatures = useMemo(
    () => workspace.features.filter((f) => selection.has(f.id)),
    [workspace.features, selection],
  );

  const selectionAreaHa = useMemo(
    () => selectedFeatures.reduce((sum, feature) => sum + areaHa(feature.geometry), 0),
    [selectedFeatures],
  );

  /* --------------------------------------------------------------- helpers */

  const zoomTo = useCallback(
    (ids: FeatureId[]) => {
      const geometries = workspace.features
        .filter((f) => ids.includes(f.id))
        .map((f) => bboxOf(f.geometry));
      if (geometries.length === 0) return;
      const bbox: BBox = [
        Math.min(...geometries.map((b) => b[0])),
        Math.min(...geometries.map((b) => b[1])),
        Math.max(...geometries.map((b) => b[2])),
        Math.max(...geometries.map((b) => b[3])),
      ];
      nonceRef.current += 1;
      setFocus({ bbox, nonce: nonceRef.current });
    },
    [workspace.features],
  );

  const selectOne = useCallback((id: FeatureId | null, additive: boolean) => {
    setSelection((current) => {
      // Returning the same Set when nothing changed matters: a new empty Set would
      // still count as a state change and restart every effect keyed on the selection.
      if (id === null) return additive || current.size === 0 ? current : new Set();
      const next = new Set(current);
      if (additive) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return next.size === 1 && next.has(id) ? new Set() : new Set([id]);
    });
  }, []);

  const selectMany = useCallback((ids: FeatureId[]) => setSelection(new Set(ids)), []);

  /* ---------------------------------------------------------------- import */

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      try {
        const report = await importFiles(files);
        if (report.features.length === 0 && report.errors.length === 0) {
          toast('Nothing to import: no polygons were found in those files.', 'error');
          return;
        }
        setPendingImport(report);
      } catch (error) {
        toast(`Import failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const confirmImport = useCallback(
    (mapping: AttributeMapping) => {
      const report = pendingImport;
      if (!report) return;
      setPendingImport(null);
      apply(`Import ${report.features.length} polygons`, (current) =>
        addImported(current, report.features, mapping),
      );
      toast(`Added ${report.features.length} polygons to the workspace.`);
    },
    [pendingImport, apply, toast],
  );

  // Files dropped anywhere on the window, not just on a target the user has to find.
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      depth += 1;
      setDragActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragActive(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      depth = 0;
      setDragActive(false);
      void handleFiles([...event.dataTransfer.files]);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  /* ------------------------------------------------------------- map edits */

  const handleDrawPolygon = useCallback(
    (geometry: Polygon) => {
      apply('Draw polygon', (current) => addDrawnFeature(current, geometry));
    },
    [apply],
  );

  const handleCutHole = useCallback(
    (hole: Polygon) => {
      apply('Cut exclusion zone', (current) => cutExclusionZone(current, hole, selection));
    },
    [apply, selection],
  );

  const handleSplitLine = useCallback(
    (line: LineString) => {
      const targets = selectedFeatures;
      if (targets.length === 0) {
        toast('Select the polygon to split first.', 'error');
        return;
      }
      let splitCount = 0;
      apply('Split polygon', (current) => {
        let next = current;
        for (const target of targets) {
          const live = next.features.find((f) => f.id === target.id);
          if (!live) continue;
          const parts = splitByLine(live.geometry, line);
          if (!parts || parts.length < 2) continue;
          next = replaceWithParts(next, live.id, parts);
          splitCount += 1;
        }
        return next;
      });
      setSelection(new Set());
      setTool('select');
      toast(
        splitCount > 0
          ? `Split ${splitCount} polygon${splitCount === 1 ? '' : 's'}.`
          : 'The line did not cut cleanly through the selected polygon.',
        splitCount > 0 ? 'info' : 'error',
      );
    },
    [apply, selectedFeatures, toast],
  );

  const handleGeometryEdited = useCallback(
    (featureId: FeatureId, geometry: PolyGeom) => {
      apply('Edit geometry', (current) => setGeometry(current, featureId, geometry));
    },
    [apply],
  );

  /* ------------------------------------------------------ selection actions */

  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    const ids = [...selection];
    apply(`Delete ${ids.length} polygon${ids.length === 1 ? '' : 's'}`, (current) =>
      deleteFeatures(current, ids),
    );
    setSelection(new Set());
  }, [apply, selection]);

  const mergeSelection = useCallback(() => {
    const ids = [...selection];
    if (ids.length < 2) return;
    apply('Merge polygons', (current) => mergeFeatures(current, ids));
    setSelection(new Set());
    toast('Merged the selected polygons into one.');
  }, [apply, selection, toast]);

  const combineSelection = useCallback(() => {
    const ids = [...selection];
    if (ids.length === 0) return;
    apply(`Combine ${ids.length} polygon${ids.length === 1 ? '' : 's'} into a field`, (current) =>
      combineIntoField(current, ids),
    );
    toast('Created a field. Fill in Client, Farm and Field to make it exportable.');
  }, [apply, selection, toast]);

  const assignSelection = useCallback(
    (fieldId: FieldId | null) => {
      const ids = [...selection];
      if (ids.length === 0) return;
      apply(fieldId ? 'Move polygons to field' : 'Remove polygons from field', (current) =>
        assignToField(current, ids, fieldId),
      );
    },
    [apply, selection],
  );

  /* -------------------------------------------------------------- QA fixes */

  const handleAutoFix = useCallback(
    (flag: QAFlag) => {
      setActiveFlagId(flag.id);
      const spec = flag.autoFix;
      if (!spec) return;

      if (spec.kind === 'resolve-overlap') {
        const pair = flag.fieldIds
          .map((id) => workspace.fields.find((field) => field.id === id))
          .filter((field): field is WField => field !== undefined);
        if (pair.length !== 2) return;
        setOverlapPair([pair[0], pair[1]]);
        return;
      }

      const outcome =
        spec.kind === 'unkink'
          ? autoFixGeometry(workspace, flag.featureIds)
          : spec.kind === 'delete-features'
            ? autoDeleteFeatures(workspace, flag.featureIds)
            : autoSimplify(workspace, flag.featureIds, spec.toleranceMeters);

      if (!outcome.ok) {
        toast(outcome.message, 'error');
        return;
      }
      apply(`Auto-fix: ${flag.title}`, () => outcome.workspace);
      toast(`${outcome.message} Ctrl+Z undoes it.`);
    },
    [apply, workspace, toast],
  );

  const handleFixManually = useCallback(
    (flag: QAFlag) => {
      setActiveFlagId(flag.id);
      if (flag.featureIds.length > 0) {
        setSelection(new Set(flag.featureIds));
        zoomTo(flag.featureIds);
      }

      switch (flag.manual) {
        case 'attributes': {
          const field = workspace.fields.find((item) => item.id === flag.fieldIds[0]);
          if (!field) break;
          const column =
            (['client', 'farm', 'field'] as const).find((key) => field[key].trim() === '') ??
            'field';
          nonceRef.current += 1;
          setAttributeFocus({ fieldId: field.id, column, nonce: nonceRef.current });
          setTool('select');
          break;
        }
        case 'vertex':
          setTool('edit');
          break;
        case 'vertex-snap':
          setSnapping(true);
          setTool('edit');
          break;
        case 'simplify':
          if (flag.autoFix?.kind === 'simplify') setTolerance(flag.autoFix.toleranceMeters);
          setTool('simplify');
          break;
        case 'cut-hole':
          setTool('cut-hole');
          break;
        case 'review-delete':
          setTool('select');
          break;
      }
    },
    [workspace.fields, zoomTo],
  );

  const handleResolveOverlap = useCallback(
    (keeperId: string, loserId: string) => {
      setOverlapPair(null);
      const outcome = resolveOverlap(workspace, keeperId, loserId);
      if (!outcome.ok) {
        toast(outcome.message, 'error');
        return;
      }
      apply('Auto-fix: clip overlap', () => outcome.workspace);
      toast(`${outcome.message} Ctrl+Z undoes it.`);
    },
    [apply, workspace, toast],
  );

  /* ------------------------------------------------------------- smoothing */

  const preview = useMemo(() => {
    if (tool !== 'simplify' || selectedFeatures.length === 0 || tolerance <= 0) return null;
    return selectedFeatures
      .map((feature) => ({
        featureId: feature.id,
        geometry: simplifyMeters(feature.geometry, tolerance),
      }))
      .filter((item): item is { featureId: FeatureId; geometry: PolyGeom } => item.geometry !== null);
  }, [tool, selectedFeatures, tolerance]);

  const previewStats = useMemo(() => {
    const before = selectedFeatures.reduce((sum, f) => sum + vertexCount(f.geometry), 0);
    const beforeArea = selectedFeatures.reduce((sum, f) => sum + areaHa(f.geometry), 0);
    const after = preview?.reduce((sum, item) => sum + vertexCount(item.geometry), 0) ?? before;
    const afterArea = preview?.reduce((sum, item) => sum + areaHa(item.geometry), 0) ?? beforeArea;
    return { before, after, areaChangeHa: afterArea - beforeArea };
  }, [selectedFeatures, preview]);

  const applySmoothing = useCallback(() => {
    const ids = [...selection];
    if (ids.length === 0) return;
    const outcome = autoSimplify(workspace, ids, tolerance);
    if (!outcome.ok) {
      toast('Nothing to smooth at that tolerance.', 'error');
      return;
    }
    apply(`Smooth at ${tolerance} m`, () => outcome.workspace);
    setTool('select');
    toast(outcome.message);
  }, [apply, selection, tolerance, workspace, toast]);

  /* ---------------------------------------------------------------- export */

  const plan = useMemo(() => planExport(workspace), [workspace]);
  const exportStatus = useMemo(() => exportBlockers(flags, plan), [flags, plan]);

  const openExport = useCallback(() => {
    // Re-suggested on each open, because the client name it is built from is usually
    // typed in after the first, blocked, attempt to export.
    if (!fileNameEdited) setFileName(suggestFileName(workspace));
    setExportOpen(true);
  }, [workspace, fileNameEdited]);

  const downloadExport = useCallback(async () => {
    try {
      const base = (fileName.trim() || 'cropforce_boundaries').replace(/[^A-Za-z0-9._-]+/g, '_');
      const blob = await buildExportZip(plan, base);
      downloadBlob(blob, `${base}.zip`);
      setExportOpen(false);
      toast(`Downloaded ${base}.zip with ${plan.rows.length} field rows.`);
    } catch (error) {
      toast(`Export failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [fileName, plan, toast]);

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
        return;
      }
      if (typing) return;

      if (event.key === 'Escape') {
        setTool('select');
        setSelection(new Set());
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (meta || event.altKey) return;

      const shortcuts: Record<string, Tool> = {
        v: 'select',
        e: 'edit',
        m: 'move',
        d: 'draw',
        h: 'cut-hole',
        s: 'split',
        g: 'simplify',
      };
      const next = shortcuts[event.key.toLowerCase()];
      if (next) {
        // Tools that act on a selection stay put until there is one to act on.
        if (['edit', 'move', 'split', 'simplify'].includes(next) && selection.size === 0) return;
        setTool(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history, deleteSelection, selection.size]);

  // A tool that needs a selection cannot stay armed once the selection is gone.
  useEffect(() => {
    if (selection.size === 0 && ['edit', 'move', 'split', 'simplify'].includes(tool)) {
      setTool('select');
    }
  }, [selection.size, tool]);

  /* ---------------------------------------------------------------- render */

  const isEmpty = workspace.features.length === 0 && workspace.fields.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3">
        <h1 className="text-sm font-semibold text-ink-100">CropForce Boundary Prep</h1>
        <span
          className="hidden items-center gap-1.5 rounded-full border border-ink-700 bg-ink-950
            px-2.5 py-1 text-[10px] text-ink-300 sm:inline-flex"
          title="No server, no database, no analytics. Refreshing this page discards everything."
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3 text-crop-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1.5l5 2v4c0 3-2.2 5.7-5 7-2.8-1.3-5-4-5-7v-4z" />
            <path d="M5.8 8l1.6 1.6L10.4 6.5" strokeLinecap="round" />
          </svg>
          Files are processed only in your browser. Nothing is uploaded or stored.
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {busy && <span className="text-[11px] text-ink-400">Reading files…</span>}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(event) => {
              void handleFiles([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs
              text-ink-100 hover:bg-ink-700"
          >
            Add files
          </button>
          <button
            type="button"
            disabled={isEmpty}
            onClick={() => {
              if (!window.confirm('Discard everything in the workspace? This cannot be undone.')) {
                return;
              }
              history.clear();
              setSelection(new Set());
              setTool('select');
              setFileName('');
              setFileNameEdited(false);
            }}
            className="rounded-md border border-transparent px-2.5 py-1.5 text-xs text-ink-400
              hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[400px] shrink-0">
          <LeftPanel
            workspace={workspace}
            selection={selection}
            flags={flags}
            attributeFocus={attributeFocus}
            onSelectFeature={selectOne}
            onSelectMany={selectMany}
            onUpdateField={(id, patch) =>
              apply('Edit attributes', (current) => updateField(current, id, patch))
            }
            onCombine={combineSelection}
            onAssign={assignSelection}
            onUngroupField={(id) =>
              apply('Ungroup field', (current) => ungroupField(current, id))
            }
            onDeleteField={(id) => {
              const keepPolygons = !window.confirm(
                'Delete this field and its polygons?\n\n' +
                  'OK deletes both. Cancel keeps the polygons and only removes the field row.',
              );
              apply('Delete field', (current) => deleteField(current, id, !keepPolygons));
            }}
            onDeleteSelection={deleteSelection}
            onMergeSelection={mergeSelection}
            onNewField={() => apply('Add field', createEmptyField)}
            onZoomToFeatures={zoomTo}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            hasSelection={selection.size > 0}
            selectionAreaHa={selectionAreaHa}
            selectionCount={selection.size}
            snapping={snapping}
            onSnappingChange={setSnapping}
            basemap={basemap}
            onBasemapChange={setBasemap}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            undoLabel={history.undoLabel}
            redoLabel={history.redoLabel}
            onUndo={history.undo}
            onRedo={history.redo}
            onDeleteSelection={deleteSelection}
            onMergeSelection={mergeSelection}
          />

          <div className="relative min-h-0 flex-1">
            <MapView
              workspace={workspace}
              selection={selection}
              tool={tool}
              snapping={snapping}
              basemap={basemap}
              colorFor={colorFor}
              preview={preview}
              focus={focus}
              onSelect={selectOne}
              onDrawPolygon={handleDrawPolygon}
              onCutHole={handleCutHole}
              onSplitLine={handleSplitLine}
              onGeometryEdited={handleGeometryEdited}
            />

            {tool === 'simplify' && selection.size > 0 && (
              <SmoothingPanel
                tolerance={tolerance}
                onToleranceChange={setTolerance}
                verticesBefore={previewStats.before}
                verticesAfter={previewStats.after}
                areaChangeHa={previewStats.areaChangeHa}
                onApply={applySmoothing}
                onCancel={() => setTool('select')}
              />
            )}

            {isEmpty && (
              <div className="absolute inset-0 z-1000 bg-ink-950/92 backdrop-blur-[2px]">
                <EmptyState onBrowse={() => fileInputRef.current?.click()} />
              </div>
            )}

            {dragActive && (
              <div className="pointer-events-none absolute inset-0 z-1400 grid place-items-center
                border-4 border-dashed border-crop-400 bg-ink-950/70">
                <p className="rounded-lg bg-ink-900 px-5 py-3 text-sm text-ink-100 shadow-xl">
                  Drop boundary files to load them
                </p>
              </div>
            )}
          </div>
        </main>

        <aside className="w-[340px] shrink-0">
          <QAPanel
            flags={flags}
            activeFlagId={activeFlagId}
            fieldCount={workspace.fields.length}
            onAutoFix={handleAutoFix}
            onFixManually={handleFixManually}
            onExport={openExport}
          />
        </aside>
      </div>

      {pendingImport && (
        <ImportDialog
          report={pendingImport}
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {overlapPair && (
        <OverlapDialog
          fields={overlapPair}
          workspace={workspace}
          onResolve={handleResolveOverlap}
          onCancel={() => setOverlapPair(null)}
        />
      )}

      {exportOpen && (
        <ExportDialog
          plan={plan}
          status={exportStatus}
          fileName={fileName}
          onFileNameChange={(value) => {
            setFileNameEdited(true);
            setFileName(value);
          }}
          onDownload={() => void downloadExport()}
          onClose={() => setExportOpen(false)}
        />
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />
    </div>
  );
}
