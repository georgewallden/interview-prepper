import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { config, ROOT, voiceEnabled } from "./config.js";
import { runTurn } from "./agent.js";
import { transcribe, speak } from "./elevenlabs.js";
import { buildSystemPrompt, OPENING_MESSAGE, DEBRIEF_MESSAGE } from "./prompts.js";
import {
  createSession, getSession, saveSession, sessionDir,
  appendTranscript, readTranscript, withSessionLock,
  type InterviewType, type Session,
} from "./sessions.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));

const INTERVIEW_TYPES: InterviewType[] = ["recruiter-screen", "hiring-manager", "behavioral", "technical", "panel"];

/** Send one message to the interviewer and get its reply (+ audio if voice is on). */
async function interviewerTurn(session: Session, message: string) {
  const reply = await runTurn({
    cwd: sessionDir(session.id),
    claudeSessionId: session.claudeSessionId,
    isFirstTurn: !session.started,
    systemPrompt: await buildSystemPrompt(session),
    message,
  });
  session.started = true;
  session.costUsd += reply.costUsd;
  await saveSession(session);
  return reply.text;
}

async function maybeSpeak(text: string): Promise<string | null> {
  if (!voiceEnabled() || !text) return null;
  return (await speak(text)).toString("base64");
}

async function loadSession(req: Request, res: Response): Promise<Session | null> {
  const session = await getSession(String(req.params.id));
  if (!session) res.status(404).json({ error: "session not found" });
  return session;
}

app.get("/api/health", (_req, res) => {
  res.json({
    claudeBin: config.claude.bin,
    claudeBinFound: config.claude.bin.includes(path.sep) ? existsSync(config.claude.bin) : "on PATH (unchecked)",
    model: config.claude.model,
    voice: voiceEnabled(),
  });
});

/** Create a session from the setup form. */
app.post("/api/sessions", upload.single("resume"), async (req, res) => {
  const type = req.body.interviewType as InterviewType;
  const session = await createSession({
    resumePdf: req.file?.buffer,
    jobDescription: req.body.jobDescription ?? "",
    recruiterNotes: req.body.recruiterNotes ?? "",
    interviewType: INTERVIEW_TYPES.includes(type) ? type : "recruiter-screen",
    persona: req.body.persona ?? "",
  });
  res.json({ id: session.id, voice: voiceEnabled() });
});

/** Interviewer reads the material and opens. */
app.post("/api/sessions/:id/start", async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const result = await withSessionLock(session.id, async () => {
    const reply = await interviewerTurn(session, OPENING_MESSAGE);
    await appendTranscript(session.id, { role: "interviewer", text: reply });
    return { reply, audio: await maybeSpeak(reply) };
  });
  res.json(result);
});

/** Candidate answers — either recorded audio (field "audio") or typed text (field "text"). */
app.post("/api/sessions/:id/turn", upload.single("audio"), async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;

  const answer = req.file
    ? await transcribe(req.file.buffer, req.file.mimetype, req.file.originalname)
    : String(req.body.text ?? "").trim();
  if (!answer) {
    res.status(400).json({ error: "empty answer (nothing transcribed)" });
    return;
  }

  const result = await withSessionLock(session.id, async () => {
    await appendTranscript(session.id, { role: "candidate", text: answer });
    const reply = await interviewerTurn(session, answer);
    await appendTranscript(session.id, { role: "interviewer", text: reply });
    return { transcript: answer, reply, audio: await maybeSpeak(reply) };
  });
  res.json(result);
});

/** End the interview; interviewer steps out of character and coaches. */
app.post("/api/sessions/:id/debrief", async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  const feedback = await withSessionLock(session.id, async () => {
    const text = await interviewerTurn(session, DEBRIEF_MESSAGE);
    await appendTranscript(session.id, { role: "coach", text });
    await writeFile(path.join(sessionDir(session.id), "feedback.md"), text);
    return text;
  });
  res.json({ feedback, costUsd: session.costUsd });
});

app.get("/api/sessions/:id/transcript", async (req, res) => {
  const session = await loadSession(req, res);
  if (!session) return;
  res.json({ session, transcript: await readTranscript(session.id) });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`interview-prepper on http://localhost:${config.port}`);
  console.log(`  claude: ${config.claude.bin} (model ${config.claude.model})`);
  console.log(`  voice:  ${voiceEnabled() ? "ElevenLabs on" : "off — set ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in .env"}`);
});
