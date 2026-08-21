import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureId, FieldId, QAFlag, WField, Workspace } from '../types';
import { useT } from '../i18n';
import type { StringKey } from '../i18n';
import { areaHa, formatHa } from '../lib/geo';
import { describeField, fieldGeometries, reviewKey } from '../lib/qa';
import { UNGROUPED_COLOR, fieldColor } from '../lib/colors';
import { PanelToggle } from './SidePanel';
import { Button, InfoDot, PanelHeader } from './ui';

/**
 * Which fields the list shows, by the state of their quality flags. The names match
 * the two counts in the quality panel on purpose: "Blocking" here and "N blocking"
 * there are the same set of fields, so the two panels can be read against each other.
 */
export type StatusFilter = 'all' | 'blocking' | 'review' | 'clean';

const STATUS_FILTERS: { id: StatusFilter; label: StringKey; hint: StringKey }[] = [
  { id: 'all', label: 'filter.all', hint: 'filter.allHint' },
  { id: 'blocking', label: 'filter.blocking', hint: 'filter.blockingHint' },
  { id: 'review', label: 'filter.review', hint: 'filter.reviewHint' },
  { id: 'clean', label: 'filter.clean', hint: 'filter.cleanHint' },
];

export interface AttributeFocus {
  fieldId: FieldId;
  column: 'client' | 'farm' | 'field';
  nonce: number;
}

export interface LeftPanelProps {
  workspace: Workspace;
  selection: ReadonlySet<FeatureId>;
  flags: QAFlag[];
  attributeFocus: AttributeFocus | null;
  /** Warnings already waved through, so they stop counting as "needs review". */
  reviewed: ReadonlySet<string>;
  /** Fields the quality panel is currently scoped to; highlighted here to match. */
  scopeFieldIds: ReadonlySet<FieldId>;
  /** Puts a field (and its polygons) in front of the quality panel. */
  onFocusField: (id: FieldId, additive: boolean) => void;
  /**
   * True once the user has tried to export and been stopped. Until then an empty
   * attribute is just a box waiting to be filled in, not an error.
   */
  showBlocked: boolean;
  /** Highlighted from elsewhere — a hovered flag, or a polygon under the cursor. */
  hoverFeatureIds: ReadonlySet<FeatureId>;
  onHoverFeatures: (ids: FeatureId[]) => void;
  onToggleCollapsed: () => void;
  onSelectFeature: (id: FeatureId | null, additive: boolean) => void;
  onSelectMany: (ids: FeatureId[]) => void;
  onUpdateField: (id: FieldId, patch: Partial<Omit<WField, 'id'>>) => void;
  onBulkUpdateFields: (ids: FieldId[], patch: Partial<Omit<WField, 'id'>>) => void;
  onCombine: () => void;
  onAssign: (fieldId: FieldId | null) => void;
  onUngroupField: (id: FieldId) => void;
  onDeleteField: (id: FieldId) => void;
  onDeleteSelection: () => void;
  onMergeSelection: () => void;
  onNewField: () => void;
  onZoomToFeatures: (ids: FeatureId[]) => void;
}

export default function LeftPanel(props: LeftPanelProps) {
  const t = useT();
  const { workspace, selection } = props;
  const [expanded, setExpanded] = useState<ReadonlySet<FieldId>>(new Set());
  /** Fields ticked for bulk attribute editing. Separate from the polygon selection. */
  const [checked, setChecked] = useState<ReadonlySet<FieldId>>(new Set());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const allFields = useMemo(() => fieldGeometries(workspace), [workspace]);
  const allUngrouped = useMemo(
    () => workspace.features.filter((f) => f.fieldId === null),
    [workspace.features],
  );

  /** How many blocking flags and how many outstanding warnings each field carries. */
  const statusByField = useMemo(() => {
    const map = new Map<FieldId, { blocking: number; review: number }>();
    for (const flag of props.flags) {
      const outstanding =
        flag.severity === 'blocking' || !props.reviewed.has(reviewKey(flag));
      if (!outstanding) continue;
      for (const id of flag.fieldIds) {
        const entry = map.get(id) ?? { blocking: 0, review: 0 };
        if (flag.severity === 'blocking') entry.blocking += 1;
        else entry.review += 1;
        map.set(id, entry);
      }
    }
    return map;
  }, [props.flags, props.reviewed]);

  const blockingByField = useMemo(
    () => new Map([...statusByField].map(([id, entry]) => [id, entry.blocking])),
    [statusByField],
  );

  // Every word typed has to appear somewhere in the row, so "acme long" finds Long Acre
  // at Acme without caring which column holds which word or what order they are in.
  const terms = useMemo(
    () => search.toLowerCase().split(/\s+/).filter(Boolean),
    [search],
  );
  const matches = (haystack: string) => {
    const text = haystack.toLowerCase();
    return terms.every((term) => text.includes(term));
  };

  const matchesStatus = (id: FieldId): boolean => {
    if (status === 'all') return true;
    const entry = statusByField.get(id) ?? { blocking: 0, review: 0 };
    switch (status) {
      case 'blocking':
        return entry.blocking > 0;
      case 'review':
        return entry.review > 0;
      default:
        return entry.blocking === 0 && entry.review === 0;
    }
  };

  const fields = useMemo(
    () =>
      (terms.length === 0
        ? allFields
        : allFields.filter((entry) =>
            matches(
              [entry.field.client, entry.field.farm, entry.field.field]
                .concat(
                  workspace.features
                    .filter((f) => f.fieldId === entry.field.id)
                    .map((f) => f.source),
                )
                .join(' '),
            ),
          )
      ).filter((entry) => matchesStatus(entry.field.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFields, terms, workspace.features, status, statusByField],
  );

  const ungrouped = useMemo(
    () =>
      // A status filter is about fields; ungrouped polygons are not fields yet, so they
      // step aside rather than pretending to have a status.
      status !== 'all'
        ? []
        : terms.length === 0
          ? allUngrouped
          : allUngrouped.filter((f) => matches(f.source)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allUngrouped, terms, status],
  );

  /** Fields with nothing blocking them, which is what "ready to export" means. */
  const readyCount = useMemo(
    () => allFields.filter((entry) => (blockingByField.get(entry.field.id) ?? 0) === 0).length,
    [allFields, blockingByField],
  );

  const hiddenFields = allFields.length - fields.length;
  const filtering = terms.length > 0 || status !== 'all';
  const searching = filtering;

  const totalHa = fields.reduce((sum, entry) => sum + entry.areaHa, 0);
  const selectedIds = [...selection];

  // A field that has been deleted or ungrouped must not stay ticked invisibly.
  const liveFieldIds = useMemo(
    () => new Set(allFields.map((entry) => entry.field.id)),
    [allFields],
  );
  const checkedIds = useMemo(
    () => [...checked].filter((id) => liveFieldIds.has(id)),
    [checked, liveFieldIds],
  );

  const toggleChecked = (id: FieldId) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A field is expanded automatically when the QA panel sends focus to one of its cells.
  useEffect(() => {
    if (!props.attributeFocus) return;
    setExpanded((current) => new Set(current).add(props.attributeFocus!.fieldId));
  }, [props.attributeFocus]);

  const toggleExpanded = (id: FieldId) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-ink-800 bg-ink-900">
      <PanelHeader title={t('fields.title')} count={allFields.length}>
        <InfoDot text={t('fields.attributeGuidance')} label={t('fields.attributeLabel')} />
        <Button tone="ghost" onClick={props.onNewField} title={t('fields.newHint')}>
          {t('fields.new')}
        </Button>
        <PanelToggle
          side="left"
          collapsed={false}
          onToggle={props.onToggleCollapsed}
          hideLabel={t('panel.hideFields')}
          showLabel={t('panel.showFields')}
        />
      </PanelHeader>

      {allFields.length > 0 && <ReadyProgress ready={readyCount} total={allFields.length} />}

      <div className="shrink-0 border-b border-ink-800 px-2 py-1.5">
        <div className="relative">
          <svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setSearch('')}
            placeholder={t('fields.search')}
            spellCheck={false}
            aria-label={t('fields.searchLabel')}
            className="w-full rounded-md border border-ink-700 bg-ink-950 py-1.5 pl-7 pr-16
              text-xs text-ink-100 placeholder:text-ink-600 focus:border-crop-500 focus:outline-none"
          />
          {searching && (
            <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                onClick={() => props.onZoomToFeatures(fields.flatMap((entry) => entry.featureIds))}
                disabled={fields.length === 0}
                aria-label={t('fields.zoomMatches')}
                title={t('fields.zoomMatchesHint')}
                className="rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-ink-800
                  hover:text-crop-300 disabled:opacity-40"
              >
                {t('fields.zoom')}
              </button>
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('fields.clearSearch')}
                className="rounded px-1 py-0.5 text-ink-500 hover:bg-ink-800 hover:text-ink-100"
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          )}
        </div>
        <div className="mt-1.5 flex gap-1">
          {STATUS_FILTERS.map((option) => {
            const count =
              option.id === 'all'
                ? allFields.length
                : allFields.filter((entry) => {
                    const entry_ = statusByField.get(entry.field.id) ?? { blocking: 0, review: 0 };
                    if (option.id === 'blocking') return entry_.blocking > 0;
                    if (option.id === 'review') return entry_.review > 0;
                    return entry_.blocking === 0 && entry_.review === 0;
                  }).length;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatus(option.id)}
                title={t(option.hint)}
                aria-pressed={status === option.id}
                className={`flex-1 rounded px-1.5 py-1 text-[10px] transition-colors
                  ${
                    status === option.id
                      ? 'bg-ink-700 text-ink-100'
                      : 'text-ink-400 hover:bg-ink-800 hover:text-ink-100'
                  }`}
              >
                {t(option.label)}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {searching && (
          <p className="mt-1 px-0.5 text-[10px] text-ink-500">
            {t('fields.matchCount', { shown: fields.length, total: allFields.length })}
            {hiddenFields > 0 && ` · ${t('fields.hiddenCount', { count: hiddenFields })}`}
            {allUngrouped.length > 0 &&
              ` · ${t('fields.ungroupedCount', {
                shown: ungrouped.length,
                total: allUngrouped.length,
              })}`}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searching && fields.length === 0 && ungrouped.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-ink-400">
            {t('fields.noMatches', { search })}
          </p>
        )}

        {!searching && fields.length === 0 && ungrouped.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-ink-400">
            {t('fields.empty')}
          </p>
        )}

        {fields.length > 0 && (
          <table className="w-full table-fixed border-collapse text-xs">
            {/* Fixed widths so a long farm name cannot squeeze the field name, which is
                the column people actually read the table by. */}
            <colgroup>
              {/* The three name columns are what people read the table by, so they get
                  the room and the area figure moves into the expanded row. Wide enough
                  for the badge and both icons side by side: the icons are transparent
                  rather than absent until hover, so they hold their width. */}
              <col className="w-6" />
              <col className="w-7" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col />
              <col className="w-16" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-ink-850">
              <tr className="text-[10px] uppercase tracking-wide text-ink-400">
                <th className="border-b border-ink-800 py-1.5 pl-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-crop-500 align-middle"
                    aria-label={t('fields.selectAllFields')}
                    title={t('fields.selectAllFieldsHint')}
                    checked={checkedIds.length > 0 && checkedIds.length === fields.length}
                    ref={(node) => {
                      // Partly-ticked reads as indeterminate rather than as "none ticked".
                      if (node) {
                        node.indeterminate =
                          checkedIds.length > 0 && checkedIds.length < fields.length;
                      }
                    }}
                    onChange={(event) =>
                      setChecked(
                        event.target.checked
                          ? new Set(fields.map((entry) => entry.field.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th className="border-b border-ink-800 py-1.5" />
                <th className="border-b border-ink-800 px-1 py-1.5 text-left font-semibold">
                  {t('fields.client')}
                </th>
                <th className="border-b border-ink-800 px-1 py-1.5 text-left font-semibold">
                  {t('fields.farm')}
                </th>
                <th className="border-b border-ink-800 px-1 py-1.5 text-left font-semibold">
                  {t('fields.field')}
                </th>
                <th className="border-b border-ink-800 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {fields.map((entry, index) => {
                const memberSelected = entry.featureIds.some((id) => selection.has(id));
                const blocking = blockingByField.get(entry.field.id) ?? 0;
                return (
                  <FieldRow
                    key={entry.field.id}
                    field={entry.field}
                    color={fieldColor(index)}
                    areaHa={entry.areaHa}
                    memberIds={entry.featureIds}
                    memberSelected={memberSelected}
                    scoped={props.scopeFieldIds.has(entry.field.id)}
                    onFocus={(additive) => props.onFocusField(entry.field.id, additive)}
                    showBlocked={props.showBlocked}
                    hovered={entry.featureIds.some((id) => props.hoverFeatureIds.has(id))}
                    onHover={props.onHoverFeatures}
                    blockingCount={blocking}
                    expanded={expanded.has(entry.field.id)}
                    checked={checked.has(entry.field.id)}
                    onCheck={() => toggleChecked(entry.field.id)}
                    focus={
                      props.attributeFocus?.fieldId === entry.field.id
                        ? props.attributeFocus
                        : null
                    }
                    workspace={workspace}
                    selection={selection}
                    onToggle={() => toggleExpanded(entry.field.id)}
                    onUpdate={(patch) => props.onUpdateField(entry.field.id, patch)}
                    onSelectMembers={() => props.onSelectMany(entry.featureIds)}
                    onZoom={() => props.onZoomToFeatures(entry.featureIds)}
                    onUngroup={() => props.onUngroupField(entry.field.id)}
                    onDelete={() => props.onDeleteField(entry.field.id)}
                    onSelectFeature={props.onSelectFeature}
                    onZoomFeature={(id) => props.onZoomToFeatures([id])}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-[11px] text-ink-400">
                <td colSpan={4} className="border-t border-ink-800 px-2 py-1.5">
                  {searching
                    ? t('fields.shownOf', { shown: fields.length, total: allFields.length })
                    : t.n('fields.toExport', fields.length)}
                </td>
                <td className="border-t border-ink-800 px-1.5 py-1.5 text-right tabular-nums text-ink-100">
                  {formatHa(totalHa)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {ungrouped.length > 0 && (
          <section className="mt-1">
            <div className="flex items-center gap-2 bg-ink-850 px-3 py-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm border border-dashed"
                style={{ borderColor: UNGROUPED_COLOR }}
              />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {t('ungrouped.title')}
              </h3>
              <span className="rounded bg-ink-800 px-1.5 text-[10px] tabular-nums text-ink-400">
                {ungrouped.length}
              </span>
              <button
                type="button"
                className="ml-auto text-[10px] text-ink-400 underline-offset-2 hover:text-crop-300 hover:underline"
                onClick={() => props.onSelectMany(ungrouped.map((f) => f.id))}
              >
                {t('ungrouped.selectAll')}
              </button>
            </div>
            <ul>
              {ungrouped.map((feature) => (
                <li key={feature.id}>
                  <FeatureRow
                    label={feature.source}
                    areaHa={areaHa(feature.geometry)}
                    selected={selection.has(feature.id)}
                    color={UNGROUPED_COLOR}
                    onSelect={(additive) => props.onSelectFeature(feature.id, additive)}
                    onZoom={() => props.onZoomToFeatures([feature.id])}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {checkedIds.length > 0 && (
        <BulkAttributeBar
          count={checkedIds.length}
          onApply={(patch) => props.onBulkUpdateFields(checkedIds, patch)}
          onClear={() => setChecked(new Set())}
        />
      )}

      {selectedIds.length > 0 && (
        <SelectionBar
          count={selectedIds.length}
          fields={fields.map((entry, index) => ({
            field: entry.field,
            color: fieldColor(index),
          }))}
          onCombine={props.onCombine}
          onAssign={props.onAssign}
          onMerge={props.onMergeSelection}
          onDelete={props.onDeleteSelection}
          onZoom={() => props.onZoomToFeatures(selectedIds)}
        />
      )}
    </div>
  );
}

/**
 * How much of the job is done. A list of complaints is easier to work through when it
 * also says how close the end is, and after a bulk fix this is the only thing on screen
 * that shows the batch accomplished something.
 */
function ReadyProgress({ ready, total }: { ready: number; total: number }) {
  const t = useT();
  const share = total === 0 ? 0 : ready / total;
  return (
    <div className="shrink-0 border-b border-ink-800 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <div
          className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-800"
          role="progressbar"
          aria-label={t('fields.progressLabel')}
          aria-valuenow={ready}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300
              ${ready === total ? 'bg-crop-400' : 'bg-crop-500/70'}`}
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-ink-400">
          {t('fields.progress', { ready, total })}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field row                                                                   */
/* -------------------------------------------------------------------------- */

interface FieldRowProps {
  field: WField;
  color: string;
  areaHa: number;
  memberIds: FeatureId[];
  memberSelected: boolean;
  /** True while the quality panel is scoped to this field. */
  scoped: boolean;
  onFocus: (additive: boolean) => void;
  /** Red attribute cells, once an export attempt has been stopped by them. */
  showBlocked: boolean;
  hovered: boolean;
  onHover: (ids: FeatureId[]) => void;
  blockingCount: number;
  expanded: boolean;
  /** Ticked for bulk attribute editing. Independent of the polygon selection. */
  checked: boolean;
  onCheck: () => void;
  focus: AttributeFocus | null;
  workspace: Workspace;
  selection: ReadonlySet<FeatureId>;
  onToggle: () => void;
  onUpdate: (patch: Partial<Omit<WField, 'id'>>) => void;
  onSelectMembers: () => void;
  onZoom: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  onSelectFeature: (id: FeatureId, additive: boolean) => void;
  onZoomFeature: (id: FeatureId) => void;
}

function FieldRow(props: FieldRowProps) {
  const t = useT();
  const { field } = props;
  const members = props.workspace.features.filter((f) => props.memberIds.includes(f.id));

  return (
    <>
      <tr
        onMouseEnter={() => props.onHover(props.memberIds)}
        onMouseLeave={() => props.onHover([])}
        className={`group border-b border-ink-850 align-middle
          ${props.scoped ? 'scoped-row' : ''}
          ${props.hovered ? 'ring-1 ring-inset ring-crop-400/60' : ''}
          ${props.memberSelected ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
      >
        <td className="py-0.5 pl-1.5">
          <input
            type="checkbox"
            className="h-3 w-3 accent-crop-500 align-middle"
            checked={props.checked}
            onChange={props.onCheck}
            aria-label={t('fields.selectForBulk', { name: describeField(field, t) })}
          />
        </td>
        <td className="py-0.5">
          <button
            type="button"
            onClick={props.onToggle}
            title={t.n('fields.polygonCount', props.memberIds.length)}
            className="flex items-center gap-1 text-ink-400 hover:text-ink-100"
          >
            <svg
              viewBox="0 0 12 12"
              className={`h-2.5 w-2.5 transition-transform ${props.expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
            >
              <path d="M4 2l5 4-5 4z" />
            </svg>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: props.color }} />
          </button>
        </td>
        <AttributeCell
          value={field.client}
          column="client"
          focus={props.focus}
          showBlocked={props.showBlocked}
          onChange={(client) => props.onUpdate({ client })}
        />
        <AttributeCell
          value={field.farm}
          column="farm"
          focus={props.focus}
          showBlocked={props.showBlocked}
          onChange={(farm) => props.onUpdate({ farm })}
        />
        <AttributeCell
          value={field.field}
          column="field"
          focus={props.focus}
          showBlocked={props.showBlocked}
          onChange={(value) => props.onUpdate({ field: value })}
        />
        <td className="pr-1.5">
          <div className="flex items-center justify-end gap-0.5">
            {props.blockingCount > 0 && (
              <button
                type="button"
                onClick={(event) => props.onFocus(event.shiftKey)}
                title={t.n('fields.blockingBadge', props.blockingCount)}
                aria-label={t('fields.showIssues', { name: describeField(field, t) })}
                className="mr-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500/20
                  text-[9px] font-bold text-red-300 hover:bg-red-500/40 hover:text-red-100"
              >
                {props.blockingCount}
              </button>
            )}
            <IconButton title={t('fields.selectMembers')} onClick={props.onSelectMembers}>
              <path d="M2 2h4M2 2v4M14 2h-4M14 2v4M2 14h4M2 14v-4M14 14h-4M14 14v-4" />
            </IconButton>
            <IconButton title={t('fields.zoomToField')} onClick={props.onZoom}>
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </IconButton>
          </div>
        </td>
      </tr>

      {props.expanded && (
        <tr className="border-b border-ink-850 bg-ink-950/40">
          <td colSpan={6} className="px-2 py-1.5">
            <p className="mb-1 px-1 text-[11px] tabular-nums text-ink-400">
              {formatHa(props.areaHa)} {t('fields.ha')}
            </p>
            <ul className="mb-1.5 space-y-0.5">
              {members.length === 0 && (
                <li className="px-1 py-1 text-[11px] text-red-300">
                  {t('fields.noMembers')}
                </li>
              )}
              {members.map((member) => (
                <li key={member.id}>
                  <FeatureRow
                    label={member.source}
                    areaHa={areaHa(member.geometry)}
                    selected={props.selection.has(member.id)}
                    color={props.color}
                    dense
                    onSelect={(additive) => props.onSelectFeature(member.id, additive)}
                    onZoom={() => props.onZoomFeature(member.id)}
                  />
                </li>
              ))}
            </ul>
            <div className="flex gap-1.5">
              <Button tone="ghost" onClick={props.onUngroup} title={t('fields.ungroupHint')}>
                {t('fields.ungroup')}
              </Button>
              <Button tone="ghost" onClick={props.onDelete} title={t('fields.deleteFieldHint')}>
                {t('fields.deleteField')}
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Attribute cell                                                              */
/* -------------------------------------------------------------------------- */

function AttributeCell({
  value,
  column,
  focus,
  showBlocked,
  onChange,
}: {
  value: string;
  column: 'client' | 'farm' | 'field';
  focus: AttributeFocus | null;
  showBlocked: boolean;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const targeted = focus?.column === column;

  useEffect(() => {
    if (!targeted) return;
    ref.current?.focus();
    ref.current?.select();
  }, [targeted, focus?.nonce]);

  return (
    <td className="px-0.5 py-0.5">
      <input
        ref={ref}
        className="field-input"
        data-empty={value.trim() === ''}
        data-blocked={showBlocked && value.trim() === ''}
        value={value}
        maxLength={30}
        spellCheck={false}
        placeholder={t(column === 'field' ? 'fields.fieldPlaceholder' : `fields.${column}`)}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t(`fields.${column}` as const)}
      />
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* Feature row                                                                 */
/* -------------------------------------------------------------------------- */

function FeatureRow({
  label,
  areaHa: ha,
  selected,
  color,
  dense,
  onSelect,
  onZoom,
}: {
  label: string;
  areaHa: number;
  selected: boolean;
  color: string;
  dense?: boolean;
  onSelect: (additive: boolean) => void;
  onZoom: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`group flex items-center gap-2 rounded px-2 ${dense ? 'py-0.5' : 'py-1'}
        ${selected ? 'bg-ink-700' : 'hover:bg-ink-850'}`}
    >
      <button
        type="button"
        onClick={(event) => onSelect(event.shiftKey || event.ctrlKey || event.metaKey)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: selected ? '#ffffff' : color }}
        />
        <span className="truncate text-[11px] text-ink-300">{label}</span>
      </button>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{formatHa(ha)} ha</span>
      <IconButton title={t('fields.zoomToPolygon')} onClick={onZoom}>
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </IconButton>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk attribute editing                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Applies one Client and/or Farm name across every ticked field at once.
 *
 * Field is deliberately absent: Client and Farm are shared by design and retyping
 * them per row is where inconsistent spelling creeps in, whereas a Field name
 * identifies one field and giving fifty of them the same name would be a mistake,
 * not a shortcut. Blank boxes are left alone, so Client can be set across a batch
 * without disturbing the Farm names already in it.
 */
function BulkAttributeBar({
  count,
  onApply,
  onClear,
}: {
  count: number;
  onApply: (patch: Partial<Omit<WField, 'id'>>) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [client, setClient] = useState('');
  const [farm, setFarm] = useState('');
  const nothingToApply = client.trim() === '' && farm.trim() === '';

  const apply = () => {
    if (nothingToApply) return;
    const patch: Partial<Omit<WField, 'id'>> = {};
    if (client.trim() !== '') patch.client = client.trim();
    if (farm.trim() !== '') patch.farm = farm.trim();
    onApply(patch);
    setClient('');
    setFarm('');
  };

  return (
    <div className="shrink-0 space-y-2 border-t border-ink-700 bg-ink-850 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-ink-100">
          {t.n('bulk.ticked', count)}
        </span>
        <InfoDot label={t('bulk.label')} text={t('bulk.guidance')} />
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-[10px] text-ink-400 underline-offset-2 hover:text-crop-300 hover:underline"
        >
          {t('bulk.clear')}
        </button>
      </div>

      <div className="flex gap-1.5">
        <input
          value={client}
          onChange={(event) => setClient(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && apply()}
          placeholder={t('bulk.clientPlaceholder')}
          maxLength={30}
          spellCheck={false}
          aria-label={t('bulk.clientLabel')}
          className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5
            text-xs text-ink-100 placeholder:text-ink-600 focus:border-crop-500 focus:outline-none"
        />
        <input
          value={farm}
          onChange={(event) => setFarm(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && apply()}
          placeholder={t('bulk.farmPlaceholder')}
          maxLength={30}
          spellCheck={false}
          aria-label={t('bulk.farmLabel')}
          className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5
            text-xs text-ink-100 placeholder:text-ink-600 focus:border-crop-500 focus:outline-none"
        />
        <Button tone="primary" onClick={apply} disabled={nothingToApply}>
          {t('bulk.apply')}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Selection actions                                                           */
/* -------------------------------------------------------------------------- */

function SelectionBar({
  count,
  fields,
  onCombine,
  onAssign,
  onMerge,
  onDelete,
  onZoom,
}: {
  count: number;
  fields: { field: WField; color: string }[];
  onCombine: () => void;
  onAssign: (fieldId: FieldId | null) => void;
  onMerge: () => void;
  onDelete: () => void;
  onZoom: () => void;
}) {
  const t = useT();
  return (
    <div className="shrink-0 space-y-2 border-t border-ink-700 bg-ink-850 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-ink-100">
          {t.n('selection.count', count)}
        </span>
        <button
          type="button"
          onClick={onZoom}
          className="ml-auto text-[10px] text-ink-400 underline-offset-2 hover:text-crop-300 hover:underline"
        >
          {t('selection.zoom')}
        </button>
      </div>

      <Button tone="primary" onClick={onCombine} className="w-full">
        {t('selection.combine')}
      </Button>

      <div className="flex gap-1.5">
        <select
          className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs
            text-ink-100 focus:border-crop-500 focus:outline-none"
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value) onAssign(value === '__none__' ? null : value);
            event.target.value = '';
          }}
          aria-label={t('selection.moveToLabel')}
        >
          <option value="">{t('selection.moveTo')}</option>
          {fields.map(({ field }) => (
            <option key={field.id} value={field.id}>
              {[field.farm, field.field].filter(Boolean).join(' / ') || t('selection.untitled')}
            </option>
          ))}
          <option value="__none__">{t('selection.ungroupOption')}</option>
        </select>
        <Button onClick={onMerge} title={t('selection.mergeHint')}>
          {t('selection.merge')}
        </Button>
        <Button tone="danger" onClick={onDelete} title={t('selection.deleteHint')}>
          {t('selection.delete')}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded p-1 text-ink-400 opacity-0 transition hover:bg-ink-700 hover:text-ink-100
        focus:opacity-100 group-hover:opacity-100"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
        {children}
      </svg>
    </button>
  );
}
