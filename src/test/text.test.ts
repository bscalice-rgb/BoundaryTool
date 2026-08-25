import { describe, expect, it } from 'vitest';
import { hasNonAscii, nonAsciiCharacters, toAscii } from '../lib/text';

describe('folding names to ASCII', () => {
  it('strips the accents CropForce will not take', () => {
    expect(toAscii('Améca')).toBe('Ameca');
    expect(toAscii('Caiçara')).toBe('Caicara');
    expect(toAscii('São João')).toBe('Sao Joao');
    expect(toAscii('Fazenda Três Irmãos')).toBe('Fazenda Tres Irmaos');
    expect(toAscii('Peñón')).toBe('Penon');
    expect(toAscii('Île-de-France')).toBe('Ile-de-France');
  });

  it('spells out letters that are not accented forms of anything', () => {
    expect(toAscii('Straße')).toBe('Strasse');
    expect(toAscii('Ærø')).toBe('AEro');
    expect(toAscii('Łódź')).toBe('Lodz');
  });

  it('brings typographic punctuation back to what a keyboard produces', () => {
    expect(toAscii('O’Brien')).toBe("O'Brien");
    expect(toAscii('North – South')).toBe('North - South');
    expect(toAscii('Lot 12')).toBe('Lot 12');
  });

  it('leaves a name that is already plain alone', () => {
    expect(toAscii('Long Acre (293)')).toBe('Long Acre (293)');
    expect(toAscii('Block 7B')).toBe('Block 7B');
  });

  // Guessing at a transliteration nobody would recognise is worse than a short name
  // the user can see is wrong and correct.
  it('drops what it cannot fold rather than inventing a spelling', () => {
    expect(toAscii('Поле 3')).toBe('3');
    expect(toAscii('田 12')).toBe('12');
  });

  it('tidies the whitespace it leaves behind', () => {
    expect(toAscii('  Ameca   Norte  ')).toBe('Ameca Norte');
  });

  it('knows when a value would change', () => {
    expect(hasNonAscii('Caiçara')).toBe(true);
    expect(hasNonAscii('Caicara')).toBe(false);
    expect(hasNonAscii('  Caicara  ')).toBe(false);
  });

  it('names the characters that will not survive', () => {
    expect(nonAsciiCharacters('Caiçara')).toEqual(['ç']);
    expect(nonAsciiCharacters('São João')).toEqual(['ã']);
    expect(nonAsciiCharacters('Ameca')).toEqual([]);
  });
});
