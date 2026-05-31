import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import type { ImageData } from "./images.js";

/**
 * 解码 base64 图片并写盘。
 * 单张 → outPath；多张 → 在扩展名前加 "-1"、"-2"…。
 * 返回实际写出的路径列表。
 */
export function saveImages(data: ImageData[], outPath: string): string[] {
  if (!data || data.length === 0) {
    throw new Error("后端未返回图片数据");
  }

  if (data.length === 1) {
    const only = data[0];
    if (!only) throw new Error("后端未返回图片数据");
    writeFileSync(outPath, Buffer.from(only.b64_json, "base64"));
    return [outPath];
  }

  const ext = extname(outPath) || ".png";
  const base = outPath.slice(0, outPath.length - ext.length);
  return data.map((d, i) => {
    const p = `${base}-${i + 1}${ext}`;
    writeFileSync(p, Buffer.from(d.b64_json, "base64"));
    return p;
  });
}
