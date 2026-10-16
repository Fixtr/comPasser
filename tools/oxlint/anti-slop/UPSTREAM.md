# anti-slop source

- Source: https://github.com/dmmulroy/anti-slop
- Installed from: `install-anti-slop` skill's bundled `assets/anti-slop` snapshot
- Upstream commit: unknown (the installed skill did not record one)
- Installed entry point: `tools/oxlint/anti-slop/index.ts`
- Snapshot: SHA-256 over the 38 files in this directory excluding this record, sorted by relative path; feed each relative path, a NUL byte, and its file contents in sequence: `cea57e9827e691eafaebdb7c9ead526f58227b92c853e64e1cd2ec148e6d9121`
- Local source changes: none. The repository's `.oxlintrc.json` selects JavaScript rules; the copied TypeScript and Effect rules remain available but disabled.
- Local policy (2026-10-06, user approved): `.oxlintrc.json` disables `no-conditional-empty-object-spread` and reports `no-array-filter-map` as a warning. Other configured rules and plugin source are unchanged. Verified with the repository lint command and planner Playwright scenarios.

The copied files in this directory are the recoverable pristine installed snapshot. Keep the nested ESLint Stylistic license and provenance when updating it.
