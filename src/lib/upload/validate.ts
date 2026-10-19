export const MAX_UPLOAD_BYTES = 1_048_576;
export const MAX_FILENAME_LENGTH = 255;

export type UploadErrorCode =
  | "invalid_request"
  | "missing_file"
  | "multiple_files"
  | "empty_file"
  | "invalid_filename"
  | "file_too_large"
  | "unsupported_media_type"
  | "unsupported_extension"
  | "binary_content"
  | "invalid_encoding"
  | "server_error";

/** Short, generic messages only: never include file names, content or matched values. */
export const UPLOAD_ERRORS: Record<UploadErrorCode, { status: number; message: string }> = {
  invalid_request: { status: 400, message: "The upload request is not valid." },
  missing_file: { status: 400, message: "Choose a file to upload." },
  multiple_files: { status: 400, message: "Upload exactly one file." },
  empty_file: { status: 400, message: "The file is empty." },
  invalid_filename: { status: 400, message: "The file name is not valid." },
  file_too_large: { status: 413, message: "The file is larger than 1 MiB." },
  unsupported_media_type: { status: 415, message: "Send the file as multipart/form-data." },
  unsupported_extension: { status: 415, message: "Only .csv and .txt files are supported." },
  binary_content: { status: 415, message: "The file does not look like plain text." },
  invalid_encoding: { status: 415, message: "The file must be valid UTF-8 text." },
  server_error: { status: 500, message: "Something went wrong." },
};

export type ValidationResult =
  | { ok: true; text: string; filename: string }
  | { ok: false; code: UploadErrorCode };

// Control characters, plus invisible/bidirectional formatting characters that can disguise names.
const UNSAFE_NAME_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Drops any directory part and unsafe characters. May return an empty string. */
export function sanitizeFilename(raw: string): string {
  const base = raw.slice(Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1);
  return base.replace(UNSAFE_NAME_CHARS, "").trim();
}

function hasDisallowedControlBytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Allow TAB, LF, CR. Reject NUL, other C0 controls and DEL. UTF-8 multibyte bytes are all >= 0x80.
    if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f) return true;
  }
  return false;
}

/**
 * Validates an uploaded file from its actual bytes (never trust Content-Length, file.size or MIME type).
 * Order: size, filename, extension, binary content, UTF-8.
 * BOM: a leading UTF-8 BOM is accepted and stripped (counted in the size limit). Text without a BOM is accepted too.
 * UTF-16/32 files fail as binary (NUL bytes) or invalid UTF-8.
 */
export function validateUpload(bytes: Uint8Array, rawFilename: string): ValidationResult {
  if (bytes.length === 0) return { ok: false, code: "empty_file" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, code: "file_too_large" };

  const filename = sanitizeFilename(rawFilename);
  const length = Array.from(filename).length; // code points, like Postgres char_length
  if (length < 1 || length > MAX_FILENAME_LENGTH) return { ok: false, code: "invalid_filename" };
  if (!/\.(csv|txt)$/i.test(filename)) return { ok: false, code: "unsupported_extension" };
  if (filename.length <= 4) return { ok: false, code: "invalid_filename" }; // nothing before the extension

  if (hasDisallowedControlBytes(bytes)) return { ok: false, code: "binary_content" };

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text, filename };
  } catch {
    return { ok: false, code: "invalid_encoding" };
  }
}
