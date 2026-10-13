export function setLoadingMessage(messageEl) {
  if (!messageEl) return;
  messageEl.classList.remove("error");
  messageEl.innerHTML =
    '<span class="loading-inline" role="status" aria-label="Loading"></span>';
}

export function clearMessage(messageEl, text = "") {
  if (!messageEl) return;
  messageEl.textContent = text;
}
