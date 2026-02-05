# TASK_BREAKDOWN - 原子化任务拆分

## 任务拆分原则
- 每个子任务不超过 3 个函数。
- 遵循单一职责原则。
- 明确输入输出。

## 任务列表

### 1. 后台逻辑优化 (background.js)
- **任务 1.1**: 修复 `onMessage` 异步响应。
  - 函数: `onMessage` 监听器优化。
  - 输入: `chrome.runtime.onMessage`。
  - 输出: 正确返回 `true` 或 `Promise` 以保持通道开启。
- **任务 1.2**: 优化 Offscreen 创建锁。
  - 函数: `setup_offscreen_document`。
  - 输入: 文档路径。
  - 改进: 增加超时处理和更稳健的锁机制。

### 2. 剪贴板读取优化 (offscreen.js)
- **任务 2.1**: 增强图片处理健壮性。
  - 函数: `compress_image`, `process_clipboard_items`。
  - 输入: `Blob` 或 `DataTransferItem`。
  - 改进: 增加错误捕获，确保即使图片压缩失败也能保存文本。

### 3. UI 与交互增强 (content.js)
- **任务 3.1**: 点击外部自动关闭面板。
  - 函数: 全局 `click` 监听逻辑。
  - 改进: 实现真正的“点击外部关闭”。
- **任务 3.2**: 渲染性能优化。
  - 函数: `render_history`。
  - 改进: 使用 `DocumentFragment` 减少重排。

### 4. 代码规范修复 (All Files)
- **任务 4.1**: 命名规范同步。
  - 操作: 将 `camelCase` 变量/函数改为 `snake_case`。
- **任务 4.2**: 完善注释。
  - 操作: 按照 `@brief`, `@param` 等标准添加函数头注释。
