import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const BASE_URL = "https://chatgpt.com/backend-api/codex";
const CODEX_VERSION = "0.118.0";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_EDIT_IMAGES = 5;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface ImageUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ImageData {
  b64_json: string;
}

export interface ImageResponse {
  created?: number;
  data: ImageData[];
  size?: string;
  quality?: string;
  background?: string;
  usage?: ImageUsage;
}

export interface GenOptions {
  prompt: string;
  model: string;
  n: number;
  size: string;
  quality: string;
  background: string;
}

export interface EditOptions extends GenOptions {
  imagePaths: string[];
}

/** 参数/校验类错误 → CLI 退出码 2。 */
export function usageError(message: string): Error {
  return Object.assign(new Error(message), { exitCode: 2 });
}

function buildHeaders(token: string, accountId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    originator: "codex_cli_rs",
    "User-Agent": `codex_cli_rs/${CODEX_VERSION}`,
    Origin: "https://chatgpt.com",
    "Content-Type": "application/json",
  };
}

/** 组装请求体。size/quality/background/n 由调用方带默认值（默认 auto / 1）。 */
export function buildBody(
  o: GenOptions,
  images?: Array<{ image_url: string }>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: o.prompt,
    model: o.model,
    n: o.n,
    size: o.size,
    quality: o.quality,
    background: o.background,
  };
  if (images) body["images"] = images;
  return body;
}

/** 把输入图路径转成 base64 data URL；出问题抛 usageError。 */
export function imageToDataUrl(path: string): string {
  if (!existsSync(path)) throw usageError(`输入图不存在: ${path}`);
  const ext = extname(path).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw usageError(`不支持的图片类型: ${ext || "(无扩展名)"}（支持 png/jpg/jpeg/webp/gif）`);
  }
  const b64 = readFileSync(path).toString("base64");
  return `data:${mime};base64,${b64}`;
}

async function callImages(
  path: string,
  token: string,
  accountId: string,
  body: Record<string, unknown>,
): Promise<ImageResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: buildHeaders(token, accountId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    throw new Error(`请求失败（网络/超时）：${(error as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw mapHttpError(res.status, text);
  }
  return (await res.json()) as ImageResponse;
}

function mapHttpError(status: number, text: string): Error {
  const detail = extractMessage(text);
  if (status === 401 || status === 403) {
    return new Error(
      `认证/权限失败 (${status})：账号可能是免费号，图片生成需 Plus/Pro。${detail}`,
    );
  }
  if (status === 429) {
    return new Error(`撞限流 (429)：稍后再试。${detail}`);
  }
  return new Error(`后端返回 ${status}。${detail}`);
}

/** 从后端错误响应里抽出可读消息，避免直接糊一大坨。 */
function extractMessage(text: string): string {
  if (!text) return "";
  try {
    const j = JSON.parse(text) as { error?: { message?: string }; message?: string };
    const msg = j.error?.message ?? j.message;
    if (msg) return msg;
  } catch {
    /* 非 JSON，回退到截断文本 */
  }
  return text.slice(0, 300);
}

export async function generate(
  token: string,
  accountId: string,
  o: GenOptions,
): Promise<ImageResponse> {
  return callImages("/images/generations", token, accountId, buildBody(o));
}

export async function edit(
  token: string,
  accountId: string,
  o: EditOptions,
): Promise<ImageResponse> {
  if (o.imagePaths.length < 1 || o.imagePaths.length > MAX_EDIT_IMAGES) {
    throw usageError(`图生图需要 1~${MAX_EDIT_IMAGES} 张输入图，收到 ${o.imagePaths.length} 张`);
  }
  const images = o.imagePaths.map((p) => ({ image_url: imageToDataUrl(p) }));
  return callImages("/images/edits", token, accountId, buildBody(o, images));
}
