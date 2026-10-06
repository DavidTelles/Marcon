import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { ActionError } from "./permissions";
import { speechText } from "./james-voice";

const run = promisify(execFile);
const config = () => ({
  whisperBin: process.env.JAMES_WHISPER_BIN,
  whisperModel: process.env.JAMES_WHISPER_MODEL,
  piperBin: process.env.JAMES_PIPER_BIN,
  piperModel: process.env.JAMES_PIPER_MODEL,
  piperConfig: process.env.JAMES_PIPER_CONFIG,
});

export async function localVoiceStatus() {
  if (process.env.VERCEL) return { transcribe: false, speak: false };
  const paths = config();
  const exists = async (path?: string) => {
    if (!path) return false;
    try { await access(path); return true; } catch { return false; }
  };
  return {
    transcribe: await exists(paths.whisperBin) && await exists(paths.whisperModel),
    speak: await exists(paths.piperBin) && await exists(paths.piperModel) && await exists(paths.piperConfig),
  };
}

function tempDirectory(name: string) {
  return mkdtemp(join(tmpdir(), `james-${name}-`));
}
async function removeTemp(path: string) {
  // The directory is created by mkdtemp in the OS temp root, never from user input.
  if (!resolve(path).startsWith(resolve(tmpdir()) + sep))
    throw new Error("Diretório temporário inválido.");
  await rm(path, { recursive: true, force: true });
}

export function validateVoiceWave(buffer: Buffer) {
  if (buffer.length < 44 || buffer.length > 550_000 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE")
    throw new ActionError("Áudio WAV inválido ou longo demais.", 422);
  let offset = 12, format = 0, channels = 0, rate = 0, bits = 0, samples = 0;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) throw new ActionError("Áudio WAV incompleto.", 422);
    if (chunk === "fmt " && size >= 16) {
      format = buffer.readUInt16LE(offset + 8);
      channels = buffer.readUInt16LE(offset + 10);
      rate = buffer.readUInt32LE(offset + 12);
      bits = buffer.readUInt16LE(offset + 22);
    }
    if (chunk === "data") samples += size;
    offset += 8 + size + (size % 2);
  }
  if (format !== 1 || channels !== 1 || rate !== 16000 || bits !== 16 || samples < 6400 || samples > 480000)
    throw new ActionError("Envie PCM mono de 16 kHz, com até 15 segundos de fala.", 422);
  return samples / 32000;
}

let asrBusy = false;
export async function transcribeLocalWave(wave: Buffer, signal?: AbortSignal) {
  validateVoiceWave(wave);
  const { whisperBin, whisperModel } = config();
  if (!(await localVoiceStatus()).transcribe || !whisperBin || !whisperModel)
    throw new ActionError("Transcrição local não configurada no servidor.", 503);
  if (asrBusy) throw new ActionError("Transcrição ocupada. Tente novamente.", 429);
  asrBusy = true;
  const dir = await tempDirectory("asr");
  const start = performance.now();
  try {
    const input = join(dir, "input.wav"), output = join(dir, "result");
    await writeFile(input, wave);
    await run(whisperBin, ["-m", whisperModel, "-f", input, "-l", "pt", "-t", "6", "-nt", "-otxt", "-of", output, "-np"], {
      timeout: 35_000, windowsHide: true, maxBuffer: 16_000, signal,
    });
    const transcript = (await readFile(output + ".txt", "utf8")).trim().slice(0, 2000);
    if (!transcript) throw new ActionError("Não detectei palavras. Tente novamente ou digite.", 422);
    return { transcript, processingMs: Math.round(performance.now() - start) };
  } catch (error) {
    if (error instanceof ActionError) throw error;
    throw new ActionError("Falha na transcrição local. Use o texto ou tente novamente.", 503);
  } finally {
    asrBusy = false;
    await removeTemp(dir);
  }
}

type Task = { file: string; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
class PiperWorker {
  private child: ChildProcessWithoutNullStreams;
  private stdout = "";
  private task: Task | null = null;
  private queue: Promise<void> = Promise.resolve();
  constructor(bin: string, model: string, configuration: string) {
    this.child = spawn(bin, ["--model", model, "--config", configuration, "--json-input", "--quiet"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.stdout += chunk.toString("utf8");
      let newline;
      while ((newline = this.stdout.indexOf("\n")) >= 0) {
        const filename = this.stdout.slice(0, newline).trim();
        this.stdout = this.stdout.slice(newline + 1);
        const task = this.task;
        if (task && resolve(filename) === resolve(task.file)) {
          clearTimeout(task.timer);
          this.task = null;
          task.resolve();
        }
      }
    });
    this.child.stderr.resume();
    this.child.on("error", () => this.fail());
    this.child.on("exit", () => this.fail());
  }
  private fail() {
    const task = this.task;
    if (task) { clearTimeout(task.timer); task.reject(new Error("Piper indisponível.")); this.task = null; }
    if (globalPiper.worker === this) globalPiper.worker = undefined;
  }
  synthesize(text: string, file: string) {
    const job = this.queue.then(() => new Promise<void>((resolveTask, rejectTask) => {
      if (!this.child.stdin.writable) return rejectTask(new Error("Piper indisponível."));
      const timer = setTimeout(() => { this.child.kill(); rejectTask(new Error("Piper demorou a responder.")); }, 12_000);
      this.task = { file, resolve: resolveTask, reject: rejectTask, timer };
      this.child.stdin.write(JSON.stringify({ text, output_file: file }) + "\n");
    }));
    this.queue = job.catch(() => {});
    return job;
  }
}
const globalPiper = globalThis as typeof globalThis & { worker?: PiperWorker };

export async function speakLocal(text: string) {
  if (!text.trim() || text.length > 700) throw new ActionError("Resposta de voz inválida.", 422);
  const { piperBin, piperModel, piperConfig } = config();
  if (!(await localVoiceStatus()).speak || !piperBin || !piperModel || !piperConfig)
    throw new ActionError("Voz local não configurada no servidor.", 503);
  const dir = await tempDirectory("tts");
  const start = performance.now();
  try {
    const file = join(dir, "answer.wav");
    const worker = globalPiper.worker ??= new PiperWorker(piperBin, piperModel, piperConfig);
    await worker.synthesize(speechText(text), file);
    const audio = await readFile(file);
    if (audio.length < 44 || audio.length > 3_000_000) throw new Error("Áudio inválido.");
    return { audio, processingMs: Math.round(performance.now() - start) };
  } catch {
    throw new ActionError("Falha na síntese local. A resposta continua em texto.", 503);
  } finally {
    await removeTemp(dir);
  }
}
