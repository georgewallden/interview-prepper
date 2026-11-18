const $ = (id) => document.getElementById(id);
let sessionId = null;
let busy = false;

// ---------- helpers ----------
function addLine(role, text) {
  const li = document.createElement("li");
  li.className = role;
  li.textContent = text;
  $("log").appendChild(li);
  li.scrollIntoView({ behavior: "smooth", block: "end" });
}

function setStatus(text) {
  $("status").textContent = text;
}

function setBusy(on, label) {
  busy = on;
  $("mic").disabled = on;
  $("text").disabled = on;
  $("debrief").disabled = on;
  if (label) setStatus(label);
}

async function api(path, body) {
  const res = await fetch(path, { method: "POST", body });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function play(base64) {
  if (!base64) return Promise.resolve();
  const player = $("player");
  player.src = `data:audio/mpeg;base64,${base64}`;
  return new Promise((resolve) => {
    player.onended = resolve;
    player.onerror = resolve;
    player.play().catch(resolve);
  });
}

async function handleReply({ transcript, reply, audio }) {
  if (transcript) addLine("candidate", transcript);
  addLine("interviewer", reply);
  setStatus(audio ? "Interviewer speaking…" : "Your turn.");
  await play(audio);
  setBusy(false, "Your turn — click the mic or hold Space.");
}

async function send(formData, label) {
  setBusy(true, label);
  try {
    await handleReply(await api(`/api/sessions/${sessionId}/turn`, formData));
  } catch (err) {
    setBusy(false, `Error: ${err.message}`);
  }
}

// ---------- setup ----------
$("setup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  if (!data.get("resume")?.size) data.delete("resume");

  $("setup").hidden = true;
  $("interview").hidden = false;
  setBusy(true, "Interviewer is reading your materials…");

  try {
    ({ id: sessionId } = await api("/api/sessions", data));
    await handleReply(await api(`/api/sessions/${sessionId}/start`));
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

// ---------- typed answers ----------
$("text-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text || busy) return;
  $("text").value = "";
  const fd = new FormData();
  fd.append("text", text);
  send(fd, "Thinking…");
});

// ---------- voice answers ----------
let recorder = null;
let chunks = [];

async function startRecording() {
  if (busy || recorder) return;
  $("player").pause();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);
  chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType });
    recorder = null;
    $("mic").classList.remove("live");
    const fd = new FormData();
    fd.append("audio", blob, "answer.webm");
    send(fd, "Transcribing + thinking…");
  };
  recorder.start();
  $("mic").classList.add("live");
  setStatus("Listening… click again or release Space when done.");
}

function stopRecording() {
  if (recorder?.state === "recording") recorder.stop();
}

$("mic").addEventListener("click", () => (recorder ? stopRecording() : startRecording()));

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat && !$("interview").hidden && document.activeElement !== $("text")) {
    e.preventDefault();
    startRecording();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && document.activeElement !== $("text")) stopRecording();
});

// ---------- debrief ----------
$("debrief").addEventListener("click", async () => {
  setBusy(true, "Writing your feedback…");
  try {
    const { feedback } = await api(`/api/sessions/${sessionId}/debrief`);
    $("interview").hidden = true;
    $("feedback").hidden = false;
    $("feedback-text").textContent = feedback;
  } catch (err) {
    setBusy(false, `Error: ${err.message}`);
  }
});
