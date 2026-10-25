import { createEmptySharedState, isSharedStateDocument, SHARED_BLOB_PATH, SharedStateDocument } from "@/lib/shared/schema";
import { head, get, put } from "@vercel/blob";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

export interface SharedStateResult {
  state: SharedStateDocument;
  etag?: string | null;
}

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function getLocalDataPath(): string {
  return join(process.cwd(), ".data", "shared-state.json");
}

export async function readSharedState(): Promise<SharedStateResult> {
  if (isBlobConfigured()) {
    try {
      const headResult = await head(SHARED_BLOB_PATH).catch(() => null);
      const etag = headResult?.etag ?? null;
      const res = await get(SHARED_BLOB_PATH, { access: "private" as any, useCache: false } as any);
      if (!res || res.statusCode !== 200 || !res.stream) {
        return { state: createEmptySharedState(), etag: etag ?? null };
      }
      const reader = res.stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      const parsed = JSON.parse(text);
      if (isSharedStateDocument(parsed)) {
        return { state: parsed, etag };
      }
      return { state: createEmptySharedState(), etag };
    } catch (err: any) {
      if (err?.name === "BlobNotFoundError" || err?.message?.includes("not found") || err?.statusCode === 404) {
        return { state: createEmptySharedState(), etag: null };
      }
      throw err;
    }
  }

  try {
    const path = getLocalDataPath();
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text);
    if (isSharedStateDocument(parsed)) {
      return { state: parsed, etag: null };
    }
  } catch {
    // ignore
  }
  return { state: createEmptySharedState(), etag: null };
}

export async function writeSharedState(state: SharedStateDocument, ifMatch?: string | null): Promise<{ etag?: string | null }> {
  const json = JSON.stringify(state);
  if (isBlobConfigured()) {
    try {
      const result: any = await put(SHARED_BLOB_PATH, json, {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        ifMatch: ifMatch ?? undefined,
      } as any);
      return { etag: result?.etag ?? null };
    } catch (err: any) {
      if (err?.name === "BlobPreconditionFailedError") {
        throw err;
      }
      throw err;
    }
  }

  const path = getLocalDataPath();
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  await writeFile(path, json, "utf8");
  return { etag: null };
}

export async function createSharedStateIfNotExists(state: SharedStateDocument): Promise<{ created: boolean; etag?: string | null }> {
  if (isBlobConfigured()) {
    try {
      const result: any = await put(SHARED_BLOB_PATH, JSON.stringify(state), {
        access: "private",
        contentType: "application/json",
        allowOverwrite: false,
      } as any);
      return { created: true, etag: result?.etag ?? null };
    } catch (err: any) {
      if (err?.name === "BlobAlreadyExistsError" || err?.message?.includes("already exists")) {
        return { created: false, etag: null };
      }
      return { created: false, etag: null };
    }
  }

  const path = getLocalDataPath();
  try {
    await readFile(path, "utf8");
    return { created: false, etag: null };
  } catch {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    await writeFile(path, JSON.stringify(state), "utf8");
    return { created: true, etag: null };
  }
}
