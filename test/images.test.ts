import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  imageTool,
  buildRequest,
  imageToDataUrl,
  extractImage,
  usageError,
  type GenOptions,
} from "../src/images.js";

const baseOpts: GenOptions = { prompt: "a fox", model: "gpt-5.4", size: "auto", quality: "auto", background: "auto" };

test("imageTool: auto 时省略 size/quality/background", () => {
  const t = imageTool(baseOpts);
  assert.equal(t["type"], "image_generation");
  assert.equal("size" in t, false);
  assert.equal("quality" in t, false);
  assert.equal("background" in t, false);
});

test("imageTool: 非 auto 时带上参数", () => {
  const t = imageTool({ ...baseOpts, size: "3840x2160", quality: "high" });
  assert.equal(t["size"], "3840x2160");
  assert.equal(t["quality"], "high");
  assert.equal("background" in t, false);
});

test("buildRequest 文生图：input 含 prompt、tools 含 image_generation、无输入图", () => {
  const req = buildRequest(baseOpts, []);
  const input = req["input"] as Array<{ content: Array<{ type: string; text?: string }> }>;
  assert.equal(input[0]?.content[0]?.text, "a fox");
  assert.equal(input[0]?.content.length, 1);
  const tools = req["tools"] as Array<{ type: string }>;
  assert.equal(tools[0]?.type, "image_generation");
  assert.equal(req["stream"], true);
});

test("buildRequest 图生图：content 带 input_image", () => {
  const req = buildRequest(baseOpts, [{ type: "input_image", image_url: "data:image/png;base64,AA" }]);
  const input = req["input"] as Array<{ content: Array<{ type: string }> }>;
  assert.equal(input[0]?.content.length, 2);
  assert.equal(input[0]?.content[1]?.type, "input_image");
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

test("imageToDataUrl 不存在文件抛 usageError(exitCode=2)", () => {
  try {
    imageToDataUrl("/no/such/file.png");
    assert.fail("应当抛错");
  } catch (error: unknown) {
    assert.equal((error as { exitCode?: number }).exitCode, 2);
  }
});

test("extractImage 从 output_item.done 取最终图 + size", () => {
  const b64 = Buffer.from([1, 2, 3, 4]).toString("base64").repeat(40);
  const sse =
    `data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"${b64}","size":"1024x1024"}}\n\n` +
    `data: {"type":"response.completed"}\n\n`;
  const r = extractImage(sse);
  assert.equal(r.b64, b64);
  assert.equal(r.size, "1024x1024");
});

test("extractImage 失败事件抛错", () => {
  const sse = `data: {"type":"response.failed","response":{"error":{"message":"boom"}}}\n\n`;
  assert.throws(() => extractImage(sse), /boom/);
});

test("usageError 带 exitCode 2", () => {
  assert.equal((usageError("bad") as { exitCode?: number }).exitCode, 2);
});
