import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonTone = 'default' | 'primary' | 'danger' | 'ghost';

export function Button({
  children,
  onClick,
  disabled,
  tone = 'default',
  active,
  title,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
  active?: boolean;
  title?: string;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const tones: Record<ButtonTone, string> = {
    default: 'bg-ink-800 hover:bg-ink-700 border-ink-700 text-ink-100',
    primary: 'bg-crop-500 hover:bg-crop-400 border-crop-400 text-ink-950 font-medium',
    danger: 'bg-red-900/60 hover:bg-red-800/70 border-red-700/60 text-red-100',
    ghost: 'bg-transparent hover:bg-ink-800 border-transparent text-ink-300',
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5
        text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40
        focus:outline-none focus-visible:ring-2 focus-visible:ring-crop-400
        ${active ? 'ring-1 ring-crop-400 bg-ink-700' : ''} ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A small "i" that reveals guidance on hover or focus. Used to carry the Arva
 * boundary criteria next to the check each one belongs to, so the tool explains
 * the standard while it enforces it.
 */
export function InfoDot({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const heading = label ?? t('ui.whatThisChecks');
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={heading}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-ink-600
          text-[9px] font-semibold text-ink-400 hover:border-crop-400 hover:text-crop-300
          focus:outline-none focus-visible:ring-2 focus-visible:ring-crop-400"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute right-0 top-5 z-1000 w-64 rounded-md border border-ink-600
            bg-ink-950 p-2.5 text-[11px] leading-relaxed font-normal text-ink-300 shadow-xl"
        >
          <span className="mb-1 block font-semibold text-ink-100">{heading}</span>
          {text}
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                      */
/* -------------------------------------------------------------------------- */

export function PanelHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900 px-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-300">{title}</h2>
      {count !== undefined && (
        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] tabular-nums text-ink-400">
          {count}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

export function Modal({
  title,
  children,
  onClose,
  width = 'max-w-lg',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-2000 grid place-items-center bg-ink-950/75 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} overflow-hidden rounded-lg border border-ink-700
          bg-ink-900 shadow-2xl focus:outline-none`}
      >
        <div className="flex items-center border-b border-ink-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.close', { title })}
            className="ml-auto rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3.5">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
  /** A way out, for a message that would otherwise be a dead end. */
  action?: { label: string; onClick: () => void };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-1500 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-md border
            px-3 py-2 text-xs shadow-xl
            ${
              toast.tone === 'error'
                ? 'border-red-700/70 bg-red-950/95 text-red-100'
                : 'border-ink-600 bg-ink-850/95 text-ink-100'
            }`}
        >
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="min-w-0 flex-1 text-left leading-relaxed"
          >
            {toast.text}
          </button>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.onClick();
                onDismiss(toast.id);
              }}
              className={`shrink-0 self-center rounded border px-2 py-1 font-medium
                ${
                  toast.tone === 'error'
                    ? 'border-red-400/60 hover:bg-red-900/70'
                    : 'border-ink-500 hover:bg-ink-800'
                }`}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
