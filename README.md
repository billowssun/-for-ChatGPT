# ThreadPilot for ChatGPT

ThreadPilot is a focused browser extension for long ChatGPT conversations.

It does two things:

1. Folds long assistant replies into compact, readable previews.
2. Turns your prompts into a navigable conversation timeline.

No account, analytics, ads, or conversation upload.

## Features

### Conversation timeline

- One position tick per user prompt
- Ticks map to the prompts' real positions in the conversation
- Current turn follows page scrolling
- Hover preview before jumping
- Click a tick to place the matching prompt below ChatGPT's fixed header
- Dedicated jump-to-top and jump-to-bottom controls
- Dense, non-scrolling rail for very long chats

### Reply folding

- Automatically folds completed long replies
- Keeps the opening context, character count, and an explicit expand action
- Per-reply expand and collapse
- One context-aware bulk fold button, isolated from the timeline hit area
- Bulk folding preserves the current prompt's viewport position
- Manual choices survive ChatGPT DOM updates within the current conversation

## Settings

The popup contains only:

- Current-page connection status and a reconnect action
- Conversation timeline on/off
- Automatic long-reply folding on/off
- Compact, balanced, or relaxed folding threshold

## Shortcuts

- `Alt + J`: show or hide the timeline
- `Alt + C`: collapse or expand all assistant replies
- `Alt + N`: jump to the next turn
- `Alt + P`: jump to the previous turn

## Install

- Website: https://billowssun.github.io/threadpilot-for-chatgpt/
- Releases: https://github.com/billowssun/threadpilot-for-chatgpt/releases/latest

After installation or an extension update, open or refresh https://chatgpt.com/. If the page is not connected, open the extension popup and choose **Reconnect**.

## Privacy

ThreadPilot stores only feature switches and the folding threshold in browser sync storage. Conversation text stays in the current ChatGPT page and is never uploaded or persisted by the extension.

---

# 中文

ThreadPilot 是一个专门改善 ChatGPT 长对话阅读体验的浏览器扩展。

它只做两件事：

1. 把 AI 长回答折叠成可读的紧凑摘要。
2. 把你的提问整理成可导航的对话时间线。

无需账号，不含统计、广告，也不会上传对话。

## 功能

### 对话时间线

- 每个用户提问对应一个位置刻度
- 刻度按提问在对话中的真实位置映射
- 页面滚动时自动高亮当前轮次
- 悬停先预览，再决定是否跳转
- 点击刻度后将对应提问准确放到 ChatGPT 固定顶栏下方
- 提供回到对话顶部和跳到对话底部按钮
- 超长对话使用密集刻度，不产生第二层滚动

### 回答折叠

- 自动折叠已经生成完成的长回答
- 保留开头上下文、字数和明确的展开入口
- 每条回答可独立展开或收起
- 独立批量按钮根据状态执行折叠全部或展开全部，不占用时间线点击区域
- 批量操作保持当前问题的视口位置和时间线轮次
- ChatGPT 页面更新后仍保留当前对话中的手动选择

## 设置

弹窗只保留：

- 当前页面连接状态和重新连接入口
- 对话时间线开关
- 自动折叠长回答开关
- 紧凑、平衡、宽松三档折叠强度

## 快捷键

- `Alt + J`：显示或隐藏时间线
- `Alt + C`：折叠或展开全部回答
- `Alt + N`：跳到下一轮
- `Alt + P`：跳到上一轮

## 安装

- 官网：https://billowssun.github.io/threadpilot-for-chatgpt/
- 最新版本：https://github.com/billowssun/threadpilot-for-chatgpt/releases/latest

安装或更新扩展后，打开或刷新 https://chatgpt.com/。如果页面未连接，可在扩展弹窗中点击“重新连接”。

## 隐私

ThreadPilot 只在浏览器同步存储中保存功能开关和折叠强度。对话正文只存在于当前 ChatGPT 页面，不会被扩展上传或持久化。
