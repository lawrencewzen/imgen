import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveImages } from "../src/output.js";

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a];
const PNG_B64 = Buffer.from(PNG_BYTES).toString("base64");

test("saveImages 单张写到 outPath", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-out-"));
  try {
    const out = join(dir, "pic.png");
    const paths = saveImages([PNG_B64], out);
    assert.deepEqual(paths, [out]);
    assert.deepEqual([...readFileSync(out)], PNG_BYTES);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saveImages 多张加 -1/-2 后缀并保留扩展名", () => {
  const dir = mkdtempSync(join(tmpdir(), "imgen-out2-"));
  try {
    const out = join(dir, "pic.png");
    const paths = saveImages([PNG_B64, PNG_B64], out);
    assert.deepEqual(paths, [join(dir, "pic-1.png"), join(dir, "pic-2.png")]);
    assert.ok(existsSync(join(dir, "pic-1.png")));
    assert.ok(existsSync(join(dir, "pic-2.png")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saveImages 空数组抛错", () => {
  assert.throws(() => saveImages([], "/tmp/x.png"));
});
