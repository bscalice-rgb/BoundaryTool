import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, LANGUAGE_ORDER, useLanguage } from '../i18n';
import type { Lang } from '../i18n';

/**
 * Switches the interface language. Deliberately not remembered anywhere: this app
 * stores nothing at all, and a preference file would be the first exception.
 */
export default function LanguagePicker() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const choose = (next: Lang) => {
    setLang(next);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('app.language')}
        title={t('app.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-800 px-2 py-1.5
          text-xs text-ink-100 hover:bg-ink-700"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.2" />
          <path d="M2 8h12M8 1.8c1.7 2 2.6 4 2.6 6.2S9.7 12.2 8 14.2C6.3 12.2 5.4 10.2 5.4 8s.9-4.2 2.6-6.2z" />
        </svg>
        {LANGUAGES[lang].short}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('app.language')}
          className="absolute right-0 top-9 z-2000 w-44 overflow-hidden rounded-md border
            border-ink-600 bg-ink-900 py-1 shadow-2xl"
        >
          {LANGUAGE_ORDER.map((id) => (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={id === lang}
                onClick={() => choose(id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs
                  hover:bg-ink-800 ${id === lang ? 'text-crop-300' : 'text-ink-200'}`}
              >
                <span className="w-6 shrink-0 text-[10px] tabular-nums text-ink-500">
                  {LANGUAGES[id].short}
                </span>
                {LANGUAGES[id].label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
