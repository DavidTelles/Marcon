"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { pcmWave, VoiceActivity, VOICE_SAMPLE_RATE } from "@/lib/james-audio";
import { wakeCommand } from "@/lib/james-voice";

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};
type BrowserRecognitionConstructor = new () => BrowserRecognition;
function browserRecognizer() {
  const browser = window as typeof window & { SpeechRecognition?: BrowserRecognitionConstructor; webkitSpeechRecognition?: BrowserRecognitionConstructor };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

function resample(input: Float32Array, sourceRate: number) {
  if (sourceRate === VOICE_SAMPLE_RATE) return input;
  const result = new Float32Array(Math.round(input.length * VOICE_SAMPLE_RATE / sourceRate));
  for (let i = 0; i < result.length; i++) {
    const position = i * sourceRate / VOICE_SAMPLE_RATE;
    const left = Math.floor(position), fraction = position - left;
    result[i] = input[left] * (1 - fraction) + (input[Math.min(left + 1, input.length - 1)] || 0) * fraction;
  }
  return result;
}

export function useJamesLocalVoice(onCommand: (text: string) => void, onWake: () => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptFinal, setTranscriptFinal] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [browserFallback, setBrowserFallback] = useState(false);
  const [mode, setMode] = useState<"server" | "browser" | null>(null);
  const refs = useRef({ onCommand, onWake, onError });
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const worklet = useRef<AudioWorkletNode | null>(null);
  const controller = useRef<AbortController | null>(null);
  const recognition = useRef<BrowserRecognition | null>(null);
  const browserTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartBrowser = useRef<(() => void) | null>(null);
  const gate = useRef(new VoiceActivity());
  const active = useRef(false), suspended = useRef(false), busy = useRef(false), session = useRef(0), conversation = useRef(0);
  useEffect(() => { refs.current = { onCommand, onWake, onError }; }, [onCommand, onWake, onError]);

  const acceptFinal = useCallback((final: string) => {
    const command = wakeCommand(final);
    if (command !== null) {
      conversation.current = Date.now() + 90_000; refs.current.onWake();
      setTranscript(final); setTranscriptFinal(true);
      if (command) refs.current.onCommand(command);
    } else if (Date.now() < conversation.current) {
      conversation.current = Date.now() + 90_000;
      setTranscript(final); setTranscriptFinal(true);
      if (final) refs.current.onCommand(final);
    }
  }, []);

  const detachBrowser = useCallback(() => {
    if (browserTimer.current) clearTimeout(browserTimer.current);
    browserTimer.current = null;
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onstart = current.onsoundstart = current.onsoundend = current.onend = null;
      current.onresult = current.onerror = null;
      current.abort();
    }
    setCapturing(false); setHearing(false);
  }, []);

  const stop = useCallback(() => {
    session.current++;
    active.current = false; suspended.current = false; busy.current = false;
    controller.current?.abort(); controller.current = null;
    detachBrowser(); restartBrowser.current = null;
    gate.current.reset();
    worklet.current?.disconnect(); worklet.current = null;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    void context.current?.close(); context.current = null;
    setListening(false); setCapturing(false); setHearing(false); setTranscribing(false);
    setTranscript(""); setTranscriptFinal(false); conversation.current = 0;
    setMode(null);
  }, [detachBrowser]);
  const suspend = useCallback(() => { suspended.current = true; gate.current.reset(); detachBrowser(); setHearing(false); }, [detachBrowser]);
  const resume = useCallback(() => { suspended.current = false; restartBrowser.current?.(); }, []);

  const startBrowser = () => {
    stop(); setPaused(false); setPermissionDenied(false); refs.current.onError("");
    const C = browserRecognizer();
    if (!C) { setBrowserFallback(false); refs.current.onError("Este navegador não oferece reconhecimento de fala. Continue por texto."); return; }
    const generation = session.current;
    active.current = true; setListening(true); setMode("browser"); setBrowserFallback(false);
    let failures = 0;
    const run = () => {
      if (!active.current || suspended.current || document.hidden || recognition.current) return;
      const current = new C();
      recognition.current = current;
      current.lang = "pt-BR";
      current.continuous = true;
      current.interimResults = true;
      let startedAt = Date.now(), silent = false;
      current.onstart = () => { startedAt = Date.now(); setCapturing(true); };
      current.onsoundstart = () => setHearing(true);
      current.onsoundend = () => setHearing(false);
      current.onresult = (event) => {
        failures = 0;
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          const words = result[0]?.transcript?.trim() || "";
          if (Date.now() < conversation.current || wakeCommand(words) !== null) {
            setTranscript(words); setTranscriptFinal(result.isFinal);
          }
          if (result.isFinal && generation === session.current && !suspended.current) acceptFinal(words);
        }
      };
      current.onerror = (event) => {
        if (event.error === "no-speech") { silent = true; return; }
        const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
        stop(); setPermissionDenied(denied);
        refs.current.onError(denied ? "Microfone sem permissão. Use texto ou permita o acesso." : `Reconhecimento do navegador indisponível (${event.error}). Continue por texto.`);
      };
      current.onend = () => {
        if (recognition.current !== current) return;
        recognition.current = null; setCapturing(false); setHearing(false);
        failures = silent || Date.now() - startedAt > 1500 ? 0 : failures + 1;
        if (active.current && failures <= 5)
          browserTimer.current = setTimeout(run, Math.min(500 * 2 ** failures, 8000));
        else if (active.current) { stop(); refs.current.onError("Escuta pausada pelo navegador. Ative novamente."); }
      };
      try { current.start(); }
      catch { stop(); refs.current.onError("Não foi possível iniciar o microfone. Continue por texto."); }
    };
    restartBrowser.current = run;
    run();
  };

  const start = async () => {
    stop(); setPaused(false); setPermissionDenied(false); setBrowserFallback(false); refs.current.onError("");
    const generation = session.current;
    try {
      const health = await fetch("/api/james/voice", { cache: "no-store" });
      if (health.status === 401) throw new Error("Sua sessão terminou. Faça login novamente.");
      if (!health.ok || !(await health.json()).transcribe) {
        setBrowserFallback(!!browserRecognizer());
        throw new Error(browserRecognizer() ? "Transcrição local indisponível no servidor. Você pode ativar o reconhecimento do navegador abaixo." : "Transcrição local indisponível no servidor. Este navegador não oferece reconhecimento de fala; continue por texto.");
      }
      if (generation !== session.current) return;
      const media = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
      } });
      if (generation !== session.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const audio = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE }); context.current = audio;
      await audio.audioWorklet.addModule("/james-voice-worklet.js");
      if (generation !== session.current) return;
      const source = audio.createMediaStreamSource(media), node = new AudioWorkletNode(audio, "james-voice-capture");
      worklet.current = node; source.connect(node); node.connect(audio.destination);
      await audio.resume();
      active.current = true; setListening(true); setCapturing(true); setMode("server");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!active.current || suspended.current || document.hidden || busy.current) return;
        const boundary = gate.current.push(resample(event.data, audio.sampleRate));
        if (boundary === "start") { setHearing(true); setTranscriptFinal(false); }
        if (boundary !== "end") return;
        setHearing(false);
        const wave = pcmWave(gate.current.take());
        busy.current = true; setTranscribing(true);
        const abort = new AbortController(); controller.current = abort;
        void fetch("/api/james/voice", {
          method: "POST", headers: { "Content-Type": "audio/wav" }, body: wave,
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(40_000)]),
        }).then(async (response) => {
          const data = await response.json();
          if (response.status === 401) {
            stop(); refs.current.onError("Sua sessão terminou. Faça login novamente."); return;
          }
          if (!response.ok) throw new Error(data.error || "Falha na transcrição.");
          if (generation !== session.current) return;
          acceptFinal(String(data.transcript || "").trim());
        }).catch((error) => {
          if (generation === session.current && !abort.signal.aborted) {
            stop();
            setBrowserFallback(!!browserRecognizer());
            refs.current.onError(`${error instanceof Error ? error.message : "Falha na transcrição."} Você pode usar o reconhecimento do navegador ou continuar por texto.`);
          }
        }).finally(() => {
          if (generation === session.current) { busy.current = false; setTranscribing(false); }
        });
      };
    } catch (error) {
      if (generation !== session.current) return;
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      stop(); setPermissionDenied(denied);
      refs.current.onError(denied ? "Microfone sem permissão. Permita o acesso ou use texto." : error instanceof Error ? error.message : "Falha no microfone. Use texto.");
    }
  };

  useEffect(() => {
    const visibility = () => { setHidden(document.hidden); if (document.hidden) { gate.current.reset(); detachBrowser(); setHearing(false); } else restartBrowser.current?.(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", stop);
    return () => { stop(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", stop); };
  }, [stop, detachBrowser]);
  return {
    listening, capturing, hearing, transcribing, transcript, transcriptFinal, hidden, paused, permissionDenied, browserFallback, mode,
    start, startBrowser, stop, suspend, resume,
    pause: () => { stop(); setPaused(true); },
  };
}
