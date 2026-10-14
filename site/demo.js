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

// ---- DOM wiring (runs only in a browser; Node imports the helpers above) -------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function renderTree(container, groups) {
  container.replaceChildren();
  if (groups.length === 0) return;
  const rootList = el("ul", { class: "tree" });
  const linkSense = el("li", {}, el("span", { class: "folder", text: "Other bookmarks › Link Sense" }));
  const inner = el("ul");
  for (const group of groups) {
    const items = group.items.map((i) => el("li", { text: i.title }));
    if (group.folder === "") {
      inner.append(...items);
    } else {
      inner.append(el("li", {}, el("span", { class: "folder", text: group.folder }), el("ul", {}, ...items)));
    }
  }
  linkSense.append(inner);
  rootList.append(linkSense);
  container.append(rootList);
}

function initDemo() {
  const list = document.getElementById("demo-list");
  if (!list) return;
  const search = document.getElementById("demo-search");
  const applyButton = document.getElementById("demo-apply");
  const resetButton = document.getElementById("demo-reset");
  const result = document.getElementById("demo-result");
  const ranked = rank(SAMPLE);
  const choices = new Map();

  const choiceFor = (url) => choices.get(url) ?? { add: false, folder: "" };

  function refresh() {
    const n = countAdds(choices);
    applyButton.disabled = n === 0;
    applyButton.textContent = n > 0 ? `Apply (${n})` : "Apply";
  }

  function renderList() {
    list.replaceChildren();
    const shown = filterEntries(ranked, search.value);
    if (shown.length === 0) {
      list.append(el("li", { class: "empty", text: "No pages match" }));
      return;
    }
    for (const entry of shown) {
      const current = choiceFor(entry.url);
      const row = el("li", { class: current.add ? "item marked" : "item" });
      const folderInput = el("input", {
        class: "folder-input",
        type: "text",
        list: "demo-folders",
        placeholder: "Folder",
        maxlength: String(MAX_FOLDER_LENGTH),
        "aria-label": `Folder for ${entry.title}`,
        value: current.folder,
      });
      folderInput.addEventListener("change", () => {
        folderInput.value = normalizeFolder(folderInput.value);
        choices.set(entry.url, { ...choiceFor(entry.url), folder: folderInput.value });
      });
      const toggle = el("button", {
        class: "button ghost toggle",
        type: "button",
        "aria-pressed": String(current.add),
        "aria-label": `Add ${entry.title}`,
        text: current.add ? "Added" : "Add",
      });
      toggle.addEventListener("click", () => {
        const next = { ...choiceFor(entry.url), add: !choiceFor(entry.url).add };
        choices.set(entry.url, next);
        toggle.textContent = next.add ? "Added" : "Add";
        toggle.setAttribute("aria-pressed", String(next.add));
        row.className = next.add ? "item marked" : "item";
        refresh();
      });
      row.append(
        el(
          "div",
          { class: "info" },
          el("span", { class: "title", text: entry.title }),
          el("span", { class: "url", text: entry.url }),
          el("span", { class: "meta", text: `Score ${entry.score} · ${entry.visits} visits · ${entry.days} days ago` }),
        ),
        folderInput,
        toggle,
      );
      list.append(row);
    }
  }

  search.addEventListener("input", renderList);
  applyButton.addEventListener("click", () => {
    const items = ranked
      .filter((e) => choiceFor(e.url).add)
      .map((e) => ({ title: e.title, url: e.url, folder: normalizeFolder(choiceFor(e.url).folder) }));
    renderTree(result, buildFolderTree(items));
  });
  resetButton.addEventListener("click", () => {
    choices.clear();
    search.value = "";
    result.replaceChildren();
    renderList();
    refresh();
  });

  renderList();
  refresh();
}

function initDecay() {
  const slider = document.getElementById("decay-days");
  if (!slider) return;
  const out = document.getElementById("decay-score");
  const bar = document.getElementById("decay-bar");
  const label = document.getElementById("decay-label");
  const VISITS = 10;
  const update = () => {
    const days = Number(slider.value);
    const s = score(VISITS, days);
    out.textContent = s.toFixed(2);
    bar.style.width = `${(s / VISITS) * 100}%`;
    label.textContent = `${days} day${days === 1 ? "" : "s"} since last visit`;
  };
  slider.addEventListener("input", update);
  update();
}

function initCopy() {
  for (const button of document.querySelectorAll("[data-copy-target]")) {
    const label = button.textContent;
    let timer;
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      const ok = await copyText(target.textContent, navigator.clipboard);
      if (!ok) window.getSelection()?.selectAllChildren(target);
      button.textContent = ok ? "Copied" : "Press Ctrl+C";
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = label;
      }, 1500);
    });
  }
}

if (typeof document !== "undefined") {
  initDemo();
  initDecay();
  initCopy();
}
