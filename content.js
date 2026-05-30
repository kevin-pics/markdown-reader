(function () {
  'use strict';

  let inlineCurrentUrl = null; // kept for future inline navigation

  const hideStyle = document.createElement('style');
  hideStyle.textContent = 'html,body{display:none!important}';
  (document.head || document.documentElement).appendChild(hideStyle);

  function getMarkdownText() {
    const pre = document.body.querySelector('pre');
    if (pre) return pre.textContent;
    return document.body.innerText || document.body.textContent || '';
  }

  function getDirUrl(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      u.search = '';
      const lastSlash = u.pathname.lastIndexOf('/');
      if (lastSlash <= 0) return url;
      u.pathname = u.pathname.slice(0, lastSlash + 1);
      return u.toString();
    } catch {
      const lastSlash = url.lastIndexOf('/');
      return lastSlash > 0 ? url.slice(0, lastSlash + 1) : url;
    }
  }

  function getFileName(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      return decodeURIComponent(parts[parts.length - 1]);
    } catch {
      const parts = url.split('/');
      return decodeURIComponent(parts[parts.length - 1]);
    }
  }

  function isMarkdownUrl(url) {
    let lower = url.toLowerCase();
    try {
      lower = new URL(url).pathname.toLowerCase();
    } catch {
      lower = lower.split('#')[0].split('?')[0];
    }
    return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdown') || lower.endsWith('.mkd') || lower.endsWith('.mkdn');
  }

  function isMarkdownFileName(name) {
    const lower = name.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdown') || lower.endsWith('.mkd') || lower.endsWith('.mkdn');
  }



  function getCleanFileUrl(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      u.search = '';
      return u.toString();
    } catch {
      return url.split('#')[0].split('?')[0];
    }
  }

  function isSameFileUrl(a, b) {
    return getDirUrl(a) === getDirUrl(b) && getFileName(a) === getFileName(b);
  }

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      || 'heading';
  }

  // ===== Storage Helpers =====
  function getFavoriteKey(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return parts.slice(-2).join('/');
      return u.pathname;
    } catch {
      const parts = url.split('/').filter(Boolean);
      if (parts.length >= 2) return parts.slice(-2).join('/');
      return url;
    }
  }

  function getFavorites() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['mdrFavorites'], (result) => {
        if (chrome.runtime.lastError) {
          resolve(new Set());
          return;
        }
        const list = result.mdrFavorites || [];
        resolve(new Set(list));
      });
    });
  }

  async function toggleFavorite(url) {
    const key = getFavoriteKey(url);
    const favorites = await getFavorites();
    if (favorites.has(key)) {
      favorites.delete(key);
    } else {
      favorites.add(key);
    }
    return new Promise((resolve) => {
      chrome.storage.local.set({ mdrFavorites: Array.from(favorites) }, () => {
        resolve(favorites);
      });
    });
  }

  // ===== UI Builders =====
  function buildSkeleton() {
    const container = document.createElement('div');
    container.id = 'mdr-container';

    const sidebar = document.createElement('aside');
    sidebar.id = 'mdr-sidebar';

    const tabs = document.createElement('div');
    tabs.id = 'mdr-tabs';
    tabs.innerHTML = `
      <button id="mdr-tab-files" class="active" title="Directory files">
        <svg viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.2a2 2 0 0 1-1.4-.6L9.6 3.6A2 2 0 0 0 8.2 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>
        Files
      </button>
      <button id="mdr-tab-toc" title="Table of contents">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h6"/></svg>
        TOC
      </button>
    `;

    const sidebarContent = document.createElement('div');
    sidebarContent.id = 'mdr-sidebar-content';

    const fileListPanel = document.createElement('div');
    fileListPanel.id = 'mdr-panel-files';

    const fileList = document.createElement('ul');
    fileList.id = 'mdr-file-list';
    fileListPanel.appendChild(fileList);

    const tocPanel = document.createElement('div');
    tocPanel.id = 'mdr-panel-toc';
    tocPanel.style.display = 'none';
    const tocList = document.createElement('ul');
    tocList.id = 'mdr-toc';
    tocPanel.appendChild(tocList);

    sidebarContent.appendChild(fileListPanel);
    sidebarContent.appendChild(tocPanel);
    sidebar.appendChild(tabs);
    sidebar.appendChild(sidebarContent);

    const main = document.createElement('main');
    main.id = 'mdr-main';
    const content = document.createElement('article');
    content.id = 'mdr-content';
    main.appendChild(content);

    // Sidebar toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'mdr-sidebar-toggle';
    toggleBtn.title = 'Toggle sidebar';
    toggleBtn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';

    container.appendChild(sidebar);
    container.appendChild(toggleBtn);
    container.appendChild(main);

    return {
      container,
      sidebar,
      tabs,
      fileListPanel,
      tocPanel,
      fileList,
      tocList,
      main,
      content,
      tabFiles: tabs.querySelector('#mdr-tab-files'),
      tabToc: tabs.querySelector('#mdr-tab-toc'),
      toggleBtn
    };
  }

  function renderMarkdown(contentEl, text) {
    const html = marked.parse(text, {
      gfm: true,
      breaks: true,
      headerIds: true,
      mangle: false
    });
    contentEl.innerHTML = html;

    const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((h, idx) => {
      if (!h.id) h.id = slugify(h.textContent) + '-' + idx;
    });
    return headings;
  }

  function renderToc(tocList, headings) {
    tocList.innerHTML = '';
    if (headings.length === 0) {
      tocList.innerHTML = '<li style="color:#9ca3af;padding:20px 16px;">No headings found</li>';
      return [];
    }
    const items = [];
    headings.forEach((h) => {
      const level = parseInt(h.tagName[1]);
      const li = document.createElement('li');
      li.className = `toc-h${level}`;
      li.textContent = h.textContent;
      li.addEventListener('click', () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      tocList.appendChild(li);
      items.push(li);
    });
    return items;
  }

  function setupTabs(tabFiles, tabToc, fileListPanel, tocPanel) {
    function switchTab(name) {
      if (name === 'files') {
        fileListPanel.style.display = '';
        tocPanel.style.display = 'none';
        tabFiles.classList.add('active');
        tabToc.classList.remove('active');
      } else {
        fileListPanel.style.display = 'none';
        tocPanel.style.display = '';
        tabToc.classList.add('active');
        tabFiles.classList.remove('active');
      }
    }
    tabFiles.addEventListener('click', () => switchTab('files'));
    tabToc.addEventListener('click', () => switchTab('toc'));
  }

  async function renderFileList(currentUrl, files, fileList, contentEl) {
    fileList.innerHTML = '';
    if (files.length === 0) {
      fileList.innerHTML = '<li id="mdr-file-empty">No Markdown files found in this directory.</li>';
      return;
    }

    const favorites = await getFavorites();

    const sorted = [...files].sort((a, b) => {
      const mtimeA = a.dateModified ?? Infinity;
      const mtimeB = b.dateModified ?? Infinity;
      if (mtimeA !== mtimeB) return mtimeA - mtimeB;
      const nameA = a.title || getFileName(a.url);
      const nameB = b.title || getFileName(b.url);
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });

    sorted.forEach((f) => {
      const li = document.createElement('li');
      if (isSameFileUrl(f.url, currentUrl) || (inlineCurrentUrl && isSameFileUrl(f.url, inlineCurrentUrl))) {
        li.classList.add('active');
      }

      const titleSpan = document.createElement('span');
      titleSpan.textContent = f.title || getFileName(f.url);
      titleSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;';
      li.appendChild(titleSpan);

      const starBtn = document.createElement('button');
      const favKey = getFavoriteKey(f.url);
      starBtn.className = 'mdr-star' + (favorites.has(favKey) ? ' mdr-starred' : '');
      starBtn.title = favorites.has(favKey) ? 'Unfavorite' : 'Favorite';
      starBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
      starBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updated = await toggleFavorite(f.url);
        const newKey = getFavoriteKey(f.url);
        starBtn.className = 'mdr-star' + (updated.has(newKey) ? ' mdr-starred' : '');
        starBtn.title = updated.has(newKey) ? 'Unfavorite' : 'Favorite';
        // Re-render to resort
        renderFileList(currentUrl, files, fileList, contentEl);
      });
      li.appendChild(starBtn);

      li.addEventListener('click', () => {
        window.location.href = f.url;
      });
      fileList.appendChild(li);
    });
  }

  function parseContentLinks(contentEl, currentUrl, dirUrl) {
    const linked = [];
    if (!contentEl) return linked;
    contentEl.querySelectorAll('a[href]').forEach(a => {
      let href = a.getAttribute('href');
      if (!href) return;
      try {
        href = getCleanFileUrl(new URL(href, currentUrl).href);
      } catch { return; }
      if (isMarkdownUrl(href) && getDirUrl(href) === dirUrl) {
        linked.push({ url: href, title: a.textContent.trim() || getFileName(href) });
      }
    });
    return linked;
  }

  function setupScrollSpy(main, headings, tocItems) {
    function updateActiveToc() {
      const scrollPos = main.scrollTop + 80;
      let activeIdx = -1;
      headings.forEach((h, idx) => {
        if (h.offsetTop <= scrollPos) activeIdx = idx;
      });
      tocItems.forEach((li, idx) => {
        li.classList.toggle('active', idx === activeIdx);
      });
    }
    main.addEventListener('scroll', updateActiveToc, { passive: true });
    window.addEventListener('load', updateActiveToc);
    updateActiveToc();
  }

  // ===== File List Loader =====
  function dedupeFiles(files) {
    const seen = new Set();
    const unique = [];
    files.forEach((f) => {
      if (!f || !f.url || seen.has(f.url)) return;
      seen.add(f.url);
      unique.push(f);
    });
    return unique;
  }

  function fetchDirListingDoc(dirUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'fetchUrl', url: dirUrl }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          resolve(null);
          return;
        }
        const parser = new DOMParser();
        resolve(parser.parseFromString(response.html, 'text/html'));
      });
    });
  }

  async function fetchDirListing(dirUrl) {
    const doc = await fetchDirListingDoc(dirUrl);
    return doc ? parseDirListingDoc(doc, dirUrl) : [];
  }

  function parseDirListingRows(doc, dirUrl) {
    // Chrome directory listings use JS addRow() to build the page dynamically.
    // DOMParser won't execute JS, so we must parse the script source instead.
    // Current Chromium signature:
    // addRow(name, url, isdir, size, size_string, date_modified, date_modified_string)
    const scripts = doc.querySelectorAll('script');
    const rows = [];
    scripts.forEach(script => {
      const regex = /addRow\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*(-?\d+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
      let match;
      while ((match = regex.exec(script.textContent)) !== null) {
        const name = match[1].replace(/\\(.)/g, '$1');
        const urlPath = match[2].replace(/\\(.)/g, '$1');
        let fileUrl;
        try {
          fileUrl = new URL(urlPath, dirUrl).href;
        } catch {
          fileUrl = dirUrl + encodeURIComponent(name);
        }
        rows.push({
          name,
          urlPath,
          url: fileUrl,
          isdir: parseInt(match[3], 10),
          size: parseInt(match[4], 10),
          sizeString: match[5].replace(/\\(.)/g, '$1'),
          dateModified: parseInt(match[6], 10),
          dateModifiedString: match[7].replace(/\\(.)/g, '$1')
        });
      }
    });
    return rows;
  }

  function parseDirListingDoc(doc, dirUrl) {
    const files = [];
    parseDirListingRows(doc, dirUrl).forEach(row => {
      if (row.isdir !== 0) return; // skip directories
      if (!isMarkdownFileName(row.name)) return;
      // Only include files in the same directory
      if (getDirUrl(row.url) !== dirUrl) return;
      files.push({
        url: row.url,
        title: row.name,
        size: row.size,
        sizeString: row.sizeString,
        dateModified: row.dateModified,
        dateModifiedString: row.dateModifiedString
      });
    });
    return dedupeFiles(files);
  }

  async function loadFileList(currentUrl, dirUrl, fileList, contentEl) {
    // Try directory listing first
    const dirFiles = await fetchDirListing(dirUrl);
    // Also parse links in the current document
    const linked = parseContentLinks(contentEl, currentUrl, dirUrl);
    // Merge and dedupe
    const allFiles = dedupeFiles([...dirFiles, ...linked]);
    await renderFileList(currentUrl, allFiles, fileList, contentEl);
  }

  // ===== Main =====
  async function init() {
    const url = getCleanFileUrl(location.href);
    if (!isMarkdownUrl(url)) return;

    const text = getMarkdownText();
    const dirUrl = getDirUrl(url);
    const fileName = getFileName(url);

    // Build DOM
    document.body.innerHTML = '';
    document.body.style.display = '';
    hideStyle.remove();

    const ui = buildSkeleton();
    document.body.appendChild(ui.container);

    // Render markdown
    const headings = renderMarkdown(ui.content, text);
    const docTitle = ui.content.querySelector('h1')?.textContent?.trim() || fileName;

    // Render TOC
    const tocItems = renderToc(ui.tocList, headings);

    // Tabs
    setupTabs(ui.tabFiles, ui.tabToc, ui.fileListPanel, ui.tocPanel);

    // File list uses passive sources until the user grants folder access.
    await loadFileList(url, dirUrl, ui.fileList, ui.content);

    // Toggle sidebar
    ui.toggleBtn.addEventListener('click', () => {
      ui.sidebar.classList.toggle('collapsed');
    });

    // Scroll spy
    setupScrollSpy(ui.main, headings, tocItems);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
