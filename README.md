# ThreadPilot for ChatGPT

Choose a language:

- [English](#english)
- [中文](#中文)

<a id="english"></a>

<details open>
<summary>English</summary>

## Overview

ThreadPilot for ChatGPT is a lightweight browser extension that helps you navigate, preview, filter, and collapse long ChatGPT conversations.

## Links

- GitHub: https://github.com/billowssun/threadpilot-for-chatgpt
- Issues: https://github.com/billowssun/threadpilot-for-chatgpt/issues
- Releases: https://github.com/billowssun/threadpilot-for-chatgpt/releases
- Website: https://billowssun.github.io/threadpilot-for-chatgpt/

## Why It Exists

Long ChatGPT conversations can become hard to scan, revisit, and manage. ThreadPilot adds a clean side navigator so you can quickly jump between messages, preview nodes, filter by role, and fold long AI replies.

## Features

- Side navigator for long conversations
- Hover preview for message nodes
- Click or drag to jump through a conversation
- Filter navigation by All / AI / Me
- Collapse long AI replies while keeping user messages visible
- Per-message More / Collapse controls
- Optional native navigator hiding
- Adjustable side offset
- Local settings only

## Installation

### From Source

1. Clone or download this repository.
2. Open the Chrome / Edge extensions page: `chrome://extensions/`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select the project folder.
6. Open or refresh `https://chatgpt.com/`.

### From Releases

Download the latest zip from GitHub Releases and load it as an unpacked extension, or install it from browser stores after publication.

## Shortcuts

- `Alt + J`: Show / hide navigator
- `Alt + C`: Fold / unfold AI long replies
- `Alt + N`: Next message
- `Alt + P`: Previous message

## Permissions

```json
"permissions": ["storage"]
```

The `storage` permission is used only to save local extension settings, such as navigator visibility, filter mode, side offset, and AI folding preferences.

ThreadPilot does not upload your conversations, does not use remote analytics, and does not inject ads.

## Release Packaging

Releases are created from version tags. After updating `manifest.json`, push a matching tag such as `v1.1.0` to build and publish the release zip automatically.

## License

MIT License

</details>

<a id="中文"></a>

<details>
<summary>中文</summary>

## 项目简介

ThreadPilot for ChatGPT，中文名“对话导航助手”，是一个轻量浏览器扩展，用来改善 ChatGPT 网页端长对话的阅读体验。

## 链接

- GitHub: https://github.com/billowssun/threadpilot-for-chatgpt
- 问题反馈: https://github.com/billowssun/threadpilot-for-chatgpt/issues
- 版本发布: https://github.com/billowssun/threadpilot-for-chatgpt/releases
- 官网: https://billowssun.github.io/threadpilot-for-chatgpt/

## 为什么需要它

ChatGPT 长对话经常很难快速回看、定位和整理。ThreadPilot 会在页面侧边添加轻量导航条，让你快速跳转、预览消息、按角色筛选，并折叠过长的 AI 回复。

## 功能

- 为长对话生成侧边导航
- 悬浮预览消息节点
- 点击或拖动快速定位
- 按全部 / AI / 我的输入筛选导航
- 折叠 AI 长回复，同时保留你的输入
- 每条 AI 回复都有独立的更多 / 收起控制
- 可隐藏 ChatGPT 原生导航
- 可调整导航条侧边距离
- 设置仅保存在本地

## 安装

### 从源码安装

1. 下载或克隆本仓库。
2. 打开 Chrome / Edge 扩展管理页：`chrome://extensions/`。
3. 开启开发者模式。
4. 点击“加载已解压的扩展程序”。
5. 选择项目文件夹。
6. 打开或刷新 `https://chatgpt.com/`。

### 从发布版安装

你可以从 GitHub Releases 下载最新版 zip，然后通过开发者模式加载；正式发布后，也可以从 Chrome Web Store 或 Microsoft Edge Add-ons 安装。

## 快捷键

- `Alt + J`：显示或隐藏导航条
- `Alt + C`：折叠或展开 AI 长回复
- `Alt + N`：下一条消息
- `Alt + P`：上一条消息

## 权限

```json
"permissions": ["storage"]
```

`storage` 权限仅用于保存本地设置，例如导航条显示状态、筛选模式、侧边距离和 AI 回复折叠偏好。

ThreadPilot 不上传你的对话内容，不使用远程分析，也不插入广告。

## 发布打包

Release 由版本 tag 触发。更新 `manifest.json` 后，推送匹配的 tag，例如 `v1.1.0`，即可自动构建并发布 release zip。

## 开源协议

MIT License

</details>
