import type { ReactNode } from 'react';
import type { Basemap, Tool } from '../types';
import { Button, InfoDot } from './ui';

export interface ToolSpec {
  id: Tool;
  label: string;
  shortcut: string;
  hint: string;
  /** Tools that act on a selection are disabled until there is one. */
  needsSelection?: boolean;
  icon: ReactNode;
}

export const TOOLS: ToolSpec[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'V',
    hint: 'Click a polygon to select it. Shift-click to add to the selection.',
    icon: <path d="M3 2l9 5-4 1.2L6.6 12z" />,
  },
  {
    id: 'edit',
    label: 'Vertices',
    shortcut: 'E',
    hint: 'Drag a vertex to move it, click the midpoint markers to add one, right-click a vertex to delete it.',
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
    label: 'Move',
    shortcut: 'M',
    hint: 'Drag the whole polygon without changing its shape.',
    needsSelection: true,
    icon: <path d="M8 2v12M2 8h12M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />,
  },
  {
    id: 'draw',
    label: 'Draw',
    shortcut: 'D',
    hint: 'Click to place each vertex. Double-click, press Enter, or click the first vertex again to close the polygon.',
    icon: <path d="M2 8l4-5 8 2-2 8-8 1z" />,
  },
  {
    id: 'cut-hole',
    label: 'Cut hole',
    shortcut: 'H',
    hint:
      'Draw around an area to exclude it — a tree island, a track, a watercourse, a turbine ' +
      'pad. Double-click to close the shape; anything it covers is cut out of the polygons ' +
      'underneath, or out of the selected polygons only when there is a selection.',
    icon: (
      <>
        <path d="M2 2h12v12H2z" />
        <path d="M6 6h4v4H6z" strokeDasharray="2,1.5" />
      </>
    ),
  },
  {
    id: 'split',
    label: 'Split',
    shortcut: 'S',
    hint: 'Draw a line across the selected polygon to cut it in two. Double-click or press Enter to finish the line.',
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
    label: 'Smooth',
    shortcut: 'G',
    hint: 'Reduce vertex noise with a live preview before anything is committed.',
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
  basemap: Basemap;
  onBasemapChange: (value: Basemap) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onMergeSelection: () => void;
}

export default function Toolbar(props: ToolbarProps) {
  const active = TOOLS.find((tool) => tool.id === props.tool);

  return (
    <div className="flex shrink-0 flex-col border-b border-ink-800 bg-ink-900">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        {TOOLS.map((spec) => {
          const disabled = spec.needsSelection && !props.hasSelection;
          return (
            <button
              key={spec.id}
              type="button"
              disabled={disabled}
              onClick={() => props.onToolChange(spec.id)}
              title={`${spec.label} (${spec.shortcut}) — ${spec.hint}`}
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
              {spec.label}
            </button>
          );
        })}

        <Divider />

        <Button
          onClick={props.onMergeSelection}
          disabled={props.selectionCount < 2}
          title="Merge the selected polygons into one (they should be adjacent or overlapping)"
        >
          Merge
        </Button>
        <Button
          tone="danger"
          onClick={props.onDeleteSelection}
          disabled={!props.hasSelection}
          title="Delete the selected polygons (Del)"
        >
          Delete
        </Button>

        <Divider />

        <label
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs
            text-ink-300 hover:bg-ink-800"
          title="Snap vertices to nearby boundaries while drawing and editing, so neighbouring fields meet exactly"
        >
          <input
            type="checkbox"
            checked={props.snapping}
            onChange={(event) => props.onSnappingChange(event.target.checked)}
            className="h-3 w-3 accent-crop-500"
          />
          Snap
        </label>

        <Divider />

        <Button onClick={props.onUndo} disabled={!props.canUndo} title={undoTitle(props.undoLabel)}>
          Undo
        </Button>
        <Button onClick={props.onRedo} disabled={!props.canRedo} title={redoTitle(props.redoLabel)}>
          Redo
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <div className="flex overflow-hidden rounded-md border border-ink-700">
            {(['imagery', 'street'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => props.onBasemapChange(option)}
                className={`px-2.5 py-1.5 text-xs transition-colors ${
                  props.basemap === option
                    ? 'bg-ink-700 text-ink-100'
                    : 'bg-ink-850 text-ink-400 hover:text-ink-100'
                }`}
              >
                {option === 'imagery' ? 'Imagery' : 'Street'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-ink-850 bg-ink-950/60 px-3 py-1">
        <span className="min-w-0 truncate text-[11px] text-ink-400">
          {active ? active.hint : ''}
        </span>
        {active && <InfoDot text={active.hint} label={active.label} />}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-300">
          {props.selectionCount > 0
            ? `${props.selectionCount} selected · ${props.selectionAreaHa.toFixed(2)} ha`
            : 'Nothing selected'}
        </span>
      </div>
    </div>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-ink-800" />;

const undoTitle = (label: string | null) =>
  label ? `Undo: ${label} (Ctrl+Z)` : 'Nothing to undo (Ctrl+Z)';

const redoTitle = (label: string | null) =>
  label ? `Redo: ${label} (Ctrl+Shift+Z)` : 'Nothing to redo (Ctrl+Shift+Z)';

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
  return (
    <div
      className="absolute left-1/2 top-3 z-1000 w-96 -translate-x-1/2 rounded-lg border
        border-ink-600 bg-ink-900/97 p-3 shadow-2xl"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-ink-100">Smoothing preview</h3>
        <InfoDot
          label="Smoothing"
          text={
            'Boundaries traced from imagery or logged by GPS carry far more vertices than the ' +
            'shape needs. Smoothing removes the noise without moving the boundary further than ' +
            'the tolerance you set. The dashed outline is the result; nothing is committed until ' +
            'you apply it.'
          }
        />
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
        aria-label="Smoothing tolerance in metres"
      />

      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-ink-400">Vertices</dt>
          <dd className="tabular-nums text-ink-100">
            {verticesBefore} to {verticesAfter}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400">Removed</dt>
          <dd className="tabular-nums text-ink-100">
            {verticesBefore > 0
              ? `${Math.round(((verticesBefore - verticesAfter) / verticesBefore) * 100)}%`
              : '0%'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-400">Area change</dt>
          <dd
            className={`tabular-nums ${
              Math.abs(areaChangeHa) > 0.05 ? 'text-amber-300' : 'text-ink-100'
            }`}
          >
            {areaChangeHa >= 0 ? '+' : ''}
            {areaChangeHa.toFixed(2)} ha
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex gap-1.5">
        <Button tone="primary" onClick={onApply} disabled={tolerance <= 0} className="flex-1">
          Apply smoothing
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
