chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'recordFile') {
    recordFile(request.url, request.title).then(sendResponse).catch(err => {
      console.error('[MarkdownReader] recordFile error:', err);
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

  if (request.type === 'storeDirFiles') {
    storeDirFiles(request.dirUrl, request.files).then(sendResponse).catch(err => {
      console.error('[MarkdownReader] storeDirFiles error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

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

async function storeDirFiles(dirUrl, files) {
  const data = await chrome.storage.local.get('dirFiles');
  const dirFiles = data.dirFiles || {};
  dirFiles[dirUrl] = dedupeFiles(files || [])
    .map(f => ({ url: f.url, title: f.title || getFileName(f.url), path: f.url }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  await chrome.storage.local.set({ dirFiles });
  return { success: true };
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

function dedupeFiles(files) {
  const seen = new Set();
  const unique = [];
  files.forEach(f => {
    if (!f || !f.url || seen.has(f.url)) return;
    seen.add(f.url);
    unique.push(f);
  });
  return unique;
}
