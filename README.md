# Interview Prepper

A small local web app for practising job interviews out loud.

You give it your resume (PDF), the job description and any recruiter emails or messages. Claude plays the interviewer, grounded in that material. You answer by voice: ElevenLabs transcribes what you say and speaks the interviewer's replies. At the end you get a written debrief.

## How it works

```
browser (mic)  ──audio──▶  server ──▶ ElevenLabs STT (Scribe)
                                   ──▶ claude -p --resume <session>   (Claude Code CLI, your subscription)
                                   ──▶ ElevenLabs TTS
browser (speaker) ◀──mp3 + text──┘
```

- Each answer is one headless `claude -p` run. The conversation history lives in Claude Code's own session store (`--session-id` on the first turn, `--resume` after that).
- The CLI runs inside `sessions/<id>/`, which holds `resume.pdf`, `job-description.md` and `recruiter-notes.md`. Claude reads the PDF itself through its Read tool, so the app needs no PDF parser.
- `--safe-mode` keeps your personal Claude Code setup (CLAUDE.md, hooks, plugins, MCP servers) out of the interviewer while still using your normal login. `--tools Read` means it can only read files.
- The interviewer's behaviour is set in [prompts/interviewer.md](prompts/interviewer.md). The file is re-read on every turn, so you can edit it while the server is running.

## Setup

Requirements: Node 22+, and Claude Code installed and logged in (`claude` works in a terminal).

```sh
npm install
cp .env.example .env   # add your ElevenLabs key and a voice id
npm run dev
```

Open http://localhost:5178.

Without ElevenLabs keys the app still works in text mode: type your answers and read the replies.

## Layout

| Path | What |
|---|---|
| `src/server.ts` | Express routes: create session, start, turn, debrief, transcript |
| `src/agent.ts` | Spawns the Claude Code CLI for one turn |
| `src/elevenlabs.ts` | `transcribe()` and `speak()` |
| `src/sessions.ts` | Session folder layout, transcript log, per-session lock |
| `src/prompts.ts` | Fills the system prompt; opening and debrief messages |
| `prompts/interviewer.md` | The interviewer's instructions |
| `public/` | The frontend: plain HTML, CSS and JS with no build step |
| `sessions/` | One folder per practice run (gitignored) |

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | CLI path, model, whether voice is on |
| POST | `/api/sessions` | multipart: `resume` (pdf), `jobDescription`, `recruiterNotes`, `interviewType`, `persona` | `{ id }` |
| POST | `/api/sessions/:id/start` | | `{ reply, audio }` |
| POST | `/api/sessions/:id/turn` | multipart: `audio` **or** `text` | `{ transcript, reply, audio }` |
| POST | `/api/sessions/:id/debrief` | | `{ feedback }` (also saved to `feedback.md`) |
| GET | `/api/sessions/:id/transcript` | | session metadata and transcript lines |

`audio` is a base64 MP3, or `null` when voice is off.

## Next steps

- **Latency.** Each turn starts the CLI from cold. Switch to one long-lived `claude -p --input-format stream-json --output-format stream-json` process per session, and stream TTS sentence by sentence.
- **Barge-in.** Let you interrupt the interviewer mid-sentence.
- **Debrief rendering.** The feedback is Markdown but is shown as plain text.
- **Past sessions.** A page to browse old transcripts and feedback.
- **Check ElevenLabs model ids.** `scribe_v1` and `eleven_flash_v2_5` are the defaults. Override them in `.env` if your plan has newer models.
