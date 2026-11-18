import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Find the real Claude Code binary.
 *
 * On Windows, npm installs `claude.cmd` / `claude.ps1` shims. Spawning a .cmd
 * needs `shell: true`, which mangles multi-line arguments (our system prompt),
 * so we resolve the native claude.exe the shim points at instead.
 */
function resolveClaudeBin(): string {
  const fromEnv = process.env.CLAUDE_BIN?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== "win32") return "claude";

  try {
    const hits = execFileSync("where", ["claude.cmd"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
    for (const shim of hits) {
      const exe = path.join(
        path.dirname(shim),
        "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe",
      );
      if (existsSync(exe)) return exe;
    }
  } catch {
    // fall through
  }
  return "claude.exe"; // native installer puts this on PATH
}

export const config = {
  port: Number(process.env.PORT ?? 5178),
  sessionsDir: path.join(ROOT, "sessions"),
  promptsDir: path.join(ROOT, "prompts"),

  claude: {
    bin: resolveClaudeBin(),
    model: process.env.CLAUDE_MODEL || "sonnet",
    effort: process.env.CLAUDE_EFFORT || "",
    turnTimeoutMs: 180_000,
  },

  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? "",
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
    ttsModel: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5",
    sttModel: process.env.ELEVENLABS_STT_MODEL || "scribe_v1",
  },
};

export const voiceEnabled = () =>
  Boolean(config.elevenlabs.apiKey && config.elevenlabs.voiceId);
