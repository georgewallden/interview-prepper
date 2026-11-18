# interview-prepper

Local voice mock-interview app. Node 22 + TypeScript (run via tsx, no build), Express 5, plain JS frontend in `public/`.

- The interviewer agent is the Claude Code CLI spawned per turn (`src/agent.ts`). Keep `--safe-mode`: without it the user's global hooks, plugins and CLAUDE.md leak into the interviewer. Do not switch to `--bare`, which only accepts ANTHROPIC_API_KEY and would break subscription auth.
- On Windows, spawn the native `claude.exe` (resolved in `src/config.ts`), not the `claude.cmd` shim. The shim needs `shell: true`, which mangles the multi-line system prompt.
- Interviewer behaviour lives in `prompts/interviewer.md`, not in code.
- `sessions/` holds personal data (resumes, recruiter emails). It is gitignored and must stay that way.
- Check with `npm run typecheck`.
