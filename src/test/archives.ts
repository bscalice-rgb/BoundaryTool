/**
 * Minimal writers for the two archive formats the app reads through libarchive.
 *
 * Neither format has a free encoder, and a binary fixture checked into the repo could
 * only ever hold what it was built with, so the bytes are laid out here instead. Both
 * writers store their members uncompressed, which is all a reader test needs, and both
 * follow the published container layouts — a reader that accepts these accepts a real
 * archive of the same shape.
 */

export interface ArchiveMember {
  path: string;
  bytes: Uint8Array;
}

export const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

export const member = (path: string, content: string | ArrayBuffer | Uint8Array): ArchiveMember => ({
  path,
  bytes:
    typeof content === 'string'
      ? bytesOf(content)
      : content instanceof Uint8Array
        ? content
        : new Uint8Array(content),
});

/* -------------------------------------------------------------------------- */
/* Shared plumbing                                                             */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/** Both formats check their members with the same CRC-32 the rest of the world uses. */
const crc32 = (bytes: ArrayLike<number>): number => {
  let value = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    value = CRC_TABLE[(value ^ bytes[i]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const u32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];

/** Fixtures never come near 4 GB, so the high word is always zero. */
const u64 = (value: number): number[] => [...u32(value), 0, 0, 0, 0];

/** Appends without spreading, so a member of any size stays within argument limits. */
const append = (into: number[], from: ArrayLike<number>): void => {
  for (let i = 0; i < from.length; i += 1) into.push(from[i]);
};

/* -------------------------------------------------------------------------- */
/* RAR 5                                                                       */
/* -------------------------------------------------------------------------- */

/** RAR's variable-length integer: seven bits a byte, high bit set while more follow. */
const rarVint = (value: number): number[] => {
  const out: number[] = [];
  let rest = value;
  do {
    const byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
    out.push(rest > 0 ? byte | 0x80 : byte);
  } while (rest > 0);
  return out;
};

/**
 * One RAR5 block: a CRC of everything from the size field on, then the block itself.
 *
 * Only the two header flags these fixtures need are handled — 0x0002 for "a data area
 * follows" — so there is no extra area to size.
 */
const rarBlock = (type: number, flags: number, body: number[], data?: Uint8Array): number[] => {
  const rest = [
    ...rarVint(type),
    ...rarVint(flags),
    ...(flags & 0x0002 ? rarVint(data?.length ?? 0) : []),
    ...body,
  ];
  const payload = [...rarVint(rest.length), ...rest];
  const block = [...u32(crc32(payload)), ...payload];
  if (data) append(block, data);
  return block;
};

/** A RAR 5 archive whose members are stored rather than compressed. */
export function makeRar5(members: ArchiveMember[]): ArrayBuffer {
  const out: number[] = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]; // "Rar!\x1a\x07\x01\x00"
  append(out, rarBlock(1, 0, rarVint(0))); // main archive header, no volume or solid flags

  for (const entry of members) {
    const name = bytesOf(entry.path);
    const body = [
      ...rarVint(0x0004), // file flags: the unpacked data's CRC32 is present
      ...rarVint(entry.bytes.length), // unpacked size
      ...rarVint(0x20), // attributes: a plain file
      ...u32(crc32(entry.bytes)),
      ...rarVint(0), // compression info: RAR 5.0, method 0 (store)
      ...rarVint(0), // host OS
      ...rarVint(name.length),
      ...name,
    ];
    append(out, rarBlock(2, 0x0002, body, entry.bytes));
  }

  append(out, rarBlock(5, 0, rarVint(0))); // end of archive, no further volumes
  return Uint8Array.from(out).buffer;
}

/* -------------------------------------------------------------------------- */
/* 7z                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 7z's number encoding: the first byte's high bits say how many more follow, and those
 * carry the low bytes of the value, least significant first.
 */
const sevenNumber = (value: number): number[] => {
  let first = 0;
  let mask = 0x80;
  for (let width = 0; width < 8; width += 1) {
    if (value < 2 ** (7 * (width + 1))) {
      first |= Math.floor(value / 2 ** (8 * width)) & 0xff;
      const out = [first];
      let rest = value;
      for (let i = 0; i < width; i += 1) {
        out.push(rest & 0xff);
        rest = Math.floor(rest / 256);
      }
      return out;
    }
    first |= mask;
    mask >>= 1;
  }
  throw new Error('number out of range');
};

const utf16le = (text: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out.push(code & 0xff, (code >>> 8) & 0xff);
  }
  out.push(0, 0); // names are NUL-terminated
  return out;
};

/**
 * A 7z archive whose members are stored with the Copy coder, one folder each, and whose
 * header is written plainly rather than compressed into a header stream.
 *
 * Members must carry content: an empty file needs the kEmptyStream bookkeeping that
 * nothing here has a reason to write.
 */
export function make7z(members: ArchiveMember[]): ArrayBuffer {
  if (members.some((entry) => entry.bytes.length === 0)) {
    throw new Error('make7z: empty members are not supported');
  }

  const header: number[] = [0x01, 0x04]; // kHeader, kMainStreamsInfo

  header.push(0x06, ...sevenNumber(0), ...sevenNumber(members.length), 0x09); // kPackInfo, kSize
  for (const entry of members) header.push(...sevenNumber(entry.bytes.length));
  header.push(0x00); // kEnd of kPackInfo

  header.push(0x07, 0x0b, ...sevenNumber(members.length), 0x00); // kUnPackInfo, kFolder, external
  for (let i = 0; i < members.length; i += 1) {
    header.push(...sevenNumber(1), 0x01, 0x00); // one coder, a one-byte id, Copy
  }
  header.push(0x0c); // kCodersUnPackSize
  for (const entry of members) header.push(...sevenNumber(entry.bytes.length));
  header.push(0x0a, 0x01); // kCRC, all defined
  for (const entry of members) header.push(...u32(crc32(entry.bytes)));
  header.push(0x00); // kEnd of kUnPackInfo
  header.push(0x08, 0x00); // kSubStreamsInfo: one stream per folder, nothing to override
  header.push(0x00); // kEnd of kMainStreamsInfo

  header.push(0x05, ...sevenNumber(members.length)); // kFilesInfo
  const names = members.flatMap((entry) => utf16le(entry.path));
  header.push(0x11, ...sevenNumber(names.length + 1), 0x00, ...names); // kName, size, external
  header.push(0x00); // kEnd of kFilesInfo
  header.push(0x00); // kEnd of kHeader

  const packed: number[] = [];
  for (const entry of members) append(packed, entry.bytes);

  const start = [...u64(packed.length), ...u64(header.length), ...u32(crc32(header))];
  const out = [
    0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, // "7z\xbc\xaf\x27\x1c"
    0x00, 0x04, // format version
    ...u32(crc32(start)),
    ...start,
  ];
  append(out, packed);
  append(out, header);
  return Uint8Array.from(out).buffer;
}
