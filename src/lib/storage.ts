import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "./db";

/**
 * Spreads are print PDFs — 25 MB is normal. Serverless platforms cap request bodies
 * far below that (Vercel at 4.5 MB), so the file never travels through this app:
 * the browser asks for a one-time upload URL, PUTs the PDF straight to storage, and
 * only then tells us the metadata.
 *
 * Locally there is no bucket, so the upload URL points back at our own route and the
 * file lands on disk. Both paths look identical to the client.
 */

const BUCKET = process.env.SUPABASE_BUCKET ?? "spreads";

function remote() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function isRemoteStorage(): boolean {
  return remote() !== null;
}

export function newStoredName(): string {
  return `${crypto.randomUUID()}.pdf`;
}

async function supabase(pathname: string, init: RequestInit) {
  const r = remote()!;
  const res = await fetch(`${r.url}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${r.key}`,
      apikey: r.key,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res;
}

/** A short-lived URL the browser can PUT the PDF to. */
export async function createUploadUrl(storedName: string): Promise<string> {
  const r = remote();
  if (!r) return `/api/spreads/blob/${storedName}`;

  const res = await supabase(`/storage/v1/object/upload/sign/${BUCKET}/${storedName}`, {
    method: "POST",
  });
  const { url } = (await res.json()) as { url: string };
  return `${r.url}/storage/v1${url.startsWith("/") ? url : `/${url}`}`;
}

/** A short-lived URL the browser can read the PDF from. */
export async function createReadUrl(storedName: string, expiresIn = 3600): Promise<string> {
  const r = remote();
  if (!r) return `/api/spreads/blob/${storedName}`;

  const res = await supabase(`/storage/v1/object/sign/${BUCKET}/${storedName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${r.url}/storage/v1${signedURL.startsWith("/") ? signedURL : `/${signedURL}`}`;
}

export async function deleteStored(storedName: string): Promise<void> {
  const r = remote();
  if (!r) {
    await fs.rm(path.join(UPLOAD_DIR, storedName), { force: true });
    return;
  }
  await supabase(`/storage/v1/object/${BUCKET}/${storedName}`, { method: "DELETE" }).catch(
    () => {}
  );
}

/* --- local disk, used only when no bucket is configured ------------------- */

export async function writeLocal(storedName: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, safeName(storedName)), bytes);
}

export async function readLocal(storedName: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOAD_DIR, safeName(storedName)));
}

/** Stored names are UUIDs we generated; refuse anything that isn't. */
export function safeName(name: string): string {
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(name)) throw new Error("bad stored name");
  return name;
}
