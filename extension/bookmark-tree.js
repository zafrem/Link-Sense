export const ROOT_TITLE = "Link Sense";

// Map url -> [{ id, folder }] for the root's bookmarks ("" folder) and its direct subfolders.
function indexTree(root) {
  const index = new Map();
  const add = (node, folder) => {
    if (!node.url) return;
    if (!index.has(node.url)) index.set(node.url, []);
    index.get(node.url).push({ id: node.id, folder });
  };
  for (const child of root?.children ?? []) {
    if (child.url) add(child, "");
    else for (const grandchild of child.children ?? []) add(grandchild, child.title);
  }
  return index;
}

// root: the "Link Sense" node from chrome.bookmarks.getSubTree, or null.
// adds: [{ url, title, folder }]; removes: [url]. Returns remove ops first, then create ops.
export function planSync({ root, adds, removes }) {
  const index = indexTree(root);
  const ops = [];
  const removedIds = new Set();

  for (const url of removes) {
    for (const hit of index.get(url) ?? []) {
      removedIds.add(hit.id);
      ops.push({ type: "remove", id: hit.id, url });
    }
  }

  const seen = new Set();
  for (const add of adds) {
    const folder = add.folder ?? "";
    const key = `${folder}\n${add.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const exists = (index.get(add.url) ?? []).some((h) => h.folder === folder && !removedIds.has(h.id));
    if (!exists) ops.push({ type: "create", folder, title: add.title || add.url, url: add.url });
  }
  return ops;
}
