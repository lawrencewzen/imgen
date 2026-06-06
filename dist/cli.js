#!/usr/bin/env node
import { Command } from "commander";
import { randomUUID, randomInt } from "node:crypto";
import { ensureValidToken, defaultCodexHome } from "./auth.js";
import { generate, edit, usageError, REQUEST_TIMEOUT_S, } from "./images.js";
import { loadOrCreateIdentity } from "./fingerprint.js";
import { ImpersonatedSession } from "./http.js";
import { saveImages } from "./output.js";
function jitter(minMs, maxMs) {
    const ms = minMs + randomInt(maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function run(prompt, opts) {
    const n = Number.parseInt(opts.count, 10);
    if (!Number.isInteger(n) || n < 1) {
        throw usageError(`-n/--count 必须是正整数，收到: ${opts.count}`);
    }
    const out = opts.out ?? `./image-${Math.floor(Date.now() / 1000)}.png`;
    const { accessToken, accountId } = await ensureValidToken(opts.codexHome);
    const identity = loadOrCreateIdentity(opts.codexHome);
    // One TLS session for the entire CLI run (matches real Codex connection reuse)
    const session = new ImpersonatedSession(REQUEST_TIMEOUT_S, identity.tls.ja3, identity.tls.akamai);
    try {
        const ctx = {
            session,
            token: accessToken,
            accountId,
            identity,
            sessionId: randomUUID(),
            threadId: randomUUID(),
        };
        const base = {
            prompt,
            model: opts.model,
            size: opts.size,
            quality: opts.quality,
            background: opts.background,
        };
        const imagePaths = opts.image ?? [];
        const isEdit = imagePaths.length > 0;
        const b64s = [];
        let lastSize = "";
        for (let i = 0; i < n; i++) {
            // Human-like delay between batch requests
            if (i > 0)
                await jitter(1500, 5000);
            if (n > 1)
                process.stderr.write(`生成中 ${i + 1}/${n}…\n`);
            const result = isEdit
                ? await edit(ctx, { ...base, imagePaths })
                : await generate(ctx, base);
            b64s.push(result.b64);
            lastSize = result.size || lastSize;
        }
        const paths = saveImages(b64s, out);
        console.log(`✓ 已保存 ${paths.length} 张图片${lastSize ? `（${lastSize}）` : ""}：`);
        for (const p of paths)
            console.log(`  ${p}`);
    }
    finally {
        session.close();
    }
}
const program = new Command();
program
    .name("imgen")
    .description("Codex 图片生成 CLI（文生图 + 图生图）")
    .argument("<prompt>", "图片描述")
    .option("-i, --image <path...>", "输入图（给了即图生图，1~5 张，可多次）")
    .option("-o, --out <path>", "输出路径（默认 ./image-<时间戳>.png）")
    .option("-n, --count <num>", "生成数量", "1")
    .option("-s, --size <size>", "尺寸，如 1024x1024 / 3840x2160（最长边 ≤3840），默认 auto", "auto")
    .option("-q, --quality <q>", "low|medium|high|auto", "auto")
    .option("-b, --background <bg>", "transparent|opaque|auto", "auto")
    .option("-m, --model <model>", "编排模型（负责调用图片工具）", "gpt-5.5")
    .option("--codex-home <dir>", "codex 目录", defaultCodexHome())
    .action(async (prompt, opts) => {
    await run(prompt, opts);
});
program.parseAsync(process.argv).catch((error) => {
    const e = error;
    console.error(`✗ ${e.message ?? String(error)}`);
    process.exit(typeof e.exitCode === "number" ? e.exitCode : 1);
});
