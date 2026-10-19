// Requires a signed-in user (checked first, before the body is read). Saves only masked, aggregated results,
// via the atomic save_scan() RPC with the user's own session. Never log content, matches or Supabase error bodies.
import { scanText } from "@/lib/detection";
import { SaveScanError, saveScan } from "@/lib/scans/save";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_ERRORS,
  validateUpload,
  type UploadErrorCode,
} from "@/lib/upload/validate";

export const runtime = "nodejs";

// Room for the multipart envelope (boundaries, headers, a 255-character filename).
const ENVELOPE_ALLOWANCE = 64 * 1024;
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + ENVELOPE_ALLOWANCE;

type ErrorCode = UploadErrorCode | "unauthorized" | "save_failed";
const ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  ...UPLOAD_ERRORS,
  unauthorized: { status: 401, message: "Sign in to upload files." },
  save_failed: { status: 500, message: "The scan could not be saved." },
};

function fail(code: ErrorCode): Response {
  const { status, message } = ERRORS[code];
  return Response.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reads the body, counting real bytes. Returns null as soon as the cap is exceeded. */
async function readBodyCapped(request: Request, cap: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Authenticate before reading anything from the request body.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return fail("unauthorized");

    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data\s*;/i.test(contentType)) return fail("unsupported_media_type");

    const declared = request.headers.get("content-length");
    if (declared !== null) {
      if (!/^\d+$/.test(declared)) return fail("invalid_request");
      if (Number(declared) > MAX_BODY_BYTES) return fail("file_too_large");
    }

    // Content-Length can be absent or wrong, so also cap the bytes actually received.
    const body = await readBodyCapped(request, MAX_BODY_BYTES);
    if (body === null) return fail("file_too_large");

    let entries: [string, FormDataEntryValue][];
    try {
      const form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
      entries = [...form.entries()];
    } catch {
      return fail("invalid_request");
    }

    if (entries.length === 0) return fail("missing_file");
    if (entries.length > 1) return fail("multiple_files");
    const [name, value] = entries[0];
    if (name !== "file" || typeof value === "string") return fail("missing_file");

    const bytes = new Uint8Array(await value.arrayBuffer());
    const checked = validateUpload(bytes, value.name);
    if (!checked.ok) return fail(checked.code);

    const result = scanText(checked.text);

    let scanId: string;
    try {
      scanId = await saveScan(supabase, checked.filename, result);
    } catch (error) {
      if (error instanceof SaveScanError) return fail("save_failed");
      throw error;
    }

    return Response.json(
      {
        scanId,
        filename: checked.filename,
        risk: result.risk,
        findingCount: result.totalMatches,
        findings: result.findings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Deliberately not logged: error details could include request content.
    return fail("server_error");
  }
}
