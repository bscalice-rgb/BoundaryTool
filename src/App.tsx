import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { BBox, LineString, Polygon, Position } from 'geojson';
import type {
  Basemap,
  FeatureId,
  FieldId,
  PolyGeom,
  QAFlag,
  Tool,
  WFeature,
  WField,
  Workspace,
} from './types';
import { useT } from './i18n';
import LanguagePicker from './components/LanguagePicker';
import { useWorkspaceHistory } from './state/history';
import {
  addDrawnToField,
  addImported,
  assignToField,
  combineIntoField,
  cutExclusionZone,
  deleteFeatures,
  deleteField,
  mergeFeatures,
  replaceWithParts,
  setGeometry,
  ungroupField,
  updateField,
  updateFields,
} from './state/ops';
import { type ColumnMapping, type ImportReport, importFiles } from './lib/import';
import { areaHa, bboxOf, simplifyMeters, splitByLine, vertexCount } from './lib/geo';
import { formatLatLon } from './lib/coords';
import {
  autoDeleteFeatures,
  autoFixGeometry,
  autoShortenNames,
  autoSimplify,
  autoUniquifyNames,
  resolveOverlap,
  reviewKey,
  runChecks,
} from './lib/qa';
import {
  type ExportBlockers,
  buildExportZip,
  downloadBlob,
  exportBlockers,
  planExport,
  suggestFileName,
} from './lib/export';
import { UNGROUPED_COLOR, fieldColor } from './lib/colors';
import { describeField } from './lib/qa';
import { describeAccuracy, isCoarse } from './lib/locate';
import MapView, { type FocusRequest } from './components/MapView';
import { CollapsedRail, PanelResizer, SidePanel } from './components/SidePanel';
import ShortcutSheet from './components/ShortcutSheet';
import Toolbar, { HistoryButtons, SmoothingPanel } from './components/Toolbar';
import LeftPanel, { type AttributeFocus } from './components/LeftPanel';
import QAPanel from './components/QAPanel';
import EmptyState from './components/EmptyState';
import {
  CoordinatesDialog,
  ExportDialog,
  ImportDialog,
  OverlapDialog,
} from './components/dialogs';
import { InfoDot, ToastStack, type Toast } from './components/ui';

const ACCEPTED = '.kml,.kmz,.zip,.geojson,.json,.shp,.shx,.dbf,.prj,.cpg';

/** Panel sizing. The map keeps at least this much room whatever the panels want. */
const MAP_MIN_WIDTH = 360;
const FIELDS_MIN = 260;
const CHECKS_MIN = 240;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export default function App() {
  const t = useT();
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
  /** Export blockers as of the moment the dialog was opened; null while it is closed. */
  const [exportStatus, setExportStatus] = useState<ExportBlockers | null>(null);
  const [fileName, setFileName] = useState('');
  /** Once the user types their own file name, stop re-suggesting one over the top of it. */
  const [fileNameEdited, setFileNameEdited] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [coordinatesOpen, setCoordinatesOpen] = useState(false);
  const [goTo, setGoTo] = useState<{ position: Position; nonce: number } | null>(null);
  /** Non-null while the browser is being asked for a position. */
  const [locating, setLocating] = useState<string | null>(null);
  /**
   * Warnings the user has looked at and waved through. Kept outside the undo history on
   * purpose: this is a note about what has been read, not a change to the boundaries.
   */
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set());
  /**
   * Fields put in front of the quality panel from the list, on top of whatever the
   * polygon selection already implies. Kept separately so a field with no polygons —
   * which cannot be selected on the map — can still be worked on.
   */
  const [pinnedFields, setPinnedFields] = useState<ReadonlySet<FieldId>>(new Set());
  /**
   * Empty attributes go red only once an export attempt has actually been stopped by
   * them. Before that they are boxes you have not filled in yet, and colouring every
   * one of them red on a freshly imported file is shouting about nothing.
   */
  const [exportAttempted, setExportAttempted] = useState(false);
  /** Boundaries lit up by pointing rather than selecting. */
  const [hoverFeatureIds, setHoverFeatureIds] = useState<ReadonlySet<FeatureId>>(new Set());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** Panel geometry. Held here for the session; nothing about it is stored. */
  const [fieldsWidth, setFieldsWidth] = useState(460);
  const [checksWidth, setChecksWidth] = useState(340);
  const [fieldsCollapsed, setFieldsCollapsed] = useState(false);
  /**
   * Where the next drawn polygon lands. Drawing and grouping were two separate steps
   * with a manual join between them; this is the join, made explicit and visible in
   * the toolbar so it is never a guess.
   */
  const [drawTarget, setDrawTarget] = useState<FieldId | 'new'>('new');
  const [checksCollapsed, setChecksCollapsed] = useState(false);

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
  const flags = useMemo<QAFlag[]>(() => runChecks(deferredWorkspace, t), [deferredWorkspace, t]);

  const colorByField = useMemo(() => {
    const map = new Map<FieldId, string>();
    workspace.fields.forEach((field, index) => map.set(field.id, fieldColor(index)));
    return map;
  }, [workspace.fields]);

  /** What a polygon is called on the map: its field's name, or nothing if ungrouped. */
  const labelFor = useCallback(
    (feature: WFeature) => {
      if (!feature.fieldId) return '';
      const field = workspace.fields.find((item) => item.id === feature.fieldId);
      return field ? describeField(field, t) : '';
    },
    [workspace.fields, t],
  );

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

  const hoverFeatures = useCallback((ids: FeatureId[]) => {
    setHoverFeatureIds((current) => {
      // Leaving one polygon for the next fires an empty update in between; returning
      // the same set keeps that from re-rendering the map layers for nothing.
      if (ids.length === 0) return current.size === 0 ? current : new Set();
      if (ids.length === current.size && ids.every((id) => current.has(id))) return current;
      return new Set(ids);
    });
  }, []);

  /**
   * What the quality panel is scoped to. Selecting a field's polygons — from the list,
   * from the map, or from a flag — is what "I am working on this" means everywhere else
   * in the app, so the panel follows it rather than inventing a second kind of selection.
   */
  const scopeFieldIds = useMemo(() => {
    const ids = new Set<FieldId>(pinnedFields);
    for (const feature of selectedFeatures) {
      if (feature.fieldId) ids.add(feature.fieldId);
    }
    return ids;
  }, [selectedFeatures, pinnedFields]);

  const clearScope = useCallback(() => {
    setPinnedFields(new Set());
    setSelection(new Set());
  }, []);

  /** Puts one field in front of the quality panel, and its polygons on the map with it. */
  const focusField = useCallback(
    (id: FieldId, additive: boolean) => {
      const members = workspace.features.filter((f) => f.fieldId === id).map((f) => f.id);
      setPinnedFields((current) => (additive ? new Set(current).add(id) : new Set([id])));
      setSelection((current) =>
        additive ? new Set([...current, ...members]) : new Set(members),
      );
      if (members.length > 0) zoomTo(members);
      setActiveFlagId(null);
    },
    [workspace.features, zoomTo],
  );

  /* ---------------------------------------------------------------- import */

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      try {
        const report = await importFiles(files);
        if (report.features.length === 0 && report.errors.length === 0) {
          toast(t('import.nothing'), 'error');
          return;
        }
        setPendingImport(report);
      } catch (error) {
        toast(t('import.failed', { message: messageOf(error) }), 'error');
      } finally {
        setBusy(false);
      }
    },
    [toast, t],
  );

  const confirmImport = useCallback(
    (mapping: ColumnMapping) => {
      const report = pendingImport;
      if (!report) return;
      setPendingImport(null);
      apply(t('action.import', { count: report.features.length }), (current) =>
        addImported(current, report.features, mapping),
      );
      toast(t.n('import.added', report.features.length));
    },
    [pendingImport, apply, toast, t],
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
      // Worked out before dispatching, because the ids decide what happens next and
      // the reducer does not run until the following render.
      const outcome = addDrawnToField(workspace, geometry, drawTarget);
      const field = outcome.workspace.fields.find((item) => item.id === outcome.fieldId);
      const name = field ? describeField(field, t) : '';

      if (outcome.created) {
        apply(t('action.drawField'), () => outcome.workspace);
        // Straight into the name box: a field that has just been drawn is a field
        // about to be named, and the alternative is hunting for the row.
        setSelection(new Set([outcome.featureId]));
        setPinnedFields(new Set([outcome.fieldId]));
        nonceRef.current += 1;
        setAttributeFocus({ fieldId: outcome.fieldId, column: 'field', nonce: nonceRef.current });
        setTool('select');
        toast(t('toast.drewNewField'));
        return;
      }

      apply(t('action.drawIntoField', { field: name }), () => outcome.workspace);
      toast(t('toast.drewIntoField', { field: name }));
    },
    [apply, workspace, drawTarget, toast, t],
  );

  const handleCutHole = useCallback(
    (hole: Polygon) => {
      const next = cutExclusionZone(workspace, hole, selection);
      if (next === workspace) {
        toast(t('toast.cutNothing'), 'error');
        return;
      }
      apply(t('action.cutHole'), () => next);
    },
    [apply, workspace, selection, toast, t],
  );

  const handleSplitLine = useCallback(
    (line: LineString) => {
      if (selectedFeatures.length === 0) {
        toast(t('toast.splitSelect'), 'error');
        return;
      }
      // The split is worked out here rather than inside the history action, because the
      // action runs on the next render and the result is needed now, for the message.
      let next = workspace;
      let splitCount = 0;
      for (const target of selectedFeatures) {
        const parts = splitByLine(target.geometry, line);
        if (!parts || parts.length < 2) continue;
        next = replaceWithParts(next, target.id, parts);
        splitCount += 1;
      }

      if (splitCount === 0) {
        toast(t('toast.splitNone'), 'error');
        return;
      }
      apply(t('action.split', { count: splitCount }), () => next);
      setSelection(new Set());
      setTool('select');
      toast(t.n('toast.splitDone', splitCount));
    },
    [apply, workspace, selectedFeatures, toast, t],
  );

  const handleGeometryEdited = useCallback(
    (featureId: FeatureId, geometry: PolyGeom) => {
      apply(t('action.editGeometry'), (current) => setGeometry(current, featureId, geometry));
    },
    [apply, t],
  );

  /* ------------------------------------------------------ selection actions */

  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    const ids = [...selection];
    apply(t('action.deletePolygons', { count: ids.length }), (current) =>
      deleteFeatures(current, ids),
    );
    setSelection(new Set());
  }, [apply, selection, t]);

  const mergeSelection = useCallback(() => {
    const ids = [...selection];
    if (ids.length < 2) return;
    apply(t('action.mergePolygons'), (current) => mergeFeatures(current, ids));
    setSelection(new Set());
    toast(t('toast.merged'));
  }, [apply, selection, toast, t]);

  const combineSelection = useCallback(() => {
    const ids = [...selection];
    if (ids.length === 0) return;
    apply(t('action.combine', { count: ids.length }), (current) =>
      combineIntoField(current, ids),
    );
    toast(t('toast.combined'));
  }, [apply, selection, toast, t]);

  const assignSelection = useCallback(
    (fieldId: FieldId | null) => {
      const ids = [...selection];
      if (ids.length === 0) return;
      apply(t(fieldId ? 'action.moveToField' : 'action.removeFromField'), (current) =>
        assignToField(current, ids, fieldId),
      );
    },
    [apply, selection, t],
  );

  /* -------------------------------------------------------------- QA fixes */

  /**
   * Runs one flag's programmatic correction against a given workspace. Overlaps are the
   * exception: which field keeps the shared area is a judgement the tool will not make,
   * so those return null and are dealt with through the dialog instead.
   */
  const applyAutoFix = useCallback(
    (current: Workspace, flag: QAFlag) => {
      const spec = flag.autoFix;
      if (!spec || spec.kind === 'resolve-overlap') return null;
      switch (spec.kind) {
        case 'unkink':
          return autoFixGeometry(current, flag.featureIds, t);
        case 'delete-features':
          return autoDeleteFeatures(current, flag.featureIds, t);
        case 'uniquify-names':
          return autoUniquifyNames(current, flag.fieldIds, t);
        case 'shorten-names':
          return autoShortenNames(current, flag.fieldIds, t);
        default:
          return autoSimplify(current, flag.featureIds, spec.toleranceMeters, t);
      }
    },
    [t],
  );

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

      const outcome = applyAutoFix(workspace, flag);
      if (!outcome || !outcome.ok) {
        if (outcome) toast(outcome.message, 'error');
        return;
      }
      apply(t('action.autoFix', { title: flag.title }), () => outcome.workspace);
      toast(t('toast.undoHint', { message: outcome.message }));
    },
    [apply, applyAutoFix, workspace, toast, t],
  );

  /**
   * Fixes a batch in one go, as a single history entry: a run of forty slivers is a
   * chore, not forty decisions, and one Ctrl+Z should put it all back.
   */
  const handleAutoFixMany = useCallback(
    (flags: QAFlag[]) => {
      let next = workspace;
      let fixed = 0;
      let overlaps = 0;
      for (const flag of flags) {
        if (flag.autoFix?.kind === 'resolve-overlap') {
          overlaps += 1;
          continue;
        }
        // Each fix runs against the result of the last, so flags that overlap in the
        // features they touch settle in order instead of fighting each other.
        const outcome = applyAutoFix(next, flag);
        if (outcome?.ok) {
          next = outcome.workspace;
          fixed += 1;
        }
      }

      const skipped = overlaps > 0 ? t.n('toast.bulkSkipped', overlaps) : '';
      if (fixed === 0) {
        toast(overlaps > 0 ? skipped.trim() : t('toast.bulkNothingFixed'), 'error');
        return;
      }
      setActiveFlagId(null);
      apply(t('action.autoFixMany', { count: fixed }), () => next);
      toast(t('toast.undoHint', { message: t.n('toast.bulkFixed', fixed) }) + skipped);
    },
    [apply, applyAutoFix, workspace, toast, t],
  );

  /** Selects every polygon behind the given flags and frames them on the map. */
  const handleSelectFlagged = useCallback(
    (chosen: QAFlag[]) => {
      const ids = [...new Set(chosen.flatMap((flag) => flag.featureIds))].filter((id) =>
        workspace.features.some((feature) => feature.id === id),
      );
      if (ids.length === 0) {
        toast(t('toast.flagsWithoutPolygons'), 'error');
        return;
      }
      setActiveFlagId(chosen.length === 1 ? chosen[0].id : null);
      setSelection(new Set(ids));
      zoomTo(ids);
      setTool('select');
    },
    [workspace.features, zoomTo, toast, t],
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
          // A name collision is resolved in the Field cell of the second field, not the
          // first: the first is the one keeping the name it already has.
          const id = flag.kind === 'duplicate-name' ? flag.fieldIds[1] : flag.fieldIds[0];
          const field = workspace.fields.find((item) => item.id === id);
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
      const outcome = resolveOverlap(workspace, keeperId, loserId, t);
      if (!outcome.ok) {
        toast(outcome.message, 'error');
        return;
      }
      apply(t('action.clipOverlap'), () => outcome.workspace);
      toast(t('toast.undoHint', { message: outcome.message }));
    },
    [apply, workspace, toast, t],
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
    const outcome = autoSimplify(workspace, ids, tolerance, t);
    if (!outcome.ok) {
      toast(t('toast.smoothNothing'), 'error');
      return;
    }
    apply(t('action.smooth', { tolerance }), () => outcome.workspace);
    setTool('select');
    toast(outcome.message);
  }, [apply, selection, tolerance, workspace, toast, t]);

  /* ---------------------------------------------------------------- export */

  const plan = useMemo(() => planExport(workspace), [workspace]);

  const openExport = useCallback(() => {
    // The QA panel reads deferred flags, which is fine for a live indicator but not for
    // the gate itself: someone who fills in the last attribute and immediately clicks
    // export must not be told they are still blocked. So the checks run fresh here,
    // against the live workspace, and the answer is held for as long as the dialog is up.
    setExportStatus(
      exportBlockers(
        runChecks(workspace, t).filter((flag) => !reviewed.has(reviewKey(flag))),
        planExport(workspace),
        t,
      ),
    );
    // The suggested name is re-derived on each open, because the client name it is built
    // from is usually typed in after the first, blocked, attempt to export.
    if (!fileNameEdited) setFileName(suggestFileName(workspace));
    setExportAttempted(true);
    setExportOpen(true);
  }, [workspace, fileNameEdited, reviewed, t]);

  const downloadExport = useCallback(async () => {
    try {
      const base = (fileName.trim() || 'cropforce_boundaries').replace(/[^A-Za-z0-9._-]+/g, '_');
      const blob = await buildExportZip(plan, base);
      downloadBlob(blob, `${base}.zip`);
      setExportOpen(false);
      toast(t('export.done', { name: `${base}.zip`, count: plan.rows.length }));
    } catch (error) {
      toast(t('export.failed', { message: messageOf(error) }), 'error');
    }
  }, [fileName, plan, toast, t]);

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
        setShortcutsOpen(false);
        setTool('select');
        setSelection(new Set());
        setPinnedFields(new Set());
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setShortcutsOpen((value) => !value);
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

  /**
   * Arming the draw tool aims it at the field being worked on, if there is exactly one.
   * Seeded on entry rather than followed continuously: a target that moved every time
   * the selection changed would be impossible to rely on mid-draw.
   */
  const wasDrawingRef = useRef(false);
  useEffect(() => {
    const drawing = tool === 'draw';
    if (drawing && !wasDrawingRef.current) {
      setDrawTarget(scopeFieldIds.size === 1 ? [...scopeFieldIds][0] : 'new');
    }
    wasDrawingRef.current = drawing;
    // scopeFieldIds is read on entry only, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // A target field that has since been deleted would silently become a new field.
  useEffect(() => {
    if (drawTarget !== 'new' && !workspace.fields.some((field) => field.id === drawTarget)) {
      setDrawTarget('new');
    }
  }, [workspace.fields, drawTarget]);

  // A tool that needs a selection cannot stay armed once the selection is gone.
  useEffect(() => {
    if (selection.size === 0 && ['edit', 'move', 'split', 'simplify'].includes(tool)) {
      setTool('select');
    }
  }, [selection.size, tool]);

  /* ---------------------------------------------------------------- render */

  const isEmpty = workspace.features.length === 0 && workspace.fields.length === 0;
  const blockingCount = flags.filter((flag) => flag.severity === 'blocking').length;

  /**
   * What the header says. One line about the next thing to do, which is more use than
   * a count of everything at once — the counts are in the panels either side.
   */
  const status = useMemo(() => {
    const ungrouped = workspace.features.filter((f) => f.fieldId === null).length;
    if (isEmpty) return { tone: 'bg-ink-600', text: t('status.empty') };
    if (blockingCount > 0) {
      const blocked = new Set(
        flags.filter((f) => f.severity === 'blocking').flatMap((f) => f.fieldIds),
      );
      return { tone: 'bg-red-400', text: t.n('status.blocked', blocked.size) };
    }
    if (ungrouped > 0) return { tone: 'bg-amber-400', text: t.n('status.group', ungrouped) };
    return { tone: 'bg-crop-400', text: t.n('status.ready', workspace.fields.length) };
  }, [workspace, flags, blockingCount, isEmpty, t]);

  // Neither panel may squeeze the map below a width it can still be worked in. The
  // window is measured rather than assumed, because both panels are draggable and the
  // browser can be resized under them.
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const otherPanel = (collapsed: boolean, width: number) => (collapsed ? 36 : width);
  const maxFieldsWidth = Math.max(
    FIELDS_MIN,
    viewportWidth - MAP_MIN_WIDTH - otherPanel(checksCollapsed, checksWidth),
  );
  const maxChecksWidth = Math.max(
    CHECKS_MIN,
    viewportWidth - MAP_MIN_WIDTH - otherPanel(fieldsCollapsed, fieldsWidth),
  );

  // A window narrowed under the panels must not leave a sliver of map behind.
  useEffect(() => {
    setFieldsWidth((width) => Math.min(width, maxFieldsWidth));
    setChecksWidth((width) => Math.min(width, maxChecksWidth));
  }, [maxFieldsWidth, maxChecksWidth]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3">
        <h1 className="shrink-0 text-sm font-semibold text-ink-100">{t('app.title')}</h1>
        {/* One line saying what to do next, rather than a permanent reassurance that
            is read once and then becomes furniture. The reassurance keeps its place
            in the info dot beside it. */}
        <p className="hidden min-w-0 items-center gap-1.5 truncate text-[11px] sm:flex">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.tone}`} />
          <span className="truncate text-ink-300">{status.text}</span>
        </p>
        <InfoDot label={t('app.privacy')} text={t('app.privacyTooltip')} />

        <div className="ml-auto flex items-center gap-1.5">
          {busy && <span className="text-[11px] text-ink-400">{t('app.reading')}</span>}
          <HistoryButtons
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            undoLabel={history.undoLabel}
            redoLabel={history.redoLabel}
            pastLabels={history.pastLabels}
            futureLabels={history.futureLabels}
            onUndo={history.undo}
            onRedo={history.redo}
            onJump={history.jump}
          />
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
            {t('app.addFiles')}
          </button>
          <button
            type="button"
            disabled={isEmpty}
            onClick={() => {
              if (!window.confirm(t('app.clearConfirm'))) {
                return;
              }
              history.clear();
              setSelection(new Set());
              setReviewed(new Set());
              setPinnedFields(new Set());
              setExportAttempted(false);
              setTool('select');
              setFileName('');
              setFileNameEdited(false);
            }}
            className="rounded-md border border-transparent px-2.5 py-1.5 text-xs text-ink-400
              hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
          >
            {t('app.clear')}
          </button>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title={t('shortcuts.open')}
            aria-label={t('shortcuts.open')}
            className="grid h-7 w-7 place-items-center rounded-md border border-ink-700
              bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-ink-100"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5.8 5.8a2.2 2.2 0 113.1 2l-.9.7v1.1" strokeLinecap="round" />
              <circle cx="8" cy="12.2" r="0.7" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <LanguagePicker />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SidePanel
          collapsed={fieldsCollapsed}
          width={fieldsWidth}
          rail={
            <CollapsedRail
              side="left"
              collapsed
              onToggle={() => setFieldsCollapsed(false)}
              hideLabel={t('panel.hideFields')}
              showLabel={t('panel.showFields')}
              title={t('fields.title')}
              badge={workspace.fields.length}
            />
          }
        >
          <LeftPanel
            workspace={workspace}
            selection={selection}
            flags={flags}
            attributeFocus={attributeFocus}
            reviewed={reviewed}
            scopeFieldIds={scopeFieldIds}
            onFocusField={focusField}
            onSelectFeature={selectOne}
            onSelectMany={selectMany}
            onUpdateField={(id, patch) =>
              apply(t('action.editAttributes'), (current) => updateField(current, id, patch))
            }
            onBulkUpdateFields={(ids, patch) => {
              const columns = Object.keys(patch)
                .map((key) => t(`fields.${key as 'client' | 'farm' | 'field'}` as const))
                .join(t('fix.and'));
              apply(t('action.bulkNaming', { columns, count: ids.length }), (current) =>
                updateFields(current, ids, patch),
              );
              toast(t.n('toast.bulkApplied', ids.length, { columns }));
            }}
            onCombine={combineSelection}
            onAssign={assignSelection}
            onUngroupField={(id) =>
              apply(t('action.ungroupField'), (current) => ungroupField(current, id))
            }
            onDeleteField={(id) => {
              const keepPolygons = !window.confirm(t('fields.deleteFieldConfirm'));
              apply(t('action.deleteField'), (current) => deleteField(current, id, !keepPolygons));
            }}
            onDeleteSelection={deleteSelection}
            onMergeSelection={mergeSelection}
            onNewField={() => {
              setDrawTarget('new');
              setSelection(new Set());
              setPinnedFields(new Set());
              setTool('draw');
            }}
            onZoomToFeatures={zoomTo}
            showBlocked={exportAttempted}
            hoverFeatureIds={hoverFeatureIds}
            onHoverFeatures={hoverFeatures}
            onToggleCollapsed={() => setFieldsCollapsed(true)}
          />
        </SidePanel>
        {!fieldsCollapsed && (
          <PanelResizer
            side="left"
            width={fieldsWidth}
            onWidthChange={setFieldsWidth}
            onToggle={() => setFieldsCollapsed(true)}
            minWidth={FIELDS_MIN}
            maxWidth={maxFieldsWidth}
            label={t('panel.resizeFields')}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            hasSelection={selection.size > 0}
            selectionAreaHa={selectionAreaHa}
            selectionCount={selection.size}
            snapping={snapping}
            onSnappingChange={setSnapping}
            drawTarget={drawTarget}
            onDrawTargetChange={setDrawTarget}
            fields={workspace.fields}
            basemap={basemap}
            onBasemapChange={setBasemap}
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
              hoverFeatureIds={hoverFeatureIds}
              onHoverFeatures={hoverFeatures}
              labelFor={labelFor}
              onLocationError={(message) => toast(message, 'error')}
              onLocatingChange={setLocating}
              onLocated={(accuracy) => {
                // A fix good to 30 km is a real answer to a different question, so it
                // says so rather than leaving the user to wonder why the map landed
                // somewhere near but not right. A browser that reports no accuracy at
                // all gets no claim made on its behalf; the dot is the message.
                if (accuracy <= 0) return;
                const value = describeAccuracy(accuracy);
                toast(
                  isCoarse(accuracy)
                    ? t('map.locatedCoarse', { accuracy: value })
                    : t('map.located', { accuracy: value }),
                );
              }}
              onOpenCoordinates={() => setCoordinatesOpen(true)}
              goTo={goTo}
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

            {locating && (
              <div
                role="status"
                className="absolute left-1/2 top-3 z-1000 flex -translate-x-1/2 items-center gap-2
                  rounded-md border border-ink-600 bg-ink-900/97 px-3 py-2 text-xs text-ink-100
                  shadow-xl"
              >
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-600
                  border-t-crop-400" />
                {locating}
              </div>
            )}

            {/* The welcome panel covers the map, so choosing to draw has to move it out
                of the way — otherwise the one button that starts a field from scratch
                arms a tool the user cannot reach. */}
            {isEmpty && tool !== 'draw' && (
              <div className="absolute inset-0 z-1000 bg-ink-950/92 backdrop-blur-[2px]">
                <EmptyState onBrowse={() => fileInputRef.current?.click()} />
              </div>
            )}

            {dragActive && (
              <div className="pointer-events-none absolute inset-0 z-1400 grid place-items-center
                border-4 border-dashed border-crop-400 bg-ink-950/70">
                <p className="rounded-lg bg-ink-900 px-5 py-3 text-sm text-ink-100 shadow-xl">
                  {t('empty.dropOverlay')}
                </p>
              </div>
            )}
          </div>
        </main>

        {!checksCollapsed && (
          <PanelResizer
            side="right"
            width={checksWidth}
            onWidthChange={setChecksWidth}
            onToggle={() => setChecksCollapsed(true)}
            minWidth={CHECKS_MIN}
            maxWidth={maxChecksWidth}
            label={t('panel.resizeChecks')}
          />
        )}
        <SidePanel
          collapsed={checksCollapsed}
          width={checksWidth}
          rail={
            <CollapsedRail
              side="right"
              collapsed
              onToggle={() => setChecksCollapsed(false)}
              hideLabel={t('panel.hideChecks')}
              showLabel={t('panel.showChecks')}
              title={t('qa.title')}
              badge={blockingCount || flags.length}
              badgeTone={blockingCount > 0 ? 'red' : flags.length > 0 ? 'amber' : 'grey'}
            />
          }
        >
          <QAPanel
            flags={flags}
            activeFlagId={activeFlagId}
            fieldCount={workspace.fields.length}
            onAutoFix={handleAutoFix}
            onFixManually={handleFixManually}
            onSelectFlagged={handleSelectFlagged}
            reviewed={reviewed}
            scopeFieldIds={scopeFieldIds}
            onClearScope={clearScope}
            onAutoFixMany={handleAutoFixMany}
            onReview={(flag) =>
              setReviewed((current) => new Set(current).add(reviewKey(flag)))
            }
            onReviewMany={(flags) => {
              setReviewed((current) => {
                const next = new Set(current);
                for (const flag of flags) next.add(reviewKey(flag));
                return next;
              });
              toast(t.n('toast.bulkReviewed', flags.length));
            }}
            onUnreview={(flag) =>
              setReviewed((current) => {
                const next = new Set(current);
                next.delete(reviewKey(flag));
                return next;
              })
            }
            onExport={openExport}
            onHoverFlag={(flag) => hoverFeatures(flag ? flag.featureIds : [])}
            onToggleCollapsed={() => setChecksCollapsed(true)}
          />
        </SidePanel>
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

      {coordinatesOpen && (
        <CoordinatesDialog
          onGo={(position) => {
            nonceRef.current += 1;
            setGoTo({ position, nonce: nonceRef.current });
            setCoordinatesOpen(false);
            toast(t('coords.moved', { value: formatLatLon(position) }));
          }}
          onClose={() => setCoordinatesOpen(false)}
        />
      )}

      {exportOpen && exportStatus && (
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

      {shortcutsOpen && <ShortcutSheet onClose={() => setShortcutsOpen(false)} />}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />
    </div>
  );
}
