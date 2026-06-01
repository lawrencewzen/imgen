import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const TOKEN_REFRESH_URL = "https://auth.openai.com/oauth/token";
const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
// 在过期前 5 分钟就视为过期，留刷新缓冲
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const REFRESH_TIMEOUT_MS = 15_000;
export function defaultCodexHome() {
    return process.env["CODEX_HOME"] ?? join(homedir(), ".codex");
}
function authPath(codexHome) {
    return join(codexHome, "auth.json");
}
/** 解码 JWT payload 为对象，任何失败都返回 null。 */
function decodeJwtPayload(jwt) {
    const part = jwt.split(".")[1];
    if (!part)
        return null;
    try {
        return JSON.parse(Buffer.from(part, "base64url").toString());
    }
    catch {
        return null;
    }
}
/** 从 <codexHome>/auth.json 读 tokens，缺失/非法时抛友好错误。 */
export function loadTokens(codexHome) {
    const p = authPath(codexHome);
    if (!existsSync(p)) {
        throw new Error(`未找到 ${p}，请先用 codex 登录（codex login）`);
    }
    let raw;
    try {
        raw = JSON.parse(readFileSync(p, "utf-8"));
    }
    catch (error) {
        throw new Error(`解析 ${p} 失败：${error.message}`);
    }
    const tokens = raw.tokens;
    if (!tokens || !tokens.access_token) {
        throw new Error(`${p} 中没有有效的 tokens.access_token，请重新用 codex 登录`);
    }
    return {
        access_token: tokens.access_token,
        id_token: tokens.id_token ?? "",
        refresh_token: tokens.refresh_token ?? "",
        account_id: tokens.account_id ?? "",
    };
}
/** access token 是否过期（含刷新缓冲；无法解析也视为过期）。 */
export function isTokenExpired(accessToken) {
    const payload = decodeJwtPayload(accessToken);
    const exp = payload?.["exp"];
    if (typeof exp !== "number")
        return true;
    return Date.now() >= exp * 1000 - EXPIRY_BUFFER_MS;
}
/** 从 access token 的 auth claim 取 chatgpt_account_id。 */
export function extractAccountId(accessToken) {
    const payload = decodeJwtPayload(accessToken);
    const auth = payload?.["https://api.openai.com/auth"];
    if (auth && typeof auth === "object") {
        const id = auth["chatgpt_account_id"];
        if (typeof id === "string")
            return id;
    }
    return null;
}
/** 用 refresh_token 换新 tokens；account_id 留给调用方填。 */
export async function refreshTokens(refreshToken) {
    const res = await fetch(TOKEN_REFRESH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: OAUTH_CLIENT_ID,
        }),
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    if (!res.ok) {
        throw new Error(`token 刷新失败：${res.status} ${res.statusText}`);
    }
    const data = (await res.json());
    return {
        access_token: data["access_token"] ?? "",
        id_token: data["id_token"] ?? "",
        refresh_token: data["refresh_token"] ?? refreshToken,
        account_id: "",
    };
}
/**
 * 把 tokens 写回 <codexHome>/auth.json：read-merge-write，
 * 保留 codex 自己的字段（OPENAI_API_KEY、auth_mode 等），空值不覆盖既有值。
 */
export function saveTokensMerged(codexHome, tokens) {
    const p = authPath(codexHome);
    let existing = {};
    if (existsSync(p)) {
        try {
            existing = JSON.parse(readFileSync(p, "utf-8"));
        }
        catch {
            existing = {};
        }
    }
    const prevTokens = existing["tokens"] ?? {};
    const updates = {};
    for (const [k, v] of Object.entries(tokens)) {
        if (v !== "" && v !== undefined && v !== null)
            updates[k] = v;
    }
    const merged = {
        ...existing,
        tokens: { ...prevTokens, ...updates },
        last_refresh: new Date().toISOString(),
    };
    writeFileSync(p, JSON.stringify(merged, null, 2));
}
/** 确保拿到可用的 access token + account id，过期则刷新并写回。 */
export async function ensureValidToken(codexHome) {
    const tokens = loadTokens(codexHome);
    let accessToken = tokens.access_token;
    if (isTokenExpired(accessToken)) {
        if (!tokens.refresh_token) {
            throw new Error("access_token 已过期且无 refresh_token，请重新用 codex 登录");
        }
        const refreshed = await refreshTokens(tokens.refresh_token);
        if (!refreshed.access_token) {
            throw new Error("token 刷新返回为空，请重新用 codex 登录");
        }
        accessToken = refreshed.access_token;
        const accountId = extractAccountId(accessToken) ?? tokens.account_id;
        saveTokensMerged(codexHome, { ...refreshed, account_id: accountId });
        return { accessToken, accountId };
    }
    const accountId = extractAccountId(accessToken) ?? tokens.account_id;
    return { accessToken, accountId };
}
