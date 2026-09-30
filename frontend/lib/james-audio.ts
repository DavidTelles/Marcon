export const VOICE_SAMPLE_RATE = 16000;

export function pcmWave(chunks: Float32Array[], rate = VOICE_SAMPLE_RATE) {
  const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const wave = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(wave);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF"); view.setUint32(4, wave.byteLength - 8, true);
  write(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, sampleCount * 2, true);
  let at = 44;
  for (const chunk of chunks) for (const sample of chunk) {
    view.setInt16(at, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
    at += 2;
  }
  return wave;
}

export class VoiceActivity {
  private noise = 0.003;
  private preRoll: Float32Array[] = [];
  private captured: Float32Array[] = [];
  private consecutive = 0;
  private silence = 0;
  private samples = 0;
  active = false;

  push(chunk: Float32Array): "start" | "end" | null {
    let sum = 0;
    for (const sample of chunk) sum += sample * sample;
    const rms = Math.sqrt(sum / chunk.length);
    const voiced = rms > Math.max(0.014, this.noise * 3.2);
    if (!this.active && !voiced) this.noise = this.noise * 0.98 + rms * 0.02;
    if (!this.active) {
      this.preRoll.push(chunk);
      if (this.preRoll.length > 4) this.preRoll.shift();
      this.consecutive = voiced ? this.consecutive + 1 : 0;
      if (this.consecutive < 2) return null;
      this.active = true;
      this.captured = this.preRoll;
      this.samples = this.captured.reduce((total, item) => total + item.length, 0);
      this.preRoll = [];
      return "start";
    }
    this.captured.push(chunk);
    this.samples += chunk.length;
    this.silence = voiced ? 0 : this.silence + chunk.length;
    if (this.silence >= VOICE_SAMPLE_RATE * 0.7 || this.samples >= VOICE_SAMPLE_RATE * 15) {
      this.active = false;
      this.silence = 0;
      this.consecutive = 0;
      return "end";
    }
    return null;
  }

  take() {
    const chunks = this.captured;
    this.captured = [];
    this.samples = 0;
    return chunks;
  }

  reset() {
    this.active = false;
    this.preRoll = [];
    this.captured = [];
    this.consecutive = 0;
    this.silence = 0;
    this.samples = 0;
  }
}
