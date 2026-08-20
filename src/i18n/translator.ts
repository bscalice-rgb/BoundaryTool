import { en } from './en';
import type { Dictionary, StringKey } from './en';
import { pt } from './pt';
import { es } from './es';

export type { StringKey, Dictionary } from './en';

export type Lang = 'en' | 'pt' | 'es';

interface LanguageMeta {
  /** Shown in the picker, in the language itself — nobody looks for "Portuguese". */
  label: string;
  /** Short form for the collapsed button. */
  short: string;
  /** BCP 47 tags for Intl, most specific first. */
  locales: string[];
  dictionary: Dictionary;
}

export const LANGUAGES: Record<Lang, LanguageMeta> = {
  en: { label: 'English', short: 'EN', locales: ['en-GB', 'en'], dictionary: en },
  pt: { label: 'Português (BR)', short: 'PT', locales: ['pt-BR', 'pt'], dictionary: pt },
  es: { label: 'Español (LATAM)', short: 'ES', locales: ['es-419', 'es'], dictionary: es },
};

export const LANGUAGE_ORDER: Lang[] = ['en', 'pt', 'es'];

/** Bases of the `.one` / `.other` pairs, so a plural call cannot name a key that is not one. */
type PluralBaseOf<K> = K extends `${infer Base}.one` ? Base : never;
export type PluralKey = PluralBaseOf<StringKey>;

export type Vars = Record<string, string | number>;

export interface Translator {
  (key: StringKey, vars?: Vars): string;
  /** Picks `.one` or `.other` and passes `count` through as a variable. */
  n(key: PluralKey, count: number, vars?: Vars): string;
  lang: Lang;
  locales: string[];
}

/**
 * The language a fresh tab starts in. Read from the browser rather than remembered,
 * because nothing about the workspace is remembered either — there is no storage in this
 * app, and a language preference is not the place to introduce one.
 */
export function detectLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary === 'pt') return 'pt';
    if (primary === 'es') return 'es';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

export function interpolate(template: string, vars: Vars | undefined, locales: string[]): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in vars)) return match;
    const value = vars[name];
    return typeof value === 'number' ? formatNumber(value, locales) : value;
  });
}

export function formatNumber(value: number, locales: string[]): string {
  return value.toLocaleString(locales, { maximumFractionDigits: 2 });
}

export function makeTranslator(lang: Lang): Translator {
  const { dictionary, locales } = LANGUAGES[lang];
  const translate = ((key: StringKey, vars?: Vars) =>
    interpolate(dictionary[key] ?? en[key] ?? key, vars, locales)) as Translator;
  translate.n = (key, count, vars) =>
    translate(`${key}.${count === 1 ? 'one' : 'other'}` as StringKey, { count, ...vars });
  translate.lang = lang;
  translate.locales = locales;
  return translate;
}

/* -------------------------------------------------------------------------- */
/* Ambient translator                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The current language, reachable from the parts of the app that are not React: the
 * file parsers, the check engine and the auto-fixes all produce sentences the user
 * reads, and none of them sits anywhere a hook can be called. The provider keeps this
 * in step with the picker; everything else reads it through a default argument, so a
 * call site that has a translator to hand can still pass its own.
 */
let ambient: Translator = makeTranslator('en');

export const setAmbientTranslator = (t: Translator): void => {
  ambient = t;
};

export const ambientT = (): Translator => ambient;
