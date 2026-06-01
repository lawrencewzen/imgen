import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import { ImpersonatedSession } from "./http.js";

// Image generation runs through the Codex Responses endpoint + the hosted
// image_generation tool. The direct REST /images/generations route is not
// deployed on the production backend (404), so we drive the tool via /responses
// and read the image out of the SSE stream.
const RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_VERSION = "0.135.0";
const REQUEST_TIMEOUT_S = 600;
const MAX_EDIT_IMAGES = 5;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

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

/** Validation/usage error → CLI exit code 2. */
export function usageError(message: string): Error {
  return Object.assign(new Error(message), { exitCode: 2 });
}

function headers(token: string, accountId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    originator: "codex_cli_rs",
    "User-Agent": `codex_cli_rs/${CODEX_VERSION}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "x-codex-turn-metadata": JSON.stringify({
      session_id: randomUUID(),
      turn_id: randomUUID(),
      sandbox: "seatbelt",
    }),
  };
}

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

/** image_generation tool config. Non-auto size/quality/background are passed through;
 *  the backend validates (e.g. longest edge must be ≤ 3840). */
export function imageTool(o: GenOptions): Record<string, unknown> {
  const tool: Record<string, unknown> = { type: "image_generation" };
  if (o.size && o.size !== "auto") tool["size"] = o.size;
  if (o.quality && o.quality !== "auto") tool["quality"] = o.quality;
  if (o.background && o.background !== "auto") tool["background"] = o.background;
  return tool;
}

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
    instructions:
      "You are an image generation assistant. When the user requests an image, " +
      "immediately call the image_generation tool to create or edit it. Do not ask clarifying questions.",
    input: [{ type: "message", role: "user", content }],
    tools: [imageTool(o)],
    tool_choice: "auto",
    stream: true,
    store: false,
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
  };
}

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

/** Pull the generated image out of the SSE event stream.
 *  Prefers the final result on response.output_item.done; falls back to the
 *  last progressive partial_image. Exported for unit testing. */
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

async function runRequest(
  token: string,
  accountId: string,
  request: Record<string, unknown>,
): Promise<ImageResult> {
  const session = new ImpersonatedSession(REQUEST_TIMEOUT_S);
  try {
    const res = await session.post(RESPONSES_URL, headers(token, accountId), JSON.stringify(request));
    if (res.status !== 200) throw mapHttpError(res.status, res.text);
    return extractImage(res.text);
  } finally {
    session.close();
  }
}

export async function generate(
  token: string,
  accountId: string,
  o: GenOptions,
): Promise<ImageResult> {
  return runRequest(token, accountId, buildRequest(o, []));
}

export async function edit(
  token: string,
  accountId: string,
  o: EditOptions,
): Promise<ImageResult> {
  if (o.imagePaths.length < 1 || o.imagePaths.length > MAX_EDIT_IMAGES) {
    throw usageError(`图生图需要 1~${MAX_EDIT_IMAGES} 张输入图，收到 ${o.imagePaths.length} 张`);
  }
  const parts = o.imagePaths.map((p) => ({ type: "input_image", image_url: imageToDataUrl(p) }));
  return runRequest(token, accountId, buildRequest(o, parts));
}
