# Markdown Reader Chrome Extension — Known Issues

## 1. 🚫 无法自动列举本地 file:// 目录内容（核心问题）

### 现象
打开本地 `.md` 文件时，Files Tab 无法自动发现同目录下其他 `.md` 文件，除非之前手动打开过这些文件。

### 根本原因
Chrome 的安全沙箱**禁止网页/扩展主动扫描用户本地文件系统**。这是浏览器的设计原则，以下为所有尝试过的方案及其结果：

| 方案 | 实现 | 结果 | 失败原因 |
|---|---|---|---|
| **Content Script `fetch(dir)`** | 在 `file://` 页面内用 `fetch` 请求目录 URL，解析 Chrome 自动生成的 `Index of...` HTML | ❌ 失败 | Chrome 安全策略阻止 `file://` 页面的 fetch，即使同 origin 也会被拦截（CORB/CORS/null origin 限制） |
| **跳转-扫描-返回** | `location.href = dirUrl` → 在目录页解析 `<a>` → 存 cache → 跳回原始 md | ❌ 用户体验差 | 页面闪烁（白屏→目录页→md页），用户体验无法接受 |
| **Background `fetch(file://)`** | Service Worker 直接 fetch 目录 | ❌ 不可行 | Service Worker origin 是 `chrome-extension://`，向 `file://` 发请求属于跨域，且 `file` 协议不支持 CORS |
| **后台标签页静默扫描** | `chrome.tabs.create({active:false})` → `chrome.scripting.executeScript` 读取目录页 | ❌ 失败 | Chrome 阻止 background 对 `file://` 页面执行 `executeScript`，可能由于安全策略或扩展未获 file:// 执行权限 |
| **隐藏 iframe** | 在 md 页内建 `<iframe src="dirUrl" hidden>` 读取 `contentDocument` | ❌ 不可行 | `file://` 下不同文件视为不同 origin，`contentDocument` 访问触发同源策略错误 |
| **Native Messaging** | 扩展 ↔ 本地二进制程序通信，程序直接 `fs.readdirSync` | ✅ 技术上可行 | 需用户额外安装本地组件（Python/Go），过重 |
| **File System Access API** | `window.showDirectoryPicker()` 用户选择目录 | ⚠️ 半可用 | 只能获得虚拟文件句柄，**无法映射回 `file://` URL**。刷新后权限丢失 |
| **本地 HTTP 服务器** | 用户运行 `python -m http.server` 或 `npx serve` | ✅ 完全可行 | 绕过所有限制，但要求用户额外操作，不适合"双击打开 md"的工作流 |

### 当前妥协方案
目前 Files Tab 通过以下三层**被动式**数据聚合：
1. `chrome.storage.local` 缓存（记录用户打开过的文件）
2. 当前 Markdown 正文内指向同目录的链接解析
3. 首次打开时显示 "Scanning directory…" 但最终依赖 background 扫描

### 可能有效的方案
- **方案 A（推荐）**：使用 **Native Messaging** 连接一个本地微型 HTTP 服务或文件扫描程序
- **方案 B（次选）**：在扩展侧边栏加一个 **"📂 选择目录"** 按钮，使用 File System Access API 让用户主动授权目录读取
- **方案 C（hacky）**：用 `XMLHttpRequest` 替代 `fetch` 再次测试——某些旧版 Chrome 中 XHR 对 `file://` 限制比 fetch 宽松

---

## 2. 🔄 权限变更后扩展状态不稳定

### 现象
修改 `manifest.json` 中的 `permissions` 或 `host_permissions` 后，Chrome 扩展管理页可能显示"需要修复"或权限未生效。

### 解决方式
每次修改权限后必须在 `chrome://extensions` 中：
1. 点击扩展卡片上的 🔄 **刷新**
2. 重新确认 **"允许访问文件网址"** 开关
3. 有时需要**关闭并重新开启扩展开关**

---

## 3. 📦 Manifest V3 的限制

- `chrome.fileSystem` API（Chrome Apps 专属）已被剥离，不可用
- `chrome.fileBrowserHandler` 已废弃
- Service Worker 不能持久运行，长时间后台任务可能被 Chrome 终止
- `executeScript` 对 `file://` 页面的支持在 Manifest V3 中受到更严格限制

---

## 4. 🏷 来源标签样式残留

`content.css` 中 `.mdr-source-tag` 和 `#mdr-scanning-overlay` 的样式仍然存在，但 content.js 最新版本已不再渲染来源标签和扫描覆盖层。建议后续清理无用 CSS。

---

## 5. 🧪 测试环境

当前所有测试基于：
- Chrome 浏览器（具体版本未记录）
- macOS 系统
- 本地 `file://` 协议访问

不同操作系统和 Chrome 版本对 `file://` 安全策略的实现可能有差异。

---

## 建议下一步

1. 优先考虑 **File System Access API + 手动选择目录按钮** 方案，这是目前浏览器允许的最干净的本地文件访问方式
2. 如果接受额外依赖，可搭建 **Native Messaging + 本地文件扫描程序**
3. 或者接受当前妥协：Files Tab 显示历史访问记录 + 正文链接，第一次使用时需要手动多打开几个文件来"预热"列表
