import json
from datetime import datetime
from pathlib import Path

from link_sense.scorer import ScoredEntry

_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link Sense</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;background:#f0f2f5;color:#1a1a2e;height:100vh;display:flex;flex-direction:column;overflow:hidden}

/* header */
#hdr{display:flex;align-items:center;gap:10px;padding:0 16px;height:52px;background:#fff;border-bottom:1px solid #e5e7eb;flex-shrink:0;z-index:10}
#hdr h1{font-size:15px;font-weight:700;color:#1a1a2e;white-space:nowrap;margin-right:4px}
#hdr .sep{color:#d1d5db;font-size:18px}
#search-wrap{flex:1;position:relative;max-width:360px}
#search-wrap svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none}
#search{width:100%;padding:6px 10px 6px 30px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;outline:none;background:#f9fafb}
#search:focus{border-color:#6366f1;background:#fff}
.hdr-meta{font-size:12px;color:#9ca3af;white-space:nowrap}
.spacer{flex:1}
#btn-new-folder{padding:6px 12px;border:1px dashed #9ca3af;border-radius:7px;background:transparent;cursor:pointer;font-size:13px;color:#6b7280}
#btn-new-folder:hover{border-color:#6366f1;color:#6366f1}
#btn-script{padding:6px 16px;border:none;border-radius:7px;background:#6366f1;color:#fff;font-size:13px;font-weight:600;cursor:pointer}
#btn-script:hover{background:#4f46e5}

/* layout */
#layout{display:flex;flex:1;overflow:hidden}

/* sidebar */
#sidebar{width:280px;flex-shrink:0;background:#1e1f2e;color:#c9cde0;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid #13141e}
#sidebar-scroll{flex:1;overflow-y:auto;padding:8px 0}
#sidebar-scroll::-webkit-scrollbar{width:4px}
#sidebar-scroll::-webkit-scrollbar-thumb{background:#3b3d52;border-radius:2px}

/* section headers inside sidebar */
.section-label{display:flex;align-items:center;gap:6px;padding:10px 12px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4b4d65;user-select:none}
.section-label .section-count{background:#2d2f45;color:#8b8db8;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:500}
.section-divider{height:1px;background:#2d2f45;margin:8px 12px}

/* folder groups (candidates section) */
.folder-hdr{display:flex;align-items:center;gap:6px;padding:6px 12px 6px 10px;cursor:pointer;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#7c7f9e;user-select:none}
.folder-hdr:hover{background:#252638}
.folder-hdr .chevron{margin-left:auto;transition:transform .18s;font-size:10px}
.folder-hdr.open .chevron{transform:rotate(90deg)}
.folder-hdr .folder-count{background:#2d2f45;color:#8b8db8;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:500}
.folder-items{display:none}
.folder-items.open{display:block}

/* sidebar item */
.s-item{display:flex;align-items:center;gap:8px;padding:7px 12px 7px 22px;cursor:pointer;border-left:2px solid transparent;transition:background .1s}
.s-item:hover{background:#252638}
.s-item.active{background:#2d2f45;border-left-color:#6366f1}
.s-item .s-score{font-size:11px;padding:1px 5px;border-radius:4px;font-weight:600;flex-shrink:0;min-width:34px;text-align:center}
.score-hot{background:#14532d;color:#4ade80}
.score-warm{background:#451a03;color:#fb923c}
.score-cold{background:#1e293b;color:#64748b}
.score-dead{background:#3b1010;color:#f87171}
.s-item .s-title{font-size:13px;color:#c9cde0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.s-item .s-badge{font-size:10px;flex-shrink:0;border-radius:3px;padding:1px 4px}
.badge-del{background:#4c1212;color:#fca5a5}
.s-item.pending-add .s-title{color:#86efac}
.s-item.pending-remove .s-title{color:#fca5a5;text-decoration:line-through}

/* bookmarks section items (indented less — top-level) */
#bm-items .s-item{padding-left:14px}

/* folder input row */
#folder-input-row{display:none;padding:4px 10px;gap:6px;align-items:center}
#folder-input-row.show{display:flex}
#new-folder-input{flex:1;padding:5px 8px;background:#252638;border:1px solid #3b3d52;border-radius:5px;color:#c9cde0;font-size:12px;outline:none}
#new-folder-input:focus{border-color:#6366f1}
#new-folder-input::placeholder{color:#4b4d65}
#btn-folder-confirm{padding:4px 8px;background:#6366f1;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px}

/* detail panel */
#detail{flex:1;overflow-y:auto;background:#f0f2f5;padding:24px}
#detail::-webkit-scrollbar{width:6px}
#detail::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px}
#detail-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#9ca3af;gap:8px;user-select:none}
#detail-empty .hint{font-size:13px}
#detail-card{display:none;max-width:640px}
#detail-card.show{display:block}

.card{background:#fff;border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.card-title{font-size:17px;font-weight:700;color:#1a1a2e;word-break:break-word;line-height:1.3;margin-bottom:4px}
.card-url{font-size:12px;color:#6366f1;word-break:break-all;margin-bottom:14px}
.card-url a{color:inherit;text-decoration:none}
.card-url a:hover{text-decoration:underline}

.stats-row{display:flex;gap:20px;margin-bottom:14px;flex-wrap:wrap}
.stat-box{display:flex;flex-direction:column;gap:2px}
.stat-label{font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em}
.stat-val{font-size:20px;font-weight:700;color:#1a1a2e}

.score-bar-wrap{height:6px;background:#f0f2f5;border-radius:3px;margin-bottom:14px;overflow:hidden}
.score-bar-fill{height:100%;border-radius:3px;transition:width .3s}

/* decay notice */
.decay-notice{display:flex;align-items:flex-start;gap:8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#92400e;line-height:1.5}
.decay-notice svg{flex-shrink:0;margin-top:1px}
.decay-notice strong{display:block;margin-bottom:2px;color:#78350f}

/* bookmark meta row */
.bm-meta{font-size:12px;color:#9ca3af;margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap}
.bm-meta span{display:flex;align-items:center;gap:4px}

.assign-row{display:flex;align-items:center;gap:8px;margin-bottom:16px}
.assign-row label{font-size:12px;color:#6b7280;font-weight:600;white-space:nowrap}
#folder-select{padding:5px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#1a1a2e;background:#fff;cursor:pointer;outline:none}
#folder-select:focus{border-color:#6366f1}
#btn-inline-folder{padding:5px 10px;border:1px dashed #d1d5db;border-radius:6px;background:transparent;cursor:pointer;font-size:12px;color:#9ca3af}
#btn-inline-folder:hover{border-color:#6366f1;color:#6366f1}

.action-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#btn-add,#btn-remove{padding:8px 20px;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s}
#btn-add{background:#f0f2f5;color:#374151;border:1px solid #e5e7eb}
#btn-add.active{background:#d1fae5;color:#065f46;border-color:#6ee7b7}
#btn-remove{background:#f0f2f5;color:#374151;border:1px solid #e5e7eb}
#btn-remove.active{background:#fee2e2;color:#991b1b;border-color:#fca5a5}

/* script overlay */
#script-overlay{position:fixed;bottom:0;left:0;right:0;background:#1e1f2e;border-top:2px solid #6366f1;z-index:100;display:flex;flex-direction:column;max-height:55vh;transform:translateY(100%);transition:transform .25s ease}
#script-overlay.show{transform:translateY(0)}
.script-hdr{display:flex;align-items:center;padding:10px 16px;gap:10px;border-bottom:1px solid #2d2f45}
.script-hdr h3{font-size:14px;font-weight:700;color:#e2e8f0;flex:1}
.script-meta{font-size:12px;color:#7c7f9e}
#btn-copy{padding:5px 14px;background:#6366f1;border:none;border-radius:6px;color:#fff;font-size:13px;font-weight:600;cursor:pointer}
#btn-download{padding:5px 14px;background:#2d2f45;border:none;border-radius:6px;color:#c9cde0;font-size:13px;cursor:pointer}
#btn-close-script{padding:5px 8px;background:transparent;border:none;color:#7c7f9e;font-size:18px;cursor:pointer;line-height:1}
#btn-close-script:hover{color:#e2e8f0}
#script-text{flex:1;padding:14px 16px;font-family:ui-monospace,monospace;font-size:13px;background:transparent;color:#a5f3fc;border:none;outline:none;resize:none;overflow-y:auto}
#script-text::-webkit-scrollbar{width:4px}
#script-text::-webkit-scrollbar-thumb{background:#3b3d52}
</style>
</head>
<body>

<header id="hdr">
  <h1>&#128279; Link Sense</h1>
  <span class="sep">|</span>
  <div id="search-wrap">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input id="search" type="text" placeholder="Search titles or URLs…" oninput="onSearch()">
  </div>
  <span class="hdr-meta" id="hdr-meta"></span>
  <span class="spacer"></span>
  <button id="btn-new-folder" onclick="showFolderInput()">+ New Folder</button>
  <button id="btn-script" onclick="openScript()">Create Script</button>
</header>

<div id="layout">
  <aside id="sidebar">
    <div id="sidebar-scroll">
      <div id="folder-input-row">
        <input id="new-folder-input" type="text" placeholder="Folder name…" onkeydown="onFolderKey(event)">
        <button id="btn-folder-confirm" onclick="confirmFolder()">Add</button>
      </div>

      <!-- saved bookmarks section -->
      <div id="bm-section">
        <div class="section-label">
          &#128278; Saved Bookmarks
          <span class="section-count" id="bm-count">0</span>
        </div>
        <div id="bm-items"></div>
      </div>

      <div class="section-divider"></div>

      <!-- candidates section -->
      <div id="candidates-section">
        <div class="section-label">
          &#128203; Candidates
          <span class="section-count" id="cand-count">0</span>
        </div>
        <div id="groups"></div>
      </div>
    </div>
  </aside>

  <main id="detail">
    <div id="detail-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" color="#d1d5db"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
      <span class="hint">Select an item from the list</span>
    </div>
    <div id="detail-card">
      <div class="card">
        <div class="card-title" id="d-title"></div>
        <div class="card-url"><a id="d-url" href="#" target="_blank"></a></div>
        <div id="d-decay-notice" class="decay-notice" style="display:none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div><strong id="d-decay-title"></strong><span id="d-decay-body"></span></div>
        </div>
        <div id="d-bm-meta" class="bm-meta" style="display:none">
          <span>&#128197; Saved: <b id="d-added-at"></b></span>
          <span>&#127775; Score at save: <b id="d-saved-score"></b></span>
        </div>
        <div class="stats-row">
          <div class="stat-box"><div class="stat-label">Current Score</div><div class="stat-val" id="d-score"></div></div>
          <div class="stat-box"><div class="stat-label">Visits</div><div class="stat-val" id="d-visits"></div></div>
          <div class="stat-box"><div class="stat-label">Last visit</div><div class="stat-val" id="d-days"></div></div>
        </div>
        <div class="score-bar-wrap"><div class="score-bar-fill" id="d-bar"></div></div>
        <div class="assign-row">
          <label>Folder</label>
          <select id="folder-select" onchange="onFolderAssign()"></select>
          <button id="btn-inline-folder" onclick="showFolderInput()">+ New</button>
        </div>
        <div class="action-row">
          <button id="btn-add" onclick="toggleAdd()">Add to bookmarks</button>
          <button id="btn-remove" onclick="toggleRemove()">Remove bookmark</button>
        </div>
      </div>
    </div>
  </main>
</div>

<div id="script-overlay">
  <div class="script-hdr">
    <h3>apply.sh</h3>
    <span class="script-meta" id="script-meta"></span>
    <button id="btn-copy" onclick="copyScript()">Copy</button>
    <button id="btn-download" onclick="downloadScript()">Download</button>
    <button id="btn-close-script" onclick="closeScript()">&#x2715;</button>
  </div>
  <textarea id="script-text" readonly spellcheck="false"></textarea>
</div>

<script>
// ── data ───────────────────────────────────────────────────────────────────
const CANDIDATES    = %%CANDIDATES%%;
const BOOKMARKS     = %%BOOKMARKS%%;
const BOOKMARK_META = %%BOOKMARK_META%%;  // url -> {folder, added_at, saved_score}

const ITEMS = [
  ...CANDIDATES.map(x => ({...x, _type: 'candidate'})),
  ...BOOKMARKS.map(x  => ({...x, _type: 'bookmark'})),
];
const BY_URL = Object.fromEntries(ITEMS.map(x => [x.url, x]));
const MAX_SCORE = Math.max(...ITEMS.map(x => x.score), 1);

// A bookmark is a "decay candidate" if its current score is less than 10% of
// max, or if it was not visited at all in the analyzed window (score === 0).
const DECAY_THRESH = MAX_SCORE * 0.1;

// ── persistent state ───────────────────────────────────────────────────────
const LS_KEY = 'link-sense-v1';
let S;

function loadState() {
  try { S = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch(e) { S = null; }
  if (!S || typeof S !== 'object') {
    S = { folders: [], assignments: {}, pending: {} };
    // Auto-pre-select top candidates for adding
    const addThresh = MAX_SCORE * 0.15;
    CANDIDATES.forEach(x => { if (x.score >= addThresh) S.pending[x.url] = 'add'; });
    // Auto-pre-select zero-score bookmarks for removal
    BOOKMARKS.forEach(x => { if (x.score === 0) S.pending[x.url] = 'remove'; });
    // Restore folder assignments that were saved in the store
    Object.entries(BOOKMARK_META).forEach(([url, meta]) => {
      if (meta.folder) S.assignments[url] = meta.folder;
    });
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(S));
}

// ── sidebar ────────────────────────────────────────────────────────────────
let selectedUrl = null;

function scoreClass(score) {
  if (score === 0)             return 'score-dead';
  const r = score / MAX_SCORE;
  if (r > 0.5)  return 'score-hot';
  if (r > 0.2)  return 'score-warm';
  return 'score-cold';
}

function makeItem(item, indentPx) {
  const row = document.createElement('div');
  row.className = 's-item';
  row.dataset.url = item.url;
  row.style.paddingLeft = indentPx + 'px';
  if (item.url === selectedUrl) row.classList.add('active');
  const p = S.pending[item.url];
  if (p === 'add')    row.classList.add('pending-add');
  if (p === 'remove') row.classList.add('pending-remove');

  const isDecay = item._type === 'bookmark' && item.score <= DECAY_THRESH;
  row.innerHTML = `
    <span class="s-score ${scoreClass(item.score)}">${item.score.toFixed(1)}</span>
    <span class="s-title">${escH(item.title || item.url)}</span>
    ${isDecay ? '<span class="s-badge badge-del">low</span>' : ''}
  `;
  row.onclick = () => selectItem(item.url);
  return row;
}

function renderBookmarksSection(q) {
  const container = document.getElementById('bm-items');
  container.innerHTML = '';

  // Sort: zero-score first, then ascending score (deletion candidates at top)
  const items = BOOKMARKS
    .filter(x => !q || x.url.toLowerCase().includes(q) || (x.title||'').toLowerCase().includes(q))
    .slice()
    .sort((a, b) => a.score - b.score);

  items.forEach(item => container.appendChild(makeItem(item, 14)));
  document.getElementById('bm-count').textContent = items.length;
}

function renderCandidatesSection(q) {
  const groups = document.getElementById('groups');
  groups.innerHTML = '';

  const folderMap = {};
  const noFolder  = [];

  CANDIDATES.forEach(item => {
    if (q && !item.url.toLowerCase().includes(q) && !(item.title||'').toLowerCase().includes(q)) return;
    const f = S.assignments[item.url] || '';
    if (f && S.folders.includes(f)) (folderMap[f] = folderMap[f] || []).push(item);
    else noFolder.push(item);
  });

  const byScore = arr => arr.slice().sort((a, b) => b.score - a.score);

  S.folders.forEach(fname => {
    const items = byScore(folderMap[fname] || []);
    groups.appendChild(makeFolderGroup(fname, items));
  });
  groups.appendChild(makeFolderGroup('Uncategorized', byScore(noFolder)));

  const total = CANDIDATES.filter(x =>
    !q || x.url.toLowerCase().includes(q) || (x.title||'').toLowerCase().includes(q)
  ).length;
  document.getElementById('cand-count').textContent = total;
}

function makeFolderGroup(name, items) {
  const div = document.createElement('div');

  const hdr = document.createElement('div');
  hdr.className = 'folder-hdr open';
  hdr.innerHTML = `
    <span>${name === 'Uncategorized' ? '&#128230;' : '&#128193;'} ${escH(name)}</span>
    <span class="folder-count">${items.length}</span>
    <span class="chevron">&#9654;</span>
  `;
  const list = document.createElement('div');
  list.className = 'folder-items open';
  hdr.onclick = () => { hdr.classList.toggle('open'); list.classList.toggle('open'); };

  items.forEach(item => list.appendChild(makeItem(item, 22)));
  div.appendChild(hdr);
  div.appendChild(list);
  return div;
}

function renderSidebar() {
  const q = document.getElementById('search').value.toLowerCase();
  renderBookmarksSection(q);
  renderCandidatesSection(q);
  updateHdrMeta();
}

function updateHdrMeta() {
  const adds    = Object.values(S.pending).filter(v => v === 'add').length;
  const removes = Object.values(S.pending).filter(v => v === 'remove').length;
  const parts   = [];
  if (adds)    parts.push(`+${adds} to add`);
  if (removes) parts.push(`&#x2212;${removes} to remove`);
  document.getElementById('hdr-meta').innerHTML =
    parts.length ? parts.join(' &nbsp;·&nbsp; ')
                 : `${CANDIDATES.length} candidates &nbsp;·&nbsp; ${BOOKMARKS.length} saved`;
}

// ── detail panel ───────────────────────────────────────────────────────────
function selectItem(url) {
  selectedUrl = url;
  renderSidebar();
  showDetail(url);
}

function showDetail(url) {
  const item = BY_URL[url];
  if (!item) return;

  document.getElementById('detail-empty').style.display = 'none';
  document.getElementById('detail-card').classList.add('show');

  document.getElementById('d-title').textContent = item.title || url;
  const urlEl = document.getElementById('d-url');
  urlEl.href = url; urlEl.textContent = url;

  document.getElementById('d-score').textContent  = item.score.toFixed(1);
  document.getElementById('d-visits').textContent = item.visit_count.toLocaleString();
  document.getElementById('d-days').textContent   = daysLabel(item.days_since_visit);

  const ratio = MAX_SCORE > 0 ? Math.min(item.score / MAX_SCORE, 1) : 0;
  const bar   = document.getElementById('d-bar');
  bar.style.width      = (ratio * 100) + '%';
  bar.style.background = ratio > 0.5 ? '#4ade80' : ratio > 0.2 ? '#fb923c' : '#94a3b8';

  // decay notice (bookmarks only)
  const noticeEl    = document.getElementById('d-decay-notice');
  const isDecay     = item._type === 'bookmark' && item.score <= DECAY_THRESH;
  noticeEl.style.display = isDecay ? '' : 'none';
  if (isDecay) {
    document.getElementById('d-decay-title').textContent =
      item.score === 0 ? 'Not visited in the analyzed window' : 'Score has decayed significantly';
    document.getElementById('d-decay-body').textContent =
      item.score === 0
        ? ' — this page does not appear in your recent browser history. Consider removing it.'
        : ` — current score ${item.score.toFixed(1)} is well below average. Worth keeping?`;
  }

  // bookmark meta row
  const meta    = BOOKMARK_META[url];
  const metaEl  = document.getElementById('d-bm-meta');
  metaEl.style.display = meta ? '' : 'none';
  if (meta) {
    document.getElementById('d-added-at').textContent    = (meta.added_at || '').slice(0, 10) || '—';
    document.getElementById('d-saved-score').textContent = meta.saved_score != null
      ? Number(meta.saved_score).toFixed(1) : '—';
  }

  // folder select
  const sel = document.getElementById('folder-select');
  sel.innerHTML = '<option value="">— No folder —</option>';
  S.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    if ((S.assignments[url] || '') === f) opt.selected = true;
    sel.appendChild(opt);
  });

  // action buttons
  const p      = S.pending[url];
  const addBtn = document.getElementById('btn-add');
  const remBtn = document.getElementById('btn-remove');
  addBtn.classList.toggle('active', p === 'add');
  addBtn.textContent = p === 'add' ? '✓ Added' : 'Add to bookmarks';
  remBtn.classList.toggle('active', p === 'remove');
  remBtn.textContent = p === 'remove' ? '✕ Marked for removal' : 'Remove bookmark';
  addBtn.style.display = item._type === 'bookmark'  ? 'none' : '';
  remBtn.style.display = item._type === 'candidate' ? 'none' : '';
}

function toggleAdd() {
  if (!selectedUrl) return;
  S.pending[selectedUrl] = S.pending[selectedUrl] === 'add' ? null : 'add';
  saveState(); showDetail(selectedUrl); renderSidebar();
}

function toggleRemove() {
  if (!selectedUrl) return;
  S.pending[selectedUrl] = S.pending[selectedUrl] === 'remove' ? null : 'remove';
  saveState(); showDetail(selectedUrl); renderSidebar();
}

function onFolderAssign() {
  if (!selectedUrl) return;
  const val = document.getElementById('folder-select').value;
  if (val) S.assignments[selectedUrl] = val;
  else delete S.assignments[selectedUrl];
  saveState(); renderSidebar();
}

// ── folder management ──────────────────────────────────────────────────────
function showFolderInput() {
  document.getElementById('folder-input-row').classList.add('show');
  document.getElementById('new-folder-input').focus();
}

function onFolderKey(e) {
  if (e.key === 'Enter') confirmFolder();
  if (e.key === 'Escape') hideFolderInput();
}

function confirmFolder() {
  const input = document.getElementById('new-folder-input');
  const name  = input.value.trim();
  if (name && !S.folders.includes(name)) {
    S.folders.push(name);
    saveState(); renderSidebar();
    if (selectedUrl) showDetail(selectedUrl); // refresh folder dropdown
  }
  input.value = ''; hideFolderInput();
}

function hideFolderInput() {
  document.getElementById('folder-input-row').classList.remove('show');
}

function onSearch() { renderSidebar(); }

// ── script ─────────────────────────────────────────────────────────────────
function buildScript() {
  const lines = ['#!/bin/bash', '# Generated by Link Sense — ' + new Date().toLocaleString(), ''];

  // Adds grouped by folder
  const byFolder = {};
  const noFolder = [];
  Object.entries(S.pending).forEach(([url, action]) => {
    if (action !== 'add') return;
    const f = S.assignments[url] || '';
    if (f) (byFolder[f] = byFolder[f] || []).push(url);
    else noFolder.push(url);
  });

  const removes = Object.entries(S.pending).filter(([,v]) => v === 'remove').map(([url]) => url);

  let any = false;

  S.folders.forEach(f => {
    if (!(byFolder[f]||[]).length) return;
    lines.push(`# ${f}`);
    byFolder[f].forEach(url => lines.push(`link-sense add --folder ${q(f)} ${q(url)}`));
    lines.push(''); any = true;
  });

  if (noFolder.length) {
    lines.push('# (no folder)');
    noFolder.forEach(url => lines.push(`link-sense add ${q(url)}`));
    lines.push(''); any = true;
  }

  if (removes.length) {
    lines.push('# Removals');
    removes.forEach(url => lines.push(`link-sense remove ${q(url)}`));
    lines.push(''); any = true;
  }

  if (!any) lines.push('# Nothing selected — mark items with Add or Remove in the detail panel.');
  return lines.join('\n');
}

function q(s) {
  return '"' + String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\$/g,'\\$').replace(/`/g,'\\`') + '"';
}

function openScript() {
  document.getElementById('script-text').value = buildScript();
  const adds    = Object.values(S.pending).filter(v => v === 'add').length;
  const removes = Object.values(S.pending).filter(v => v === 'remove').length;
  document.getElementById('script-meta').textContent = `${adds} add · ${removes} remove`;
  document.getElementById('script-overlay').classList.add('show');
}

function closeScript() {
  document.getElementById('script-overlay').classList.remove('show');
}

function copyScript() {
  navigator.clipboard.writeText(document.getElementById('script-text').value).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1600);
  });
}

function downloadScript() {
  const blob = new Blob([document.getElementById('script-text').value], {type:'text/x-shellscript'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'apply.sh'; a.click();
}

// ── helpers ────────────────────────────────────────────────────────────────
function daysLabel(d) {
  if (d < 1)  return 'Today';
  if (d < 2)  return 'Yesterday';
  if (d < 7)  return Math.floor(d) + 'd ago';
  if (d < 30) return Math.floor(d/7) + 'w ago';
  return Math.floor(d/30) + 'mo ago';
}

function escH(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── init ───────────────────────────────────────────────────────────────────
loadState();
renderSidebar();
</script>
</body>
</html>
"""


def generate(
    candidates: list[ScoredEntry],
    bookmarks: list[ScoredEntry],
    bookmark_meta: dict[str, dict],
    output: Path,
) -> None:
    def to_json(entries: list[ScoredEntry]) -> str:
        return json.dumps(
            [
                {
                    "url": e.url,
                    "title": e.title,
                    "visit_count": e.visit_count,
                    "days_since_visit": e.days_since_visit,
                    "score": e.score,
                }
                for e in entries
            ],
            ensure_ascii=False,
        )

    # Compact per-url metadata for existing bookmarks
    meta_json = json.dumps(
        {
            url: {
                "folder": meta.get("folder", ""),
                "added_at": meta.get("added_at", ""),
                "saved_score": meta.get("score"),
            }
            for url, meta in bookmark_meta.items()
        },
        ensure_ascii=False,
    )

    html = (
        _TEMPLATE
        .replace("%%CANDIDATES%%", to_json(candidates))
        .replace("%%BOOKMARKS%%", to_json(bookmarks))
        .replace("%%BOOKMARK_META%%", meta_json)
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
