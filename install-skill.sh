#!/usr/bin/env bash
set -e

REPO="https://github.com/aisparkedu/imgen.git"
INSTALL_DIR="$HOME/.local/share/imgen"

# When piped via curl, $0 is "bash" and the script has no file path.
# Clone the repo to a stable location and run from there.
if [ ! -f "$(dirname "$0")/package.json" ]; then
  echo "==> Cloning imgen..."
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 "$REPO" "$INSTALL_DIR"
  exec "$INSTALL_DIR/install-skill.sh"
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing dependencies..."
cd "$PROJECT_DIR"
npm install

echo "==> Linking imgen CLI globally..."
npm link

install_skill() {
  local skill_dir="$1"
  if [ -L "$skill_dir" ]; then
    rm "$skill_dir"
  elif [ -e "$skill_dir" ]; then
    echo "Warning: $skill_dir exists and is not a symlink, skipping."
    return
  fi
  mkdir -p "$(dirname "$skill_dir")"
  ln -s "$PROJECT_DIR" "$skill_dir"
  echo "  $skill_dir -> $PROJECT_DIR"
}

echo "==> Installing skills..."
install_skill "$HOME/.claude/skills/imgen"
install_skill "$HOME/.codex/skills/imgen"
install_skill "$HOME/.gemini/skills/imgen"

echo ""
echo "Done. imgen CLI: $(which imgen)"
echo "Restart Claude Code / Codex / Gemini CLI to activate the skill."
