/**
 * A text file from the user's selection, with its path inside a zip or folder when known.
 * `text` is empty for an HTML file inside a zip: HTML is only recognized by its name (see analyzeImport).
 */
export interface InputText {
  path: string;
  text: string;
}

const JSON_FILE = /\.json$/i;
const HTML_FILE = /\.html?$/i;

function displayPath(file: File): string {
  // Folder pickers expose the relative path; plain file pickers only the name.
  return file.webkitRelativePath || file.name;
}

function readArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  // Blob.arrayBuffer() is missing in some test environments; FileReader works everywhere.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read file'));
    };
    reader.readAsArrayBuffer(file);
  });
}

type ZipLibrary = typeof import('@zip.js/zip.js/lib/zip-core-native.js');

let zipLibrary: Promise<ZipLibrary> | null = null;

/**
 * Loads the zip reader in its own file, so the app's first load doesn't carry it. The Import screen calls this
 * when it opens, so the reader is ready by the time a file is picked. A failed load is forgotten so the next call
 * tries again; Chrome still fails it at once for the life of the page, so only a reload recovers there. The native
 * build unzips with the browser's own DecompressionStream (no bundled code for it).
 */
export function loadZipLibrary(): Promise<ZipLibrary> {
  zipLibrary ??= import('@zip.js/zip.js/lib/zip-core-native.js').catch((error: unknown) => {
    zipLibrary = null;
    throw error;
  });
  return zipLibrary;
}

/**
 * Reads the zip's list of files, then only the JSON entries: media in a multi-GB export is never
 * read, and HTML entries are listed by name without being decompressed.
 */
async function readZip(file: File, path: string): Promise<InputText[]> {
  const { BlobReader, TextWriter, ZipReader } = await loadZipLibrary();
  const zip = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const result: InputText[] = [];
    for (const entry of await zip.getEntries()) {
      if (entry.directory || entry.filename.startsWith('__MACOSX/')) {
        continue;
      }
      const entryPath = `${path}/${entry.filename}`;
      if (HTML_FILE.test(entry.filename)) {
        result.push({ path: entryPath, text: '' });
      } else if (JSON_FILE.test(entry.filename)) {
        result.push({ path: entryPath, text: await entry.getData(new TextWriter()) });
      }
    }
    return result;
  } finally {
    await zip.close();
  }
}

/** Expands the user's selection (zip archives, folders, loose files) into the JSON/HTML text files it contains. */
export async function readInputs(files: readonly File[]): Promise<InputText[]> {
  const decoder = new TextDecoder();
  const result: InputText[] = [];

  for (const file of files) {
    const path = displayPath(file);
    if (/\.zip$/i.test(file.name)) {
      result.push(...(await readZip(file, path)));
    } else if (JSON_FILE.test(file.name) || HTML_FILE.test(file.name)) {
      result.push({ path, text: decoder.decode(await readArrayBuffer(file)) });
    }
  }

  return result;
}
