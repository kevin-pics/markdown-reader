(function () {
  'use strict';

  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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
    const lower = url.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdown') || lower.endsWith('.mkd') || lower.endsWith('.mkdn');
  }

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      || 'heading';
  }

  // ===== Storage Helpers =====
  async function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (res) => resolve(res[key]));
    });
  }

  async function storageSet(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, resolve);
    });
  }

  async function getDirCache(dirUrl) {
    const cache = await storageGet('dirCache');
    if (!cache || !cache[dirUrl]) return null;
    const entry = cache[dirUrl];
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry.files;
  }

  async function setDirCache(dirUrl, files) {
    const cache = (await storageGet('dirCache')) || {};
    cache[dirUrl] = { files, ts: Date.now() };
    await storageSet({ dirCache: cache });
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
        <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Files
      </button>
      <button id="mdr-tab-toc" title="Table of contents">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
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

    container.appendChild(sidebar);
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
      tabToc: tabs.querySelector('#mdr-tab-toc')
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

  function renderFileList(currentUrl, files, fileList) {
    fileList.innerHTML = '';
    if (files.length === 0) {
      fileList.innerHTML = '<li id="mdr-file-empty">No Markdown files found in this directory.</li>';
      return;
    }

    const sorted = [...files].sort((a, b) => {
      const nameA = getFileName(a.url);
      const nameB = getFileName(b.url);
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });

    sorted.forEach((f) => {
      const li = document.createElement('li');
      if (f.url === currentUrl) li.classList.add('active');

      const titleSpan = document.createElement('span');
      titleSpan.textContent = f.title || getFileName(f.url);
      titleSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;';
      li.appendChild(titleSpan);

      li.addEventListener('click', () => { window.location.href = f.url; });
      fileList.appendChild(li);
    });
  }

  function showFileListLoading(fileList) {
    fileList.innerHTML = '<li id="mdr-file-empty" style="color:#4f46e5;">Scanning directory…</li>';
  }

  function parseContentLinks(contentEl, currentUrl, dirUrl) {
    const linked = [];
    if (!contentEl) return linked;
    contentEl.querySelectorAll('a[href]').forEach(a => {
      let href = a.getAttribute('href');
      if (!href) return;
      try {
        href = new URL(href, currentUrl).href;
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
  async function loadFileList(currentUrl, dirUrl, fileList, contentEl) {
    let allFiles = [];

    // Layer 1: cache
    const cache = await getDirCache(dirUrl);
    if (cache) {
      allFiles = [...cache];
    }

    // Layer 2: content links
    const linked = parseContentLinks(contentEl, currentUrl, dirUrl);
    linked.forEach(l => {
      if (!allFiles.some(f => f.url === l.url)) allFiles.push(l);
    });

    // Render what we have so far
    renderFileList(currentUrl, allFiles, fileList);

    // If no cache, request background scan
    if (!cache) {
      showFileListLoading(fileList);
      try {
        const scanned = await requestScan(dirUrl);
        await setDirCache(dirUrl, scanned);

        // Merge scanned + linked
        let merged = [...scanned];
        linked.forEach(l => {
          if (!merged.some(f => f.url === l.url)) merged.push(l);
        });
        renderFileList(currentUrl, merged, fileList);
      } catch (e) {
        console.log('[MDR] Background scan failed:', e);
        // Layer 3: storage fallback
        try {
          const res = await new Promise(r => chrome.runtime.sendMessage({ type: 'getDirFiles', dirUrl }, r));
          const stored = (res && res.files) || [];
          if (stored.length) {
            let merged = stored.map(f => ({ url: f.url, title: f.title }));
            linked.forEach(l => {
              if (!merged.some(f => f.url === l.url)) merged.push(l);
            });
            renderFileList(currentUrl, merged, fileList);
          } else {
            renderFileList(currentUrl, linked, fileList);
          }
        } catch {
          renderFileList(currentUrl, linked, fileList);
        }
      }
    }
  }

  async function requestScan(dirUrl) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'scanDir', dirUrl }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!resp || !resp.success) {
          reject(new Error(resp && resp.error ? resp.error : 'Scan failed'));
        } else {
          resolve(resp.files || []);
        }
      });
    });
  }

  // ===== Main =====
  async function init() {
    const url = location.href;
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

    // File list (async: may scan in background)
    await loadFileList(url, dirUrl, ui.fileList, ui.content);

    // Record visit
    chrome.runtime.sendMessage({ type: 'recordFile', url, title: docTitle }, (res) => {
      if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
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
