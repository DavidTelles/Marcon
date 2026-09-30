import { expect, test } from "@playwright/test";
import { pcmWave, VoiceActivity, VOICE_SAMPLE_RATE } from "../lib/james-audio";
import { validateVoiceWave } from "../lib/james-local-voice";

const chunk = (amplitude: number) => Float32Array.from({ length: 2048 }, (_, i) => amplitude * Math.sin(i / 8));

test("detecção leve separa início e fim e WAV segue o contrato do servidor", () => {
  const gate = new VoiceActivity();
  for (let i = 0; i < 4; i++) expect(gate.push(chunk(0.002))).toBeNull();
  expect(gate.push(chunk(0.12))).toBeNull();
  expect(gate.push(chunk(0.12))).toBe("start");
  let ended = false;
  for (let i = 0; i < 7; i++) ended ||= gate.push(chunk(0)) === "end";
  expect(ended).toBe(true);
  const wave = pcmWave(gate.take());
  expect(validateVoiceWave(Buffer.from(wave))).toBeGreaterThan(0.2);
  const view = new DataView(wave);
  expect(view.getUint32(24, true)).toBe(VOICE_SAMPLE_RATE);
  expect(() => validateVoiceWave(Buffer.from(wave.slice(0, 100)))).toThrow();
});
