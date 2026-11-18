import { spawn } from "node:child_process";
import { config } from "./config.js";

export interface AgentReply {
  text: string;
  costUsd: number;
}

interface TurnOptions {
  /** Working dir for the CLI — the session folder holding resume.pdf etc. */
  cwd: string;
  /** Claude Code session UUID; first turn creates it, later turns resume it. */
  claudeSessionId: string;
  isFirstTurn: boolean;
  systemPrompt: string;
  message: string;
}

/**
 * One conversational turn = one headless `claude -p` run.
 *
 * Flags worth knowing:
 *  --safe-mode   skip CLAUDE.md, hooks, plugins, MCP, skills. Keeps your own
 *                Claude Code customisations out of the interviewer's head
 *                while still using your normal subscription login.
 *                (--bare would also do this but only accepts ANTHROPIC_API_KEY.)
 *  --tools Read  the agent can only read files in the session folder.
 *  --session-id / --resume   conversation memory lives in Claude Code itself.
 *
 * The message goes in on stdin to avoid argv quoting issues.
 */
export function runTurn(opts: TurnOptions): Promise<AgentReply> {
  const args = [
    "-p",
    "--safe-mode",
    "--output-format", "json",
    "--model", config.claude.model,
    "--tools", "Read",
    "--allowedTools", "Read",
    "--system-prompt", opts.systemPrompt,
    opts.isFirstTurn ? "--session-id" : "--resume", opts.claudeSessionId,
  ];
  if (config.claude.effort) args.push("--effort", config.claude.effort);

  return new Promise((resolve, reject) => {
    const child = spawn(config.claude.bin, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude timed out after ${config.claude.turnTimeoutMs} ms`));
    }, config.claude.turnTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`could not start claude (${config.claude.bin}): ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const out = JSON.parse(stdout);
        if (out.is_error) throw new Error(out.result || out.subtype || "claude returned an error");
        resolve({ text: String(out.result ?? "").trim(), costUsd: out.total_cost_usd ?? 0 });
      } catch (err) {
        const detail = stderr.trim() || stdout.trim().slice(0, 500);
        reject(new Error(`claude exited ${code}: ${(err as Error).message}\n${detail}`));
      }
    });

    child.stdin.end(opts.message);
  });
}
