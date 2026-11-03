import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';

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

/**
 * Reads the zip's list of files, then only the JSON entries: media in a multi-GB export is never
 * read, and HTML entries are listed by name without being decompressed.
 */
async function readZip(file: File, path: string): Promise<InputText[]> {
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
