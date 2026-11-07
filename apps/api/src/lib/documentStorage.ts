import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { UploadDocumentRequestSchema } from "@eo/contracts";
import { badRequest, notFound } from "./errors.js";
const root = () =>
  path.resolve(process.env.DOCUMENT_STORAGE_DIR || ".data/documents");
const uploadSchema = UploadDocumentRequestSchema;
export function parseUpload(body: unknown) {
  const result = uploadSchema.safeParse(body);
  if (!result.success)
    throw badRequest("Provide a PDF, PNG or JPEG file with base64 content.");
  const { fileName, mimeType, contentBase64 } = result.data;
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) ||
    contentBase64.length % 4 !== 0
  )
    throw badRequest("Invalid file encoding.");
  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.length > 5 * 1024 * 1024)
    throw badRequest("File exceeds the 5 MB limit.");
  const valid =
    mimeType === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : mimeType === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid)
    throw badRequest("File content does not match its declared format.");
  return {
    fileName: path
      .basename(fileName)
      .split("")
      .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join(""),
    mimeType,
    bytes,
  };
}
export async function storeUpload(file: ReturnType<typeof parseUpload>) {
  await fs.mkdir(root(), { recursive: true });
  const id = crypto.randomUUID();
  const target = path.join(root(), id);
  await fs.writeFile(target, file.bytes, { flag: "wx" });
  return {
    path: id,
    checksum: crypto.createHash("sha256").update(file.bytes).digest("hex"),
  };
}
export async function readUpload(storagePath: string) {
  if (!/^[a-f0-9-]{36}$/.test(storagePath)) throw notFound("Stored file");
  try {
    return await fs.readFile(path.join(root(), storagePath));
  } catch {
    throw notFound("Stored file");
  }
}
