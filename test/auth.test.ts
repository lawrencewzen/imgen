import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractAccountId, isTokenExpired, saveTokensMerged } from "../src/auth.js";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function fakeJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "none" })}.${b64url(payload)}.sig`;
}

test("extractAccountId 取出 chatgpt_account_id", () => {
  const jwt = fakeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acc-123" } });
  assert.equal(extractAccountId(jwt), "acc-123");
});

test("extractAccountId 无 claim / 非 JWT 返回 null", () => {
  assert.equal(extractAccountId(fakeJwt({ sub: "x" })), null);
  assert.equal(extractAccountId("not-a-jwt"), null);
});

test("isTokenExpired：过去为 true，未来为 false，垃圾为 true", () => {
  const past = fakeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
  const future = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  assert.equal(isTokenExpired(past), true);
  assert.equal(isTokenExpired(future), false);
  assert.equal(isTokenExpired("garbage"), true);
});

test("saveTokensMerged 保留 OPENAI_API_KEY 等字段，空值不覆盖既有 id_token", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-auth-"));
  try {
    const p = join(dir, "auth.json");
    writeFileSync(
      p,
      JSON.stringify({
        auth_mode: "chatgpt",
        OPENAI_API_KEY: "sk-keep-me",
        tokens: {
          id_token: "old-id",
          access_token: "old-at",
          refresh_token: "old-rt",
          account_id: "acc-1",
        },
        last_refresh: "2020-01-01T00:00:00Z",
      }),
    );

    saveTokensMerged(dir, {
      access_token: "new-at",
      id_token: "", // 空：不应覆盖既有 id_token
      refresh_token: "new-rt",
      account_id: "acc-1",
    });

    const after = JSON.parse(readFileSync(p, "utf-8")) as {
      OPENAI_API_KEY: string;
      auth_mode: string;
      tokens: Record<string, string>;
      last_refresh: string;
    };
    assert.equal(after.OPENAI_API_KEY, "sk-keep-me");
    assert.equal(after.auth_mode, "chatgpt");
    assert.equal(after.tokens["access_token"], "new-at");
    assert.equal(after.tokens["refresh_token"], "new-rt");
    assert.equal(after.tokens["id_token"], "old-id"); // 保留
    assert.notEqual(after.last_refresh, "2020-01-01T00:00:00Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
