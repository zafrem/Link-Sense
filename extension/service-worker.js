import { planSync, ROOT_TITLE } from "./bookmark-tree.js";

const HOST = "com.linksense.host";

// ---- native port -----------------------------------------------------------

let port = null;
let nextId = 1;
const pending = new Map();

function getPort() {
  if (port) return port;
  const p = chrome.runtime.connectNative(HOST);
  p.onMessage.addListener((msg) => {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    entry.resolve(msg);
  });
  p.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message ?? "Native host disconnected";
    port = null;
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
  });
  port = p;
  return p;
}

function callHost(msg) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      getPort().postMessage({ ...msg, id });
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}

// ---- Chrome bookmarks ------------------------------------------------------

async function otherBookmarksId() {
  const [tree] = await chrome.bookmarks.getTree();
  const other =
    tree.children.find((c) => c.folderType === "other") ?? tree.children.find((c) => c.id === "2");
  if (!other) throw new Error("Could not find the Other bookmarks folder");
  return other.id;
}

async function findRoot(parentId) {
  const kids = await chrome.bookmarks.getChildren(parentId);
  const hit = kids.find((k) => !k.url && k.title === ROOT_TITLE);
  if (!hit) return null;
  const [subtree] = await chrome.bookmarks.getSubTree(hit.id);
  return subtree;
}

async function runOps(parentId, root, ops) {
  const errors = [];
  let rootId = root?.id ?? null;
  const folderIds = new Map((root?.children ?? []).filter((c) => !c.url).map((c) => [c.title, c.id]));

  const ensureRoot = async () => {
    rootId ??= (await chrome.bookmarks.create({ parentId, title: ROOT_TITLE })).id;
    return rootId;
  };
  const ensureFolder = async (name) => {
    if (name === "") return ensureRoot();
    if (!folderIds.has(name)) {
      const created = await chrome.bookmarks.create({ parentId: await ensureRoot(), title: name });
      folderIds.set(name, created.id);
    }
    return folderIds.get(name);
  };

  for (const op of ops) {
    try {
      if (op.type === "remove") {
        await chrome.bookmarks.remove(op.id);
      } else {
        await chrome.bookmarks.create({ parentId: await ensureFolder(op.folder), title: op.title, url: op.url });
      }
    } catch (err) {
      errors.push({ url: op.url ?? null, id: op.id ?? null, message: String(err?.message ?? err) });
    }
  }
  return errors;
}

async function syncBookmarks(adds, removes) {
  try {
    const parentId = await otherBookmarksId();
    const root = await findRoot(parentId);
    return await runOps(parentId, root, planSync({ root, adds, removes }));
  } catch (err) {
    return [{ url: null, id: null, message: String(err?.message ?? err) }];
  }
}

// Serialize syncs so overlapping calls never read the tree before the previous one finished creating.
let syncChain = Promise.resolve();
function serialSync(adds, removes) {
  const p = syncChain.then(() => syncBookmarks(adds, removes));
  syncChain = p.catch(() => {});
  return p;
}

// ---- request routing -------------------------------------------------------

async function handleRequest(req) {
  switch (req.type) {
    case "analyze":
      return callHost(req);

    case "apply": {
      const resp = await callHost(req);
      if (resp.type === "error") return resp;
      const added = new Set(resp.added);
      const adds = req.adds.filter((a) => added.has(a.url));
      const syncErrors = await serialSync(adds, resp.removed);
      return { ...resp, syncErrors };
    }

    case "resync": {
      const resp = await callHost({ type: "analyze", limit: 1, max_results: 0 });
      if (resp.type === "error") return resp;
      const adds = resp.saved.map((s) => ({ url: s.url, title: s.title, folder: s.folder }));
      return { type: "resync", syncErrors: await serialSync(adds, []) };
    }

    default:
      return { type: "error", message: `unknown request type: ${req.type}` };
  }
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  handleRequest(req).then(sendResponse, (err) =>
    sendResponse({ type: "error", message: String(err?.message ?? err) }),
  );
  return true; // keep the channel open for the async reply
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui.html") });
});
