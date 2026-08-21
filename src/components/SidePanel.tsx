import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface PanelToggleProps {
  side: 'left' | 'right';
  collapsed: boolean;
  onToggle: () => void;
  hideLabel: string;
  showLabel: string;
}

/**
 * The fold-away button. It lives in the panel's own header rather than floating over
 * it, so it sits with the other things that act on the panel as a whole.
 */
export function PanelToggle(props: PanelToggleProps) {
  const pointsLeft = (props.side === 'left') !== props.collapsed;
  return (
    <button
      type="button"
      onClick={props.onToggle}
      title={props.collapsed ? props.showLabel : props.hideLabel}
      aria-label={props.collapsed ? props.showLabel : props.hideLabel}
      aria-expanded={!props.collapsed}
      className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-400
        hover:bg-ink-800 hover:text-ink-100"
    >
      <svg
        viewBox="0 0 16 16"
        className={`h-3 w-3 ${pointsLeft ? '' : '-scale-x-100'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 3L5 8l5 5" />
      </svg>
    </button>
  );
}

export interface CollapsedRailProps extends PanelToggleProps {
  title: string;
  badge?: number;
  badgeTone?: 'red' | 'amber' | 'grey';
}

/** What a folded panel leaves behind: its name, its worst number, and a way back. */
export function CollapsedRail(props: CollapsedRailProps) {
  return (
    <div
      className={`flex w-9 shrink-0 flex-col items-center gap-2 bg-ink-900 py-2
        ${props.side === 'left' ? 'border-r' : 'border-l'} border-ink-800`}
    >
      <PanelToggle {...props} />
      {props.badge !== undefined && props.badge > 0 && (
        <span
          className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold
            ${
              props.badgeTone === 'red'
                ? 'bg-red-500/25 text-red-200'
                : props.badgeTone === 'amber'
                  ? 'bg-amber-500/25 text-amber-200'
                  : 'bg-ink-800 text-ink-300'
            }`}
        >
          {props.badge}
        </span>
      )}
      <span
        className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400"
        style={{ writingMode: 'vertical-rl' }}
      >
        {props.title}
      </span>
    </div>
  );
}

export interface PanelResizerProps {
  side: 'left' | 'right';
  width: number;
  onWidthChange: (width: number) => void;
  onToggle: () => void;
  minWidth: number;
  maxWidth: number;
  label: string;
}

/**
 * The splitter between a panel and the map.
 *
 * The map is the part of this app that benefits from every pixel it can get — tracing
 * a boundary against imagery is the one job here that is genuinely hard in a small
 * viewport — so neither panel holds a fixed share of the window.
 */
export function PanelResizer(props: PanelResizerProps) {
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<number | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      delete document.body.dataset.resizing;
    },
    [],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = propsRef.current.width;
    setDragging(true);
    document.body.dataset.resizing = 'true';

    const move = (moveEvent: PointerEvent) => {
      const { side, minWidth, maxWidth, onWidthChange } = propsRef.current;
      const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
      // One update per frame: a drag fires far more pointer events than a layout
      // holding a whole table can usefully redraw.
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => onWidthChange(next));
    };
    const up = () => {
      setDragging(false);
      delete document.body.dataset.resizing;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  // The keyboard gets the same control, in steps: a splitter you can only drag is a
  // splitter some people cannot move at all.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    const grow = props.side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = props.side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (event.key === grow) {
      event.preventDefault();
      props.onWidthChange(Math.min(props.maxWidth, props.width + step));
    } else if (event.key === shrink) {
      event.preventDefault();
      props.onWidthChange(Math.max(props.minWidth, props.width - step));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      props.onToggle();
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuenow={Math.round(props.width)}
      aria-valuemin={props.minWidth}
      aria-valuemax={props.maxWidth}
      tabIndex={0}
      title={props.label}
      data-dragging={dragging}
      className="panel-resizer"
      onPointerDown={onPointerDown}
      onDoubleClick={props.onToggle}
      onKeyDown={onKeyDown}
    />
  );
}

/** A panel at a chosen width, or its rail when folded. */
export function SidePanel({
  collapsed,
  width,
  rail,
  children,
}: {
  collapsed: boolean;
  width: number;
  rail: ReactNode;
  children: ReactNode;
}) {
  if (collapsed) return <>{rail}</>;
  return (
    <aside className="min-w-0 shrink-0" style={{ width }}>
      {children}
    </aside>
  );
}
