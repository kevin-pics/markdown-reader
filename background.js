chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetchUrl') {
    fetch(request.url)
      .then(resp => {
        if (!resp.ok && resp.status !== 0) {
          sendResponse({ ok: false, status: resp.status });
          return;
        }
        return resp.text().then(html => {
          console.log('[MDR BG] Fetched', html.length, 'chars, preview:', html.substring(0, 500));
          sendResponse({ ok: true, html });
        });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep message channel open for async response
  }
});