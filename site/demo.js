// Scoring mirrors link_sense/scorer.py, which is the source of truth:
// score = visit_count * exp(-0.1 * days_since_last_visit), rounded to 3 decimals.
export const DECAY_LAMBDA = 0.1;
export const MAX_FOLDER_LENGTH = 80;

export const SAMPLE = [
  { title: "Hacker News", url: "https://news.ycombinator.com/", visits: 120, days: 0.1 },
  { title: "GitHub pull requests", url: "https://github.com/pulls", visits: 55, days: 0.2 },
  { title: "Python 3 documentation", url: "https://docs.python.org/3/", visits: 42, days: 0.5 },
  { title: "MDN Web Docs", url: "https://developer.mozilla.org/", visits: 38, days: 1 },
  { title: "Regex101", url: "https://regex101.com/", visits: 23, days: 1.5 },
  { title: "PostgreSQL documentation", url: "https://www.postgresql.org/docs/current/", visits: 21, days: 2 },
  { title: "Can I use", url: "https://caniuse.com/", visits: 17, days: 4 },
  { title: "Rust by Example", url: "https://doc.rust-lang.org/rust-by-example/", visits: 14, days: 6 },
  { title: "crontab.guru", url: "https://crontab.guru/", visits: 13, days: 8 },
  { title: "Linux kernel documentation", url: "https://docs.kernel.org/", visits: 8, days: 5 },
  { title: "Stack Overflow: undo a git rebase", url: "https://stackoverflow.com/questions/134882/undo-a-git-rebase", visits: 9, days: 3 },
  { title: "Exponential decay (Wikipedia)", url: "https://en.wikipedia.org/wiki/Exponential_decay", visits: 3, days: 9 },
  { title: "Sourdough bread recipe", url: "https://example.com/sourdough", visits: 6, days: 12 },
  { title: "Flight search", url: "https://example.com/flights", visits: 4, days: 20 },
  { title: "Old forum thread", url: "https://example.com/forum/old-thread", visits: 11, days: 45 },
];

export function score(visitCount, daysSinceVisit) {
  return Math.round(visitCount * Math.exp(-DECAY_LAMBDA * daysSinceVisit) * 1000) / 1000;
}

export function rank(entries) {
  return entries
    .map((e) => ({ ...e, score: score(e.visits, e.days) }))
    .sort((a, b) => b.score - a.score);
}

export function filterEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
}

export function normalizeFolder(name) {
  return name.trim().slice(0, MAX_FOLDER_LENGTH).trim();
}

export function countAdds(choices) {
  let n = 0;
  for (const choice of choices.values()) if (choice.add) n += 1;
  return n;
}

// items: [{ title, url, folder }]. Root (unfiled) group first, then folders A-Z.
export function buildFolderTree(items) {
  const groups = new Map();
  for (const item of items) {
    const folder = item.folder ?? "";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(item);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([folder, groupItems]) => ({ folder, items: groupItems }));
}

export async function copyText(text, clipboard) {
  if (!clipboard || typeof clipboard.writeText !== "function") return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
