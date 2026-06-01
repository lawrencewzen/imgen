#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$HOME/.claude/skills/imgen"

echo "==> Installing dependencies..."
cd "$PROJECT_DIR"
npm install

echo "==> Linking imgen CLI globally..."
npm link

echo "==> Installing Claude Code skill..."
if [ -L "$SKILL_DIR" ]; then
  rm "$SKILL_DIR"
elif [ -e "$SKILL_DIR" ]; then
  echo "Error: $SKILL_DIR exists and is not a symlink. Remove it manually first."
  exit 1
fi
mkdir -p "$HOME/.claude/skills"
ln -s "$PROJECT_DIR" "$SKILL_DIR"

echo ""
echo "Done."
echo "  imgen CLI: $(which imgen)"
echo "  Claude Code skill: $SKILL_DIR -> $PROJECT_DIR"
echo ""
echo "Restart Claude Code to activate the skill."
