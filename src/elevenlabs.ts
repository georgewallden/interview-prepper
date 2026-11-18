import { config } from "./config.js";

const API = "https://api.elevenlabs.io/v1";

function key(): string {
  if (!config.elevenlabs.apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  return config.elevenlabs.apiKey;
}

/** Speech-to-text (Scribe). Accepts whatever the browser recorded (webm/opus, mp4, wav). */
export async function transcribe(audio: Buffer, mimeType: string, filename = "answer.webm"): Promise<string> {
  const form = new FormData();
  form.append("model_id", config.elevenlabs.sttModel);
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), filename);

  const res = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": key() },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Text-to-speech. Returns MP3 bytes. */
export async function speak(text: string): Promise<Buffer> {
  if (!config.elevenlabs.voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");

  const url = `${API}/text-to-speech/${config.elevenlabs.voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: config.elevenlabs.ttsModel }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
