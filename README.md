# Markdown Reader

一个 Chrome 扩展，将本地 Markdown 文件渲染为格式化 HTML，并提供侧栏文件浏览和目录导航。

A Chrome extension that renders local Markdown files with a sidebar file explorer and table of contents.

---

## 功能 / Features

- **Markdown 渲染** — 使用 [marked](https://marked.js.org/) 渲染 `.md`、`.markdown`、`.mdown`、`.mkd`、`.mkdn` 文件，支持 GFM
- **文件浏览** — 自动列出同目录下所有 Markdown 文件，点击即可跳转
- **目录导航** — 从标题自动生成可点击的 TOC，并随滚动高亮当前位置
- **可折叠侧栏** — 点击箭头按钮可收起/展开侧栏
- **深色/浅色主题** — 通过 CSS 自定义属性支持浅色、深色、暗灰三种主题

---

## 实现原理 / How It Works

### 目录文件列表 / Directory File Listing

打开本地 Markdown 文件时，扩展自动列出同目录下所有其他 Markdown文件：

1. Content script 从当前文件 URL 推导出目录地址（如 `file:///path/to/notes/`）
2. 通过 `chrome.runtime.sendMessage` 将目录地址发送给 **background service worker**
3. Background service worker 用 `fetch()` 请求该目录地址 — Chrome 返回一段包含 `addRow()` 调用的 HTML
4. Content script 用正则从 `<script>` 标签中提取 `addRow("文件名", "url", isdir, ...)` 参数
5. 过滤出 `.md` 文件，显示在侧栏中

> **为什么不能直接在 content script 中请求？**
> Chrome 的 CORS 策略禁止 content script 对 `file://` URL 发起 XHR/fetch 请求。Background service worker 在用户开启「允许访问文件网址」后拥有相关权限。

1. Content script derives the directory URL from the current file (e.g. `file:///path/to/notes/`)
2. It sends a message to the **background service worker** requesting that URL
3. The background service worker fetches the directory URL — Chrome returns an HTML page with files listed via `addRow()` JavaScript calls
4. The content script parses the `addRow()` calls using regex to extract filenames
5. Markdown files are filtered and displayed in the sidebar

> **Why not fetch directly from the content script?**  
> Chrome blocks XHR/fetch to `file://` URLs from content scripts due to CORS policy. The background service worker has the necessary permissions when "Allow access to file URLs" is enabled.

### 文档内链接 / Document Links

扩展还会扫描渲染后的 Markdown 中指向同目录其他 `.md` 文件的 `[链接](other.md)`，与目录列表合并去重。

The extension also scans rendered Markdown for `[links](other.md)` pointing to other Markdown files in the same directory, merging them with the directory listing (deduped).

---

## 安装 / Installation

1. 克隆或下载本仓库 / Clone or download this repository
2. 在 Chrome 中打开 `chrome://extensions/` / Open `chrome://extensions/` in Chrome
3. 开启右上角 **开发者模式** / Enable **Developer mode** (top right)
4. 点击 **加载已解压的扩展程序**，选择项目文件夹 / Click **Load unpacked** and select the project folder
5. 点击扩展的 **详情**，开启 **「允许访问文件网址」** / Click **Details** on the extension, then enable **"Allow access to file URLs"**

---

## 使用 / Usage

在 Chrome 中打开本地 Markdown 文件（如将 `.md` 文件拖入浏览器），扩展会自动：

Open any local Markdown file in Chrome (e.g. drag a `.md` file into the browser). The extension will automatically:

- 将 Markdown 渲染为格式化 HTML / Render the Markdown as formatted HTML
- 在侧栏显示同目录下的 `.md` 文件 / Populate the sidebar with sibling `.md` files
- 从标题生成目录导航 / Generate a table of contents from headings
- 高亮当前文件 / Highlight the current file in the file list

点击侧栏中的文件名即可跳转 / Click any file in the sidebar to navigate to it.

---

## 文件结构 / File Structure

```
├── manifest.json        # 扩展清单 (Manifest V3) / Extension manifest
├── background.js        # Service worker: 请求 file:// 目录列表 / Fetches file:// directory listings
├── content.js           # 主逻辑: UI、渲染、文件列表解析 / Main logic: UI, rendering, file list parsing
├── content.css          # 所有样式 (CSS 自定义属性) / All styles with CSS custom properties
├── marked.min.js         # Markdown 解析器 / Markdown parser
├── icons/                # 扩展图标 (SVG) / Extension icons
└── scripts/              # 构建工具 / Build utilities
```

---

## 权限 / Permissions

| 权限 / Permission | 用途 / Purpose |
|---|---|
| `file://*/*` | 访问本地 Markdown 文件和目录列表 / Access local Markdown files and directory listings |
| `storage` | 持久化用户偏好 / Persist user preferences |

---

## 许可 / License

MIT