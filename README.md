# 🤖 JARVIS — Daily AI × Crypto Business Idea Generator

JARVIS scans trending AI topics (HackerNews, Reddit) and crypto markets (CoinGecko), generates actionable business ideas at the intersection of AI and crypto, and sends a daily digest to your Telegram.

## Setup (5 minutes)

### 1. Create a Telegram Bot

1. Open Telegram → search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the **bot token** (looks like `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`)

### 2. Get Your Chat ID

1. Send any message to your new bot
2. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find `"chat":{"id": 123456789}` — that's your Chat ID
4. For a group/channel, add the bot to it first, then check getUpdates

### 3. Deploy to GitHub Actions (Free)

1. Create a new GitHub repo and push this code:
   ```bash
   cd jarvis-daily-ideas
   git init && git add -A && git commit -m "JARVIS v1"
   gh repo create jarvis-daily-ideas --private --push --source=.
   ```

2. Add your secrets:
   ```bash
   gh secret set TELEGRAM_BOT_TOKEN --body "YOUR_BOT_TOKEN_HERE"
   gh secret set TELEGRAM_CHAT_ID --body "YOUR_CHAT_ID_HERE"
   ```

3. That's it! JARVIS will run every day at **08:00 UTC**.

### 4. Test It Now

**Dry run (no Telegram needed):**
```bash
npm install
node jarvis.mjs --dry-run
```

**Manual trigger on GitHub:**
```bash
gh workflow run jarvis.yml
```

## What JARVIS Reports

Each daily message includes:

| Section | Source |
|---------|--------|
| 📡 Trending AI Topics | HackerNews (Algolia API), Reddit hot posts |
| 💰 Crypto Pulse | CoinGecko trending coins + top 24h gainers |
| 💡 Business Ideas | Auto-generated from pattern matching trends |

### Idea Types Generated

- **AI SaaS** — Service ideas based on the hottest AI themes
- **Crypto × AI** — Crossover products for trending tokens
- **Content Business** — Newsletter/course plays with crypto-gated access
- **Crypto Tool** — Alert bots and trading tools for movers

## Customization

Edit `jarvis.mjs` to:

- Add more data sources (Twitter/X API, Product Hunt, etc.)
- Adjust idea generation patterns
- Change the number of trends/ideas reported
- Add OpenAI API for smarter idea synthesis

## License

MIT
