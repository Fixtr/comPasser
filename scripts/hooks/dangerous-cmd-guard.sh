#!/bin/bash
# Hook: Prevent dangerous bash commands
CMD="$1"
if [[ "$CMD" == *"rm -rf"* ]] || [[ "$CMD" == *"git reset --hard"* ]] || [[ "$CMD" == *"git push --force"* ]]; then
  echo "[Dangerous Cmd Guard] Blocked: Dangerous command detected: $CMD"
  exit 1
fi
exit 0
