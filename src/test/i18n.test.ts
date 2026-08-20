import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { pt } from '../i18n/pt';
import { es } from '../i18n/es';
import {
  LANGUAGES,
  LANGUAGE_ORDER,
  detectLang,
  interpolate,
  makeTranslator,
} from '../i18n/translator';
import type { Lang } from '../i18n/translator';
import { runChecks } from '../lib/qa';
import { newFeature, newField } from '../state/ops';
import { poly, squareRing } from './fixtures';

const DICTIONARIES: Record<Lang, Record<string, string>> = { en, pt, es };

describe('string tables', () => {
  it('every language carries exactly the English key set', () => {
    const expected = Object.keys(en).sort();
    for (const lang of LANGUAGE_ORDER) {
      expect(Object.keys(DICTIONARIES[lang]).sort(), lang).toEqual(expected);
    }
  });

  it('no string is left empty', () => {
    for (const lang of LANGUAGE_ORDER) {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('translations carry the same placeholders as the English original', () => {
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort();
    for (const lang of LANGUAGE_ORDER) {
      if (lang === 'en') continue;
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        expect(placeholders(value), `${lang}:${key}`).toEqual(
          placeholders(en[key as keyof typeof en]),
        );
      }
    }
  });

  it('every plural pair has both halves', () => {
    for (const key of Object.keys(en)) {
      if (!key.endsWith('.one')) continue;
      expect(en).toHaveProperty(`${key.slice(0, -4)}.other`);
    }
  });

  // Portuguese and Spanish are for people who read them; a stray English word in the
  // middle of a translated screen is the failure mode this catches.
  it('does not leave English text sitting in a translated table', () => {
    // A trailing letter test that understands accents, so "exportá-lo" is not read as
    // the English word "export".
    const giveaways = /(?<![\wÀ-ÿ])(field|farm|the|boundary|polygon|export)(?![\wÀ-ÿ])/i;
    // Client / Farm / Field name the exported columns and stay in English on purpose.
    const columnNames = /^(Client|Farm|Field)$/;
    for (const lang of ['pt', 'es'] as const) {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        if (columnNames.test(value)) continue;
        if (key.startsWith('fields.client') || key.startsWith('fields.farm')) continue;
        const stripped = value
          .replace(/\{\w+\}/g, '')
          .replace(/Client|Farm|Field/g, '')
          .replace(/CropForce|WGS84|EPSG|Esri|OpenStreetMap|Google Maps/g, '');
        expect(giveaways.test(stripped), `${lang}:${key} → ${value}`).toBe(false);
      }
    }
  });
});

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('{a} of {b}', { a: 1, b: 4 }, ['en-GB'])).toBe('1 of 4');
  });

  it('leaves an unknown placeholder alone rather than printing "undefined"', () => {
    expect(interpolate('{a} of {b}', { a: 1 }, ['en-GB'])).toBe('1 of {b}');
  });

  it('formats numbers in the target locale', () => {
    expect(interpolate('{n}', { n: 1234.5 }, ['pt-BR'])).toBe('1.234,5');
    expect(interpolate('{n}', { n: 1234.5 }, ['en-GB'])).toBe('1,234.5');
  });
});

describe('translator', () => {
  it('picks the singular and plural forms apart', () => {
    const t = makeTranslator('en');
    expect(t.n('fields.polygonCount', 1)).toBe('1 polygon');
    expect(t.n('fields.polygonCount', 3)).toBe('3 polygons');
  });

  it('passes the count through as a variable', () => {
    const t = makeTranslator('es');
    expect(t.n('selection.count', 2)).toContain('2');
  });

  it('returns the translated string for each language', () => {
    expect(makeTranslator('pt')('app.clear')).toBe(pt['app.clear']);
    expect(makeTranslator('es')('app.clear')).toBe(es['app.clear']);
  });
});

describe('detectLang', () => {
  it('reads the browser preference order', () => {
    expect(detectLang(['pt-BR', 'en-US'])).toBe('pt');
    expect(detectLang(['es-AR'])).toBe('es');
    expect(detectLang(['en-GB', 'pt'])).toBe('en');
  });

  it('falls back to English for a language it does not have', () => {
    expect(detectLang(['fr-FR', 'de'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });
});

describe('checks in another language', () => {
  it('reports flags in the language it is handed', () => {
    const field = newField({ client: '', farm: '', field: '' });
    const geometry = poly([squareRing(2.5, 48.8, 0.003)]);
    const workspace = {
      fields: [field],
      features: [{ ...newFeature(geometry, 'a.kml'), fieldId: field.id }],
    };
    const flags = runChecks(workspace, makeTranslator('pt'));
    const missing = flags.find((flag) => flag.kind === 'missing-attributes');
    expect(missing?.title).toContain('atributos');
    expect(missing?.guidance).toBe(pt['guidance.missing-attributes']);
  });

  it('leaves an empty workspace with nothing to say in any language', () => {
    for (const lang of LANGUAGE_ORDER) {
      expect(runChecks({ fields: [], features: [] }, makeTranslator(lang))).toEqual([]);
    }
  });
});

describe('language metadata', () => {
  it('names every language in its own words', () => {
    expect(LANGUAGES.pt.label).toBe('Português (BR)');
    expect(LANGUAGES.es.label).toBe('Español (LATAM)');
    expect(LANGUAGES.en.label).toBe('English');
  });
});
