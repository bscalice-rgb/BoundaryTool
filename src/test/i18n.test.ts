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
import { fieldColor } from '../lib/colors';
import {
  MAX_LOCATE_ZOOM,
  MIN_LOCATE_ZOOM,
  clampLocateZoom,
  describeAccuracy,
  isCoarse,
} from '../lib/locate';
import { newFeature, newField } from '../state/ops';
import { buildHierarchy, hierarchyToText } from '../lib/hierarchy';
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

describe('field colours', () => {
  it('gives each of the first ten fields its own hue', () => {
    const first = Array.from({ length: 10 }, (_, index) => fieldColor(index));
    expect(new Set(first).size).toBe(10);
  });

  // Thirty fields on one screen is an ordinary batch, and a repeat of the same blue
  // two rows apart is the sort of thing that gets a boundary put in the wrong field.
  it('shifts lightness on later passes rather than repeating a colour', () => {
    const thirty = Array.from({ length: 30 }, (_, index) => fieldColor(index));
    expect(new Set(thirty).size).toBe(30);
    expect(fieldColor(0)).not.toBe(fieldColor(10));
    expect(fieldColor(10)).not.toBe(fieldColor(20));
  });

  it('is stable for a given position', () => {
    expect(fieldColor(3)).toBe(fieldColor(3));
    expect(fieldColor(0)).toMatch(/^#[0-9a-f]{6}$/);
    expect(fieldColor(17)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('locating', () => {
  // The bug this exists for: Leaflet frames the accuracy circle, so a desktop fix
  // accurate to 30 km "zoomed to your location" by zooming out to the whole region.
  it('never zooms further out than the view was worth keeping', () => {
    expect(clampLocateZoom(4)).toBe(MIN_LOCATE_ZOOM);
    expect(clampLocateZoom(-3)).toBe(MIN_LOCATE_ZOOM);
  });

  it('never zooms deeper than the imagery can answer for', () => {
    expect(clampLocateZoom(22)).toBe(MAX_LOCATE_ZOOM);
  });

  it('leaves a sensible fit alone', () => {
    expect(clampLocateZoom(14)).toBe(14);
  });

  it('calls a fix approximate only when it is', () => {
    expect(isCoarse(40)).toBe(false);
    expect(isCoarse(5_000)).toBe(false);
    expect(isCoarse(30_000)).toBe(true);
  });

  it('says the accuracy in units that suit it', () => {
    expect(describeAccuracy(45)).toBe('45 m');
    expect(describeAccuracy(1_240)).toBe('1.2 km');
    expect(describeAccuracy(32_000)).toBe('32 km');
    expect(describeAccuracy(0)).toBe('—');
  });
});


describe('the session as a tree', () => {
  const field = (client: string, farm: string, name: string) =>
    newField({ client, farm, field: name });

  it('files fields under their farm and their client', () => {
    const a = field('Acme', 'Home', 'West');
    const b = field('Acme', 'Home', 'East');
    const c = field('Acme', 'Ridge', 'Top');
    const geometry = poly([squareRing(2.5, 48.8, 0.003)]);
    const workspace = {
      fields: [a, b, c],
      features: [a, b, c].map((f) => ({ ...newFeature(geometry, 'x.kml'), fieldId: f.id })),
    };

    const tree = buildHierarchy(workspace, []);
    expect(tree.clients).toHaveLength(1);
    expect(tree.clients[0].name).toBe('Acme');
    expect(tree.clients[0].fieldCount).toBe(3);
    expect(tree.clients[0].farms.map((f) => f.name)).toEqual(['Home', 'Ridge']);
    // Fields read in name order, not the order they happened to be created in.
    expect(tree.clients[0].farms[0].fields.map((f) => f.name)).toEqual(['East', 'West']);
  });

  it('puts the unnamed groups last, where they are not in the way', () => {
    const named = field('Acme', 'Home', 'West');
    const blank = field('', '', '');
    const geometry = poly([squareRing(2.5, 48.8, 0.003)]);
    const tree = buildHierarchy(
      {
        fields: [blank, named],
        features: [blank, named].map((f) => ({
          ...newFeature(geometry, 'x.kml'),
          fieldId: f.id,
        })),
      },
      [],
    );
    expect(tree.clients.map((c) => c.name)).toEqual(['Acme', '']);
  });

  it('carries the blocking count up the branches', () => {
    const a = field('Acme', 'Home', 'West');
    const geometry = poly([squareRing(2.5, 48.8, 0.003)]);
    const workspace = {
      fields: [a],
      features: [{ ...newFeature(geometry, 'x.kml'), fieldId: a.id }],
    };
    const tree = buildHierarchy(workspace, runChecks(workspace, makeTranslator('en')));
    expect(tree.clients[0].blocking).toBe(0);

    const broken = { ...workspace, fields: [{ ...a, field: '' }] };
    const brokenTree = buildHierarchy(broken, runChecks(broken, makeTranslator('en')));
    expect(brokenTree.clients[0].blocking).toBeGreaterThan(0);
    expect(brokenTree.clients[0].farms[0].blocking).toBeGreaterThan(0);
  });

  it('counts the polygons that belong to no field at all', () => {
    const geometry = poly([squareRing(2.5, 48.8, 0.003)]);
    const tree = buildHierarchy(
      { fields: [], features: [newFeature(geometry, 'x.kml')] },
      [],
    );
    expect(tree.ungrouped).toBe(1);
    expect(tree.clients).toEqual([]);
  });

  it('writes itself out as indented text', () => {
    const a = field('Acme', 'Home', 'West');
    const geometry = poly([squareRing(2.5, 48.8, 0.003)]);
    const tree = buildHierarchy(
      { fields: [a], features: [{ ...newFeature(geometry, 'x.kml'), fieldId: a.id }] },
      [],
    );
    expect(hierarchyToText(tree, { client: '?', farm: '?', field: '?' })).toBe(
      'Acme\n  Home\n    West',
    );
  });
});
