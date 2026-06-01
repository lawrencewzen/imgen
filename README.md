<h1 align="center">imgen</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node ≥ 20">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/Claude%20Code-skill-blueviolet" alt="Claude Code Skill">
  <img src="https://img.shields.io/badge/Codex-skill-black" alt="Codex Skill">
  <img src="https://img.shields.io/badge/Gemini%20CLI-skill-blue" alt="Gemini CLI Skill">
</p>

<p align="center">
  Command-line image generation powered by ChatGPT — text-to-image and image-to-image, up to 4K, zero extra API keys.
</p>

---

---

## ✨ Features

- 🖼️ **文生图 & 图生图** — 一条命令，从文字生成图片或修改已有图片
- 🔑 **零配置** — 复用本地 Codex 登录状态，无需单独申请 API Key
- 📐 **最高 4K 分辨率** — 支持到 3840×2160（4K UHD）
- 🪟 **透明背景** — 一键输出透明 PNG，适合做图标、贴纸
- 🤖 **原生 AI Skill** — 在 Claude Code / Codex / Gemini CLI 里直接说"帮我画一张……"即可触发
- ⚡ **直出本地文件** — 图片直接写盘，无中间云端上传

## 📦 安装

```bash
curl -fsSL https://raw.githubusercontent.com/aisparkedu/imgen/main/install-skill.sh | bash
```

自动完成：依赖安装 → 注册全局 `imgen` 命令 → 为 Claude Code / Codex / Gemini CLI 安装 Skill。

> **前提**：已安装 [Codex CLI](https://github.com/openai/codex) 并完成登录。

## 🚀 用法

```
imgen [options] <prompt>

  -i, --image <path...>   输入图（图生图，1~5 张）
  -o, --out <path>        输出路径（默认 ./image-<时间戳>.png）
  -n, --count <num>       生成数量
  -s, --size <size>       尺寸，如 1024x1024 / 1024x1536 / 3840x2160
  -q, --quality <q>       low | medium | high | auto
  -b, --background <bg>   transparent | opaque | auto
  -m, --model <model>     编排模型（默认 gpt-5.4）
```

## 💡 示例

```bash
# 文生图
imgen "a red fox in snow" -o fox.png

# 图生图
imgen "make it night, neon lights" -i fox.png -o fox-night.png

# 4K 壁纸
imgen "a nebula wallpaper" -s 3840x2160 -q high -o nebula.png

# 透明贴纸
imgen "a cute cat sticker" -b transparent -o cat.png
```

## 🤖 AI Skill 用法

安装后，在支持 Skill 的 AI 工具里可以直接用自然语言触发，无需记命令：

| 工具 | 说一句话 |
|------|---------|
| Claude Code | "帮我画一张雪地里的狐狸" |
| Codex | "生成一个透明背景的 logo" |
| Gemini CLI | "把这张图改成赛博朋克风" |

## 📄 License

MIT © [aisparkedu](https://github.com/aisparkedu)
