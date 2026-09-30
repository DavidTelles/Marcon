import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { localVoiceStatus, speakLocal, transcribeLocalWave } from "../lib/james-local-voice";

test("Piper gera WAV e whisper.cpp transcreve áudio sintético local", async () => {
  test.skip(!process.env.JAMES_TEST_WAVE, "Defina JAMES_TEST_WAVE e os caminhos dos modelos locais.");
  expect(await localVoiceStatus()).toEqual({ transcribe: true, speak: true });
  const first = await speakLocal("Você precisa do M6 ou do M8?");
  const second = await speakLocal("Encontrei o parafuso sextavado.");
  expect(first.audio.toString("ascii", 0, 4)).toBe("RIFF");
  expect(second.processingMs).toBeLessThan(first.processingMs);
  const wave = await readFile(process.env.JAMES_TEST_WAVE!);
  const result = await transcribeLocalWave(wave);
  expect(result.transcript.toLowerCase()).toContain("parafuso");
  expect(result.processingMs).toBeGreaterThan(0);
  console.log(JSON.stringify({ ttsColdMs: first.processingMs, ttsWarmMs: second.processingMs, asrMs: result.processingMs, transcript: result.transcript }));
});
