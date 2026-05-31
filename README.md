# imgen

Codex 图片生成 CLI —— 用本地 codex 登录的 ChatGPT **付费账号**（Plus/Pro…）调用 Codex 后端图片接口，支持**文生图**和**图生图**。

底层走 `https://chatgpt.com/backend-api/codex/images/{generations,edits}`，认证复用 `~/.codex/auth.json`，零配置。

## 安装

```bash
npm install
npm run build
npm link        # 可选：把 imgen 装到全局 PATH
```

未 `npm link` 时也可直接 `node dist/cli.js ...` 或 `npm run dev -- ...`（tsx 热跑）。

## 用法

```bash
imgen [options] <prompt>

  -i, --image <path...>   输入图，给了即走图生图 edits（1~5 张，可多次）
  -o, --out <path>        输出路径（默认 ./image-<时间戳>.png）
  -n, --count <num>       生成数量（默认 1；>1 输出 out-1.png, out-2.png…）
  -s, --size <size>       auto | 1024x1024 | 1024x1536 | 1536x1024（默认 auto）
  -q, --quality <q>       low | medium | high | auto（默认 auto）
  -b, --background <bg>   transparent | opaque | auto（默认 auto）
  -m, --model <model>     图片模型（默认 gpt-image-2）
  --codex-home <dir>      codex 目录（默认 $CODEX_HOME 或 ~/.codex）
```

### 例子

```bash
# 文生图
imgen "a red fox in snow" -o fox.png

# 图生图（改图）
imgen "make it night, neon lights" -i fox.png -o fox-night.png

# 多张
imgen "logo ideas" -n 4 -o logo.png          # logo-1.png … logo-4.png

# 透明背景贴纸
imgen "a cute cat sticker" -b transparent -o cat.png
```

## 说明

- **必须是付费号**：免费 ChatGPT 账号不支持图片生成，会报 401/403。
- access_token 过期会自动用 refresh_token 刷新，并安全写回 `auth.json`（保留 `OPENAI_API_KEY` 等其他字段）。
- 图片以 base64 内联返回，直接解码写盘，无二次下载。
- 画图比文字多烧 3–5 倍 ChatGPT 套餐额度，注意限流（约 250 张/分钟，新号 5/分钟）。

## 开发

```bash
npm test        # 单元测试（auth/images/output 纯逻辑）
npm run dev -- "a fox" -o /tmp/fox.png
```
