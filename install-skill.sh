#!/usr/bin/env bash
set -e

SKILL_DIR="$HOME/.claude/skills/imgen"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -L "$SKILL_DIR" ]; then
  echo "Updating symlink: $SKILL_DIR -> $PROJECT_DIR"
  rm "$SKILL_DIR"
elif [ -e "$SKILL_DIR" ]; then
  echo "Error: $SKILL_DIR exists and is not a symlink. Remove it manually first."
  exit 1
fi

mkdir -p "$HOME/.claude/skills"
ln -s "$PROJECT_DIR" "$SKILL_DIR"
echo "Installed: $SKILL_DIR -> $PROJECT_DIR"
echo "Restart Claude Code to activate the skill."
