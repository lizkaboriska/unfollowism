import { unzipSync } from "fflate";

/** A text file from the user's selection, with its path inside a zip or folder when known. */
export interface InputText {
  path: string;
  text: string;
}

const RELEVANT = /\.(json|html?)$/i;

function displayPath(file: File): string {
  // Folder pickers expose the relative path; plain file pickers only the name.
  return file.webkitRelativePath || file.name;
}

function readArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  // Blob.arrayBuffer() is missing in some test environments; FileReader works everywhere.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as ArrayBuffer); };
    reader.onerror = () => { reject(reader.error ?? new Error("Could not read file")); };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Expands the user's selection (zip archives, folders, loose files) into the JSON/HTML
 * text files it contains. Media inside a zip is skipped without being decompressed.
 */
export async function readInputs(files: readonly File[]): Promise<InputText[]> {
  const decoder = new TextDecoder();
  const result: InputText[] = [];

  for (const file of files) {
    const path = displayPath(file);
    if (/\.zip$/i.test(file.name)) {
      const entries = unzipSync(new Uint8Array(await readArrayBuffer(file)), {
        filter: entry => RELEVANT.test(entry.name) && !entry.name.startsWith("__MACOSX/"),
      });
      for (const [name, data] of Object.entries(entries)) {
        result.push({ path: `${path}/${name}`, text: decoder.decode(data) });
      }
    } else if (RELEVANT.test(file.name)) {
      result.push({ path, text: decoder.decode(await readArrayBuffer(file)) });
    }
  }

  return result;
}
