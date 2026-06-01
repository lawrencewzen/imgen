#!/usr/bin/env bash
set -e

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
install_skill "$HOME/.agent/skills/imgen"

echo ""
echo "Done. imgen CLI: $(which imgen)"
echo "Restart Claude Code / Agent to activate the skill."
