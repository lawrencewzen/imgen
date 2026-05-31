# imgen

Codex 图片生成 CLI —— 用本地 codex 登录的 ChatGPT **付费账号**（Plus/Pro…）生成图片，支持**文生图**和**图生图**。

## 原理

- 用 **`@ossiana/node-libcurl`**（libcurl-impersonate，Chrome JA3 + Akamai HTTP/2 指纹）请求 `chatgpt.com`，绕过其 Cloudflare 机器人质询 —— 普通 Node `fetch` 会被 `403 cf-mitigated: challenge`。
- 调 **Codex Responses 端点** `POST /backend-api/codex/responses` + 内置 **`image_generation` 工具**，从 SSE 流的 `image_generation_call` 事件里取出图片。
  （直连 REST `/images/generations` 在生产后端 404、未部署，故走工具流。）
- 认证复用 `~/.codex/auth.json`：token 过期自动刷新并安全写回（保留 `OPENAI_API_KEY` 等字段），零配置。

## 安装

```bash
npm install        # 含原生插件 @ossiana/node-libcurl（拉平台预编译二进制）
npm run build
npm link           # 可选：装到全局 PATH
```

未 `npm link` 时直接 `node dist/cli.js ...` 或 `npm run dev -- ...`。

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

## 说明

- **必须付费号**：免费 ChatGPT 账号生成图片会 401/403。
- 每张图是一次完整 response turn（模型推理 + 工具生成），比纯文本多烧 ChatGPT 套餐额度。
- **分辨率上限：最长边 3840px** —— 4K UHD `3840x2160` 可以；`4096x4096` 会被后端拒（`longest edge must be ≤ 3840`）。
- 图片以 base64 在 SSE 里返回，直接解码写盘，无二次下载。

## 开发

```bash
npm test           # 单元测试（auth / images / output 纯逻辑）
npm run dev -- "a fox" -o /tmp/fox.png
```
