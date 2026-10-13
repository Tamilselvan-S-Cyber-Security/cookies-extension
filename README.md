# Cookie collector extension

Load in Chrome: **Extensions → Developer mode → Load unpacked → `clon-site/extension`**.

## Role

- Collects **all browser cookies** when the mart **website** asks (sign in / register).
- **No popup buttons** — backup runs when you sign in on the mart website.

## Setup

1. Reload the extension after code changes.
2. Open the mart site (local `npx serve .` or your Vercel URL).
3. Refresh the shop tab, then sign in — cookies upload to Supabase from the **website**, not this popup.

## Files

- `content-bridge.js` — talks to the shop page (`JM_COOKIE_BACKUP`).
- `background.js` — `chrome.cookies.getAll` + storage from open tabs.
