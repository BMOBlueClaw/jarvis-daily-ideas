// JARVIS — Daily AI + Crypto Business Idea Generator
// Scans trending AI topics & crypto markets, generates business ideas, sends to Telegram.
// Saves all ideas to data/ideas.json for the JARVIS Dashboard.

import fetch from "node-fetch";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DRY_RUN = process.argv.includes("--dry-run");
const DATA_DIR = join(__dirname, "data");
const IDEAS_DB = join(DATA_DIR, "ideas.json");
const FETCH_TIMEOUT_MS = 15_000;

// ─── OWASP: Input Validation ───────────────────────────────────────────────────

function validateEnvVars() {
  if (DRY_RUN) return;
  if (!TELEGRAM_BOT_TOKEN || !/^\d+:[A-Za-z0-9_-]{35,}$/.test(TELEGRAM_BOT_TOKEN)) {
    throw new Error("TELEGRAM_BOT_TOKEN missing or malformed");
  }
  if (!TELEGRAM_CHAT_ID || !/^-?\d+$/.test(TELEGRAM_CHAT_ID)) {
    throw new Error("TELEGRAM_CHAT_ID missing or malformed");
  }
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeText(str, maxLen = 500) {
  if (typeof str !== "string") return "";
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, maxLen);
}

// ─── Data Sources ──────────────────────────────────────────────────────────────

async function fetchJSON(url, options = {}) {
  if (!isValidUrl(url)) throw new Error(`Invalid URL blocked: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "JARVIS-BusinessBot/1.0" },
      signal: controller.signal,
      redirect: "error", // OWASP: prevent open redirect / SSRF chains
      ...options,
    });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    const body = await res.text();
    // OWASP: limit response size to prevent DoS via large payloads
    if (body.length > 5_000_000) throw new Error(`Response too large: ${body.length} bytes`);
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

/** Top AI/ML posts from HackerNews (Algolia API) */
async function getHackerNewsTrends() {
  const data = await fetchJSON(
    "https://hn.algolia.com/api/v1/search?query=AI+machine+learning+LLM+GPT&tags=story&hitsPerPage=10&numericFilters=points>50"
  );
  return data.hits.map((h) => {
    const itemUrl = h.url || `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`;
    return {
      source: "HackerNews",
      title: sanitizeText(h.title, 200),
      url: isValidUrl(itemUrl) ? itemUrl : `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`,
      score: Number(h.points) || 0,
    };
  });
}

/** Top AI posts from Reddit */
async function getRedditAITrends() {
  const data = await fetchJSON(
    "https://www.reddit.com/r/artificial+MachineLearning+LocalLLaMA+singularity/hot.json?limit=10"
  );
  return data.data.children
    .filter((c) => !c.data.stickied)
    .slice(0, 8)
    .map((c) => {
      const permalink = (c.data.permalink || "").replace(/[^a-zA-Z0-9/_\-]/g, "");
      return {
        source: "Reddit",
        title: sanitizeText(c.data.title, 200),
        url: `https://reddit.com${permalink}`,
        score: Number(c.data.score) || 0,
      };
    });
}

/** Trending crypto tokens + big movers from CoinGecko (free, no key) */
async function getCryptoTrends() {
  const trending = await fetchJSON(
    "https://api.coingecko.com/api/v3/search/trending"
  );
  const coins = trending.coins.slice(0, 7).map((c) => ({
    name: sanitizeText(c.item.name, 50),
    symbol: sanitizeText(c.item.symbol, 10),
    marketCapRank: Number(c.item.market_cap_rank) || null,
    priceChange24h: c.item.data?.price_change_percentage_24h?.usd ?? "N/A",
  }));

  // Top gainers by market cap from the top-250
  const markets = await fetchJSON(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h"
  );
  const topGainers = markets
    .filter((m) => m.price_change_percentage_24h_in_currency > 5)
    .sort(
      (a, b) =>
        b.price_change_percentage_24h_in_currency -
        a.price_change_percentage_24h_in_currency
    )
    .slice(0, 5)
    .map((m) => ({
      name: sanitizeText(m.name, 50),
      symbol: sanitizeText(m.symbol, 10).toUpperCase(),
      priceChange24h: m.price_change_percentage_24h_in_currency?.toFixed(1),
      price: Number(m.current_price) || 0,
    }));

  return { trendingCoins: coins, topGainers };
}

// ─── Idea Generator ────────────────────────────────────────────────────────────

function generateIdeas(aiTrends, crypto) {
  const ideas = [];
  const aiTopics = aiTrends.map((t) => t.title);

  // Pattern 1: AI SaaS ideas inspired by trending topics
  const hotTopics = extractKeyThemes(aiTopics);
  for (const theme of hotTopics.slice(0, 3)) {
    ideas.push({
      type: "AI SaaS",
      idea: `Build a ${theme}-as-a-Service platform. Monetize with freemium subscriptions + crypto payments (accept top trending tokens).`,
      trend: theme,
    });
  }

  // Pattern 2: Crypto + AI crossover
  for (const coin of crypto.trendingCoins.slice(0, 2)) {
    ideas.push({
      type: "Crypto × AI",
      idea: `Create an AI-powered analytics/notification bot for ${coin.name} (${coin.symbol}) traders. Charge in ${coin.symbol} or stablecoins.`,
      trend: `${coin.name} trending #${coin.marketCapRank}`,
    });
  }

  // Pattern 3: Content/Education plays
  if (hotTopics.length > 0) {
    ideas.push({
      type: "Content Business",
      idea: `Launch a premium newsletter / course on "${hotTopics[0]}" with crypto-gated access (NFT or token-gated).`,
      trend: hotTopics[0],
    });
  }

  // Pattern 4: Arbitrage / tool opportunities from top gainers
  for (const gainer of crypto.topGainers.slice(0, 2)) {
    ideas.push({
      type: "Crypto Tool",
      idea: `Build a sniper/alert bot for tokens like ${gainer.name} (${gainer.symbol}, +${gainer.priceChange24h}% today). Sell access via Telegram premium channel.`,
      trend: `${gainer.symbol} +${gainer.priceChange24h}%`,
    });
  }

  return ideas;
}

function extractKeyThemes(titles) {
  const keywords = {};
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to",
    "for", "of", "with", "and", "or", "but", "not", "this", "that", "it",
    "its", "from", "by", "as", "be", "has", "have", "had", "do", "does",
    "did", "will", "would", "can", "could", "should", "may", "might",
    "my", "your", "our", "their", "i", "we", "you", "they", "he", "she",
    "how", "what", "why", "when", "where", "who", "which", "new", "now",
    "just", "like", "get", "got", "use", "using", "used", "about", "more",
    "show", "than", "some", "all", "any", "no", "so", "if", "up", "out",
    "one", "two", "first", "also", "into", "over", "after", "before",
  ]);

  for (const title of titles) {
    // Extract multi-word phrases and single significant words
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    for (const w of words) {
      keywords[w] = (keywords[w] || 0) + 1;
    }
  }

  return Object.entries(keywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);
}

// ─── Telegram Sender ───────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (DRY_RUN) {
    console.log("=== DRY RUN — would send to Telegram ===\n");
    console.log(text);
    return;
  }

  // Validation already done in validateEnvVars(), but defense-in-depth
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error(
      "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables"
    );
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text.slice(0, 4096), // Telegram message limit
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram API error: ${res.status} ${err.slice(0, 200)}`);
    }
    console.log("Message sent to Telegram successfully.");
  } finally {
    clearTimeout(timer);
  }
}

// ─── Message Formatter ─────────────────────────────────────────────────────────

function formatMessage(aiTrends, crypto, ideas, date) {
  let msg = `🤖 *JARVIS Daily Report — ${date}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // AI Trends section
  msg += `📡 *Trending in AI Today:*\n`;
  for (const t of aiTrends.slice(0, 6)) {
    msg += `• [${t.title}](${t.url}) _(${t.source}, ${t.score}pts)_\n`;
  }

  // Crypto section
  msg += `\n💰 *Crypto Pulse:*\n`;
  msg += `_Trending Coins:_\n`;
  for (const c of crypto.trendingCoins.slice(0, 5)) {
    const change =
      typeof c.priceChange24h === "number"
        ? `${c.priceChange24h > 0 ? "+" : ""}${c.priceChange24h.toFixed(1)}%`
        : "N/A";
    msg += `• ${c.name} (${c.symbol}) — Rank #${c.marketCapRank} — ${change}\n`;
  }
  if (crypto.topGainers.length > 0) {
    msg += `\n_Top Gainers (24h):_\n`;
    for (const g of crypto.topGainers.slice(0, 3)) {
      msg += `• ${g.name} ($${g.symbol}) — +${g.priceChange24h}% — $${g.price}\n`;
    }
  }

  // Business Ideas section
  msg += `\n💡 *Business Ideas for Today:*\n`;
  for (let i = 0; i < ideas.length; i++) {
    msg += `\n*${i + 1}. [${ideas[i].type}]*\n`;
    msg += `${ideas[i].idea}\n`;
    msg += `_📊 Based on: ${ideas[i].trend}_\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Generated by JARVIS — your AI business partner 🧠_`;

  return msg;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  validateEnvVars();
  const date = new Date().toISOString().split("T")[0];
  console.log(`JARVIS running for ${date}...`);

  // Fetch all data sources in parallel
  const [hnTrends, redditTrends, crypto] = await Promise.allSettled([
    getHackerNewsTrends(),
    getRedditAITrends(),
    getCryptoTrends(),
  ]);

  const aiTrends = [
    ...(hnTrends.status === "fulfilled" ? hnTrends.value : []),
    ...(redditTrends.status === "fulfilled" ? redditTrends.value : []),
  ];

  if (aiTrends.length === 0) {
    console.warn("Warning: No AI trends fetched. Check API connectivity.");
  }

  const cryptoData =
    crypto.status === "fulfilled"
      ? crypto.value
      : { trendingCoins: [], topGainers: [] };

  if (cryptoData.trendingCoins.length === 0) {
    console.warn("Warning: No crypto data fetched. Check CoinGecko API.");
  }

  // Generate ideas from the trends
  const ideas = generateIdeas(aiTrends, cryptoData);

  // Format and send
  const message = formatMessage(aiTrends, cryptoData, ideas, date);
  await sendTelegram(message);

  // Persist ideas to JSON database for the dashboard
  saveIdeasToDb(date, aiTrends, cryptoData, ideas);

  console.log("JARVIS daily run complete.");
}

// ─── Ideas Database ────────────────────────────────────────────────────────────

function saveIdeasToDb(date, aiTrends, cryptoData, ideas) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  let db = { entries: [] };
  if (existsSync(IDEAS_DB)) {
    try {
      db = JSON.parse(readFileSync(IDEAS_DB, "utf-8"));
    } catch {
      db = { entries: [] };
    }
  }

  // Don't duplicate if already ran today
  if (db.entries.some((e) => e.date === date)) {
    console.log(`Ideas for ${date} already saved, skipping DB write.`);
    return;
  }

  db.entries.push({
    date,
    aiTrends: aiTrends.slice(0, 8).map((t) => ({
      title: t.title,
      url: t.url,
      source: t.source,
      score: t.score,
    })),
    crypto: {
      trending: cryptoData.trendingCoins.slice(0, 5),
      gainers: cryptoData.topGainers.slice(0, 3),
    },
    ideas: ideas.map((idea, i) => ({
      id: `${date}-${i + 1}`,
      ...idea,
      starred: false,
    })),
  });

  // Keep last 90 days
  if (db.entries.length > 90) {
    db.entries = db.entries.slice(-90);
  }

  db.lastUpdated = new Date().toISOString();
  writeFileSync(IDEAS_DB, JSON.stringify(db, null, 2));
  console.log(`Saved ${ideas.length} ideas for ${date} to database.`);
}

main().catch((err) => {
  console.error("JARVIS encountered an error:", err);
  process.exit(1);
});
