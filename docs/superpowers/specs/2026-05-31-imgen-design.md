# imgen — Codex 图片生成 CLI 设计文档

> 日期：2026-05-31　状态：已实现并验证

## ⚠️ 实现修订（2026-05-31，实测后）

原设计（下文第 2/4/8/9 节）假设走直连 REST `/codex/images/{generations,edits}`，**实测不可行**，已按真实情况实现：

1. **Cloudflare 质询**：`chatgpt.com` 对普通 Node `fetch` 返回 `403 cf-mitigated: challenge`（TLS 指纹被判 bot）。改用 **`@ossiana/node-libcurl`**（libcurl-impersonate + Chrome JA3/Akamai 指纹，复用 reverse 项目方案）即可通过。
2. **直连 REST images 端点 404**：`/backend-api/codex/images/generations` 在生产后端不存在（codex main 新增、未部署）。真实可行路径是 **`POST /backend-api/codex/responses` + `tools:[{type:"image_generation"}]`**，流式 SSE，从 `response.output_item.done` 的 `image_generation_call` 取 base64 图片。
3. **图生图**：在 user message 里加 `input_image`（base64 data URL）+ prompt，模型调工具编辑。
4. **分辨率上限**：最长边 ≤ **3840px**（4K UHD 3840×2160 可；4096+ 被后端拒）。
5. **模块变化**：新增 `src/http.ts`（node-libcurl 封装）；`images.ts` 改为 responses+工具流 + SSE 解析；`-m` 改为编排模型（默认 gpt-5.4）。

下文保留原始设计作为记录。

## 1. 目标

一个独立命令行工具 `imgen`，用本地 codex 登录的 ChatGPT 付费账号，调用 Codex 后端图片接口：

- **文生图**：`imgen "提示词" -o out.png`
- **图生图**：`imgen "提示词" -i in.png -o out.png`（带 `-i` 自动走改图）

不依赖 coproxy 服务或 reverse.db，零配置（复用 `~/.codex/auth.json`）。

## 2. 接口事实（已调研确认）

Base URL：`https://chatgpt.com/backend-api/codex`

| 用途 | Method | Path |
|---|---|---|
| 文生图 | POST | `/images/generations` |
| 图生图 | POST | `/images/edits` |

**Headers**（与 coproxy `backend.ts` 已验证可用的一致）：

```
Authorization: Bearer <access_token>
ChatGPT-Account-Id: <account_id>
originator: codex_cli_rs
User-Agent: codex_cli_rs/<version>
Origin: https://chatgpt.com
Content-Type: application/json
```

**generations 请求体**（除 `prompt` 外都可选；本工具默认发送 `size`/`quality`/`background` = `auto`、`n` = 1，与 Codex 客户端一致）：

```json
{ "prompt": "...", "model": "gpt-image-2",
  "background": "auto", "quality": "auto", "size": "auto", "n": 1 }
```

**edits 请求体**：在 generations 基础上加（1~5 张）：

```json
"images": [{ "image_url": "data:image/png;base64,<...>" }]
```

**响应**（纯 JSON）：

```json
{ "created": 1778832973,
  "data": [{ "b64_json": "<base64-PNG>" }],
  "background": "opaque", "quality": "medium", "size": "1024x1536",
  "usage": { "input_tokens": 0, "output_tokens": 0, "total_tokens": 0 } }
```

图片是 `data[i].b64_json`（base64 PNG），内联返回，**无二次下载**。

**约束**：

- 图片生成要求付费号（Plus/Pro/…），免费号会 4xx
- 限流 ~250 张/分钟（新号 5/分钟），画图比文字多烧 3-5x quota
- 来源：Codex 源码 `codex-rs/codex-api/src/endpoint/images.rs`、`images.rs`、`ext/image-generation/`

## 3. 范围

**做**：文生图、图生图（1-5 输入图）、多张输出（n）、size/quality/background/model 参数、单账号自动刷新 token。

**不做（YAGNI）**：账号池/轮换、SSE 流式/进度图、variations、Web UI、对话历史持久化。

## 4. 技术栈

- Node.js + TypeScript（ESM），与 coproxy 同栈
- `commander` 解析参数（成熟标准，处理可重复 `-i`、help）
- 内置 `fetch`（REST，无需 `ws`）
- 认证逻辑从 coproxy `auth.ts` / `pipeline.ts` 拷约 80 行，保持解耦

## 5. 账号 / 认证（已验证 auth.json 结构）

`~/.codex/auth.json` 实际结构：

```
top-level: auth_mode, OPENAI_API_KEY, tokens, last_refresh
tokens:    id_token, access_token, refresh_token, account_id
```

- `loadTokens(codexHome)` 读 `file.tokens` —— coproxy 现成逻辑直接可用
- `extractAccountId(access_token)` 从 JWT 的 `chatgpt_account_id` 现解（刷新后也准），不依赖文件里的 account_id
- access_token 过期（`isTokenExpired`）→ `refreshTokens(refresh_token)`（POST `https://auth.openai.com/oauth/token`，client_id `app_EMoamEEZ73f0CkXaXp7hrann`）→ 写回
- ⚠️ **写回必须 read-merge-write**：保留 `OPENAI_API_KEY` / `auth_mode` 等 codex 自己的字段，只更新 `tokens` + `last_refresh`。不能用 coproxy 的固定格式整体覆盖（会破坏 codex 登录态）。

## 6. 项目结构

```
imgen/
  package.json        bin: { imgen: "dist/cli.js" }, type: module
  tsconfig.json
  .gitignore
  src/
    cli.ts            ~90 行  commander 定义 + 编排
    auth.ts           ~90 行  load/refresh/merge-save token + extractAccountId
    images.ts         ~80 行  buildBody + generate/edit + 错误映射
    output.ts         ~30 行  base64 → 写 png
  README.md
```

每文件 <120 行，符合 code-quality 规则。

## 7. CLI 接口

```
imgen [options] <prompt>

  -i, --image <path...>   输入图，给了即走 edits（1~5 张，可多次）
  -o, --out <path>        输出路径（默认 ./image-<unix>.png）
  -n, --count <num>       生成数量（默认 1；>1 输出 out-1.png…）
  -s, --size <size>       auto|1024x1024|1024x1536|1536x1024（默认 auto）
  -q, --quality <q>       low|medium|high|auto（默认 auto）
  -b, --background <bg>   transparent|opaque|auto（默认 auto）
  -m, --model <model>     默认 gpt-image-2
  --codex-home <dir>      默认 $CODEX_HOME 或 ~/.codex
```

**例子**：

```
imgen "a red fox in snow" -o fox.png
imgen "make it night, neon" -i fox.png -o fox-night.png
imgen "logo ideas" -n 4 -o logo.png            # logo-1.png … logo-4.png
imgen "a cat sticker" -b transparent -o cat.png
```

## 8. 模块设计

### auth.ts

```
loadTokens(codexHome): AuthTokens
isTokenExpired(accessToken): boolean
refreshTokens(refreshToken): Promise<AuthTokens>
saveTokensMerged(codexHome, tokens): void          // read-merge-write，保留其他字段
extractAccountId(accessToken): string | null
ensureValidToken(codexHome): Promise<{ accessToken: string; accountId: string }>
   // 编排：load → 若过期则 refresh + saveTokensMerged → 返回 { accessToken, extractAccountId(accessToken) }
```

### images.ts

```
interface GenOptions  { prompt; model; n?; size?; quality?; background? }
interface EditOptions extends GenOptions { imagePaths: string[] }

generate(token, accountId, o: GenOptions): Promise<ImageResponse>
edit(token, accountId, o: EditOptions): Promise<ImageResponse>
   // 读每张图 → 按扩展名判 mime(png/jpeg/webp/gif) → data URL → images[]
   // 校验：文件存在、1~5 张、是图片类型
callImages(path, token, accountId, body): Promise<ImageResponse>
   // fetch POST，超时 120s，非 2xx → 映射错误（401/403→付费号提示，429→限流提示）
BASE_URL / 公共 headers 常量
```

### output.ts

```
saveImages(data: { b64_json: string }[], outPath): string[]
   // 单张 → outPath；多张 → outPath 去扩展名 + "-{i}" + 扩展名
   // base64 decode → writeFileSync，返回保存路径数组
```

### cli.ts

```
program ... .action(async (prompt, opts) => {
  const { accessToken, accountId } = await ensureValidToken(opts.codexHome)
  const resp = opts.image?.length
     ? await edit(accessToken, accountId, { ...opts, imagePaths: opts.image })
     : await generate(accessToken, accountId, { ...opts })
  const paths = saveImages(resp.data, opts.out)
  // 打印保存路径 + size/quality + usage
})
// catch → 友好消息 + process.exit(1|2)
```

## 9. 执行流程

1. 解析参数
2. `ensureValidToken` → 拿到有效 access_token + accountId（过期自动刷新写回）
3. 有 `-i` → `edit`（读图转 data URL）；否则 `generate`
4. POST，120s 超时
5. `data[].b64_json` 解码写文件
6. 打印保存路径 + usage

## 10. 错误处理

| 场景 | 处理 |
|---|---|
| auth.json 缺失 | 提示「未找到 <path>/auth.json，请先用 codex 登录」，exit 1 |
| token 刷新失败 | 打印原因，exit 1 |
| 401 / 403 | 「账号无图片生成权限，可能是免费号，需 Plus/Pro」，exit 1 |
| 429 / usage_limit_reached | 「撞限流，稍后再试」（+reset 时间若有），exit 1 |
| 输入图不存在 / 超 5 张 / 非图片 | 参数校验报错，exit 2 |
| 网络 / 超时 | 打印原因，exit 1 |

## 11. 测试

- **单元**：`extractAccountId`（JWT 解析）、`buildBody`（gen vs edit 分支、默认值注入 size/quality/background=auto）、mime 检测、`saveImages` 多张后缀、`saveTokensMerged` 保留其他字段
- **手动 E2E**：真付费号跑 1 张文生图 + 1 张图生图确认出图；用过期 token 确认自动刷新且 auth.json 其他字段不丢

## 12. 验收标准

- `imgen "a red fox" -o fox.png` 生成 PNG
- `imgen "make it night" -i fox.png -o night.png` 改图
- token 过期自动刷新，且 auth.json 其他字段（OPENAI_API_KEY 等）不丢
- 免费号给出明确报错
- `imgen --help` 显示完整用法
