import { buildApplyPayload, entryFolder, filterEntries, groupByFolder } from "./ui-model.js";

const $ = (id) => document.getElementById(id);
const state = { candidates: [], saved: [], choices: {}, selected: null, query: "", truncated: false, syncErrors: [], applying: false };

// ---- messaging -------------------------------------------------------------

async function send(msg) {
  const resp = await chrome.runtime.sendMessage(msg);
  if (!resp) throw new Error("No response from the extension service worker");
  if (resp.type === "error") throw new Error(resp.message);
  return resp;
}

function showBanner(text, isError = false, retry = null) {
  const banner = $("banner");
  banner.replaceChildren(document.createTextNode(text));
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Retry sync";
    button.addEventListener("click", retry);
    banner.append(" ", button);
  }
  banner.className = isError ? "error" : "";
  banner.hidden = !text;
}

function describeError(err) {
  const message = String(err?.message ?? err);
  if (/native messaging host/i.test(message)) {
    return "Native host not found. Run `link-sense install-host`, then reload this page.";
  }
  return message;
}

// ---- persistence of pending choices ----------------------------------------

async function loadChoices() {
  const stored = await chrome.storage.local.get("choices");
  state.choices = stored.choices ?? {};
}

function saveChoices() {
  chrome.storage.local.set({ choices: state.choices });
}

function setChoice(url, patch) {
  state.choices[url] = { action: null, folder: "", ...state.choices[url], ...patch };
  saveChoices();
  render();
}

// ---- rendering (text only: titles and URLs are untrusted) ------------------

function allEntries() {
  return [...state.candidates, ...state.saved];
}

function isSaved(entry) {
  return state.saved.some((s) => s.url === entry.url);
}

function renderList() {
  const list = $("list");
  list.replaceChildren();
  const entries = filterEntries(allEntries(), state.query);
  for (const group of groupByFolder(entries, state.choices)) {
    const heading = document.createElement("h2");
    heading.textContent = group.folder || "Unfiled";
    list.append(heading);
    for (const entry of group.items) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `item ${state.choices[entry.url]?.action ?? ""}`;
      if (entry.url === state.selected) item.setAttribute("aria-current", "true");
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = entry.title || entry.url;
      const url = document.createElement("span");
      url.className = "url";
      url.textContent = entry.url;
      item.append(title, url);
      item.addEventListener("click", () => {
        state.selected = entry.url;
        render();
      });
      list.append(item);
    }
  }
}

function detailRow(dl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
}

function knownFolders() {
  const names = new Set(allEntries().map((e) => entryFolder(e, state.choices)));
  names.delete("");
  return [...names].sort((a, b) => a.localeCompare(b));
}

function renderDetail() {
  const panel = $("detail");
  const entry = allEntries().find((e) => e.url === state.selected);
  if (!entry) {
    panel.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Select a page to see details." }));
    return;
  }
  const saved = isSaved(entry);
  const choice = state.choices[entry.url] ?? { action: null, folder: "" };

  const heading = document.createElement("h2");
  heading.textContent = entry.title || entry.url;
  const dl = document.createElement("dl");
  detailRow(dl, "URL", entry.url);
  detailRow(dl, "Score", String(entry.score));
  detailRow(dl, "Visits", String(entry.visit_count));
  detailRow(dl, "Last visit", entry.visit_count ? new Date(entry.last_visit_time).toLocaleString() : "—");
  detailRow(dl, "Status", saved ? "Bookmarked" : "Not bookmarked");

  const nodes = [heading, dl];

  if (saved) {
    detailRow(dl, "Folder", entry.folder || "Unfiled");
    const row = document.createElement("div");
    row.className = "row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = choice.action === "remove" ? "Keep" : "Remove";
    toggle.addEventListener("click", () => setChoice(entry.url, { action: choice.action === "remove" ? null : "remove" }));
    row.append(toggle);
    nodes.push(row);
  } else {
    const folderRow = document.createElement("div");
    folderRow.className = "row";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Folder");
    for (const name of ["", ...knownFolders()]) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name || "Unfiled";
      option.selected = name === choice.folder;
      select.append(option);
    }
    select.addEventListener("change", () => setChoice(entry.url, { folder: select.value }));
    const newFolder = document.createElement("input");
    newFolder.placeholder = "New folder";
    newFolder.maxLength = 80;
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = "Create";
    create.addEventListener("click", () => {
      const name = newFolder.value.trim();
      if (name) setChoice(entry.url, { folder: name });
    });
    folderRow.append(select, newFolder, create);

    const actionRow = document.createElement("div");
    actionRow.className = "row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = choice.action === "add" ? "Clear" : "Add";
    toggle.addEventListener("click", () => setChoice(entry.url, { action: choice.action === "add" ? null : "add" }));
    actionRow.append(toggle);
    nodes.push(folderRow, actionRow);
  }
  panel.replaceChildren(...nodes);
}

function render() {
  renderList();
  renderDetail();
  const { adds, removes } = buildApplyPayload(state.candidates, state.saved, state.choices);
  $("apply").disabled = state.applying || adds.length + removes.length === 0;
  $("reload").disabled = state.applying;
  $("apply").textContent = adds.length + removes.length ? `Apply (${adds.length + removes.length})` : "Apply";
}

// ---- actions ---------------------------------------------------------------

// Returns true when the reload succeeded, false when it failed (the error is already in the banner).
async function load() {
  showBanner("Reading history…");
  try {
    const resp = await send({ type: "analyze" });
    state.candidates = resp.candidates;
    state.saved = resp.saved;
    state.truncated = resp.truncated;
    showBanner(truncatedNote());
    render();
    return true;
  } catch (err) {
    state.candidates = [];
    state.saved = [];
    showBanner(describeError(err), true);
    render();
    return false;
  }
}

function truncatedNote() {
  return state.truncated ? ` Showing the top ${state.candidates.length} candidates by score.` : "";
}

async function retrySync() {
  try {
    const resp = await send({ type: "resync" });
    showBanner(resp.syncErrors.length ? `${resp.syncErrors.length} bookmarks could not be synced.${truncatedNote()}` : `Synced.${truncatedNote()}`, resp.syncErrors.length > 0, resp.syncErrors.length ? retrySync : null);
  } catch (err) {
    showBanner(describeError(err), true, retrySync);
  }
}

async function apply() {
  if (state.applying) return;
  const payload = buildApplyPayload(state.candidates, state.saved, state.choices);
  state.applying = true;
  $("apply").disabled = true;
  $("reload").disabled = true;
  showBanner("Applying…");
  try {
    const resp = await send({ type: "apply", ...payload });
    for (const url of [...resp.added, ...resp.removed, ...resp.missing]) delete state.choices[url];
    saveChoices();
    const reloaded = await load();
    // If the reload failed, load() already left its error in the banner; do not overwrite it.
    if (reloaded) {
      if (resp.syncErrors.length) {
        showBanner(`Saved, but ${resp.syncErrors.length} Chrome bookmarks failed to sync.${truncatedNote()}`, true, retrySync);
      } else {
        showBanner(`Applied: ${resp.added.length} added, ${resp.removed.length} removed.${truncatedNote()}`);
      }
    }
  } catch (err) {
    showBanner(describeError(err), true);
    render();
  } finally {
    state.applying = false;
    render();
  }
}

$("search").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderList();
});
$("reload").addEventListener("click", load);
$("apply").addEventListener("click", apply);

await loadChoices();
await load();
