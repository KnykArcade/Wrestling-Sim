import type { WorkbookData, WorkbookSheetData } from "./types";

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function fileExtension(name: string): string {
  return name.split(".").at(-1)?.toLowerCase() ?? "";
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

function uint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

interface ZipEntry {
  name: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function zipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endOffset = -1;
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (uint32(view, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("The Excel file does not contain a readable ZIP directory.");
  const entryCount = uint16(view, endOffset + 10);
  const directoryOffset = uint32(view, endOffset + 16);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (uint32(view, offset) !== 0x02014b50) throw new Error("The Excel ZIP directory is malformed.");
    const compression = uint16(view, offset + 10);
    const compressedSize = uint32(view, offset + 20);
    const fileNameLength = uint16(view, offset + 28);
    const extraLength = uint16(view, offset + 30);
    const commentLength = uint16(view, offset + 32);
    const localHeaderOffset = uint32(view, offset + 42);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    entries.push({ name, compression, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function decompressDeflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser does not support read-only Excel decompression.");
  const copy = Uint8Array.from(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const offset = entry.localHeaderOffset;
  if (uint32(view, offset) !== 0x04034b50) throw new Error(`The Excel entry ${entry.name} has an invalid local header.`);
  const nameLength = uint16(view, offset + 26);
  const extraLength = uint16(view, offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return decompressDeflateRaw(compressed);
  throw new Error(`The Excel entry ${entry.name} uses unsupported ZIP compression method ${entry.compression}.`);
}

function normalizeZipPath(value: string): string {
  const parts: string[] = [];
  for (const part of value.replace(/^\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function workbookRelationships(xml: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]+?)\/?\s*>/g)) {
    const attributes = match[1];
    const id = attributes.match(/\bId="([^"]+)"/)?.[1] ?? "";
    const target = attributes.match(/\bTarget="([^"]+)"/)?.[1] ?? "";
    if (id && target) result.set(id, normalizeZipPath(`xl/${target}`));
  }
  return result;
}

function workbookSheets(xml: string, relationships: Map<string, string>): Array<{ name: string; path: string }> {
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of xml.matchAll(/<sheet\b([^>]+?)\/?\s*>/g)) {
    const attributes = match[1];
    const name = decodeXml(attributes.match(/\bname="([^"]*)"/)?.[1] ?? "Worksheet");
    const id = attributes.match(/(?:r:id|id)="([^"]+)"/)?.[1] ?? "";
    const path = relationships.get(id) ?? "";
    if (path) sheets.push({ name, path });
  }
  return sheets;
}

function sharedStrings(xml: string): string[] {
  const values: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const text = Array.from(match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((item) => decodeXml(item[1])).join("");
    values.push(text);
  }
  return values;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let value = 0;
  for (const character of letters) value = value * 26 + character.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function worksheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] ?? `A${rows.length + 1}`;
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inline = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((item) => decodeXml(item[1])).join("");
      let value = inline || decodeXml(raw);
      if (type === "s") value = strings[Number(raw)] ?? "";
      if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      row[columnIndex(reference)] = value;
    }
    while (row.length > 0 && (row.at(-1) ?? "") === "") row.pop();
    rows.push(row.map((value) => value ?? ""));
  }
  return rows.filter((row) => row.some((value) => value.trim() !== ""));
}

async function parseExcelBuffer(buffer: ArrayBuffer, fileName: string, fileType: "xlsx" | "xlsm"): Promise<WorkbookData> {
  const entries = zipEntries(buffer);
  const entryMap = new Map(entries.map((entry) => [normalizeZipPath(entry.name), entry]));
  const decoder = new TextDecoder("utf-8");
  const readText = async (path: string): Promise<string> => {
    const entry = entryMap.get(normalizeZipPath(path));
    if (!entry) return "";
    return decoder.decode(await readZipEntry(buffer, entry));
  };
  const workbookXml = await readText("xl/workbook.xml");
  const relationsXml = await readText("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relationsXml) throw new Error("The workbook does not contain readable worksheet metadata.");
  const strings = sharedStrings(await readText("xl/sharedStrings.xml"));
  const relationships = workbookRelationships(relationsXml);
  const sheets: WorkbookSheetData[] = [];
  for (const sheet of workbookSheets(workbookXml, relationships)) {
    const xml = await readText(sheet.path);
    if (xml) sheets.push({ name: sheet.name, rows: worksheetRows(xml, strings) });
  }
  if (sheets.length === 0) throw new Error("No readable worksheets were found in the Excel file.");
  return { fileName, fileType, sheets };
}

function objectRows(value: unknown): string[][] {
  const records = Array.isArray(value) ? value : typeof value === "object" && value !== null && Array.isArray((value as { profiles?: unknown[] }).profiles) ? (value as { profiles: unknown[] }).profiles : [];
  const objects = records.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item));
  if (objects.length === 0) return [];
  const headers = Array.from(new Set(objects.flatMap((record) => Object.keys(record))));
  return [headers, ...objects.map((record) => headers.map((header) => {
    const value = record[header];
    return value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  }))];
}

export async function readProfileWorkbook(file: File): Promise<WorkbookData> {
  const extension = fileExtension(file.name);
  if (extension === "csv") return { fileName: file.name, fileType: "csv", sheets: [{ name: "CSV", rows: parseCsvText(await file.text()) }] };
  if (extension === "json") {
    let value: unknown;
    try { value = JSON.parse(await file.text()) as unknown; } catch { throw new Error("The selected profile JSON is not valid JSON."); }
    const rows = objectRows(value);
    if (rows.length === 0) throw new Error("The profile JSON does not contain an array of profile objects.");
    return { fileName: file.name, fileType: "json", sheets: [{ name: "Profiles", rows }] };
  }
  if (extension === "xlsx" || extension === "xlsm") return parseExcelBuffer(await file.arrayBuffer(), file.name, extension);
  throw new Error("Select an .xlsx, .xlsm, .csv, or tracker profile .json file.");
}
