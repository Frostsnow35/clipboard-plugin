# ALIGNMENT - PlugClipboard 需求对齐

## 项目背景
PlugClipboard 是一个 Chrome 扩展，旨在保存用户的剪贴板历史记录（文本和图片），并提供便捷的 UI 进行查看和重新复制。

## 核心需求
1. **自动记录**：监听用户的复制操作，自动保存剪贴板内容。
2. **多类型支持**：支持纯文本、纯图片以及图文混合内容。
3. **容量限制**：默认保存最近的 20 条记录。
4. **持久化**：使用 `chrome.storage.local` 存储数据。
5. **便捷访问**：在网页右下角提供悬浮球和侧边面板查看历史。
6. **一键复用**：点击历史记录项，将其重新写入剪贴板。

## 技术方案边界
- **Manifest V3**：必须符合 Chrome 扩展 MV3 规范。
- **Offscreen API**：由于 MV3 Service Worker 无法直接访问 DOM 剪贴板，使用 Offscreen Document 绕过限制。
- **Shadow DOM**：Content Script 注入的 UI 必须使用 Shadow DOM 以隔离网页样式影响。
- **性能优化**：图片存储前需进行压缩（JPEG 格式），避免超出存储配额。

## 质量目标
- 剪贴板读取成功率 > 95%。
- 页面加载性能损耗最小化。
- 遵循 snake_case 命名规范和双层解释机制。
