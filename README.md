# Markdown Reader

A Chrome extension that renders local Markdown files with a sidebar file explorer and table of contents.

## Features

- **Markdown rendering** — Renders `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn` files using [marked](https://marked.js.org/) with GFM support
- **File explorer** — Automatically lists all Markdown files in the same directory
- **Table of contents** — Generates a clickable TOC from headings with scroll spy
- **Collapsible sidebar** — Toggle sidebar visibility with the arrow button
- **Light & dark themes** — CSS custom properties with light, dark, and dimmed variants

## How It Works

### Directory File Listing

When you open a local Markdown file, the extension automatically lists all other Markdown files in the same directory:

1. The content script derives the directory URL from the current file (e.g. `file:///path/to/notes/`)
2. It sends a message to the **background service worker** requesting that URL
3. The background service worker fetches the directory URL — Chrome returns an HTML page with files listed via `addRow()` JavaScript calls
4. The content script parses the `addRow()` calls using regex to extract filenames
5. Markdown files are filtered and displayed in the sidebar

> **Why not fetch directly from the content script?**  
> Chrome blocks XHR/fetch to `file://` URLs from content scripts due to CORS policy. The background service worker has the necessary permissions when "Allow access to file URLs" is enabled.

### Document Links

The extension also scans the rendered Markdown for `[links](other.md)` pointing to other Markdown files in the same directory, merging them with the directory listing (deduped).

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder
5. Click **Details** on the extension, then enable **"Allow access to file URLs"**

## Usage

Open any local Markdown file in Chrome (e.g. drag a `.md` file into the browser). The extension will automatically:

- Render the Markdown as formatted HTML
- Populate the sidebar with sibling `.md` files from the same directory
- Generate a table of contents from headings
- Highlight the current file in the file list

Click any file in the sidebar to navigate to it.

## File Structure

```
├── manifest.json        # Extension manifest (Manifest V3)
├── background.js        # Service worker: fetches file:// directory listings
├── content.js           # Main logic: UI, rendering, file list parsing
├── content.css          # All styles with CSS custom properties
├── marked.min.js         # Markdown parser
├── icons/                # Extension icons (SVG)
└── scripts/              # Build utilities
```

## Permissions

| Permission | Purpose |
|---|---|
| `file://*/*` | Access local Markdown files and directory listings |
| `storage` | Persist user preferences |

## License

MIT