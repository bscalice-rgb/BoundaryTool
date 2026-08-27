import type { ArchiveReader, LibarchiveWasm } from 'libarchive-wasm';
import wasmUrl from 'libarchive-wasm/dist/libarchive.wasm?url';
import { ambientT } from '../i18n/translator';

/**
 * Archive formats read through libarchive.
 *
 * .zip is not in this list: JSZip already handles it, and shpjs reads a zipped
 * shapefile bundle straight from the raw buffer, which is the common case by far.
 * These two are the formats a Windows user is most likely to hand over instead.
 */
export const ARCHIVE_EXTENSIONS = ['rar', '7z'] as const;

export const isArchiveExtension = (ext: string): boolean =>
  (ARCHIVE_EXTENSIONS as readonly string[]).includes(ext);

export interface ArchiveEntry {
  /** The path as stored in the archive, folders included. */
  path: string;
  bytes: Uint8Array<ArrayBuffer>;
}

interface Engine {
  wasm: LibarchiveWasm;
  Reader: typeof ArchiveReader;
}

/**
 * Emscripten looks for its .wasm beside the script that loaded it. In the browser Vite
 * hashes the file into the assets folder, so the URL has to be handed over; under Node —
 * where the unit tests run — the default already finds the file on disk and a bundler
 * URL would mean nothing to `fs`.
 */
const runningInNode = typeof (globalThis as { process?: unknown }).process === 'object';

let engine: Promise<Engine> | null = null;

/**
 * 600 KB of WebAssembly is a lot to hand someone who only ever opens a .kml, so the
 * decoder is fetched the first time an archive actually turns up and kept afterwards.
 */
const startEngine = async (): Promise<Engine> => {
  const { ArchiveReader: Reader, libarchiveWasm } = await import('libarchive-wasm');
  const wasm = await libarchiveWasm(runningInNode ? {} : { locateFile: () => wasmUrl });
  return { wasm, Reader };
};

/** Archive members that are packaging noise rather than anything a user put there. */
const isJunk = (path: string): boolean => {
  const name = path.split('/').pop() ?? path;
  return path.includes('__MACOSX') || name.startsWith('._') || name === '.DS_Store';
};

/**
 * Reads the members of a .rar or .7z into memory.
 *
 * Only what `wanted` accepts is decompressed — the rest is skipped without being
 * expanded, so a boundary set that happens to sit next to a folder of aerial imagery
 * costs nothing to open.
 */
export async function readArchive(
  buffer: ArrayBuffer,
  wanted: (path: string) => boolean,
): Promise<ArchiveEntry[]> {
  // A failed load is not cached: a dropped connection on the first archive should not
  // condemn every archive the user opens afterwards.
  engine ??= startEngine().catch((error: unknown) => {
    engine = null;
    throw error;
  });
  const { wasm, Reader } = await engine;

  const reader = new Reader(wasm, new Int8Array(buffer));
  const entries: ArchiveEntry[] = [];
  let encrypted = 0;
  try {
    for (const entry of reader.entries()) {
      if (entry.getFiletype() !== 'File') continue;
      const path = entry.getPathname();
      if (isJunk(path) || !wanted(path)) continue;
      // Password-protected members read as garbage rather than failing outright, so
      // they are counted and left alone.
      if (entry.isEncrypted()) {
        encrypted += 1;
        continue;
      }
      const size = entry.getSize();
      const data = size === 0 ? new Int8Array(0) : entry.readData();
      if (!data || data.length !== size) {
        throw new Error(ambientT()('note.archiveTruncated', { entry: path }));
      }
      // `readData` hands back a fresh slice, so this is a view onto bytes nobody else
      // holds — no copy needed to keep it.
      const bytes = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
      entries.push({ path, bytes });
    }
  } finally {
    reader.free();
  }

  if (entries.length === 0 && encrypted > 0) {
    throw new Error(ambientT()('note.archiveEncrypted'));
  }
  return entries;
}
