const CHANNEL = "JM_COOKIE_BACKUP";

function markReady() {
  document.documentElement.dataset.jmExtensionReady = "1";
}

if (document.documentElement) {
  markReady();
} else {
  document.addEventListener("DOMContentLoaded", markReady, { once: true });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL) return;

  if (data.type === "PING") {
    window.postMessage({ channel: CHANNEL, type: "PONG" }, "*");
    return;
  }

  if (data.type === "REQUEST_RESTORE") {
    chrome.runtime.sendMessage(
      {
        type: "RESTORE",
        backup: data.backup,
        options: { restoreCookies: true, restoreStorage: true },
      },
      (response) => {
        const err = chrome.runtime.lastError;
        window.postMessage(
          {
            channel: CHANNEL,
            type: "RESTORE_RESULT",
            ok: Boolean(response?.ok) && !err,
            report: response?.report,
            error: err?.message || response?.error || "Extension could not restore cookies.",
          },
          "*"
        );
      }
    );
    return;
  }

  if (data.type !== "REQUEST_BACKUP") return;

  chrome.runtime.sendMessage(
    { type: "COLLECT_ALL", label: data.label || "Account backup" },
    (response) => {
      const err = chrome.runtime.lastError;
      window.postMessage(
        {
          channel: CHANNEL,
          type: "BACKUP_RESULT",
          ok: Boolean(response?.ok) && !err,
          backup: response?.backup,
          error: err?.message || response?.error || "Extension could not collect cookies.",
        },
        "*"
      );
    }
  );
});
