# cms-api-gadget

Starter kit + helper libraries for building **Omni CMS (OU Campus) gadgets**.

This repo is intentionally *plain HTML + JS* (no build step). It’s designed to run inside the Omni CMS gadget iframe, where the host provides an auth token and context.

## What’s in here

- `_lib/gadget.js` – a small `postMessage` bridge that exposes a global `window.gadget`:
  - collects URL + host environment (token, site, account, etc.)
  - convenience helpers like `gadget.getFileInfo()`, `gadget.getSourceContent()`, `gadget.insertAtCursor(...)`
  - an event bus via `$(gadget).on(...)`
- `_lib/cms-api.js` – a thin wrapper around the OU Campus CMS API using `$.ajax`:
  - automatically includes the auth token
  - retry + exponential backoff for transient failures
  - convenience methods for common endpoints (e.g. `files_list`, `assets_view`, `directories_settings`, …)
- `_lib/gadget-common.js` – shared utilities:
  - UI helpers (alerts, modals, spinners, list builders, tooltips, etc.)
  - CMS helpers (fetch assets/binaries/links/locked files, directory settings, publish/unpublish helpers, etc.)
- `gadget_name/` – a working **starter gadget** you can copy/rename:
  - `index.html` – includes Bootstrap + jQuery and loads the libs
  - `gadget-name.js` – minimal example that prints the current view context
  - `config.xml` – Omni CMS gadget configuration template

---

## Quick start (copy + run in Omni CMS)

1) **Copy the repo** (or just the folders you need) into your Omni CMS gadgets directory.

2) **Duplicate** `gadget_name/` and rename it to your gadget folder name (example: `broken_links/`).

3) Update:
- `your_gadget/config.xml` (title, types, sidebar height, etc.)
- `your_gadget/index.html` (the visible UI)
- `your_gadget/*.js` (your logic)

4) Load the gadget in Omni CMS and open DevTools (Console) to see the initial `gadget` environment log.

> The starter gadget calls `gadget.ready(init)` so you can safely access `gadget.token`, `gadget.site`, etc.

---

## Usage examples (copy/paste)

### 1) Minimal gadget bootstrap

```js
// your-gadget.js
let api;

$(() => gadget.ready(async () => {
  api = new CmsApi();

  // Host context (site, user, token, etc.) is now available on `gadget`.
  console.log('site:', gadget.site);
  console.log('user:', gadget.user);

  // Your UI setup here...
}));
```

### 2) Get the current file (page/asset) the user is looking at

```js
$(() => gadget.ready(async () => {
  const fileInfo = await gadget.getFileInfo(); // host-provided context
  console.log(fileInfo);

  // Typical fields include site + staging path, depending on where you are in the UI.
  // Example usage:
  // const { site, path } = fileInfo;
}));
```

If you want “best available context” (file if present; otherwise inferred from the URL), `gadget-common.js` includes:

```js
$(() => gadget.ready(async () => {
  const view = await getCurrentView(); // returns a file object or a location object
  console.log(view.type, view.path);
}));
```

### 3) List files in a directory

```js
$(() => gadget.ready(async () => {
  const site = gadget.site;
  const path = '/'; // directory path on staging

  const data = await api.files_list({ site, path });

  // data.entries is the directory listing
  const entries = data.entries || [];
  console.log('entries:', entries.length);

  // show only pages
  const pages = entries.filter(e => e.file_type === 'pcf' || e.staging_path?.endsWith('.pcf'));
  console.log(pages.slice(0, 5));
}));
```

### 4) Read a file’s source content

```js
$(() => gadget.ready(async () => {
  const site = gadget.site;
  const path = '/about/index.pcf';

  const content = await api.files_content({ site, path });
  console.log(content);
}));
```

### 5) Checkout → update → checkin (typical edit workflow)

```js
async function updateFile(site, path, transformFn) {
  // 1) Checkout
  await api.files_checkout({ site, path });

  // 2) Get current source
  const current = await api.files_content({ site, path });

  // 3) Apply your change
  const updated = transformFn(current);

  // 4) Save (files_save exists in cms-api.js; use the signature your endpoint expects)
  await api.files_save({ site, path, content: updated });

  // 5) Checkin
  await api.files_checkin({ site, path, message: 'Updated via gadget' });
}

// Example call:
$(() => gadget.ready(async () => {
  await updateFile(gadget.site, '/about/index.pcf', (src) =>
    src.replaceAll('Old Title', 'New Title')
  );
}));
```

> Note: `cms-api.js` includes many endpoint helpers, but Omni CMS permissions still apply. If the current user can’t write/checkin, the API will reject the request.

### 6) Build a UI list with `gadget-common.js`

`buildList` can fetch and render common “list” types (assets, binaries, links, locked files, subscribers), or you can pass a list directly.

```js
$(() => gadget.ready(async () => {
  api = new CmsApi();

  // Example: list links found in the current page source
  const page = await getCurrentFile(); // from gadget-common.js
  await buildList(
    { type: 'link', page, edit_mode: false },
    document.querySelector('#list-container')
  );
}));
```

### 7) Insert content into the WYSIWYG editor at the cursor

```js
$(() => gadget.ready(async () => {
  await gadget.insertAtCursor('<p><strong>Hello from a gadget!</strong></p>');
}));
```

### 8) Deep-link the user to a CMS location

```js
$(() => gadget.ready(async () => {
  // Example route: depends on Omni CMS UI routes; use what your org expects.
  await gadget.setLocation('/pages');     // navigate
  await gadget.refreshLocation();         // refresh current view
}));
```

### 9) Listen for host events

`gadget.js` forwards non-callback host messages as jQuery events:

```js
$(gadget).on('file-changed', (e, payload) => {
  console.log('file changed:', payload);
});
```

---

## Folder structure

```
.
├─ _lib/
│  ├─ cms-api.js          # CMS API wrapper + endpoint helpers
│  ├─ gadget.js           # postMessage bridge; defines window.gadget
│  └─ gadget-common.js    # shared UI + CMS helper utilities
└─ gadget_name/
   ├─ config.xml          # Omni CMS gadget config template
   ├─ index.html          # gadget UI shell + script includes
   └─ gadget-name.js      # starter logic
```

---

## Notes & troubleshooting

- **jQuery is required**: both `cms-api.js` and `gadget.js` use `$.ajax` / `$.Deferred`.
- **Token + host origin**: `gadget.js` only accepts messages from `gadget.msghost` and `window.top`. If your gadget is timing out, check that the host provides `msghost` in the environment.
- **Retries**: `CmsApi.call()` currently retries only certain error codes (e.g. `TIMEOUT`). If you want to retry additional codes (429/5xx patterns), extend `retryCodes` in `_lib/cms-api.js`.
- **Permissions still apply**: the API will enforce the current user’s Omni CMS permissions.

---

## License / ownership

Copyright © Missouri State University (2024–2026). See file headers for details.
