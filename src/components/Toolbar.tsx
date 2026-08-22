import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Basemap, FieldId, Tool, WField } from '../types';
import { useT } from '../i18n';
import type { StringKey } from '../i18n';
import { formatHa, formatNum } from '../lib/geo';
import { describeField } from '../lib/qa';
import { Button, InfoDot } from './ui';

export interface ToolSpec {
  id: Tool;
  labelKey: StringKey;
  shortcut: string;
  hintKey: StringKey;
  /** Tools that act on a selection are disabled until there is one. */
  needsSelection?: boolean;
  icon: ReactNode;
}

export const TOOLS: ToolSpec[] = [
  {
    id: 'select',
    labelKey: 'tool.select',
    shortcut: 'V',
    hintKey: 'tool.select.hint',
    icon: <path d="M3 2l9 5-4 1.2L6.6 12z" />,
  },
  {
    id: 'edit',
    labelKey: 'tool.edit',
    shortcut: 'E',
    hintKey: 'tool.edit.hint',
    needsSelection: true,
    icon: (
      <>
        <path d="M3 11L8 3l5 8z" />
        <circle cx="3" cy="11" r="1.4" />
        <circle cx="13" cy="11" r="1.4" />
        <circle cx="8" cy="3" r="1.4" />
      </>
    ),
  },
  {
    id: 'move',
    labelKey: 'tool.move',
    shortcut: 'M',
    hintKey: 'tool.move.hint',
    needsSelection: true,
    icon: <path d="M8 2v12M2 8h12M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />,
  },
  {
    id: 'draw',
    labelKey: 'tool.draw',
    shortcut: 'D',
    hintKey: 'tool.draw.hint',
    icon: <path d="M2 8l4-5 8 2-2 8-8 1z" />,
  },
  {
    id: 'cut-hole',
    labelKey: 'tool.cutHole',
    shortcut: 'H',
    hintKey: 'tool.cutHole.hint',
    icon: (
      <>
        <path d="M2 2h12v12H2z" />
        <path d="M6 6h4v4H6z" strokeDasharray="2,1.5" />
      </>
    ),
  },
  {
    id: 'split',
    labelKey: 'tool.split',
    shortcut: 'S',
    hintKey: 'tool.split.hint',
    needsSelection: true,
    icon: (
      <>
        <path d="M4 2v12M12 2v12" />
        <path d="M8 1v14" strokeDasharray="2,2" />
      </>
    ),
  },
  {
    id: 'simplify',
    labelKey: 'tool.simplify',
    shortcut: 'G',
    hintKey: 'tool.simplify.hint',
    needsSelection: true,
    icon: <path d="M2 11c3 0 3-6 6-6s3 6 6 6" />,
  },
];

export interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  hasSelection: boolean;
  selectionAreaHa: number;
  selectionCount: number;
  snapping: boolean;
  onSnappingChange: (value: boolean) => void;
  /** Where the next drawn polygon lands: a brand new field, or one that exists. */
  drawTarget: FieldId | 'new';
  onDrawTargetChange: (target: FieldId | 'new') => void;
  fields: WField[];
  basemap: Basemap;
  onBasemapChange: (value: Basemap) => void;
  onDeleteSelection: () => void;
  onMergeSelection: () => void;
}

export default function Toolbar(props: ToolbarProps) {
  const t = useT();
  const active = TOOLS.find((tool) => tool.id === props.tool);
  const targetField =
    props.drawTarget === 'new'
      ? null
      : (props.fields.find((field) => field.id === props.drawTarget) ?? null);

  // The draw tool says where the polygon will end up, because that is the only thing
  // about it worth knowing and it used to be a step you had to remember afterwards.
  const activeHint =
    props.tool === 'draw'
      ? targetField
        ? t('tool.draw.hintField', { field: describeField(targetField, t) })
        : t('tool.draw.hintNew')
      : active
        ? t(active.hintKey)
        : '';

  return (
    <div className="flex shrink-0 flex-col border-b border-ink-800 bg-ink-900">
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* The tools wrap among themselves; the basemap switch never pushes them to
            a second row, which is what happens if it shares one wrapping container. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {TOOLS.map((spec) => {
          const disabled = spec.needsSelection && !props.hasSelection;
          return (
            <button
              key={spec.id}
              type="button"
              disabled={disabled}
              onClick={() => props.onToolChange(spec.id)}
              title={`${t(spec.labelKey)} (${spec.shortcut}) — ${t(spec.hintKey)}`}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors
                disabled:cursor-not-allowed disabled:opacity-35
                focus:outline-none focus-visible:ring-2 focus-visible:ring-crop-400
                ${
                  props.tool === spec.id
                    ? 'border-crop-400 bg-crop-500/20 text-crop-300'
                    : 'border-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-100'
                }`}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                {spec.icon}
              </svg>
              {t(spec.labelKey)}
            </button>
          );
        })}

        <Divider />

        <Button
          onClick={props.onMergeSelection}
          disabled={props.selectionCount < 2}
          title={t('toolbar.mergeHint')}
          className="px-2"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M2 3h7v7H2zM7 6h7v7H7z" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">{t('toolbar.merge')}</span>
        </Button>
        <Button
          tone="danger"
          onClick={props.onDeleteSelection}
          disabled={!props.hasSelection}
          title={t('toolbar.deleteHint')}
          className="px-2"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v5M9.5 6.5v5" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">{t('toolbar.delete')}</span>
        </Button>
        </div>

        <div className="flex shrink-0 overflow-hidden rounded-md border border-ink-700">
          {(['imagery', 'street'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => props.onBasemapChange(option)}
              title={t(option === 'imagery' ? 'toolbar.imageryHint' : 'toolbar.streetHint')}
              className={`px-2.5 py-1.5 text-xs transition-colors ${
                props.basemap === option
                  ? 'bg-ink-700 text-ink-100'
                  : 'bg-ink-850 text-ink-400 hover:text-ink-100'
              }`}
            >
              {t(option === 'imagery' ? 'toolbar.imagery' : 'toolbar.street')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-ink-850 bg-ink-950/60 px-3 py-1">
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-400">
          {activeHint}
        </span>
        {active && <InfoDot text={activeHint} label={t(active.labelKey)} />}

        {props.tool === 'draw' && (
          <label
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-400"
            title={t('toolbar.drawIntoHint')}
          >
            {t('toolbar.drawInto')}
            <select
              value={props.drawTarget}
              onChange={(event) =>
                props.onDrawTargetChange(event.target.value as FieldId | 'new')
              }
              aria-label={t('toolbar.drawInto')}
              className="max-w-44 rounded border border-ink-700 bg-ink-950 px-1.5 py-0.5
                text-[11px] text-ink-100 focus:border-crop-500 focus:outline-none"
            >
              <option value="new">{t('toolbar.drawIntoNew')}</option>
              {props.fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {describeField(field, t)}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Snapping lives with the readouts rather than the actions: it is a mode that
            stays on across tools, not something you do once. */}
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-ink-400
            hover:text-ink-100"
          title={t('toolbar.snappingHint')}
        >
          <input
            type="checkbox"
            checked={props.snapping}
            onChange={(event) => props.onSnappingChange(event.target.checked)}
            className="h-3 w-3 accent-crop-500"
          />
          {t('toolbar.snapping')}
        </label>

        <span className="shrink-0 text-[11px] tabular-nums text-ink-300">
          {props.selectionCount > 0
            ? t('toolbar.selected', {
                count: props.selectionCount,
                area: formatHa(props.selectionAreaHa),
              })
            : t('toolbar.nothingSelected')}
        </span>
      </div>
    </div>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-ink-800" />;

/** Curved undo arrow, mirrored for redo. */
const HistoryArrow = ({ forward = false }: { forward?: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    className={`h-3.5 w-3.5 ${forward ? '-scale-x-100' : ''}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.5 6.5h7a3.5 3.5 0 010 7H6" />
    <path d="M5.5 3.5L2.5 6.5l3 3" />
  </svg>
);

/**
 * Undo and redo sit in the app header rather than the map toolbar, because they cover
 * grouping and attribute edits as much as they cover geometry. Each button names the
 * action it would reverse, so the history stays legible without a separate panel.
 */
export function HistoryButtons({
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  pastLabels,
  futureLabels,
  onUndo,
  onRedo,
  onJump,
}: {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  pastLabels: readonly string[];
  futureLabels: readonly string[];
  onUndo: () => void;
  onRedo: () => void;
  onJump: (delta: number) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const undoTitle = undoLabel ? t('app.undo', { label: undoLabel }) : t('app.undoEmpty');
  const redoTitle = redoLabel ? t('app.redo', { label: redoLabel }) : t('app.redoEmpty');

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const jump = (delta: number) => {
    onJump(delta);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <Button onClick={onUndo} disabled={!canUndo} title={undoTitle} className="px-2">
        <HistoryArrow />
        <span className="sr-only">{t('history.undo')}</span>
      </Button>
      <Button onClick={onRedo} disabled={!canRedo} title={redoTitle} className="px-2">
        <HistoryArrow forward />
        <span className="sr-only">{t('history.redo')}</span>
      </Button>
      <Button
        onClick={() => setOpen((value) => !value)}
        disabled={!canUndo && !canRedo}
        title={t('history.open')}
        className="px-1.5"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
          <path d="M4 6l4 4 4-4z" />
        </svg>
        <span className="sr-only">{t('history.open')}</span>
      </Button>

      {open && (
        <div
          className="absolute right-0 top-9 z-2000 w-64 overflow-hidden rounded-md border
            border-ink-600 bg-ink-900 py-1 shadow-2xl"
        >
          <h3 className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            {t('history.title')}
          </h3>
          <ol className="max-h-72 overflow-y-auto">
            {/* Redoable entries sit above "Now", newest of them furthest from it, so the
                list reads top-to-bottom as forwards-to-backwards in time. */}
            {futureLabels
              .map((label, index) => ({ label, delta: index + 1 }))
              .reverse()
              .map(({ label, delta }) => (
                <HistoryEntry
                  key={`future-${delta}`}
                  label={label}
                  title={t('history.jumpForward')}
                  tone="future"
                  onClick={() => jump(delta)}
                />
              ))}
            <li
              className="flex items-center gap-2 border-y border-ink-800 bg-ink-850 px-3 py-1
                text-[10px] font-semibold uppercase tracking-wider text-crop-300"
            >
              {t('history.now')}
            </li>
            {pastLabels.length === 0 && futureLabels.length === 0 && (
              <li className="px-3 py-2 text-[11px] text-ink-400">{t('history.empty')}</li>
            )}
            {[...pastLabels]
              .reverse()
              .map((label, index) => (
                <HistoryEntry
                  key={`past-${index}`}
                  label={label}
                  title={t('history.jumpBack')}
                  tone="past"
                  onClick={() => jump(-(index + 1))}
                />
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function HistoryEntry({
  label,
  title,
  tone,
  onClick,
}: {
  label: string;
  title: string;
  tone: 'past' | 'future';
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`block w-full truncate px-3 py-1.5 text-left text-[11px] hover:bg-ink-800
          ${tone === 'future' ? 'text-ink-400 italic' : 'text-ink-200'}`}
      >
        {label}
      </button>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Smoothing panel                                                             */
/* -------------------------------------------------------------------------- */

export function SmoothingPanel({
  tolerance,
  onToleranceChange,
  verticesBefore,
  verticesAfter,
  areaChangeHa,
  onApply,
  onCancel,
}: {
  tolerance: number;
  onToleranceChange: (value: number) => void;
  verticesBefore: number;
  verticesAfter: number;
  areaChangeHa: number;
  onApply: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div
      className="absolute left-1/2 top-3 z-1000 w-96 -translate-x-1/2 rounded-lg border
        border-ink-600 bg-ink-900/97 p-3 shadow-2xl"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-ink-100">{t('smoothing.title')}</h3>
        <InfoDot label={t('smoothing.label')} text={t('smoothing.guidance')} />
        <span className="ml-auto text-[11px] tabular-nums text-ink-300">{tolerance} m</span>
      </div>

      <input
        type="range"
        min={0}
        max={25}
        step={0.5}
        value={tolerance}
        onChange={(event) => onToleranceChange(Number(event.target.value))}
        className="w-full"
        aria-label={t('smoothing.tolerance')}
      />

      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-ink-400">{t('smoothing.vertices')}</dt>
          <dd className="tabular-nums text-ink-100">
            {t('smoothing.verticesValue', { before: verticesBefore, after: verticesAfter })}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400">{t('smoothing.removed')}</dt>
          <dd className="tabular-nums text-ink-100">
            {verticesBefore > 0
              ? `${formatNum(((verticesBefore - verticesAfter) / verticesBefore) * 100)}%`
              : '0%'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400">{t('smoothing.areaChange')}</dt>
          <dd
            className={`tabular-nums ${
              Math.abs(areaChangeHa) > 0.05 ? 'text-amber-300' : 'text-ink-100'
            }`}
          >
            {areaChangeHa >= 0 ? '+' : ''}
            {formatHa(areaChangeHa)} ha
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex gap-1.5">
        <Button tone="primary" onClick={onApply} disabled={tolerance <= 0} className="flex-1">
          {t('smoothing.apply')}
        </Button>
        <Button onClick={onCancel}>{t('smoothing.cancel')}</Button>
      </div>
    </div>
  );
}
