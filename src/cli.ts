#!/usr/bin/env node
import { Command } from "commander";
import { ensureValidToken, defaultCodexHome } from "./auth.js";
import { generate, edit, usageError, type GenOptions } from "./images.js";
import { saveImages } from "./output.js";

interface CliOptions {
  image?: string[];
  out?: string;
  count: string;
  size: string;
  quality: string;
  background: string;
  model: string;
  codexHome: string;
}

async function run(prompt: string, opts: CliOptions): Promise<void> {
  const n = Number.parseInt(opts.count, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw usageError(`-n/--count 必须是正整数，收到: ${opts.count}`);
  }
  const out = opts.out ?? `./image-${Math.floor(Date.now() / 1000)}.png`;

  const { accessToken, accountId } = await ensureValidToken(opts.codexHome);

  const base: GenOptions = {
    prompt,
    model: opts.model,
    n,
    size: opts.size,
    quality: opts.quality,
    background: opts.background,
  };

  const resp =
    opts.image && opts.image.length > 0
      ? await edit(accessToken, accountId, { ...base, imagePaths: opts.image })
      : await generate(accessToken, accountId, base);

  const paths = saveImages(resp.data, out);
  console.log(`✓ 已保存 ${paths.length} 张图片：`);
  for (const p of paths) console.log(`  ${p}`);
  if (resp.size || resp.quality) {
    console.log(`  size=${resp.size ?? "?"} quality=${resp.quality ?? "?"}`);
  }
  if (resp.usage) {
    console.log(
      `  tokens: in=${resp.usage.input_tokens ?? 0} out=${resp.usage.output_tokens ?? 0}`,
    );
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
  .option("-s, --size <size>", "auto|1024x1024|1024x1536|1536x1024", "auto")
  .option("-q, --quality <q>", "low|medium|high|auto", "auto")
  .option("-b, --background <bg>", "transparent|opaque|auto", "auto")
  .option("-m, --model <model>", "图片模型", "gpt-image-2")
  .option("--codex-home <dir>", "codex 目录", defaultCodexHome())
  .action(async (prompt: string, opts: CliOptions) => {
    await run(prompt, opts);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const e = error as { message?: string; exitCode?: number };
  console.error(`✗ ${e.message ?? String(error)}`);
  process.exit(typeof e.exitCode === "number" ? e.exitCode : 1);
});
