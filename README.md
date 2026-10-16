# pi-antigravity (with Gemini 4 Argon Support)

[![GitHub license](https://img.shields.io/github/license/JingYangYuan/pi-antigravity)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/JingYangYuan/pi-antigravity?style=social)](https://github.com/JingYangYuan/pi-antigravity)
[![Forked from Rahularya01/pi-antigravity](https://img.shields.io/badge/forked%20from-Rahularya01%2Fpi--antigravity-blue?logo=github)](https://github.com/Rahularya01/pi-antigravity)

**pi-antigravity** is a [Pi Coding Agent](https://pi.dev) provider that lets Pi talk directly to Google Antigravity / Cloud Code Assist models — including **Gemini 4 Argon (`gemini-4-argon`)**, the full Gemini Flash/Pro families, and the Claude & GPT-OSS models served through Antigravity.

This fork enhances the upstream extension with official support for **Gemini 4 Argon**, full 3-tier reasoning routing (`Low` / `Medium` / `High`), multi-endpoint priority merging (preventing disabled fallback models from overwriting live quota), and dedicated 3-group shared quota querying in `/antigravity.usage`.

[English](#english) | [中文说明](#中文说明)

---

<a name="english"></a>

## English

### ✨ Key Features

- 🚀 **Gemini 4 Argon Support**: Native integration with Google's latest `gemini-4-argon` (1,048,576 context window, 65,536 max output tokens). Wire-level `thinkingBudget: -1` support with `Low` / `Medium` / `High` reasoning controls.
- 📊 **3-Group Quota Monitoring**: Live `/antigravity.usage` displays server-reported remaining allowances and reset timers across all 3 pools:
  1. **Gemini Models** (5-hour limit + weekly limit)
  2. **Gemini 4 Argon** (Dedicated weekly limit)
  3. **Claude & GPT models** (5-hour limit + weekly limit)
- 🛡️ **Priority Multi-Endpoint Merging**: Merges `daily-cloudcode-pa`, `sandbox`, and `cloudcode-pa` so fallback endpoints never overwrite active models or live quota with disabled / zeroed entries.
- ⚡ **Pure Native Streaming**: Direct SSE streaming with OAuth 2.0 PKCE authentication. Never shells out to an external CLI binary.
- 👥 **Multi-Account Switching**: Link multiple Google accounts with `/login antigravity` and switch seamlessly using `/antigravity.accounts`.
- 🔍 **Google Search Grounding & Image Generation**: Built-in `google_search` tool (powered by Google Search Grounding) and `generate_image` tool.

---

### Requirements

- [Pi Coding Agent](https://pi.dev) and Pi AI version **0.80.0 or later**
- A Google account entitled to Antigravity / Cloud Code Assist services
- A web browser to complete the OAuth sign-in flow

---

### Installation

Install directly into Pi via GitHub:

```bash
pi install git:github.com/JingYangYuan/pi-antigravity
```

On Oh My Pi:

```bash
omp plugin install git:github.com/JingYangYuan/pi-antigravity
```

To update to the latest release later:

```bash
pi update git:github.com/JingYangYuan/pi-antigravity
```

Restart Pi or execute `/reload` after installing.

---

### Quick Start

1. Start Pi and authenticate with your Google account:
   ```text
   /login antigravity
   ```
2. Select **Gemini 4 Argon**:
   ```text
   /model antigravity/gemini-4-argon
   ```
3. (Optional) Adjust reasoning effort via your Pi status bar (`Ctrl+T` or Reasoning toggle) to `Low`, `Medium`, or `High`.
4. Inspect your real-time quota status at any time:
   ```text
   /antigravity.usage
   ```

---

### Commands

| Command                       | Description                                                                    |
| :---------------------------- | :----------------------------------------------------------------------------- |
| `/login antigravity`          | Authenticate with Google OAuth (supports linking multiple accounts).           |
| `/model antigravity/<id>`     | Select an Antigravity model (e.g. `gemini-4-argon`, `gemini-3.8-flash`).       |
| `/antigravity.usage`          | Show server-reported quota pools (Gemini / Argon / Claude+GPT, 5h + weekly).   |
| `/antigravity.models`         | List all runtime models, remaining quota percentages, and capabilities.        |
| `/antigravity.models all`     | Include internal / tab / chat models normally filtered out.                    |
| `/antigravity.accounts`       | List linked Google accounts (`switch <id/email>` or `remove <id/email>`).      |
| `/antigravity.refresh`        | Force refresh the live dynamic model catalog from Antigravity.                 |
| `/antigravity.doctor`         | Show sanitized diagnostics (active endpoint, status, resolved model, latency). |
| `/antigravity.image <prompt>` | Generate an image (`--ratio 16:9`, `--model`, `--path`).                       |
| `/antigravity.search <query>` | Real-time web search via Google Search Grounding (`--thinking`, `--url`).      |

---

### Models & Request Routing

When you select a public model ID, `pi-antigravity` dynamically routes requests to the optimal backend runtime variant based on your active thinking effort:

| Public Model ID      | Input Modalities | Thinking Levels   | Context Window | Max Output | Backend Routing                                                                                |
| :------------------- | :--------------- | :---------------- | :------------- | :--------- | :--------------------------------------------------------------------------------------------- |
| **`gemini-4-argon`** | Text, Image      | Low, Medium, High | **1,048,576**  | **65,536** | low → `gemini-4-argon-low`<br>medium → `gemini-4-argon-medium`<br>high → `gemini-4-argon-high` |
| `gemini-3.8-flash`   | Text, Image      | Low, Medium, High | 1,048,576      | 65,536     | low/medium/high variants                                                                       |
| `gemini-3.7-flash`   | Text, Image      | Low, Medium, High | 1,048,576      | 65,536     | low/medium/high variants                                                                       |
| `gemini-3.6-flash`   | Text, Image      | Low, Medium, High | 1,048,576      | 65,536     | low/medium/high variants                                                                       |
| `gemini-3.5-flash`   | Text, Image      | Low, Medium, High | 1,048,576      | 65,536     | extra-low/low/agent variants                                                                   |
| `gemini-3.1-pro`     | Text, Image      | Low, High         | 1,048,576      | 65,535     | low → `gemini-3.1-pro-low`<br>high → `gemini-pro-agent`                                        |
| `claude-sonnet-4-6`  | Text, Image      | High              | 200,000        | 64,000     | high → `claude-sonnet-4-6`                                                                     |
| `claude-opus-4-6`    | Text, Image      | High              | 250,000        | 64,000     | high → `claude-opus-4-6-thinking`                                                              |
| `gpt-oss-120b`       | Text             | Medium            | 131,072        | 32,768     | medium → `gpt-oss-120b-medium`                                                                 |

To pin preferred models in `~/.pi/agent/settings.json`:

```json
{
  "models": {
    "antigravity/gemini-4-argon": { "enabled": true },
    "antigravity/gemini-3.8-flash": { "enabled": true },
    "antigravity/claude-sonnet-4-6": { "enabled": true }
  }
}
```

---

### Configuration (Environment Variables)

| Variable                     | Description                                                                                  |
| :--------------------------- | :------------------------------------------------------------------------------------------- |
| `ANTIGRAVITY_BASE_URL`       | Override the default API base URL (defaults to `https://daily-cloudcode-pa.googleapis.com`). |
| `ANTIGRAVITY_PROJECT_ID`     | Override Google Cloud project ID discovery.                                                  |
| `ANTIGRAVITY_USER_AGENT`     | Custom User-Agent (defaults to CLI 1.3.6 fingerprint).                                       |
| `ANTIGRAVITY_RUNTIME_MODEL`  | Force all requests to a pinned runtime model ID.                                             |
| `ANTIGRAVITY_CALLBACK_HOST`  | Loopback binding address for OAuth callback (`127.0.0.1` by default).                        |
| `ANTIGRAVITY_NO_EXTRA_TOOLS` | Set to `1` to disable `google_search` and `generate_image` agent tools.                      |

---

### Troubleshooting

- **401 / 403 Authentication Error**: Run `/login antigravity` to refresh OAuth credentials.
- **403 `VALIDATION_REQUIRED`**: Open the Google account validation link output by the error in your browser to complete human verification.
- **Remote / Headless Server (Browser cannot access `localhost:51121`)**:
  - _Option 1 (Copy/Paste)_: Start `/login antigravity` on server, open link on local machine, and paste the redirected `http://localhost:51121/oauth-callback?...` URL directly into Pi.
  - _Option 2 (SSH Tunnel)_: Run `ssh -N -L 51121:127.0.0.1:51121 user@server` and log in normally.
- **Quota Exceeded (HTTP 429)**: Check `/antigravity.usage`. Link an additional account via `/login antigravity` and switch with `/antigravity.accounts switch <index>`.

---

<a name="中文说明"></a>

## 中文说明

### 🎯 项目特色

`pi-antigravity` 是面向 [Pi Coding Agent](https://pi.dev) 的专属 Antigravity / Cloud Code Assist 扩展。无需启动外部 CLI 进程，在 Pi 内部直接通过 Google 官方 OAuth 协议访问底层大模型服务。

本 Fork 重点带来以下核心更新：

1. **Gemini 4 Argon 全面支持**：完整接入代号为 Argon 的全新推理模型 `gemini-4-argon`，拥有高达 1,048,576 Token 上下文与 65,536 最大输出，原生支持 Low / Medium / High 三档思考深度。
2. **底层 Thinking 协议适配**：适配 Argon 系列特殊的 `thinkingBudget: -1` 协议约束，彻底杜绝标准 Gemini 模型在思维预算为 0 时引发的 `HTTP 400 THINKING_LEVEL_MINIMAL` 报错。
3. **三大独立配额池监控**：`/antigravity.usage` 实时显示 **Gemini 常规模型（5小时+周度）**、**Gemini 4 Argon（专属周度）** 与 **Claude / GPT 模型（5小时+周度）** 三大配额池的消耗进度与重置倒计时。
4. **多端点优先级智能合并**：重构模型探测逻辑（`mergeAvailableModelsResults`），确保主端点 `daily-cloudcode-pa` 的实时配额与可用模型不会被兜底沙箱端点的禁用占位数据所覆盖。
5. **多账号无缝轮换**：支持关联多个 Google 账号，遭遇单账号周度配额耗尽时可一键切换或自动故障转移。

---

### 📦 安装与更新

在 Pi 命令行中直接安装本仓库：

```bash
pi install git:github.com/JingYangYuan/pi-antigravity
```

若使用 Oh My Pi：

```bash
omp plugin install git:github.com/JingYangYuan/pi-antigravity
```

后续升级到最新版：

```bash
pi update git:github.com/JingYangYuan/pi-antigravity
```

安装完成后重启 Pi 或执行 `/reload` 重新加载扩展。

---

### 🚀 快速上手

1. **登录授权**：

   ```text
   /login antigravity
   ```

   在弹出的浏览器窗口中登录授权有 Antigravity 权限的 Google 账号。

2. **切换至 Gemini 4 Argon**：

   ```text
   /model antigravity/gemini-4-argon
   ```

3. **设置思考级别**：
   在 Pi 底部状态栏切换推理级别（Reasoning），支持 `Low`、`Medium`、`High`。

4. **实时查询用量与配额**：

   ```text
   /antigravity.usage
   ```

   输出示例：

   ```text
   Google AI Pro (g1-pro-tier)

   Gemini Models
     [###################-] Weekly Limit Remaining: 97.3% left · resets 6d 22h
     [##################--] Five Hour Limit Remaining: 92.1% left · resets 3h 59m

   Claude and GPT models
     [##################--] Weekly Limit Remaining: 89.7% left · resets 1d 13h
     [####################] Five Hour Limit Remaining: 100% left · resets 5h 0m

   Gemini 4 Argon
     [###############-----] Gemini 4 Argon Weekly Limit: 73.2% left · resets 6d 22h
   ```

5. **查看所有可用模型列表与单项状态**：
   ```text
   /antigravity.models
   ```

---

### 📋 常用斜杠命令

| 命令                           | 功能说明                                                               |
| :----------------------------- | :--------------------------------------------------------------------- |
| `/login antigravity`           | 发起 Google OAuth 授权；重复执行可绑定多个 Google 账号                 |
| `/model antigravity/<id>`      | 选取模型（如 `gemini-4-argon`、`gemini-3.8-flash` 等）                 |
| `/antigravity.usage`           | 查看服务端报告的共享配额池（Gemini / Argon / Claude+GPT，5h + 周度）   |
| `/antigravity.models`          | 列出所有可用 runtime 模型、剩余用量百分比及功能标签                    |
| `/antigravity.accounts`        | 管理多账号列表（`switch <序号/邮箱>` 切换，`remove <序号/邮箱>` 解绑） |
| `/antigravity.refresh`         | 强制从服务端探测并刷新最新动态模型目录                                 |
| `/antigravity.doctor`          | 输出脱敏后的诊断数据（端点、状态码、命中模型、网络延迟）               |
| `/antigravity.search <关键词>` | 通过 Google Search Grounding 执行实时联网搜索（支持 `--thinking`）     |
| `/antigravity.image <提示词>`  | 调用 Antigravity 生成图片并保存至本地项目（支持 `--ratio 16:9`）       |

---

### 🤖 模型与请求路由对应表

| 公开模型 ID          | 输入模态   | 可选思考等级      | 上下文窗口    | 最大输出 Token | 对应后端 Runtime ID                                                                            |
| :------------------- | :--------- | :---------------- | :------------ | :------------- | :--------------------------------------------------------------------------------------------- |
| **`gemini-4-argon`** | 文本、图片 | Low, Medium, High | **1,048,576** | **65,536**     | low → `gemini-4-argon-low`<br>medium → `gemini-4-argon-medium`<br>high → `gemini-4-argon-high` |
| `gemini-3.8-flash`   | 文本、图片 | Low, Medium, High | 1,048,576     | 65,536         | low/medium/high 对应变体                                                                       |
| `gemini-3.7-flash`   | 文本、图片 | Low, Medium, High | 1,048,576     | 65,536         | low/medium/high 对应变体                                                                       |
| `gemini-3.6-flash`   | 文本、图片 | Low, Medium, High | 1,048,576     | 65,536         | low/medium/high 对应变体                                                                       |
| `gemini-3.5-flash`   | 文本、图片 | Low, Medium, High | 1,048,576     | 65,536         | extra-low/low/agent 对应变体                                                                   |
| `gemini-3.1-pro`     | 文本、图片 | Low, High         | 1,048,576     | 65,535         | low → `gemini-3.1-pro-low`<br>high → `gemini-pro-agent`                                        |
| `claude-sonnet-4-6`  | 文本、图片 | High              | 200,000       | 64,000         | high → `claude-sonnet-4-6`                                                                     |
| `claude-opus-4-6`    | 文本、图片 | High              | 250,000       | 64,000         | high → `claude-opus-4-6-thinking`                                                              |
| `gpt-oss-120b`       | 纯文本     | Medium            | 131,072       | 32,768         | medium → `gpt-oss-120b-medium`                                                                 |

---

### ❓ 常见问题排查

- **401 未授权 / 403 权限拒绝**：执行 `/login antigravity` 重新登录授权。
- **403 出现 `VALIDATION_REQUIRED`（人机身份核验）**：在浏览器中打开报错信息中的 `accounts.google.com` 链接，登录对应的 Google 账号完成人机验证即可解除，单独重新登录无法清除该限制。
- **远程无头服务器登录（浏览器无法访问服务器的 localhost:51121）**：
  - _方案 A（地址回贴）_：在服务器执行 `/login antigravity`，在本地电脑浏览器打开登录链接授权。授权后浏览器跳转至 `http://localhost:51121/oauth-callback?...` 失败时，将浏览器地址栏的完整网址复制粘贴回 Pi 控制台提示处即可。
  - _方案 B（SSH 端口转发）_：本地电脑终端执行 `ssh -N -L 51121:127.0.0.1:51121 用户@服务器IP`，然后在服务器端运行 `/login antigravity`，浏览器授权后将自动命中回环端口。
- **用量限制（HTTP 429）**：通过 `/antigravity.usage` 查看哪个配额池耗尽；支持通过 `/login antigravity` 绑定多个账号，并在不同账号间灵活切换。

---

## 致谢与许可证

- 核心框架基于 [Rahul Arya](https://github.com/Rahularya01) 的 [pi-antigravity](https://github.com/Rahularya01/pi-antigravity) 项目开发。
- 本项目遵循 [MIT 许可证](LICENSE) 开源发布。
