---
name: imgen
description: Generate or edit raster images with the imgen CLI (outputs PNG). Use this WHENEVER the user wants to create/generate/draw/make an image, picture, logo, icon, illustration, wallpaper, sticker, avatar, or art from a text description — OR edit/modify/restyle/change an existing image (img2img). Triggers on phrasings like "画一张…", "生成一张…图", "做个 logo / 图标 / 贴纸", "把这张图改成…", "P 成…", "give me a picture of…", "turn this photo into…", "make me an image of…" — even when the user never says "imgen". Do NOT use for charts / diagrams / flowcharts (use code or mermaid), UI mockups / web pages (use frontend-design), or SVG vector graphics.
allowed-tools: Bash, Read
---

# imgen — 图片生成 / 编辑

用 `imgen` CLI 从文字生成图片，或对已有图片做编辑（图生图）。产出 PNG 文件。

## 何时用 / 不用

- **用**：文生图（"画/生成一张 X"）、图生图（"把这张图改成 X"）、logo / 图标 / 插画 / 壁纸 / 贴纸 / 头像 等位图。
- **不用**：图表 / 流程图 / 架构图（用代码或 mermaid）、UI 界面 / 网页（用 frontend-design）、SVG 矢量图。

## 文生图

```bash
imgen "<prompt，英文质量更好>" -o <输出.png>
```

## 图生图（编辑已有图）

用户给了图、或上文刚生成过图、或要"改这张"，把输入图给 `-i`：

```bash
imgen "<想怎么改>" -i <输入.png> -o <输出.png>
```

多张输入：`-i a.png -i b.png`（1~5 张）。

## 参数

| 参数 | 说明 |
|---|---|
| `-s, --size` | 如 `1024x1024` / `1024x1536` / `3840x2160`(4K)；最长边 ≤ 3840；默认 auto |
| `-q, --quality` | `low` / `medium` / `high` / `auto`（默认 auto） |
| `-b, --background` | `transparent`（透明，做贴纸/图标）/ `opaque` / `auto` |
| `-n, --count` | 生成数量（>1 输出 `out-1.png` `out-2.png`…） |

## 流程

1. **判类型**：有输入图 → 图生图（`-i`）；否则文生图。
2. **选输出路径**：用户没指定就放当前目录、起个语义化文件名（如 `fox.png`）。
3. **把中文需求转成英文 prompt**（对英文响应更好），保留用户要的风格/构图细节。
4. **跑命令**：约 15-30 秒/张，给足超时（Bash `timeout` 设 180000 左右）。
5. **展示**：生成后用 **Read 工具读这张 PNG** 直接展示给用户，并报保存路径。
6. **失败**：把 imgen 的报错原样转达（401/403=账号问题、429=限流、400=参数如尺寸超限）。

## 例子

**Example 1 — 文生图**
用户：帮我画一张雪地里的红色狐狸，竖版
```bash
imgen "a red fox sitting in deep snow, cinematic, soft morning light" -s 1024x1536 -o fox.png
```
然后 Read `fox.png` 给用户看。

**Example 2 — 图生图**
用户：把 fox.png 改成夜晚霓虹风
```bash
imgen "make it nighttime with neon lighting, keep the fox and composition" -i fox.png -o fox-neon.png
```

**Example 3 — 透明贴纸**
用户：做个猫咪贴纸，要透明背景
```bash
imgen "a cute cartoon cat sticker, bold clean outline" -b transparent -o cat.png
```

## 注意

- 需已完成 Codex CLI 登录；未登录会 401/403。
- 分辨率上限：最长边 **3840px**（4K UHD `3840x2160` 可，`4096` 会被拒）。
