#!/bin/bash
# Hook: Prevent implementation without tests
if ! git diff --cached --name-only | grep -q "test"; then
  echo "[TDD Guard] Blocked: No test files modified. Write tests first."
  exit 1
fi
exit 0
