import { createServer } from "node:http";
import path from "node:path";
import { CanvasError } from "@github/copilot-sdk/extension";
import { implementations, getBuilderSystemOverview } from "./catalog.mjs";

const servers = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

function renderPage(instanceId) {
  const safeInstanceId = escapeHtml(instanceId);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>Qeda Builder System Map</title>
  <style>
    :root { color-scheme: light dark; font: 15px/1.5 system-ui, sans-serif; --accent: #6ea8fe; --panel: color-mix(in srgb, CanvasText 6%, Canvas); --line: color-mix(in srgb, CanvasText 16%, transparent); }
    * { box-sizing: border-box; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px clamp(16px, 4vw, 44px) 60px; }
    h1 { margin: 0; font-size: clamp(1.7rem, 3vw, 2.4rem); letter-spacing: -.04em; }
    h2 { margin: 0; font-size: 1.15rem; }
    p { margin: 8px 0 0; color: color-mix(in srgb, CanvasText 75%, transparent); }
    code { font: 0.9em ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
    .eyebrow { color: var(--accent); font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .hero { border-bottom: 1px solid var(--line); padding-bottom: 24px; }
    .root { display: block; margin-top: 12px; color: color-mix(in srgb, CanvasText 62%, transparent); }
    .flow { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin: 22px 0; padding: 0; list-style: none; }
    .flow li { border: 1px solid var(--line); background: var(--panel); border-radius: 12px; padding: 12px; }
    .toolbar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 0; background: Canvas; }
    input, select, button { font: inherit; color: inherit; }
    input, select { min-height: 42px; border: 1px solid var(--line); border-radius: 8px; background: Canvas; padding: 8px 10px; }
    input { flex: 1 1 280px; }
    select { flex: 0 1 240px; }
    button { border: 1px solid var(--line); border-radius: 7px; background: var(--panel); padding: 5px 9px; cursor: pointer; }
    button:hover { border-color: var(--accent); }
    :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    #results-status { min-height: 1.5em; margin: 4px 0 12px; color: color-mix(in srgb, CanvasText 68%, transparent); }
    #catalog { display: grid; gap: 12px; }
    article { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 16px; }
    article header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 14px; }
    .count { margin-left: auto; color: color-mix(in srgb, CanvasText 58%, transparent); font-size: .85rem; }
    details { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 11px; }
    summary { width: fit-content; cursor: pointer; font-weight: 600; }
    .files { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
    .files li { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr) auto; align-items: center; gap: 8px 12px; border-bottom: 1px solid var(--line); padding: 8px 0; }
    .file-path { color: var(--accent); }
    .file-description { color: color-mix(in srgb, CanvasText 72%, transparent); }
    .empty, .error { border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
    .error { color: #e87979; }
    @media (max-width: 680px) { .files li { grid-template-columns: 1fr auto; } .file-description { grid-column: 1 / -1; grid-row: 2; } .count { margin-left: 0; } }
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <div class="eyebrow">Architecture explorer</div>
      <h1>Qeda Builder System</h1>
      <p id="overview">Loading the implementation map…</p>
      <code class="root" id="workspace-root">Workspace: loading…</code>
      <p>Panel instance: <code>${safeInstanceId}</code></p>
      <ol class="flow" id="workflow" aria-label="Builder workflow"></ol>
    </header>
    <div class="toolbar" role="search" aria-label="Search Builder implementations">
      <label class="sr-only" for="query">Search source paths and responsibilities</label>
      <input id="query" type="search" placeholder="Search areas, source paths, tools, tests…" autocomplete="off">
      <label class="sr-only" for="area">Filter by implementation area</label>
      <select id="area"><option value="">All implementation areas</option></select>
    </div>
    <p id="results-status" role="status" aria-live="polite">Loading implementation areas…</p>
    <section id="catalog" aria-label="Builder implementation areas"></section>
  </main>
  <script>
    const queryInput = document.querySelector("#query");
    const areaSelect = document.querySelector("#area");
    const status = document.querySelector("#results-status");
    const catalog = document.querySelector("#catalog");
    const escapeText = (value) => String(value);

    function renderFiles(files) {
      const list = document.createElement("ul");
      list.className = "files";
      for (const [relativePath, description] of files) {
        const row = document.createElement("li");
        const fullPath = window.builderWorkspaceRoot
          ? window.builderWorkspaceRoot.replace(/[\\\\/]+$/, "")
            + window.builderPathSeparator
            + relativePath.replaceAll("/", window.builderPathSeparator)
          : relativePath;
        const code = document.createElement("code");
        code.className = "file-path";
        code.textContent = fullPath;
        const detail = document.createElement("span");
        detail.className = "file-description";
        detail.textContent = escapeText(description);
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "Copy path";
        copy.setAttribute("aria-label", "Copy path " + relativePath);
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(fullPath);
            status.textContent = "Copied " + relativePath;
          } catch {
            status.textContent = "Clipboard unavailable. Select the displayed path to copy it.";
          }
        });
        row.append(code, detail, copy);
        list.append(row);
      }
      return list;
    }

    function render(items) {
      const query = queryInput.value.trim().toLocaleLowerCase();
      const area = areaSelect.value;
      const terms = query.split(/\\s+/).filter(Boolean);
      const visible = items.filter((item) => {
        if (area && item.id !== area) return false;
        const content = [item.id, item.area, item.summary, item.flow,
          ...item.files.flatMap(([file, description]) => [file, description])]
          .join(" ").toLocaleLowerCase();
        return terms.every((term) => content.includes(term));
      });

      catalog.replaceChildren();
      for (const item of visible) {
        const card = document.createElement("article");
        const header = document.createElement("header");
        const title = document.createElement("h2");
        title.textContent = item.area;
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = item.files.length + " files";
        header.append(title, count);
        const summary = document.createElement("p");
        summary.textContent = item.summary;
        const flow = document.createElement("p");
        flow.textContent = item.flow;
        const details = document.createElement("details");
        const label = document.createElement("summary");
        label.textContent = "Source map";
        details.append(label, renderFiles(item.files));
        card.append(header, summary, flow, details);
        catalog.append(card);
      }
      status.textContent = visible.length + " of " + items.length + " implementation areas";
      if (visible.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No Builder implementation areas match this search.";
        catalog.append(empty);
      }
    }

    async function loadCatalog() {
      try {
        const response = await fetch("/catalog.json", { cache: "no-store" });
        if (!response.ok) throw new Error("Catalog request failed with HTTP " + response.status);
        const data = await response.json();
        window.builderWorkspaceRoot = data.workspaceRoot;
        window.builderPathSeparator = data.pathSeparator;
        document.querySelector("#workspace-root").textContent = "Workspace: " + data.workspaceRoot;
        document.querySelector("#overview").textContent = data.overview.summary
          + " " + data.overview.areaCount + " areas, " + data.overview.fileCount + " mapped files.";
        const workflow = document.querySelector("#workflow");
        for (const step of data.overview.workflow) {
          const item = document.createElement("li");
          item.textContent = step;
          workflow.append(item);
        }
        for (const item of data.implementations) {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.area;
          areaSelect.append(option);
        }
        render(data.implementations);
        queryInput.addEventListener("input", () => render(data.implementations));
        areaSelect.addEventListener("change", () => render(data.implementations));
      } catch (error) {
        status.textContent = "Could not load the Builder implementation map.";
        status.className = "error";
        const message = document.createElement("p");
        message.className = "error";
        message.textContent = error instanceof Error ? error.message : String(error);
        catalog.replaceChildren(message);
      }
    }

    void loadCatalog();
  </script>
</body>
</html>`;
}

function assertWorkspaceRoot(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) {
    throw new CanvasError("invalid_input", "workspaceRoot must be a non-empty absolute path.");
  }
  if (!path.isAbsolute(value)) {
    throw new CanvasError("invalid_input", "workspaceRoot must be an absolute path.");
  }
  const root = path.resolve(value);
  return root;
}

function getOrCreateServer(instanceId) {
  const current = servers.get(instanceId);
  if (current?.server.listening) return current;

  const entry = { server: null, url: null, workspaceRoot: null, openCount: 0 };
  const server = createServer((req, res) => {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
      return;
    }
    let pathname;
    try {
      pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      send(res, 400, "text/plain; charset=utf-8", "Invalid request URL");
      return;
    }
    if (pathname === "/") {
      send(
        res,
        200,
        "text/html; charset=utf-8",
        renderPage(instanceId),
      );
      return;
    }
    if (pathname === "/catalog.json") {
      send(
        res,
        200,
        "application/json; charset=utf-8",
        JSON.stringify({
          workspaceRoot: entry.workspaceRoot,
          pathSeparator: path.sep,
          overview: getBuilderSystemOverview(),
          implementations,
        }).replaceAll("<", "\\u003c"),
      );
      return;
    }
    send(res, 404, "text/plain; charset=utf-8", "Not found");
  });

  entry.server = server;
  servers.set(instanceId, entry);
  return entry;
}

export async function openCanvasServer(instanceId, workspaceRoot) {
  if (typeof instanceId !== "string" || !instanceId.trim() || instanceId.length > 200) {
    throw new CanvasError("invalid_input", "Canvas instance ID is invalid.");
  }
  const root = assertWorkspaceRoot(workspaceRoot);
  const entry = getOrCreateServer(instanceId);
  entry.workspaceRoot = root;
  entry.openCount += 1;
  if (entry.server.listening) {
    return {
      title: "Qeda Builder System Map",
      url: `${entry.url}?refresh=${entry.openCount}`,
    };
  }

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      entry.server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      entry.server.off("error", onError);
      resolve();
    };
    entry.server.once("error", onError);
    entry.server.once("listening", onListening);
    entry.server.listen(0, "127.0.0.1");
  });

  const address = entry.server.address();
  if (!address || typeof address === "string") {
    await closeCanvasServer(instanceId);
    throw new Error("Could not determine the canvas server address.");
  }
  entry.url = `http://127.0.0.1:${address.port}/`;
  return {
    title: "Qeda Builder System Map",
    url: `${entry.url}?refresh=${entry.openCount}`,
  };
}

export async function closeCanvasServer(instanceId) {
  const entry = servers.get(instanceId);
  if (!entry) return;
  servers.delete(instanceId);
  if (!entry.server.listening) return;
  await new Promise((resolve, reject) => {
    entry.server.close((error) => (error ? reject(error) : resolve()));
  });
}
