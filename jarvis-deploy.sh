#!/usr/bin/env bash
# JARVIS Deploy — Zero-touch GitHub deployment
# Usage: ./jarvis-deploy.sh [project-dir] [repo-name] [--public|--private]
# Requires: GH_TOKEN env var or gh CLI already authenticated

set -euo pipefail

# ─── Config ─────────────────────────────────────────────────────────────────────
OWNER="BMOBlueClaw"
PROJECT_DIR="${1:-.}"
REPO_NAME="${2:-$(basename "$(cd "$PROJECT_DIR" && pwd)")}"
VISIBILITY="${3:---private}"
# ─── OWASP: Input Validation ───────────────────────────────────────────────────────────
if [[ ! "$REPO_NAME" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "❌ Invalid repo name: '$REPO_NAME'. Only alphanumerics, dots, hyphens, underscores allowed."
  exit 1
fi

if [[ "$VISIBILITY" != "--private" && "$VISIBILITY" != "--public" ]]; then
  echo "❌ Invalid visibility: '$VISIBILITY'. Use --private or --public."
  exit 1
fi

# ─── OWASP: Ensure token is removed from remote on any exit ─────────────────
cleanup_token() {
  if [[ -d "$PROJECT_DIR/.git" ]] && git -C "$PROJECT_DIR" remote get-url origin &>/dev/null 2>&1; then
    git -C "$PROJECT_DIR" remote set-url origin "https://github.com/${OWNER}/${REPO_NAME}.git" 2>/dev/null || true
  fi
}
trap cleanup_token EXIT
# ─── Token Resolution (no human needed) ─────────────────────────────────────────
resolve_token() {
  # Priority: GH_TOKEN env > gh CLI token > GITHUB_TOKEN (Codespace default)
  if [[ -n "${GH_TOKEN:-}" ]]; then
    echo "$GH_TOKEN"
  elif command -v gh &>/dev/null && gh auth token &>/dev/null 2>&1; then
    gh auth token
  elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
    echo "$GITHUB_TOKEN"
  else
    echo ""
  fi
}

TOKEN="$(resolve_token)"
if [[ -z "$TOKEN" ]]; then
  echo "❌ No GitHub token found."
  echo "   Fix: export GH_TOKEN=ghp_yourtoken"
  echo "   Or:  gh auth login"
  exit 1
fi

# Export for gh CLI to use
export GH_TOKEN="$TOKEN"

echo "🤖 JARVIS Deploy: $REPO_NAME → $OWNER/$REPO_NAME"

# ─── Step 1: Create repo if it doesn't exist ────────────────────────────────────
if gh repo view "$OWNER/$REPO_NAME" &>/dev/null 2>&1; then
  echo "📦 Repo exists: $OWNER/$REPO_NAME"
else
  echo "📦 Creating repo: $OWNER/$REPO_NAME ($VISIBILITY)..."
  gh repo create "$REPO_NAME" "$VISIBILITY" --description "JARVIS auto-deployed project"
  echo "   ✓ Created"
fi

# ─── Step 2: Git init + remote ──────────────────────────────────────────────────
cd "$PROJECT_DIR"

if [[ ! -d .git ]]; then
  git init -q
  git branch -M main
fi

REMOTE_URL="https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO_NAME}.git"

if git remote get-url origin &>/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

# ─── Step 3: Commit + Push ──────────────────────────────────────────────────────
git add -A

if ! git diff --cached --quiet 2>/dev/null; then
  git commit -q -m "JARVIS auto-deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "📝 Committed changes"
fi

echo "🚀 Pushing to origin/main..."
git push -u origin main --force-with-lease 2>/dev/null || git push -u origin main
echo "   ✓ Pushed"

# ─── Step 4: Set secrets from .env.secrets ───────────────────────────────────────
if [[ -f .env.secrets ]]; then
  # OWASP: validate file permissions — secrets file should not be world-readable
  PERMS=$(stat -c '%a' .env.secrets 2>/dev/null || stat -f '%Lp' .env.secrets 2>/dev/null || echo "unknown")
  if [[ "$PERMS" != "unknown" && "$PERMS" != "600" && "$PERMS" != "400" ]]; then
    echo "⚠️  Warning: .env.secrets has loose permissions ($PERMS). Fixing to 600."
    chmod 600 .env.secrets
  fi

  echo "🔑 Setting GitHub secrets..."
  while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    # Trim whitespace
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"
    [[ -z "$key" || -z "$value" ]] && continue
    # OWASP: validate secret key names (prevent injection via key name)
    if [[ ! "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
      echo "   ⚠️  Skipping invalid key: $key"
      continue
    fi
    echo "$value" | gh secret set "$key" -R "$OWNER/$REPO_NAME"
    echo "   ✓ $key"
  done < .env.secrets
fi

# ─── Step 5: Trigger workflow if exists ──────────────────────────────────────────
if [[ -d .github/workflows ]]; then
  WORKFLOW_FILE=$(ls .github/workflows/*.yml 2>/dev/null | head -1 || true)
  if [[ -n "$WORKFLOW_FILE" ]]; then
    WF_NAME=$(basename "$WORKFLOW_FILE")
    echo "⚡ Triggering workflow: $WF_NAME"
    sleep 3  # Give GitHub time to index the workflow
    gh workflow run "$WF_NAME" -R "$OWNER/$REPO_NAME" 2>/dev/null && echo "   ✓ Triggered" || echo "   ⏭ Skipped (workflow may not support dispatch)"
  fi
fi

# Clean up: remove token from remote URL (handled by trap, but belt-and-suspenders)
git remote set-url origin "https://github.com/${OWNER}/${REPO_NAME}.git"

echo ""
echo "✅ Deployed: https://github.com/$OWNER/$REPO_NAME"
echo "   JARVIS out. 🤖"
