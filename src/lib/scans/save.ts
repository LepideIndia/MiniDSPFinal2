import type { ScanResult } from "@/lib/detection";

interface UserShape {
  id: string;
}

interface AuthResult {
  data: { user?: UserShape | null };
  error: unknown;
}

/** The subset of the Supabase client used for persistence. */
export interface RpcClient {
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  from?: (table: string) => any;
  auth?: { getUser: () => PromiseLike<AuthResult> };
}

export class SaveScanError extends Error {
  constructor() {
    // Generic on purpose: Supabase error bodies can contain payload fragments.
    super("save_failed");
    this.name = "SaveScanError";
  }
}

/** Maps the engine result to the save_scan() payload. Only masked, aggregated fields are sent. */
export function toSavePayload(result: ScanResult) {
  return result.findings.map((f) => ({
    type: f.type,
    risk: f.risk,
    match_count: f.matchCount,
    masked_example: f.maskedExample,
  }));
}

async function fallbackSave(client: RpcClient, filename: string, result: ScanResult): Promise<string> {
  const from = client.from;
  const auth = client.auth;
  if (!from || !auth) throw new SaveScanError();

  const userResult = await auth.getUser();
  const userId = userResult.data.user?.id;
  if (!userId) throw new SaveScanError();

  const scanInsert = await from("scans")
    .insert({
      user_id: userId,
      filename,
      risk: result.risk,
      finding_count: result.totalMatches,
    })
    .select("id")
    .single();

  if (scanInsert.error || !scanInsert.data || typeof scanInsert.data !== "object") {
    throw new SaveScanError();
  }
  const scanId = (scanInsert.data as { id?: string }).id;
  if (!scanId) throw new SaveScanError();

  if (result.findings.length > 0) {
    const findings = result.findings.map((finding) => ({
      scan_id: scanId,
      user_id: userId,
      type: finding.type,
      risk: finding.risk,
      match_count: finding.matchCount,
      masked_example: finding.maskedExample,
    }));

    const findingsInsert = await from("findings").insert(findings);
    if (findingsInsert.error) {
      throw new SaveScanError();
    }
  }

  return scanId;
}

/** Saves a scan through the database's preferred path; falls back to direct inserts when a project has not applied the save_scan RPC migration yet. */
export async function saveScan(client: RpcClient, filename: string, result: ScanResult): Promise<string> {
  if (client.rpc) {
    try {
      const response = await client.rpc("save_scan", { p_filename: filename, p_findings: toSavePayload(result) });
      if (!response.error && typeof response.data === "string" && response.data.length > 0) {
        return response.data;
      }
    } catch {
      // Fall through to the direct-insert fallback for older or partially configured Supabase schemas.
    }
  }

  try {
    return await fallbackSave(client, filename, result);
  } catch {
    throw new SaveScanError();
  }
}
