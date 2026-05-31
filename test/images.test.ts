import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBody, imageToDataUrl, usageError, type GenOptions } from "../src/images.js";

const baseOpts: GenOptions = {
  prompt: "a fox",
  model: "gpt-image-2",
  n: 1,
  size: "auto",
  quality: "auto",
  background: "auto",
};

test("buildBody 文生图：无 images 字段，含核心字段", () => {
  const body = buildBody(baseOpts);
  assert.equal(body["prompt"], "a fox");
  assert.equal(body["model"], "gpt-image-2");
  assert.equal(body["size"], "auto");
  assert.equal(body["n"], 1);
  assert.equal("images" in body, false);
});

test("buildBody 图生图：带 images 字段", () => {
  const body = buildBody(baseOpts, [{ image_url: "data:image/png;base64,AAAA" }]);
  assert.ok(Array.isArray(body["images"]));
  assert.equal((body["images"] as unknown[]).length, 1);
});

test("imageToDataUrl 生成 data URL 并按扩展名判 mime", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-img-"));
  try {
    const p = join(dir, "x.png");
    writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    assert.ok(imageToDataUrl(p).startsWith("data:image/png;base64,"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("imageToDataUrl 不存在的文件抛 usageError(exitCode=2)", () => {
  try {
    imageToDataUrl("/no/such/file.png");
    assert.fail("应当抛错");
  } catch (error: unknown) {
    assert.equal((error as { exitCode?: number }).exitCode, 2);
  }
});

test("imageToDataUrl 不支持的扩展名抛错", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-img2-"));
  try {
    const p = join(dir, "x.txt");
    writeFileSync(p, "hello");
    assert.throws(() => imageToDataUrl(p));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usageError 带 exitCode 2", () => {
  assert.equal((usageError("bad") as { exitCode?: number }).exitCode, 2);
});
