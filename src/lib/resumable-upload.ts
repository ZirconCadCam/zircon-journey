/**
 * Resumable upload to Supabase Storage using TUS protocol.
 * Persists upload URLs in localStorage so an interrupted upload
 * (network loss, page reload) automatically resumes from where it left off.
 */
import * as tus from "tus-js-client";
import { ATTACHMENTS_BUCKET } from "./chat";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface ResumableHandle {
  abort: () => void;
  pause: () => void;
  resume: () => void;
}

export interface ResumableOptions {
  bucket?: string;
  path: string;
  file: File | Blob;
  fileName?: string;
  onProgress?: (pct: number, loaded: number, total: number) => void;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

/** Start (or resume) a TUS upload. The browser auto-saves progress to localStorage. */
export async function startResumableUpload(opts: ResumableOptions): Promise<ResumableHandle> {
  const bucket = opts.bucket ?? ATTACHMENTS_BUCKET;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(opts.file as File, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      // Upload paths are unique. Always use the project's public upload role
      // instead of a possibly stale browser session left from another
      // workspace, and explicitly disable replacement so Storage only checks
      // the INSERT policy (not UPDATE/SELECT policies on the private bucket).
      headers: {
        authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: opts.path,
        contentType: (opts.file as File).type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // Required by Supabase TUS
      onError: (err) => opts.onError?.(err as Error),
      onProgress: (loaded, total) => {
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        opts.onProgress?.(pct, loaded, total);
      },
      onSuccess: () => opts.onSuccess?.(),
    });

    // Resume previous if exists
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
      resolve({
        abort: () => upload.abort(true),
        pause: () => upload.abort(),
        resume: () => upload.start(),
      });
    }).catch((e) => {
      // If lookup fails just start fresh
      try { upload.start(); resolve({ abort: () => upload.abort(true), pause: () => upload.abort(), resume: () => upload.start() }); }
      catch { reject(e); }
    });
  });
}
