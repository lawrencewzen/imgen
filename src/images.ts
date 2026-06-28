import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import { ImpersonatedSession } from "./http.js";
import type { InstallIdentity } from "./fingerprint.js";
import { detectTerminal, platformSandboxTag } from "./fingerprint.js";
import { BASE_INSTRUCTIONS } from "./instructions.js";

const RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
export const REQUEST_TIMEOUT_S = 600;
const MAX_EDIT_IMAGES = 5;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GenOptions {
  prompt: string;
  model: string;
  size: string;
  quality: string;
  background: string;
}

export interface EditOptions extends GenOptions {
  imagePaths: string[];
}

export interface ImageResult {
  b64: string;
  size: string;
}

/** All per-request context needed to talk to the backend. */
export interface RequestContext {
  session: ImpersonatedSession;
  token: string;
  accountId: string;
  identity: InstallIdentity;
  sessionId: string;
  threadId: string;
}

// ---------------------------------------------------------------------------
// Turn context (consistent across header + body)
// ---------------------------------------------------------------------------

interface TurnContext {
  turnId: string;
  timestampMs: number;
  sessionId: string;
  threadId: string;
  windowId: string;
}

function createTurnContext(sessionId: string, threadId: string): TurnContext {
  return {
    turnId: randomUUID(),
    timestampMs: Date.now(),
    sessionId,
    threadId,
    windowId: `${threadId}:0`,
  };
}

function turnMetadataJson(ctx: TurnContext): string {
  return JSON.stringify({
    turn_id: ctx.turnId,
    turn_started_at_unix_ms: ctx.timestampMs,
    session_id: ctx.sessionId,
    thread_id: ctx.threadId,
    sandbox: platformSandboxTag(),
    request_kind: "turn",
    window_id: ctx.windowId,
    workspace_kind: "local",
    has_changes: false,
  });
}

// ---------------------------------------------------------------------------
// User-Agent  (matches codex_cli_rs format exactly)
// ---------------------------------------------------------------------------

function buildUserAgent(identity: InstallIdentity): string {
  const base = `codex_cli_rs/${identity.codexVersion} (${identity.osType} ${identity.osVersion}; ${identity.arch})`;
  const terminal = detectTerminal();
  return terminal ? `${base} ${terminal}` : base;
}

// ---------------------------------------------------------------------------
// Headers — full Codex CLI header set
// ---------------------------------------------------------------------------

function buildHeaders(
  token: string,
  accountId: string,
  identity: InstallIdentity,
  turn: TurnContext,
): Record<string, string> {
  const metadataStr = turnMetadataJson(turn);
  return {
    Authorization: `Bearer ${token}`,
    ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "OpenAI-Beta": "responses_websockets=2026-02-06",
    originator: "codex_cli_rs",
    "User-Agent": buildUserAgent(identity),
    "OAI-Product-Sku": "codex",
    "x-codex-installation-id": identity.installationId,
    "x-codex-window-id": turn.windowId,
    "x-responses": "api-include-timing-metrics",
    "session-id": turn.sessionId,
    "thread-id": turn.threadId,
    "x-client-request-id": turn.turnId,
    "x-codex-turn-metadata": metadataStr,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Validation/usage error → CLI exit code 2. */
export function usageError(message: string): Error {
  return Object.assign(new Error(message), { exitCode: 2 });
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Read an input image and return a base64 data URL. Throws usageError on problems. */
export function imageToDataUrl(path: string): string {
  if (!existsSync(path)) throw usageError(`输入图不存在: ${path}`);
  const ext = extname(path).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw usageError(`不支持的图片类型: ${ext || "(无扩展名)"}（支持 png/jpg/jpeg/webp/gif）`);
  }
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

/** image_generation tool config. */
export function imageTool(o: GenOptions): Record<string, unknown> {
  const tool: Record<string, unknown> = { type: "image_generation" };
  if (o.size && o.size !== "auto") tool["size"] = o.size;
  if (o.quality && o.quality !== "auto") tool["quality"] = o.quality;
  if (o.background && o.background !== "auto") tool["background"] = o.background;
  return tool;
}

// ---------------------------------------------------------------------------
// Request body builder  (pure — no identity dependency, testable)
// ---------------------------------------------------------------------------

export function buildRequest(
  o: GenOptions,
  imageParts: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: o.prompt },
    ...imageParts,
  ];
  return {
    model: o.model,
    instructions: BASE_INSTRUCTIONS,
    input: [{ type: "message", role: "user", content }],
    tools: [imageTool(o)],
    tool_choice: "auto",
    parallel_tool_calls: false,
    stream: true,
    store: false,
    reasoning: { effort: "medium" },
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
  };
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

interface SseEvent {
  type?: string;
  item?: Record<string, unknown>;
  [key: string]: unknown;
}

function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data) as SseEvent);
    } catch {
      /* skip non-JSON keepalive lines */
    }
  }
  return events;
}

function asLongB64(value: unknown): string | null {
  return typeof value === "string" && value.length > 100 ? value : null;
}

/** Pull the generated image out of the SSE event stream. */
export function extractImage(text: string): ImageResult {
  const events = parseSse(text);

  let finalB64: string | null = null;
  let partialB64: string | null = null;
  let size = "";

  for (const e of events) {
    const item = e.item;
    if (e.type === "response.output_item.done" && item && item["type"] === "image_generation_call") {
      const b = asLongB64(item["result"]);
      if (b) {
        finalB64 = b;
        if (typeof item["size"] === "string") size = item["size"];
      }
    } else if (typeof e.type === "string" && e.type.includes("partial_image")) {
      const b = asLongB64(e["partial_image_b64"]) ?? asLongB64(e["result"]);
      if (b) partialB64 = b;
    }
  }

  const b64 = finalB64 ?? partialB64;
  if (!b64) {
    const fail = events.find((e) => e.type === "response.failed" || e.type === "error");
    throw new Error(`图片生成失败：${describeFailure(fail) ?? "后端未返回图片"}`);
  }
  return { b64, size };
}

function describeFailure(event: SseEvent | undefined): string | null {
  if (!event) return null;
  const resp = event["response"] as Record<string, unknown> | undefined;
  const err =
    (event["error"] as Record<string, unknown> | undefined) ??
    (resp?.["error"] as Record<string, unknown> | undefined);
  return (err?.["message"] as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// HTTP error mapping
// ---------------------------------------------------------------------------

function mapHttpError(status: number, text: string): Error {
  const detail = extractMessage(text);
  if (status === 401 || status === 403) {
    return new Error(`认证/权限失败 (${status})：账号可能是免费号，图片生成需 Plus/Pro。${detail}`);
  }
  if (status === 429) return new Error(`撞限流 (429)：稍后再试。${detail}`);
  if (status === 400) return new Error(`请求被拒 (400)：${detail}`);
  return new Error(`后端返回 ${status}。${detail}`);
}

function extractMessage(text: string): string {
  if (!text) return "";
  try {
    const j = JSON.parse(text) as { error?: { message?: string }; message?: string; detail?: string };
    return j.error?.message ?? j.message ?? j.detail ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

// ---------------------------------------------------------------------------
// Core request runner
// ---------------------------------------------------------------------------

// 瞬时失败重试配置：后端常吐 "An error occurred while processing your request"
// （200 流里的 response.failed）、429、5xx —— 这些 OpenAI 自己说 "You can retry"。
const MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = [2000, 6000, 15000]; // 第 2/3/4 次尝试前的等待

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 仅对瞬时/服务端类错误重试；认证、400、输入校验等永久错误立即放弃。 */
export function isRetryableFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("an error occurred while processing your request") || // 后端瞬时内部错误
    m.includes("后端未返回图片") || // SSE 空流，瞬时
    message.includes("撞限流 (429)") || // 限流
    /后端返回 5\d\d/.test(message) || // 5xx
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("socket") ||
    m.includes("network")
  );
}

async function runRequestOnce(
  ctx: RequestContext,
  request: Record<string, unknown>,
): Promise<ImageResult> {
  const turn = createTurnContext(ctx.sessionId, ctx.threadId);

  // Enrich body with client_metadata (matches real Codex)
  const body: Record<string, unknown> = {
    ...request,
    prompt_cache_key: ctx.threadId,
    client_metadata: {
      "x-codex-installation-id": ctx.identity.installationId,
    },
  };

  const hdrs = buildHeaders(ctx.token, ctx.accountId, ctx.identity, turn);
  const res = await ctx.session.post(RESPONSES_URL, hdrs, JSON.stringify(body));
  if (res.status !== 200) throw mapHttpError(res.status, res.text);
  return extractImage(res.text);
}

async function runRequest(
  ctx: RequestContext,
  request: Record<string, unknown>,
): Promise<ImageResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // 每次尝试都用全新的 turn（runRequestOnce 内部新建 turnId）
      return await runRequestOnce(ctx, request);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isUsage = (err as { exitCode?: number }).exitCode === 2;
      if (isUsage || attempt >= MAX_ATTEMPTS || !isRetryableFailure(msg)) throw err;
      const wait = RETRY_BACKOFF_MS[attempt - 1] ?? 15000;
      process.stderr.write(
        `第 ${attempt}/${MAX_ATTEMPTS} 次失败，${Math.round(wait / 1000)}s 后重试：${msg}\n`,
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generate(ctx: RequestContext, o: GenOptions): Promise<ImageResult> {
  return runRequest(ctx, buildRequest(o, []));
}

export async function edit(ctx: RequestContext, o: EditOptions): Promise<ImageResult> {
  if (o.imagePaths.length < 1 || o.imagePaths.length > MAX_EDIT_IMAGES) {
    throw usageError(`图生图需要 1~${MAX_EDIT_IMAGES} 张输入图，收到 ${o.imagePaths.length} 张`);
  }
  const parts = o.imagePaths.map((p) => ({ type: "input_image", image_url: imageToDataUrl(p) }));
  return runRequest(ctx, buildRequest(o, parts));
}
