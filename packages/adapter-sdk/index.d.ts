/** Design contract. External adapters are not loaded by the development build. */
export type Tier = 0 | 1 | 2 | 3;
export type Capability = "U" | "S" | "X";
export type Confidence =
  "official_live" | "official_passive" | "estimated" | "unknown" | "mock";
export interface PermissionPolicy {
  tier: Tier;
  capabilities: Capability[];
  network_allowlist: string[];
  workspace_mode:
    | "artifact_only"
    | "fresh_worktree"
    | "persistent_worktree"
    | "repo_readonly";
}
export interface QuotaSnapshot {
  used_pct: number | null;
  resets_at: string | null;
  confidence: Confidence;
  status: "allowed" | "allowed_warning" | "rejected" | "unknown";
  stale: boolean;
  anomalous: boolean;
  observed_at: string;
}
export interface NormalizedEvent {
  type:
    | "text"
    | "tool_call"
    | "command"
    | "file_edit"
    | "usage"
    | "rate_limit"
    | "error"
    | "done"
    | "ignored";
  payload: Record<string, unknown>;
}
export interface RunSpec extends PermissionPolicy {
  id: string;
  prompt_final: string;
  workspace: string;
  session_id?: string;
  signal: AbortSignal;
}
export interface Adapter {
  detect(): Promise<{
    installed: boolean;
    version: string | null;
    binary: string | null;
  }>;
  healthCheck(): Promise<{ healthy: boolean; reason: string | null }>;
  start(spec: RunSpec): AsyncIterable<NormalizedEvent>;
  resume(
    sessionId: string,
    message: string,
    spec: RunSpec,
  ): AsyncIterable<NormalizedEvent>;
  cancel(runId: string): Promise<void>;
  tierToArgs(tier: Tier, policy: PermissionPolicy): string[];
  quotaSources(): Array<{
    kind: string;
    windows: string[];
    poll_interval_ms: number;
  }>;
  capabilities(): Record<string, boolean>;
}
