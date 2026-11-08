import { mkdir, readFile, writeFile } from "node:fs/promises";
import { get, put } from "@vercel/blob";
import path from "node:path";
import { db } from "./db";
import { randomToken } from "./crypto";
import { AppError } from "./errors";

/**
 * File storage.
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (connect a Blob store to the Vercel project).
 *    Files are stored with `private` access by default (BLOB_ACCESS=public for a public store) and are
 *    only ever served through /api/files/[id], which checks permissions.
 *  - Otherwise local disk: STORAGE_DIR, else ./storage. On Vercel without Blob, /tmp is used so uploads
 *    don't crash, but those files are temporary — connect a Blob store for anything real.
 */
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const blobAccess = (): "public" | "private" => (process.env.BLOB_ACCESS === "public" ? "public" : "private");
const storageDir = () => process.env.STORAGE_DIR ?? (process.env.VERCEL ? "/tmp/stitchworks-storage" : path.join(process.cwd(), "storage"));

type Kind = { mime: string; ext: string; maxMb: number; test: (b: Buffer) => boolean };

const starts = (b: Buffer, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

// Detected from file contents (magic bytes) — the browser-supplied type is never trusted.
export const KINDS: Kind[] = [
  { mime: "image/jpeg", ext: "jpg", maxMb: 10, test: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  { mime: "image/png", ext: "png", maxMb: 10, test: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: "image/webp", ext: "webp", maxMb: 10, test: (b) => starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8) },
  { mime: "application/pdf", ext: "pdf", maxMb: 15, test: (b) => starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { mime: "video/mp4", ext: "mp4", maxMb: 50, test: (b) => starts(b, [0x66, 0x74, 0x79, 0x70], 4) && !starts(b, [0x71, 0x74], 8) },
  { mime: "video/quicktime", ext: "mov", maxMb: 50, test: (b) => starts(b, [0x66, 0x74, 0x79, 0x70, 0x71, 0x74], 4) },
  // DOCX/XLSX are ZIP containers; the extension decides which.
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", maxMb: 15, test: (b) => starts(b, [0x50, 0x4b, 0x03, 0x04]) },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx", maxMb: 15, test: (b) => starts(b, [0x50, 0x4b, 0x03, 0x04]) },
];

export const PURPOSE_KINDS: Record<string, string[]> = {
  BULK_ORDER: ["jpg", "png", "webp", "pdf", "docx", "xlsx"],
  PORTFOLIO: ["jpg", "png", "webp", "pdf", "mp4", "mov"],
  APPLICATION: ["jpg", "png", "webp", "pdf"],
  ASSIGNMENT: ["jpg", "png", "webp", "pdf", "docx"],
  CMS: ["jpg", "png", "webp"],
  COURSE: ["jpg", "png", "webp", "pdf", "docx", "xlsx", "mp4"],
};

export function detectKind(buf: Buffer, filename: string, allowed: string[]): Kind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const zipExt = ext === "docx" || ext === "xlsx";
  const kind = KINDS.find((k) => allowed.includes(k.ext) && k.test(buf) && (!["docx", "xlsx"].includes(k.ext) || (zipExt && k.ext === ext)));
  if (!kind) throw new AppError(`"${filename}" is not an accepted file type. Allowed: ${allowed.join(", ").toUpperCase()}.`);
  if (buf.length > kind.maxMb * 1024 * 1024) throw new AppError(`"${filename}" is larger than ${kind.maxMb} MB.`);
  return kind;
}

async function putObject(key: string, buf: Buffer, contentType: string) {
  if (useBlob()) {
    await put(key, buf, { access: blobAccess(), contentType, addRandomSuffix: false });
    return;
  }
  const full = path.join(storageDir(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
}

export async function getObject(key: string): Promise<Buffer> {
  if (key.includes("..")) throw new AppError("Invalid key");
  if (useBlob()) {
    const r = await get(key, { access: blobAccess() });
    if (!r || r.statusCode !== 200) throw new AppError("File not found", "NOT_FOUND", 404);
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  return readFile(path.join(storageDir(), key));
}

export async function saveUpload(file: File, opts: { ownerId: string | null; purpose: keyof typeof PURPOSE_KINDS; visibility?: "PUBLIC" | "PRIVATE" }) {
  if (!file || file.size === 0) throw new AppError("Empty file.");
  if (file.size > 50 * 1024 * 1024) throw new AppError(`"${file.name}" is too large.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectKind(buf, file.name, PURPOSE_KINDS[opts.purpose]);
  const key = `${opts.purpose.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomToken(18)}.${kind.ext}`;
  await putObject(key, buf, kind.mime);
  const safeName = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return db.upload.create({ data: { ownerId: opts.ownerId, storageKey: key, originalName: safeName, mimeType: kind.mime, size: buf.length, visibility: opts.visibility ?? "PRIVATE", purpose: opts.purpose } });
}

export async function saveUploads(files: File[], opts: Parameters<typeof saveUpload>[1], max = 10) {
  const real = files.filter((f) => f && typeof f === "object" && f.size > 0);
  if (real.length > max) throw new AppError(`Upload at most ${max} files.`);
  const out = [];
  for (const f of real) out.push(await saveUpload(f, opts));
  return out;
}
