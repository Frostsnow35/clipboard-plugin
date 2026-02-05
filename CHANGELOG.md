# CHANGELOG - PlugClipboard

## [1.0.2] - 2026-02-05

### 优化与修复
- **错误修复**:
  - 修复了 `chrome.storage.local` 未定义导致的 `TypeError`，增加了环境检测和友好的警告提示。
  - 解决了 Offscreen Document 中 `navigator.clipboard.read()` 因焦点问题失败的兼容性问题，将粘贴目标从 `textarea` 升级为 `div[contenteditable="true"]` 以支持更丰富的剪贴板数据。
  - 优化了 `execCommand('paste')` 的降级处理逻辑，增加了对 `DataTransferItem.kind` 的校验，确保能正确提取图片数据。
- **架构对齐**: 新增 `ALIGNMENT.md`, `ARCHITECT.md` 和 `TASK_BREAKDOWN.md` 以明确需求和架构设计。
- **后台稳定性**: 
  - 修复了 `background.js` 中 `onMessage` 监听器未正确返回 `true` 导致异步响应失败（"Message port closed before a response was received"）的问题。
  - 改进了 Offscreen Document 的创建锁机制，增加了并发安全处理。
- **剪贴板读取增强**:
  - `offscreen.js` 重构为 `snake_case` 命名规范。
  - 增加了图片处理的健壮性，为每个步骤添加了 `try-catch` 保护，确保部分失败不影响整体流程。
- **UI 交互改进**:
  - `content.js` 实现真正的“点击外部关闭历史面板”功能（使用 `composedPath` 解决 Shadow DOM 隔离问题）。
  - 使用 `DocumentFragment` 优化历史列表渲染性能，减少 DOM 重绘。
  - 统一了 UI 操作的异步处理，提升响应速度。
- **代码规范**:
  - 全量同步 `snake_case` 命名。
  - 按照标准完善了所有核心函数的头注释（`@brief`, `@param`, `@return`）。
