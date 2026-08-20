import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureId, FieldId, QAFlag, WField, Workspace } from '../types';
import { areaHa, formatHa } from '../lib/geo';
import { fieldGeometries } from '../lib/qa';
import { UNGROUPED_COLOR, fieldColor } from '../lib/colors';
import { Button, InfoDot, PanelHeader } from './ui';

const ATTRIBUTE_GUIDANCE =
  'Client, Farm and Field are the only attributes CropForce reads, and they are how a ' +
  'boundary is matched to the right grower and holding. Keep the spelling identical ' +
  'across every field belonging to the same client and farm.';

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
  onSelectFeature: (id: FeatureId | null, additive: boolean) => void;
  onSelectMany: (ids: FeatureId[]) => void;
  onUpdateField: (id: FieldId, patch: Partial<Omit<WField, 'id'>>) => void;
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
  const { workspace, selection } = props;
  const [expanded, setExpanded] = useState<ReadonlySet<FieldId>>(new Set());

  const fields = useMemo(() => fieldGeometries(workspace), [workspace]);
  const ungrouped = useMemo(
    () => workspace.features.filter((f) => f.fieldId === null),
    [workspace.features],
  );

  const blockingByField = useMemo(() => {
    const map = new Map<FieldId, number>();
    for (const flag of props.flags) {
      if (flag.severity !== 'blocking') continue;
      for (const id of flag.fieldIds) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [props.flags]);

  const totalHa = fields.reduce((sum, entry) => sum + entry.areaHa, 0);
  const selectedIds = [...selection];

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
      <PanelHeader title="Fields" count={fields.length}>
        <InfoDot text={ATTRIBUTE_GUIDANCE} label="Client / Farm / Field" />
        <Button tone="ghost" onClick={props.onNewField} title="Create an empty field row">
          + Field
        </Button>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fields.length === 0 && ungrouped.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-ink-400">
            Nothing loaded yet. Drop boundary files anywhere on the window, or draw a polygon
            with the map toolbar.
          </p>
        )}

        {fields.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-ink-850">
              <tr className="text-[10px] uppercase tracking-wide text-ink-400">
                <th className="w-6 border-b border-ink-800 py-1.5" />
                <th className="border-b border-ink-800 px-1 py-1.5 text-left font-semibold">Client</th>
                <th className="border-b border-ink-800 px-1 py-1.5 text-left font-semibold">Farm</th>
                <th className="border-b border-ink-800 px-1 py-1.5 text-left font-semibold">Field</th>
                <th className="border-b border-ink-800 px-1.5 py-1.5 text-right font-semibold">ha</th>
                <th className="w-14 border-b border-ink-800 py-1.5" />
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
                    blockingCount={blocking}
                    expanded={expanded.has(entry.field.id)}
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
                  {fields.length} field{fields.length === 1 ? '' : 's'} to export
                </td>
                <td className="border-t border-ink-800 px-1.5 py-1.5 text-right tabular-nums text-ink-100">
                  {formatHa(totalHa)}
                </td>
                <td className="border-t border-ink-800" />
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
                Ungrouped polygons
              </h3>
              <span className="rounded bg-ink-800 px-1.5 text-[10px] tabular-nums text-ink-400">
                {ungrouped.length}
              </span>
              <button
                type="button"
                className="ml-auto text-[10px] text-ink-400 underline-offset-2 hover:text-crop-300 hover:underline"
                onClick={() => props.onSelectMany(ungrouped.map((f) => f.id))}
              >
                Select all
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

/* -------------------------------------------------------------------------- */
/* Field row                                                                   */
/* -------------------------------------------------------------------------- */

interface FieldRowProps {
  field: WField;
  color: string;
  areaHa: number;
  memberIds: FeatureId[];
  memberSelected: boolean;
  blockingCount: number;
  expanded: boolean;
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
  const { field } = props;
  const members = props.workspace.features.filter((f) => props.memberIds.includes(f.id));

  return (
    <>
      <tr
        className={`group border-b border-ink-850 align-middle
          ${props.memberSelected ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
      >
        <td className="py-0.5 pl-1.5">
          <button
            type="button"
            onClick={props.onToggle}
            title={`${props.memberIds.length} polygon${props.memberIds.length === 1 ? '' : 's'}`}
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
          onChange={(client) => props.onUpdate({ client })}
        />
        <AttributeCell
          value={field.farm}
          column="farm"
          focus={props.focus}
          onChange={(farm) => props.onUpdate({ farm })}
        />
        <AttributeCell
          value={field.field}
          column="field"
          focus={props.focus}
          onChange={(value) => props.onUpdate({ field: value })}
        />
        <td className="px-1.5 text-right tabular-nums text-ink-300">{formatHa(props.areaHa)}</td>
        <td className="pr-1.5">
          <div className="flex items-center justify-end gap-0.5">
            {props.blockingCount > 0 && (
              <span
                title={`${props.blockingCount} issue${
                  props.blockingCount === 1 ? '' : 's'
                } blocking export`}
                className="mr-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500/20
                  text-[9px] font-bold text-red-300"
              >
                {props.blockingCount}
              </span>
            )}
            <IconButton title="Select this field's polygons" onClick={props.onSelectMembers}>
              <path d="M2 2h4M2 2v4M14 2h-4M14 2v4M2 14h4M2 14v-4M14 14h-4M14 14v-4" />
            </IconButton>
            <IconButton title="Zoom to field" onClick={props.onZoom}>
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </IconButton>
          </div>
        </td>
      </tr>

      {props.expanded && (
        <tr className="border-b border-ink-850 bg-ink-950/40">
          <td colSpan={6} className="px-2 py-1.5">
            <ul className="mb-1.5 space-y-0.5">
              {members.length === 0 && (
                <li className="px-1 py-1 text-[11px] text-red-300">
                  No polygons assigned. Select polygons on the map and add them to this field.
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
              <Button tone="ghost" onClick={props.onUngroup} title="Release the polygons and remove the field row">
                Ungroup
              </Button>
              <Button tone="ghost" onClick={props.onDelete} title="Delete the field and its polygons">
                Delete field
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
  onChange,
}: {
  value: string;
  column: 'client' | 'farm' | 'field';
  focus: AttributeFocus | null;
  onChange: (value: string) => void;
}) {
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
        value={value}
        maxLength={30}
        spellCheck={false}
        placeholder={column === 'field' ? 'Field name' : column === 'farm' ? 'Farm' : 'Client'}
        onChange={(event) => onChange(event.target.value)}
        aria-label={column}
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
      <IconButton title="Zoom to polygon" onClick={onZoom}>
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </IconButton>
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
  return (
    <div className="shrink-0 space-y-2 border-t border-ink-700 bg-ink-850 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-ink-100">
          {count} polygon{count === 1 ? '' : 's'} selected
        </span>
        <button
          type="button"
          onClick={onZoom}
          className="ml-auto text-[10px] text-ink-400 underline-offset-2 hover:text-crop-300 hover:underline"
        >
          Zoom to selection
        </button>
      </div>

      <Button tone="primary" onClick={onCombine} className="w-full">
        Combine into one field
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
          aria-label="Move selection to a field"
        >
          <option value="">Move to field…</option>
          {fields.map(({ field }) => (
            <option key={field.id} value={field.id}>
              {[field.farm, field.field].filter(Boolean).join(' / ') || 'Untitled field'}
            </option>
          ))}
          <option value="__none__">Ungroup (no field)</option>
        </select>
        <Button onClick={onMerge} title="Dissolve the selected polygons into a single polygon">
          Merge
        </Button>
        <Button tone="danger" onClick={onDelete} title="Delete the selected polygons">
          Delete
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
