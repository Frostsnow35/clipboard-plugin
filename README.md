# PlugClipboard

[中文](#中文) | [English](#english)

---

## 中文

### 简介
**PlugClipboard** 是一款专为高效工作者打造的剪贴板历史管理工具。它深度集成于浏览器中，能够实时捕捉并存储您复制的文字与图片，解决原生剪贴板只能保存一条记录的痛点，让信息收集与复用变得前所未有的简单。

### 核心功能
- **全格式捕捉**：实时记录文本与图片，支持最大 20 条历史记录滚动存储。
- **图片双轨处理**：首创“存储缩略图 + 内存原图”机制，既优化了插件存储空间，又确保再次复制时能完美还原原始画质。
- **直观交互**：
  - **选择模式**：支持多选删除或一键清空。
  - **安全保障**：删除前弹出确认对话框，防止误删。
  - **沉浸 UI**：基于 Shadow DOM 实现的独立面板，不干扰网页布局，支持平滑滚动与拖拽进度条。
- **高稳定性**：内置上下文自动校验机制，彻底解决“扩展上下文失效”导致的面板消失问题。

### 技术栈
- **架构**：Chrome Extension Manifest V3
- **核心 API**：
  - **Offscreen API**：实现在 Service Worker 环境下的后台剪贴板读取。
  - **Shadow DOM**：实现 UI 沙箱隔离，防止网页样式污染。
- **存储**：`chrome.storage.local` 分离存储元数据与大尺寸图片。
- **测试**：集成 Playwright E2E 自动化测试框架。

### 安装与使用
1. 下载并解压本项目。
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`。
3. 开启右侧的“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择本项目文件夹。
5. 在任意网页复制内容，即可通过插件面板查看历史。


本产品是霜雪的一些小灵感，诚挚欢迎各位大佬对本产品进行贡献！^v^

---

## English

### Introduction
**PlugClipboard** is a clipboard history management tool designed for productivity. Deeply integrated into your browser, it captures and stores text and images in real-time, overcoming the limitation of the native clipboard that only keeps a single record.

### Key Features
- **All-Format Capture**: Real-time recording of text and images, supporting up to 20 historical items.
- **Dual-Track Image Processing**: A unique "Thumbnail Storage + Memory Original" mechanism that optimizes storage space while ensuring original quality when re-copying.
- **Intuitive Interaction**:
  - **Selection Mode**: Supports multi-select deletion or one-click clearing.
  - **Safety First**: Confirmation dialogs before deletion to prevent accidental loss.
  - **Immersive UI**: Shadow DOM-based panel that doesn't interfere with web page layouts, featuring smooth scrolling and a draggable progress bar.
- **High Stability**: Built-in context validation to prevent the "Extension context invalidated" error and ensure panel persistence.

### Technical Highlights
- **Architecture**: Chrome Extension Manifest V3
- **Core APIs**:
  - **Offscreen API**: Enables background clipboard reading within the Service Worker environment.
  - **Shadow DOM**: Provides UI sandboxing to prevent style contamination from host pages.
- **Storage**: `chrome.storage.local` for metadata and high-quality image separation.
- **Testing**: Integrated with Playwright E2E automation testing framework.

### Installation
1. Download and extract this project.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked" and select the project folder.
5. Copy any content on a web page to view history in the extension panel.
