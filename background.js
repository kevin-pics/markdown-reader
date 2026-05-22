chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'recordFile') {
    recordFile(request.url, request.title).then(sendResponse).catch(err => {
      console.error('[MarkdownReader] recordFile error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'scanDir') {
    scanDirectory(request.dirUrl).then(files => {
      sendResponse({ success: true, files });
    }).catch(err => {
      console.error('[MarkdownReader] scanDir error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'getDirFiles') {
    getDirFiles(request.dirUrl).then(sendResponse).catch(err => {
      console.error('[MarkdownReader] getDirFiles error:', err);
      sendResponse({ files: [] });
    });
    return true;
  }
});

async function scanDirectory(dirUrl) {
  const tab = await chrome.tabs.create({ url: dirUrl, active: false });
  const tabId = tab.id;

  try {
    // Wait for tab to finish loading
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, 5000);

      const listener = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Read links from directory page
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (baseUrl) => {
        const files = [];
        document.querySelectorAll('a[href]').forEach(a => {
          let href = a.getAttribute('href');
          if (!href) return;
          if (href === '../' || href.startsWith('/') || href.endsWith('/')) return;
          if (href.startsWith('.')) return;
          const lower = href.toLowerCase();
          const isMd = lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdown') || lower.endsWith('.mkd') || lower.endsWith('.mkdn');
          if (!isMd) return;
          try {
            href = new URL(href, baseUrl).href;
          } catch { return; }
          files.push({ url: href, title: a.textContent.trim() || href.split('/').pop() });
        });
        return files;
      },
      args: [dirUrl]
    });

    const files = (result && result.result) || [];

    // Close background tab
    await chrome.tabs.remove(tabId);

    // Deduplicate
    const seen = new Set();
    const unique = [];
    files.forEach(f => {
      if (!seen.has(f.url)) {
        seen.add(f.url);
        unique.push(f);
      }
    });

    return unique;
  } catch (err) {
    try { await chrome.tabs.remove(tabId); } catch {}
    throw err;
  }
}

async function recordFile(url, title) {
  const dirUrl = getDirUrl(url);
  const data = await chrome.storage.local.get('dirFiles');
  const dirFiles = data.dirFiles || {};

  if (!dirFiles[dirUrl]) {
    dirFiles[dirUrl] = [];
  }

  const exists = dirFiles[dirUrl].some(f => f.url === url);
  if (!exists) {
    dirFiles[dirUrl].push({
      url,
      title: title || getFileName(url),
      path: url
    });
    dirFiles[dirUrl].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    await chrome.storage.local.set({ dirFiles });
  }

  return { success: true };
}

async function getDirFiles(dirUrl) {
  const data = await chrome.storage.local.get('dirFiles');
  const dirFiles = data.dirFiles || {};
  return { files: dirFiles[dirUrl] || [] };
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
