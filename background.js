import { collectAllSiteData, restoreSiteData } from "./lib/backup-service.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "COLLECT_ALL": {
          const backup = await collectAllSiteData(message.label);
          sendResponse({ ok: true, backup });
          break;
        }
        case "RESTORE": {
          const report = await restoreSiteData(message.backup, message.options);
          sendResponse({ ok: true, report });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
