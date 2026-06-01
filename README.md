# imgen

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

在命令行生成图片，支持**文生图**和**图生图**，复用本地 Codex 登录状态。

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/aisparkedu/imgen/main/install-skill.sh | bash
```

自动完成依赖安装、注册全局 `imgen` 命令，并为 Claude Code / Codex / Gemini CLI 安装 Skill。

## 用法

```
imgen [options] <prompt>

  -i, --image <path...>   输入图，给了即图生图 edit（1~5 张，可多次）
  -o, --out <path>        输出路径（默认 ./image-<时间戳>.png）
  -n, --count <num>       生成数量（默认 1；>1 输出 out-1.png, out-2.png…）
  -s, --size <size>       尺寸，如 1024x1024 / 3840x2160；最长边 ≤3840（≈4K），默认 auto
  -q, --quality <q>       low | medium | high | auto（默认 auto）
  -b, --background <bg>   transparent | opaque | auto（默认 auto）
  -m, --model <model>     编排模型，负责调用图片工具（默认 gpt-5.4）
  --codex-home <dir>      codex 目录（默认 $CODEX_HOME 或 ~/.codex）
```

### 例子

```bash
# 文生图
imgen "a red fox in snow" -o fox.png

# 图生图（改图）
imgen "make it night, neon lights" -i fox.png -o fox-night.png

# 4K 壁纸
imgen "a nebula wallpaper" -s 3840x2160 -q high -o nebula.png

# 透明背景贴纸
imgen "a cute cat sticker" -b transparent -o cat.png
```

