import { writeFileSync } from "node:fs";
import { extname } from "node:path";
/**
 * Decode base64 PNGs and write to disk.
 * Single image → outPath; multiple → outPath with "-1", "-2", … before the extension.
 * Returns the list of written paths.
 */
export function saveImages(b64s, outPath) {
    if (b64s.length === 0) {
        throw new Error("没有图片可保存");
    }
    if (b64s.length === 1) {
        const only = b64s[0];
        if (!only)
            throw new Error("没有图片可保存");
        writeFileSync(outPath, Buffer.from(only, "base64"));
        return [outPath];
    }
    const ext = extname(outPath) || ".png";
    const base = outPath.slice(0, outPath.length - ext.length);
    return b64s.map((b, i) => {
        const p = `${base}-${i + 1}${ext}`;
        writeFileSync(p, Buffer.from(b, "base64"));
        return p;
    });
}
