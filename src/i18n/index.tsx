import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setNumberLocale } from '../lib/geo';
import { LANGUAGES, detectLang, makeTranslator, setAmbientTranslator } from './translator';
import type { Lang, Translator } from './translator';

export * from './translator';

interface LanguageValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translator;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(
    () => initial ?? detectLang(typeof navigator === 'undefined' ? [] : navigator.languages ?? []),
  );

  const t = useMemo(() => makeTranslator(lang), [lang]);

  // Formatting and wording reach parts of the app that are not React, so both are also
  // pushed down rather than threaded through every call site. Done during render as well
  // as in the effect, so the first paint after a language change is already translated.
  setNumberLocale(LANGUAGES[lang].locales);
  setAmbientTranslator(t);

  useEffect(() => {
    setNumberLocale(LANGUAGES[lang].locales);
    setAmbientTranslator(t);
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en';
  }, [lang, t]);

  const change = useCallback((next: Lang) => setLang(next), []);
  const value = useMemo(() => ({ lang, setLang: change, t }), [lang, change, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside a LanguageProvider');
  return value;
}

export function useT(): Translator {
  return useLanguage().t;
}
