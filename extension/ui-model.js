export function entryFolder(entry, choices) {
  return choices[entry.url]?.folder ?? entry.folder ?? "";
}

export function filterEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
}

export function groupByFolder(entries, choices) {
  const groups = new Map();
  for (const entry of entries) {
    const folder = entryFolder(entry, choices);
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(entry);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([folder, items]) => ({ folder, items: items.sort((x, y) => y.score - x.score) }));
}

export function buildApplyPayload(candidates, saved, choices) {
  const adds = candidates
    .filter((c) => choices[c.url]?.action === "add")
    .map((c) => ({ url: c.url, title: c.title, score: c.score, folder: choices[c.url].folder ?? "" }));
  const removes = saved.filter((s) => choices[s.url]?.action === "remove").map((s) => s.url);
  return { adds, removes };
}
