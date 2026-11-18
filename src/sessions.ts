import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export type InterviewType = "recruiter-screen" | "hiring-manager" | "behavioral" | "technical" | "panel";

export interface Session {
  id: string;
  /** Claude Code's own session UUID, reused with --resume each turn. */
  claudeSessionId: string;
  started: boolean;
  interviewType: InterviewType;
  persona: string;
  createdAt: string;
  costUsd: number;
}

export interface NewSessionInput {
  resumePdf?: Buffer;
  jobDescription: string;
  recruiterNotes: string;
  interviewType: InterviewType;
  persona: string;
}

export interface TranscriptLine {
  at: string;
  role: "interviewer" | "candidate" | "coach";
  text: string;
}

export const sessionDir = (id: string) => path.join(config.sessionsDir, id);
const metaPath = (id: string) => path.join(sessionDir(id), "session.json");

/**
 * Lays out the session folder the agent works in:
 *   resume.pdf            (Claude Code reads PDFs natively via its Read tool)
 *   job-description.md
 *   recruiter-notes.md
 *   session.json          (server-side state, not for the agent)
 *   transcript.jsonl
 */
export async function createSession(input: NewSessionInput): Promise<Session> {
  const session: Session = {
    id: randomUUID(),
    claudeSessionId: randomUUID(),
    started: false,
    interviewType: input.interviewType,
    persona: input.persona,
    createdAt: new Date().toISOString(),
    costUsd: 0,
  };
  const dir = sessionDir(session.id);
  await mkdir(dir, { recursive: true });

  if (input.resumePdf) await writeFile(path.join(dir, "resume.pdf"), input.resumePdf);
  await writeFile(path.join(dir, "job-description.md"), input.jobDescription || "(none provided)\n");
  await writeFile(path.join(dir, "recruiter-notes.md"), input.recruiterNotes || "(none provided)\n");
  await saveSession(session);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null; // also blocks path traversal
  try {
    return JSON.parse(await readFile(metaPath(id), "utf8")) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session): Promise<void> {
  await writeFile(metaPath(s.id), JSON.stringify(s, null, 2));
}

export async function appendTranscript(id: string, line: Omit<TranscriptLine, "at">): Promise<void> {
  const entry: TranscriptLine = { at: new Date().toISOString(), ...line };
  await appendFile(path.join(sessionDir(id), "transcript.jsonl"), JSON.stringify(entry) + "\n");
}

export async function readTranscript(id: string): Promise<TranscriptLine[]> {
  try {
    const raw = await readFile(path.join(sessionDir(id), "transcript.jsonl"), "utf8");
    return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** One claude process per session at a time — turns queue up instead of racing --resume. */
const locks = new Map<string, Promise<unknown>>();
export function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(id, next.catch(() => {}));
  return next;
}
