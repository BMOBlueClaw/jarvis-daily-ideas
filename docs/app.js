// JARVIS Ideas Dashboard — Client-side logic
// Loads ideas.json from data/, renders timeline, handles starring via localStorage.

const DATA_URL = "../data/ideas.json";
const STORAGE_KEY = "jarvis-starred";

let allEntries = [];
let starred = loadStarred();
let activeFilter = "all";

// ── Starred persistence (localStorage) ─────────────────────────────

function loadStarred() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveStarred() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...starred]));
}

function toggleStar(id) {
  if (starred.has(id)) starred.delete(id);
  else starred.add(id);
  saveStarred();
  render();
}

// ── Data loading ────────────────────────────────────────────────────

async function loadData() {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
    const db = await res.json();
    allEntries = (db.entries || []).slice().reverse(); // newest first

    document.getElementById("last-updated").textContent =
      db.lastUpdated ? new Date(db.lastUpdated).toLocaleDateString() : "—";

    loadingEl.hidden = true;
    render();
  } catch (err) {
    loadingEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = `Could not load ideas: ${err.message}. Run JARVIS at least once to generate data.`;
  }
}

// ── Rendering ───────────────────────────────────────────────────────

function render() {
  const timeline = document.getElementById("timeline");
  const statsEl = document.getElementById("stats");

  // Gather all ideas with filter
  let totalIdeas = 0;
  let totalStarred = 0;
  let visibleDays = 0;

  const html = [];

  for (const entry of allEntries) {
    let ideas = entry.ideas || [];
    totalIdeas += ideas.length;
    ideas.forEach((idea) => {
      if (starred.has(idea.id)) totalStarred++;
    });

    // Apply filter
    if (activeFilter === "starred") {
      ideas = ideas.filter((i) => starred.has(i.id));
    } else if (activeFilter !== "all") {
      ideas = ideas.filter((i) => i.type === activeFilter);
    }

    if (ideas.length === 0) continue;
    visibleDays++;

    html.push(`<section class="day-section">`);
    html.push(`
      <div class="day-header">
        <span class="day-date">${formatDate(entry.date)}</span>
        <span class="day-count">${ideas.length} idea${ideas.length !== 1 ? "s" : ""}</span>
      </div>
    `);

    // Market context cards
    if (activeFilter === "all" || activeFilter === "starred") {
      html.push(renderMarketCards(entry));
    }

    // Idea cards
    for (const idea of ideas) {
      const isStarred = starred.has(idea.id);
      html.push(`
        <div class="idea-card${isStarred ? " starred" : ""}">
          <div class="idea-top">
            <span class="idea-type" data-type="${esc(idea.type)}">${esc(idea.type)}</span>
            <button class="star-btn${isStarred ? " active" : ""}" onclick="toggleStar('${esc(idea.id)}')" title="${isStarred ? "Unstar" : "Star this idea"}">⭐</button>
          </div>
          <div class="idea-text">${esc(idea.idea)}</div>
          <div class="idea-trend">${esc(idea.trend)}</div>
        </div>
      `);
    }

    html.push(`</section>`);
  }

  if (html.length === 0) {
    timeline.innerHTML = `<div class="no-results">No ideas match this filter yet.</div>`;
  } else {
    timeline.innerHTML = html.join("");
  }

  statsEl.textContent = `${totalIdeas} ideas across ${allEntries.length} days • ${totalStarred} starred`;
}

function renderMarketCards(entry) {
  if (!entry.crypto && !entry.aiTrends) return "";

  let html = `<div class="day-market">`;

  // AI trends
  if (entry.aiTrends && entry.aiTrends.length > 0) {
    html += `<div class="market-card"><h3>📡 AI Trends</h3><ul>`;
    for (const t of entry.aiTrends.slice(0, 4)) {
      html += `<li><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(truncate(t.title, 60))}</a> <span style="color:var(--text-muted)">(${t.score}pts)</span></li>`;
    }
    html += `</ul></div>`;
  }

  // Crypto
  if (entry.crypto) {
    html += `<div class="market-card"><h3>💰 Crypto Pulse</h3><ul>`;
    for (const c of (entry.crypto.trending || []).slice(0, 4)) {
      const change = typeof c.priceChange24h === "number"
        ? `${c.priceChange24h > 0 ? "+" : ""}${c.priceChange24h.toFixed(1)}%`
        : "";
      const cls = c.priceChange24h > 0 ? "gain" : c.priceChange24h < 0 ? "loss" : "";
      html += `<li>${esc(c.name)} (${esc(c.symbol)}) <span class="${cls}">${change}</span></li>`;
    }
    if (entry.crypto.gainers && entry.crypto.gainers.length > 0) {
      html += `<li style="color:var(--text-muted);margin-top:0.3rem;font-size:0.75rem">Top gainer: ${esc(entry.crypto.gainers[0].name)} <span class="gain">+${entry.crypto.gainers[0].priceChange24h}%</span></li>`;
    }
    html += `</ul></div>`;
  }

  html += `</div>`;
  return html;
}

// ── Helpers ─────────────────────────────────────────────────────────

function esc(str) {
  if (typeof str !== "string") return String(str ?? "");
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Filter buttons ──────────────────────────────────────────────────

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".filter-btn.active")?.classList.remove("active");
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    render();
  });
});

// ── Boot ────────────────────────────────────────────────────────────

loadData();
