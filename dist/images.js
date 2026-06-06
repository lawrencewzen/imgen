import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import { detectTerminal, platformSandboxTag } from "./fingerprint.js";
import { BASE_INSTRUCTIONS } from "./instructions.js";
const RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
export const REQUEST_TIMEOUT_S = 600;
const MAX_EDIT_IMAGES = 5;
const MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
};
function createTurnContext(sessionId, threadId) {
    return {
        turnId: randomUUID(),
        timestampMs: Date.now(),
        sessionId,
        threadId,
        windowId: `${threadId}:0`,
    };
}
function turnMetadataJson(ctx) {
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
function buildUserAgent(identity) {
    const base = `codex_cli_rs/${identity.codexVersion} (${identity.osType} ${identity.osVersion}; ${identity.arch})`;
    const terminal = detectTerminal();
    return terminal ? `${base} ${terminal}` : base;
}
// ---------------------------------------------------------------------------
// Headers — full Codex CLI header set
// ---------------------------------------------------------------------------
function buildHeaders(token, accountId, identity, turn) {
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
export function usageError(message) {
    return Object.assign(new Error(message), { exitCode: 2 });
}
// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------
/** Read an input image and return a base64 data URL. Throws usageError on problems. */
export function imageToDataUrl(path) {
    if (!existsSync(path))
        throw usageError(`输入图不存在: ${path}`);
    const ext = extname(path).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
        throw usageError(`不支持的图片类型: ${ext || "(无扩展名)"}（支持 png/jpg/jpeg/webp/gif）`);
    }
    return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}
/** image_generation tool config. */
export function imageTool(o) {
    const tool = { type: "image_generation" };
    if (o.size && o.size !== "auto")
        tool["size"] = o.size;
    if (o.quality && o.quality !== "auto")
        tool["quality"] = o.quality;
    if (o.background && o.background !== "auto")
        tool["background"] = o.background;
    return tool;
}
// ---------------------------------------------------------------------------
// Request body builder  (pure — no identity dependency, testable)
// ---------------------------------------------------------------------------
export function buildRequest(o, imageParts) {
    const content = [
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
function parseSse(text) {
    const events = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith("data:"))
            continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]")
            continue;
        try {
            events.push(JSON.parse(data));
        }
        catch {
            /* skip non-JSON keepalive lines */
        }
    }
    return events;
}
function asLongB64(value) {
    return typeof value === "string" && value.length > 100 ? value : null;
}
/** Pull the generated image out of the SSE event stream. */
export function extractImage(text) {
    const events = parseSse(text);
    let finalB64 = null;
    let partialB64 = null;
    let size = "";
    for (const e of events) {
        const item = e.item;
        if (e.type === "response.output_item.done" && item && item["type"] === "image_generation_call") {
            const b = asLongB64(item["result"]);
            if (b) {
                finalB64 = b;
                if (typeof item["size"] === "string")
                    size = item["size"];
            }
        }
        else if (typeof e.type === "string" && e.type.includes("partial_image")) {
            const b = asLongB64(e["partial_image_b64"]) ?? asLongB64(e["result"]);
            if (b)
                partialB64 = b;
        }
    }
    const b64 = finalB64 ?? partialB64;
    if (!b64) {
        const fail = events.find((e) => e.type === "response.failed" || e.type === "error");
        throw new Error(`图片生成失败：${describeFailure(fail) ?? "后端未返回图片"}`);
    }
    return { b64, size };
}
function describeFailure(event) {
    if (!event)
        return null;
    const resp = event["response"];
    const err = event["error"] ??
        resp?.["error"];
    return err?.["message"] ?? null;
}
// ---------------------------------------------------------------------------
// HTTP error mapping
// ---------------------------------------------------------------------------
function mapHttpError(status, text) {
    const detail = extractMessage(text);
    if (status === 401 || status === 403) {
        return new Error(`认证/权限失败 (${status})：账号可能是免费号，图片生成需 Plus/Pro。${detail}`);
    }
    if (status === 429)
        return new Error(`撞限流 (429)：稍后再试。${detail}`);
    if (status === 400)
        return new Error(`请求被拒 (400)：${detail}`);
    return new Error(`后端返回 ${status}。${detail}`);
}
function extractMessage(text) {
    if (!text)
        return "";
    try {
        const j = JSON.parse(text);
        return j.error?.message ?? j.message ?? j.detail ?? text.slice(0, 300);
    }
    catch {
        return text.slice(0, 300);
    }
}
// ---------------------------------------------------------------------------
// Core request runner
// ---------------------------------------------------------------------------
async function runRequest(ctx, request) {
    const turn = createTurnContext(ctx.sessionId, ctx.threadId);
    // Enrich body with client_metadata (matches real Codex)
    const body = {
        ...request,
        prompt_cache_key: ctx.threadId,
        client_metadata: {
            "x-codex-installation-id": ctx.identity.installationId,
        },
    };
    const hdrs = buildHeaders(ctx.token, ctx.accountId, ctx.identity, turn);
    const res = await ctx.session.post(RESPONSES_URL, hdrs, JSON.stringify(body));
    if (res.status !== 200)
        throw mapHttpError(res.status, res.text);
    return extractImage(res.text);
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function generate(ctx, o) {
    return runRequest(ctx, buildRequest(o, []));
}
export async function edit(ctx, o) {
    if (o.imagePaths.length < 1 || o.imagePaths.length > MAX_EDIT_IMAGES) {
        throw usageError(`图生图需要 1~${MAX_EDIT_IMAGES} 张输入图，收到 ${o.imagePaths.length} 张`);
    }
    const parts = o.imagePaths.map((p) => ({ type: "input_image", image_url: imageToDataUrl(p) }));
    return runRequest(ctx, buildRequest(o, parts));
}
