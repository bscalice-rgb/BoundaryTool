/**
 * Folding attribute values down to plain ASCII.
 *
 * CropForce will not take accented or non-Latin characters in Client, Farm or Field,
 * so "Améca" has to reach it as "Ameca" and "Caiçara" as "Caicara". Doing it here, in
 * one place, means the same rule applies whether a name arrived from a file, was typed
 * into the table, or came back from an auto-fix.
 *
 * Most of the work is Unicode's: NFD splits an accented letter into its base plus a
 * combining mark, and the marks are then dropped. What NFD does not decompose is a
 * letter that is not an accented form of anything — ø, ß, æ — so those are spelled out
 * by hand below.
 */
const SPELLED_OUT: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ł: 'l',
  Ł: 'L',
  ħ: 'h',
  Ħ: 'H',
  ı: 'i',
  İ: 'I',
  ŋ: 'n',
  Ŋ: 'N',
  '№': 'No',
};

/** Punctuation a word processor substitutes silently, mapped back to the typeable form. */
const PUNCTUATION: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '−': '-',
  ' ': ' ',
  '…': '...',
  '°': ' ',
  'º': 'o',
  'ª': 'a',
};

/**
 * The plain-ASCII form of a name.
 *
 * Anything still outside printable ASCII after folding — a Cyrillic or CJK character,
 * an emoji — is dropped rather than guessed at: there is no transliteration of those
 * that a grower would recognise as their own field, and inventing one would be worse
 * than leaving the name visibly shorter for them to correct.
 */
export function toAscii(value: string): string {
  const folded = [...value]
    .map((character) => SPELLED_OUT[character] ?? PUNCTUATION[character] ?? character)
    .join('')
    .normalize('NFD')
    // Combining marks: the accents NFD has just separated from their letters.
    .replace(/[̀-ͯ]/g, '');

  // eslint-disable-next-line no-control-regex
  return folded.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
}

/** True when a value would change on the way through `toAscii`. */
export const hasNonAscii = (value: string): boolean => toAscii(value) !== value.trim();

/** The characters in a value that will not survive, for saying so in a message. */
export function nonAsciiCharacters(value: string): string[] {
  const seen = new Set<string>();
  for (const character of value) {
    // eslint-disable-next-line no-control-regex
    if (!/^[\x20-\x7e]$/.test(character)) seen.add(character);
  }
  return [...seen];
}
