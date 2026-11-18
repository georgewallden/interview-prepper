import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { Session } from "./sessions.js";

const INTERVIEW_TYPE_LABELS: Record<Session["interviewType"], string> = {
  "recruiter-screen": "a recruiter phone screen",
  "hiring-manager": "a hiring manager interview",
  behavioral: "a behavioral interview",
  technical: "a technical interview (verbal, no live coding)",
  panel: "a panel interview",
};

/** Fills prompts/interviewer.md. Re-read every turn so you can tweak it live. */
export async function buildSystemPrompt(session: Session): Promise<string> {
  const template = await readFile(path.join(config.promptsDir, "interviewer.md"), "utf8");
  return template
    .replaceAll("{{interview_type}}", INTERVIEW_TYPE_LABELS[session.interviewType])
    .replaceAll("{{persona}}", session.persona || "a warm but sharp interviewer");
}

export const OPENING_MESSAGE =
  "[SYSTEM] The candidate has joined. Read resume.pdf, job-description.md and recruiter-notes.md now, then open the interview in character.";

export const DEBRIEF_MESSAGE = `[SYSTEM] The interview is over. Step out of character and act as the candidate's coach.
Write a debrief in Markdown with these sections:
## Overall read
## What landed
## What to tighten (quote their words, then a stronger version)
## Likely follow-ups they should prep
## Gaps vs. the job description
Be specific and honest. This text is shown on screen, not spoken.`;
