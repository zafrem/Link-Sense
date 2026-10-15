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

export const STRENGTH_CEILING = 120; // the highest visit count in SAMPLE

// 0..1 measure of how strong a score is, on a log scale so a few hot pages do not flatten the rest.
export function strength(scoreValue) {
  const t = Math.log10(1 + Math.max(0, scoreValue)) / Math.log10(1 + STRENGTH_CEILING);
  return Math.min(1, Math.max(0, t));
}

// Row titles never drop below 0.7 opacity, which keeps them at 4.5:1 contrast or better.
export function textOpacity(t) {
  return 0.7 + 0.3 * Math.min(1, Math.max(0, t));
}

export function formatAge(days) {
  const rounded = Math.round(days * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}d` : `${rounded.toFixed(1)}d`;
}

export function formatScore(scoreValue) {
  return scoreValue >= 10 ? scoreValue.toFixed(1) : scoreValue.toFixed(2);
}

export function rank(entries, extraDays = 0) {
  return entries
    .map((e) => {
      const days = e.days + extraDays;
      return { ...e, days, score: score(e.visits, days) };
    })
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
  const slider = document.getElementById("skip-days");
  const skipLabel = document.getElementById("skip-label");
  const choices = new Map();
  let skip = 0;
  list.dataset.intro = "1"; // the entrance animation plays once, until the first interaction

  const choiceFor = (url) => choices.get(url) ?? { add: false, folder: "" };
  const current = () => rank(SAMPLE, skip);
  const endIntro = () => { delete list.dataset.intro; };

  function updateSkipLabel() {
    skipLabel.textContent = `+${skip} ${skip === 1 ? "day" : "days"}`;
  }

  function refresh() {
    const n = countAdds(choices);
    applyButton.disabled = n === 0;
    applyButton.textContent = n > 0 ? `Apply (${n})` : "Apply";
  }

  function renderList() {
    list.replaceChildren();
    const shown = filterEntries(current(), search.value);
    if (shown.length === 0) {
      list.append(el("li", { class: "empty", text: "No pages match" }));
      return;
    }
    shown.forEach((entry, index) => {
      const t = strength(entry.score);
      const chosen = choiceFor(entry.url);
      const row = el("li", { class: chosen.add ? "item marked" : "item" });
      row.style.setProperty("--i", String(index));
      row.style.setProperty("--o", String(textOpacity(t)));

      const fill = el("span", { class: "bar-fill" });
      fill.style.width = `${Math.max(2, Math.round(t * 100))}%`;
      const info = el(
        "div",
        { class: "info" },
        el("span", { class: "title", text: entry.title }),
        el("span", { class: "url", text: entry.url }),
        el(
          "span",
          { class: "figures" },
          el("span", { class: "score", text: formatScore(entry.score) }),
          el("span", { class: "age", text: formatAge(entry.days) }),
        ),
        el("span", { class: "bar-track" }, fill),
      );

      const folderInput = el("input", {
        class: "folder-input",
        type: "text",
        list: "demo-folders",
        placeholder: "Folder",
        maxlength: String(MAX_FOLDER_LENGTH),
        "aria-label": `Folder for ${entry.title}`,
        value: chosen.folder,
      });
      folderInput.addEventListener("change", () => {
        folderInput.value = normalizeFolder(folderInput.value);
        choices.set(entry.url, { ...choiceFor(entry.url), folder: folderInput.value });
      });

      const toggle = el("button", {
        class: "toggle",
        type: "button",
        "aria-pressed": String(chosen.add),
        "aria-label": `Add ${entry.title}`,
        text: chosen.add ? "Added" : "Add",
      });
      toggle.addEventListener("click", () => {
        endIntro();
        const next = { ...choiceFor(entry.url), add: !choiceFor(entry.url).add };
        choices.set(entry.url, next);
        toggle.textContent = next.add ? "Added" : "Add";
        toggle.setAttribute("aria-pressed", String(next.add));
        row.className = next.add ? "item marked" : "item";
        refresh();
      });

      row.append(info, folderInput, toggle);
      list.append(row);
    });
  }

  search.addEventListener("input", () => {
    endIntro();
    renderList();
  });
  slider.addEventListener("input", () => {
    skip = Number(slider.value);
    endIntro();
    updateSkipLabel();
    renderList();
  });
  applyButton.addEventListener("click", () => {
    const items = current()
      .filter((e) => choiceFor(e.url).add)
      .map((e) => ({ title: e.title, url: e.url, folder: normalizeFolder(choiceFor(e.url).folder) }));
    renderTree(result, buildFolderTree(items));
  });
  resetButton.addEventListener("click", () => {
    choices.clear();
    search.value = "";
    skip = 0;
    slider.value = "0";
    updateSkipLabel();
    result.replaceChildren();
    endIntro();
    renderList();
    refresh();
  });

  updateSkipLabel();
  renderList();
  refresh();
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
  initCopy();
}
