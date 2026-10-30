#!/usr/bin/env bash
# First-time setup, run by `make setup`. Safe to run again: each step skips what is already done.
# Models are not downloaded here: Z-Image-Turbo comes on the model server's first start, the rest from the app.
set -euo pipefail
cd "$(dirname "$0")/.."

MIN_NODE_MAJOR=20

step() { printf '\n== %s\n' "$1"; }
fail() { printf '\nSetup stopped: %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "$2"; }

step "Checking this Mac and the tools the app needs"
[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || fail "the app runs on a Mac with Apple Silicon (M1 or later)."
need brew 'Homebrew is missing. Install it from https://brew.sh, then run make setup again.'
need git 'git is missing. Install it with: xcode-select --install'
need uv 'uv is missing. Install it with: brew install uv'
need node "Node.js is missing. Install version ${MIN_NODE_MAJOR} or newer with: brew install node"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge "$MIN_NODE_MAJOR" ] || fail "Node.js ${MIN_NODE_MAJOR} or newer is needed (found $(node -v)). Update it with: brew upgrade node"
echo "Apple Silicon, Homebrew, git, uv and Node.js $(node -v): all there."

step "Installing ffmpeg (videos) and gitleaks (secret check) if missing"
for tool in ffmpeg gitleaks; do
  if command -v "$tool" >/dev/null; then echo "$tool: already installed"; else brew install "$tool"; fi
done

step "Turning on the git hooks (branch names and secrets)"
git config core.hooksPath .githooks

step "Creating .env"
if [ -f .env ]; then
  echo ".env already exists; left as it is."
else
  cp .env.example .env
  echo "Created .env from .env.example. Add the keys you need (Grok, FLUX.1-dev, Civitai add-ons); empty ones stay off."
fi

step "Installing the Python packages"
uv sync

step "Installing and building the UI"
(cd frontend && npm ci && npm run build)

cat <<'DONE'

== Done. Next:
  1. Optional: add keys to .env (see the comments in it).
  2. Start the model server:  make model-server   (the first start downloads Z-Image-Turbo, about 33 GB)
  3. Start the web app:       make app            then open http://127.0.0.1:7860
DONE
