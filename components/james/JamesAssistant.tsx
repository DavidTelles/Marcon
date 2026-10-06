"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { JamesCharacter, type JamesCharacterState } from "./JamesCharacter";
import { useDemoStore } from "@/components/workspace/demo-store";
import { useJamesLocalVoice } from "./useJamesLocalVoice";
import { choiceIndex, explicitConfirmation } from "@/lib/james-voice";
import type { JamesCart } from "@/lib/james-actions";
import type { JamesReportContext } from "@/lib/james-reports";
import { marcoUICommand } from "@/lib/marco-ui";
import { readMarcoReply } from "@/lib/marco-stream";
import type { MarcoMetrics } from "@/lib/marco-ollama.mjs";
import styles from "./JamesAssistant.module.css";
import { useJamesPet, type Dock } from "./useJamesPet";
type Reply = {
  source?: "ollama";
  metrics?: MarcoMetrics;
  reply?: string;
  error?: string;
  cart?: JamesCart;
  items?: {
    code: string;
    name: string;
    quantity: number;
    unit: string;
    packSize: number;
    available: number;
  }[];
  proposedItems?: Reply["items"];
  draft?: {
    action: string;
    query: string;
    purpose: string | null;
    appearance: string | null;
    material: string | null;
    dimensions: string | null;
    quantity: number | null;
    unit: string | null;
    block: string | null;
    pending: string;
    version: string;
  };
  confirmationToken?: string;
  confirmationKind?: "operation" | "cart";
  operationCompleted?: boolean;
  clarificationToken?: string;
  formToken?: string;
  reportContext?: JamesReportContext;
  quantityPrompt?: boolean;
  submitted?: boolean;
  result?: { ids?: number[]; id?: number };
  href?: string;
  hrefLabel?: string;
  exportHref?: string;
  navigate?: boolean;
  choices?: { code: string; name: string }[];
  moreOptions?: boolean;
  dashboard?: {
    scope: string;
    period: string;
    updatedAt: string;
    metrics: {
      id: string;
      label: string;
      value: number | null;
      unit: string;
      definition: string;
    }[];
  };
};
export default function JamesAssistant({ userId }: { userId: string }) {
  const { cart, setCart } = useDemoStore();
  const pathname = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [authorized, setAuthorized] = useState(true),
    [input, setInput] = useState(""),
    [state, setState] = useState<JamesCharacterState>("idle"),
    [error, setError] = useState("");
  const [role, setRole] = useState("");
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [speechError, setSpeechError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState("interpretando");
  const [metrics, setMetrics] = useState<MarcoMetrics>({});
  const [uiReview, setUIReview] = useState<string | null>(null);
  const uiConfirmation = useRef<(() => string) | null>(null);
  const browserSpeech = useRef<SpeechSynthesisUtterance | null>(null);
  const localTTS = useRef<boolean | null>(null);
  useEffect(() => {
    if (state !== "processing") return;
    const started = performance.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((performance.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [state]);
  const [clarification, setClarification] = useState<string | null>(null);
  const [formToken, setFormToken] = useState<string | null>(null);
  const reportContextRef = useRef<JamesReportContext | undefined>(undefined);
  const navigation = useRef<string[]>([]);
  useEffect(() => {
    if (navigation.current.at(-1) !== pathname)
      navigation.current.push(pathname);
    reportContextRef.current = undefined;
  }, [pathname]);
  const [messages, setMessages] = useState<{ user?: string; answer?: Reply }[]>(
      [],
    ),
    [review, setReview] = useState<{
      token: string;
      cart: string;
      kind?: "operation" | "cart";
    } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    symbol = useRef<HTMLDivElement>(null),
    field = useRef<HTMLInputElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    log = useRef<HTMLDivElement>(null),
    pending = useRef<AbortController | null>(null),
    confirming = useRef(false),
    speech = useRef<HTMLAudioElement | null>(null),
    speechRequest = useRef<AbortController | null>(null),
    speechUrl = useRef<string | null>(null),
    lastSpeech = useRef(""),
    suppress = useRef(0),
    cartRef = useRef(cart),
    reviewRef = useRef(review);
  const {
    root: petRoot,
    dock,
    preferences,
    update: updatePreferences,
    tip,
    point,
    clearHighlight,
  } = useJamesPet(userId, pathname, open);
  const resumeVoice = useRef<() => void>(() => {});
  const command = useRef<(text: string) => void>(() => {});
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    cartRef.current = cart;
    reviewRef.current = review;
  }, [cart, review]);
  const stopSpeech = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    const wasSpeaking = !!speech.current || !!browserSpeech.current;
    if (browserSpeech.current) {
      browserSpeech.current.onend = browserSpeech.current.onerror = null;
      browserSpeech.current = null;
      window.speechSynthesis?.cancel();
    }
    speechRequest.current?.abort();
    speechRequest.current = null;
    if (speech.current) {
      speech.current.onended = null;
      speech.current.onerror = null;
      speech.current.pause();
      speech.current = null;
    }
    if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
    speechUrl.current = null;
    suppress.current = wasSpeaking ? Date.now() + 600 : 0;
    // Wait for the speaker tail before resuming recognition.
    if (wasSpeaking)
      resumeTimer.current = setTimeout(() => resumeVoice.current(), 650);
    else resumeVoice.current();
  }, []);
  const show = useCallback(() => {
    if (
      !dialog.current?.open &&
      !matchMedia("(prefers-reduced-motion: reduce), (update: slow)").matches
    )
      setState("waking");
    setOpen(true);
    dialog.current?.showModal();
  }, []);
  const voice = useJamesLocalVoice(
    (text) => {
      if (Date.now() < suppress.current) return;
      show();
      setInput(text);
      command.current(text);
    },
    () => {
      if (Date.now() < suppress.current) return;
      show();
      setState("listening");
    },
    (message) => {
      setError(message);
      // Microphone setup/failure must not cancel an authenticated request in flight.
      if (!pending.current && !speech.current) setState("idle");
    },
  );
  const stopVoice = voice.stop;
  function pause() {
    voice.pause();
    stopSpeech();
    pending.current?.abort();
    pending.current = null;
    setState("idle");
  }
  useEffect(() => {
    resumeVoice.current = voice.resume;
  }, [voice.resume]);
  function close() {
    clearHighlight();
    pending.current?.abort();
    pending.current = null;
    stopSpeech();
    setOpen(false);
    setState("idle");
    dialog.current?.close();
    launcher.current?.focus();
  }
  function speak(text: string) {
    if (!preferences.voice) return;
    lastSpeech.current = text;
    setSpeechError("");
    stopSpeech();
    // The microphone remains open but its gate is disabled until playback ends.
    voice.suspend();
    suppress.current = Infinity;
    const request = new AbortController();
    speechRequest.current = request;
    const finish = () => {
      if (speechRequest.current !== request) return;
      suppress.current = Date.now() + 800;
      speech.current = null;
      browserSpeech.current = null;
      speechRequest.current = null;
      if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
      speechUrl.current = null;
      resumeTimer.current = setTimeout(() => resumeVoice.current(), 850);
      setState(reviewRef.current ? "confirming" : "idle");
    };
    const browserSpeak = () => {
      if (!("speechSynthesis" in window))
        throw new Error("Este navegador não oferece leitura em áudio.");
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 1200));
      utterance.lang = "pt-BR";
      const selected = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase() === "pt-br");
      if (selected) utterance.voice = selected;
      browserSpeech.current = utterance;
      utterance.onend = finish;
      utterance.onerror = () => {
        finish();
        setSpeechError(
          "O navegador não conseguiu ler a resposta. Ela continua no texto.",
        );
      };
      window.speechSynthesis.speak(utterance);
      setState("speaking");
    };
    void (async () => {
      if (localTTS.current === null) {
        const status = await fetch("/api/james/voice", {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
          cache: "no-store",
        });
        if (!status.ok)
          throw new Error("Sess?o ou servi?o de voz indispon?vel.");
        localTTS.current = (await status.json()).speak === true;
      }
      if (request.signal.aborted) return null;
      if (!localTTS.current) {
        browserSpeak();
        return null;
      }
      return fetch("/api/james/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 700) }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(40000)]),
      });
    })()
      .then(async (response) => {
        if (!response) return;
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Voz local indisponível.");
        }
        if (request.signal.aborted) return;
        const url = URL.createObjectURL(await response.blob());
        if (request.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        speechUrl.current = url;
        const audio = new Audio(url);
        speech.current = audio;
        audio.onended = finish;
        audio.onerror = () => {
          finish();
          setSpeechError(
            "Falha na reprodução do áudio. A resposta continua no texto.",
          );
        };
        await audio.play();
        if (!audio.paused && speech.current === audio) setState("speaking");
      })
      .catch((cause) => {
        if (request.signal.aborted) return;
        finish();
        setSpeechError(
          `${cause instanceof Error ? cause.message : "Voz local indisponível."} A resposta continua no texto.`,
        );
      });
  }
  function minimize() {
    stopSpeech();
    setOpen(false);
    dialog.current?.close();
  }
  async function send(text: string, confirm = false, resolveToken?: string) {
    if (!text.trim()) return;
    const localCommand = text
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[.!?]+$/, "");
    if (
      [
        "pausar escuta",
        "desligar escuta",
        "ficar parado",
        "silenciar dicas",
        "ativar dicas",
        "recolher",
        "voltar",
      ].includes(localCommand)
    ) {
      if (localCommand.endsWith("escuta")) {
        pause();
        return;
      }
      if (localCommand === "recolher") {
        close();
        return;
      }
      if (localCommand === "voltar") {
        if (navigation.current.length > 1) {
          navigation.current.pop();
          minimize();
          router.push(navigation.current.at(-1)!);
        } else
          setError(
            "Não há uma tela anterior desta sessão. Diga abra catálogo ou histórico.",
          );
        return;
      }
      updatePreferences(
        localCommand === "ficar parado"
          ? { still: true }
          : { quiet: localCommand === "silenciar dicas" },
      );
      const reply =
        localCommand === "ficar parado"
          ? "Vou permanecer na posição segura."
          : localCommand === "silenciar dicas"
            ? "Dicas silenciadas."
            : "Dicas ativadas.";
      setMessages((m) => [...m, { answer: { reply } }]);
      speak(reply);
      return;
    }
    if (
      [
        "parar de falar",
        "interromper fala",
        "silencio",
        "interromper",
      ].includes(localCommand)
    ) {
      stopSpeech();
      if (localCommand === "interromper" && !confirming.current) {
        pending.current?.abort();
        pending.current = null;
      }
      setState(reviewRef.current ? "confirming" : "idle");
      return;
    }
    if (localCommand === "confirmar formulario") {
      const reply =
        uiConfirmation.current?.() ||
        "Não há formulário aguardando confirmação.";
      uiConfirmation.current = null;
      setUIReview(null);
      setMessages((m) => [...m, { answer: { reply } }]);
      speak(reply);
      return;
    }
    if (localCommand === "cancelar" && uiConfirmation.current) {
      uiConfirmation.current = null;
      setUIReview(null);
      const reply = "Envio do formulário cancelado.";
      setMessages((m) => [...m, { answer: { reply } }]);
      speak(reply);
      return;
    }
    if (!pending.current && !confirm && !formToken && !reviewRef.current) {
      const action = marcoUICommand(text);
      if (action) {
        uiConfirmation.current = action.confirm || null;
        setUIReview(action.confirm ? action.reply : null);
        setMessages((m) => [
          ...m,
          { user: text },
          { answer: { reply: action.reply } },
        ]);
        speak(action.reply);
        setInput("");
        return;
      }
    }
    uiConfirmation.current = null;
    setUIReview(null);
    const currentReview = reviewRef.current;
    if (/^(cancelar|cancele|nao|não)[.!]?$/i.test(text.trim())) {
      if (pending.current && confirming.current) {
        setError(
          "O envio já está em andamento. Aguarde o protocolo; depois use seus pedidos para solicitar cancelamento.",
        );
        return;
      }
      pending.current?.abort();
      pending.current = null;
      setClarification(null);
      setFormToken(null);
      setReview(null);
      reviewRef.current = null;
      setMessages((m) => [
        ...m,
        {
          answer: {
            reply: currentReview
              ? currentReview.kind === "operation"
                ? "Ação cancelada. Nenhuma operação foi enviada."
                : "Envio cancelado. Seu carrinho foi mantido."
              : "Não há envio aguardando confirmação. Para cancelar uma requisição já enviada, abra seus pedidos.",
          },
        },
      ]);
      setInput("");
      stopSpeech();
      setState("idle");
      return;
    }
    if (pending.current) {
      setError("Ainda estou processando. Use Interromper antes de corrigir.");
      return;
    }
    if (/^(?:repita|repita a resposta)[.!]?$/i.test(text.trim())) {
      const last = messages.findLast((m) => m.answer?.reply)?.answer?.reply;
      if (last) speak(last);
      return;
    }
    if (/^baixar relat[oó]rio[.!]?$/i.test(text.trim())) {
      const report = messages.findLast((m) => m.answer?.exportHref)?.answer
        ?.exportHref;
      if (report) await download(report);
      else setError("Peça primeiro uma exportação em PDF ou planilha.");
      return;
    }
    if (
      explicitConfirmation(text) ||
      /^(?:sim[, ]+)?confirmar a[cç][aã]o[.!]?$/i.test(text.trim()) ||
      (currentReview && /^sim[.!]?$/i.test(text.trim()))
    )
      confirm = true;
    if (
      confirm &&
      (!currentReview || currentReview.cart !== JSON.stringify(cartRef.current))
    ) {
      setError("Revise o carrinho antes de confirmar.");
      return;
    }
    if (!confirm) {
      setReview(null);
      reviewRef.current = null;
    }
    stopSpeech();
    setError("");
    setState("processing");
    setElapsed(0);
    setPhase(confirm ? "executando" : "interpretando");
    setMessages((m) => [...m.slice(-19), { user: text }]);
    setInput("");
    const controller = new AbortController();
    pending.current = controller;
    confirming.current = confirm;
    try {
      const r = await fetch("/api/james/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify(
          confirm
            ? {
                mode: "confirm",
                token: currentReview!.token,
                cart: cartRef.current,
                confirmation:
                  currentReview!.kind === "operation"
                    ? "confirmar acao"
                    : currentReview!.kind === "cart"
                      ? "confirmar carrinho"
                      : "confirmar requisicao",
              }
            : {
                message: text,
                page: pathname + window.location.search,
                cart: cartRef.current,
                formToken: formToken || undefined,
                reportContext: reportContextRef.current,
                history: messages
                  .slice(-6)
                  .map((m) => m.user || m.answer?.reply || ""),
                clarificationToken:
                  resolveToken ||
                  (clarification &&
                  (messages.at(-1)?.answer?.quantityPrompt ||
                    /^(?:mais opções|na verdade[, ]*\d+|corrija a quantidade|[\wÀ-ÿ]+(?:\s+(?:de\s+)?[\wÀ-ÿ]+){0,4})[.!]?$/i.test(
                      text.trim(),
                    ) ||
                    messages
                      .at(-1)
                      ?.answer?.choices?.some(
                        (p, index) =>
                          p.code === text.trim() || choiceIndex(text) === index,
                      ))
                    ? clarification
                    : undefined),
              },
        ),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(60000),
        ]),
      });
      const data = await readMarcoReply<Reply>(r, setPhase);
      setMetrics(data.metrics || {});
      if (controller.signal.aborted) return;
      if (r.status === 401) {
        stopVoice();
        close();
        setAuthorized(false);
        setMessages([]);
        setCart([]);
        return;
      }
      if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
      setClarification(data.clarificationToken || null);
      setFormToken(data.formToken || null);
      reportContextRef.current = data.reportContext || reportContextRef.current;
      if (data.cart) {
        setCart(data.cart);
        cartRef.current = data.cart;
      }
      const next = data.confirmationToken
        ? {
            token: data.confirmationToken,
            cart: JSON.stringify(data.cart),
            kind: data.confirmationKind,
          }
        : null;
      setReview(next);
      reviewRef.current = next;
      setMessages((m) => [...m, { answer: data }]);
      setState(
        next
          ? "confirming"
          : data.operationCompleted || data.submitted
            ? "success"
            : "idle",
      );
      if (data.operationCompleted || data.submitted) {
        window.dispatchEvent(new Event("marcon:workspace-updated"));
        router.refresh();
      }
      if (data.navigate && data.href) {
        minimize();
        router.push(data.href);
      } else if (data.reply) speak(data.reply);
    } catch (e) {
      if (!controller.signal.aborted) {
        const message = e instanceof Error ? e.message : "Falha de rede.";
        setError(message);
        setMessages((m) => [
          ...m,
          { answer: { reply: `Não consegui responder: ${message}` } },
        ]);
        setInput(text);
        setState(currentReview ? "confirming" : "idle");
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  useEffect(() => {
    command.current = (text) => {
      void send(text);
    };
  });
  useEffect(() => {
    const c = new AbortController();
    const verify = async () => {
      try {
        const r = await fetch("/api/james/chat", {
          signal: c.signal,
          cache: "no-store",
        });
        const data = await r.json();
        if (r.status === 401) {
          stopVoice();
          stopSpeech();
          pending.current?.abort();
          setAuthorized(false);
          setOpen(false);
          setMessages([]);
          setReview(null);
          dialog.current?.close();
        } else if (r.ok && data.userId !== userId) {
          stopVoice();
          stopSpeech();
          pending.current?.abort();
          setAuthorized(false);
          setMessages([]);
          dialog.current?.close();
        } else if (r.ok) {
          setRole(data.role);
          setProviderConfigured(data.providerConfigured !== false);
        }
      } catch {
        /* Every request also validates the session. */
      }
    };
    void verify();
    const hidden = () => {
      if (document.hidden) {
        stopSpeech();
        setState("idle");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("focus", verify);
    const timer = setInterval(verify, 30000);
    const logout = (event: Event) => {
      if (
        !(event.target instanceof HTMLFormElement) ||
        new URL(event.target.action, location.href).pathname !== "/api/logout"
      )
        return;
      c.abort();
      stopVoice();
      stopSpeech();
      pending.current?.abort();
      setAuthorized(false);
      setOpen(false);
      setMessages([]);
      setReview(null);
      dialog.current?.close();
    };
    document.addEventListener("submit", logout, true);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener("focus", verify);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("submit", logout, true);
    };
  }, [pathname, stopVoice, stopSpeech, userId]);
  useEffect(
    () => () => {
      stopVoice();
      stopSpeech();
      pending.current?.abort();
    },
    [stopVoice, stopSpeech],
  );
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, state, open]);
  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    if (
      !symbol.current ||
      matchMedia("(prefers-reduced-motion: reduce), (update: slow)").matches
    )
      return;
    const b = symbol.current.getBoundingClientRect(),
      x = innerWidth / 2 - b.x - b.width / 2,
      y = innerHeight / 2 - b.y - b.height / 2;
    const a = symbol.current.animate(
      [
        {
          transform: `translate(${x}px,${y}px) perspective(600px) rotateY(-18deg) scale(2.2)`,
          offset: 0,
        },
        {
          transform: `translate(${x}px,${y}px) perspective(600px) rotateY(10deg) scale(2.2)`,
          offset: 0.3,
        },
        { transform: "perspective(600px) rotateY(-8deg)" },
      ],
      { duration: 620, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    a.onfinish = () =>
      setState((current) => (current === "waking" ? "idle" : current));
    return () => a.cancel();
  }, [open]);
  const validReview = review && review.cart === JSON.stringify(cart);
  async function download(href: string) {
    try {
      setError("");
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          "Exportação indisponível ou sem permissão. Tente novamente na página do relatório.",
        );
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `marcon-marco.${new URL(href, location.origin).searchParams.get("format")}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const reply = "Arquivo gerado. Confira os downloads do navegador.";
      setMessages((m) => [...m, { answer: { reply } }]);
      speak(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  }
  if (!authorized || ["/login", "/"].includes(pathname)) return null;
  return (
    <div
      ref={petRoot}
      className={styles.root}
      data-james-pet
      data-dock={dock}
      data-state={error ? "error" : state}
      data-hearing={voice.hearing}
    >
      {!open && tip && (
        <div className={styles.tip}>
          <p>{tip}</p>
          <button
            onClick={() => {
              setState("pointing");
              point();
            }}
          >
            Mostrar onde
          </button>
          <button onClick={() => updatePreferences({ quiet: true })}>
            Silenciar dicas
          </button>
        </div>
      )}
      <button
        className={styles.launcher}
        ref={launcher}
        onClick={show}
        aria-label="Abrir Marco"
        aria-haspopup="dialog"
      >
        <JamesCharacter
          compact
          state={error ? "error" : voice.capturing ? "listening" : state}
        />
        <span>
          {voice.capturing
            ? `Marco · escuta ${voice.mode === "browser" ? "no navegador" : "local"} ativa`
            : voice.listening
              ? "Marco · escuta em espera"
              : "Marco"}
        </span>
      </button>
      {voice.listening && !open && (
        <button className={styles.pause} onClick={pause}>
          Desligar escuta
        </button>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="james-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        {open && (
          <>
            <div ref={symbol} className={styles.symbol} aria-hidden="true">
              <div className={styles.orbit} />
              <div className={styles.halo} />
              <JamesCharacter
                state={error ? "error" : state}
                options={!!messages.at(-1)?.answer?.choices?.length}
              />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <i
                  key={i}
                  className={styles.particle}
                  style={{ "--i": i } as React.CSSProperties}
                />
              ))}
            </div>
            <section
              className={styles.panel}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget)
                  field.current?.focus();
              }}
            >
              <header>
                <div>
                  <h2 id="james-title">Marco</h2>
                  <small>Seu assistente MARCON</small>
                </div>
                <button onClick={close} aria-label="Fechar Marco">
                  {voice.listening ? "Recolher" : "Fechar"}
                </button>
              </header>
              <div
                ref={log}
                className={styles.messages}
                role="log"
                aria-live="polite"
                aria-label="Conversa com Marco"
              >
                {!messages.length && (
                  <>
                    <p>
                      Ative a escuta e diga “Marco” ou “Marcos”. Depois, fale
                      normalmente. Também pode digitar.
                    </p>
                    <div className={styles.suggestions}>
                      {(role === "funcionario"
                        ? [
                            "Procure parafusos",
                            "Mostre meu carrinho",
                            "Revisar requisição",
                            "Acompanhe minhas requisições",
                          ]
                        : role === "lider"
                          ? [
                              "Consulte requisições",
                              "Consulte dashboard do bloco",
                              "Exportar em PDF",
                            ]
                          : [
                              "Procure parafusos",
                              "Abra recomendações",
                              "Solicitar transferência",
                              "Registrar devolução",
                              "Registrar entrada prevista",
                              "Consulte dashboard de estoque",
                              "Exportar em planilha",
                            ]
                      ).map((s) => (
                        <button key={s} onClick={() => void send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {messages.map((m, i) => (
                  <article
                    key={i}
                    className={m.user ? styles.user : styles.answer}
                  >
                    {m.user || (
                      <>
                        {m.answer?.source === "ollama" && (
                          <small>
                            Resposta do modelo · nenhuma operação executada
                            nesta mensagem
                          </small>
                        )}
                        <p>{m.answer?.reply}</p>
                        {m.answer?.draft && (
                          <p>
                            Pedido atual:{" "}
                            {m.answer.draft.quantity ?? "quantidade pendente"}{" "}
                            {m.answer.draft.unit === "package"
                              ? "caixas"
                              : m.answer.draft.unit === "unit"
                                ? "unidades"
                                : ""}{" "}
                            de {m.answer.draft.query || "peça pendente"}. Falta:{" "}
                            {m.answer.draft.pending}.
                            {m.answer.draft.purpose &&
                              ` Uso informado: ${m.answer.draft.purpose}.`}
                            {m.answer.draft.dimensions &&
                              ` Medida informada: ${m.answer.draft.dimensions}.`}
                          </p>
                        )}
                        {m.answer?.choices?.map((p, index) => (
                          <button
                            key={p.code}
                            disabled={
                              state === "processing" ||
                              (!!m.answer?.clarificationToken &&
                                m.answer.clarificationToken !== clarification)
                            }
                            onClick={() => {
                              if (m.answer?.clarificationToken)
                                void send(
                                  p.code,
                                  false,
                                  m.answer.clarificationToken,
                                );
                              else {
                                setInput(p.code);
                                field.current?.focus();
                              }
                            }}
                          >
                            {index + 1}. {p.code} · {p.name}
                          </button>
                        ))}
                        {m.answer?.clarificationToken === clarification &&
                          m.answer.moreOptions && (
                            <button
                              disabled={state === "processing"}
                              onClick={() =>
                                void send(
                                  "Mais opções",
                                  false,
                                  m.answer!.clarificationToken,
                                )
                              }
                            >
                              Mais opções
                            </button>
                          )}
                        {m.answer?.items?.length ? (
                          <details open>
                            <summary>Carrinho revisado</summary>
                            <ul>
                              {m.answer.items.map((p) => (
                                <li key={p.code}>
                                  {p.name} ({p.code}): {p.quantity} {p.unit}.
                                  Embalagem: {p.packSize}. Disponível:{" "}
                                  {p.available}.
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                        {m.answer?.proposedItems?.length ? (
                          <p>
                            Pedido proposto:{" "}
                            {m.answer.proposedItems
                              .map(
                                (p) =>
                                  `${p.quantity} ${p.unit} de ${p.name} (${p.code})`,
                              )
                              .join("; ")}
                          </p>
                        ) : null}
                        {m.answer?.result?.ids && (
                          <p>
                            Protocolos:{" "}
                            {m.answer.result.ids
                              .map((id) => `REQ-${id}`)
                              .join(", ")}
                          </p>
                        )}
                        {m.answer?.operationCompleted &&
                          m.answer.result?.id && (
                            <p>Número do registro: {m.answer.result.id}</p>
                          )}
                        {m.answer?.dashboard && (
                          <details>
                            <summary>Dados reais autorizados</summary>
                            <p>
                              {m.answer.dashboard.scope} ·{" "}
                              {m.answer.dashboard.period}
                            </p>
                            <ul>
                              {m.answer.dashboard.metrics.map((v) => (
                                <li key={v.id}>
                                  {v.label}: {v.value ?? "Indisponível"}{" "}
                                  {v.unit}
                                  <small> — {v.definition}</small>
                                </li>
                              ))}
                            </ul>
                            <small>
                              Atualizado: {m.answer.dashboard.updatedAt}
                            </small>
                          </details>
                        )}
                        {m.answer?.href && (
                          <button
                            onClick={() => {
                              minimize();
                              router.push(m.answer!.href!);
                            }}
                          >
                            {m.answer.hrefLabel || "Abrir dashboard"}
                          </button>
                        )}
                        {m.answer?.exportHref && (
                          <button
                            onClick={() => void download(m.answer!.exportHref!)}
                          >
                            Baixar relatório
                          </button>
                        )}
                      </>
                    )}
                  </article>
                ))}
              </div>
              <p className={styles.status} role="status">
                {state === "processing"
                  ? `${phase.charAt(0).toUpperCase() + phase.slice(1)} (${elapsed}s). Limite do pedido: 60 segundos.`
                  : state === "speaking"
                    ? "Falando. Você pode interromper."
                    : voice.transcribing
                      ? "Fala detectada. Transcrevendo no servidor…"
                      : voice.starting
                        ? "Ativando o microfone… Você pode cancelar a ativação."
                        : validReview
                          ? "Aguardando sua confirmação explícita."
                          : voice.hearing
                            ? "Ouvindo sua fala…"
                            : voice.capturing
                              ? state === "listening"
                                ? "Chamado reconhecido. Estou ouvindo; pode falar seu pedido."
                                : `Ouvindo ${voice.mode === "browser" ? "pelo navegador" : "pelo servidor"}. Diga Marco ou Marcos.`
                              : voice.listening
                                ? voice.hidden
                                  ? "Escuta em espera. Retoma ao voltar para esta aba."
                                  : "Escuta pronta."
                                : voice.permissionDenied
                                  ? "Sem permissão para o microfone. Você pode digitar."
                                  : voice.paused
                                    ? "Escuta pausada. Ative para retomar."
                                    : "Pronto. Digite ou ative a escuta."}
              </p>
              {(metrics.serverMs !== undefined ||
                voice.transcriptionMs !== null) && (
                <small>
                  Tempos: transcrição{" "}
                  {voice.transcriptionMs === null
                    ? "não medida"
                    : `${voice.transcriptionMs} ms`}
                  ; primeiro conteúdo do modelo {metrics.modelFirstMs ?? "—"}{" "}
                  ms; modelo total {metrics.modelTotalMs ?? "—"} ms; ação
                  confirmada {metrics.actionMs ?? "—"} ms; servidor{" "}
                  {metrics.serverMs ?? "—"} ms.
                </small>
              )}
              {uiReview && (
                <div role="status">
                  <p>{uiReview}</p>
                  <button
                    type="button"
                    onClick={() => void send("confirmar formulário")}
                  >
                    Confirmar formulário
                  </button>
                  <button type="button" onClick={() => void send("cancelar")}>
                    Cancelar
                  </button>
                </div>
              )}
              {!providerConfigured && (
                <p role="alert" className={styles.error}>
                  Conversa com IA indisponível: verifique MARCO_OLLAMA_URL e a
                  configuração da ponte no servidor.
                </p>
              )}
              {voice.transcript && (
                <p className={styles.transcript}>
                  {voice.transcriptFinal
                    ? "Você disse: "
                    : "Transcrição parcial: "}
                  {voice.transcript}
                </p>
              )}
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              {speechError && (
                <div className={styles.actions}>
                  <p role="alert" className={styles.error}>
                    {speechError}
                  </p>
                  <button
                    type="button"
                    onClick={() => speak(lastSpeech.current)}
                  >
                    Tentar falar novamente
                  </button>
                </div>
              )}
              {validReview && (
                <div className={styles.actions}>
                  <button
                    disabled={state === "processing"}
                    onClick={() =>
                      void send(
                        review?.kind === "operation"
                          ? "Confirmar ação"
                          : review?.kind === "cart"
                            ? "Sim, adicionar"
                            : "Confirmar requisição",
                        true,
                      )
                    }
                  >
                    {review?.kind === "operation"
                      ? "Confirmar ação"
                      : review?.kind === "cart"
                        ? "Sim, adicionar"
                        : "Confirmar requisição"}
                  </button>
                  <button
                    disabled={state === "processing"}
                    onClick={() => void send("Cancelar")}
                  >
                    Cancelar envio
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <label htmlFor="james-input">Sua pergunta ou correção</label>
                <input
                  ref={field}
                  id="james-input"
                  value={input}
                  maxLength={2000}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={state === "processing"}
                />
                <div className={styles.actions}>
                  <button
                    type="submit"
                    disabled={!input.trim() || state === "processing"}
                  >
                    Enviar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      voice.listening || voice.starting
                        ? pause()
                        : void voice.start()
                    }
                  >
                    {voice.starting
                      ? "Cancelar ativação"
                      : voice.listening
                        ? "Pausar escuta"
                        : "Ativar escuta"}
                  </button>
                  {voice.browserFallback && !voice.listening && (
                    <button type="button" onClick={() => voice.startBrowser()}>
                      Usar reconhecimento do navegador
                    </button>
                  )}
                  {state === "processing" && (
                    <button
                      type="button"
                      onClick={() => {
                        pending.current?.abort();
                        pending.current = null;
                        setState("idle");
                        setError(
                          "Consulta interrompida. Se estava enviando, confirme novamente o mesmo resumo para recuperar o resultado sem duplicar.",
                        );
                      }}
                    >
                      Interromper
                    </button>
                  )}
                  {state === "speaking" && (
                    <button
                      type="button"
                      onClick={() => {
                        stopSpeech();
                        setState(validReview ? "confirming" : "idle");
                      }}
                    >
                      Interromper fala
                    </button>
                  )}
                </div>
                {!voice.listening && (
                  <small>
                    Ao ativar a escuta, a transcrição usa o servidor local
                    quando disponível; caso contrário, usa o reconhecimento do
                    navegador, que pode enviar áudio ao serviço dele. Autorize o
                    microfone quando o navegador solicitar e aguarde o estado
                    “Ouvindo”.
                  </small>
                )}
                <details className={styles.settings}>
                  <summary>Preferências do Marco</summary>
                  <label>
                    <input
                      type="checkbox"
                      checked={preferences.still}
                      onChange={(e) =>
                        updatePreferences({ still: e.target.checked })
                      }
                    />
                    Ficar parado
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={preferences.quiet}
                      onChange={(e) =>
                        updatePreferences({ quiet: e.target.checked })
                      }
                    />
                    Silenciar dicas
                  </label>
                  <label>
                    Posição preferida
                    <select
                      aria-label="Posição do Marco"
                      value={preferences.dock}
                      onChange={(e) =>
                        updatePreferences({ dock: e.target.value as Dock })
                      }
                    >
                      <option value="right">Direita, se houver espaço</option>
                      <option value="left">Esquerda, se houver espaço</option>
                      <option value="inline">Centro inferior</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={voice.listening || voice.starting}
                      onChange={(e) =>
                        e.target.checked ? void voice.start() : pause()
                      }
                    />
                    Manter Marco pronto enquanto uso o site
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      dialog.current?.close();
                      setState("pointing");
                      point();
                    }}
                  >
                    Mostrar o próximo controle
                  </button>
                </details>
                <label className={styles.voice}>
                  <input
                    type="checkbox"
                    checked={preferences.voice}
                    onChange={(e) => {
                      updatePreferences({ voice: e.target.checked });
                      if (!e.target.checked) {
                        stopSpeech();
                        setState(validReview ? "confirming" : "idle");
                      }
                    }}
                  />
                  Ler respostas em áudio
                </label>
                <details className={styles.privacy}>
                  <summary>Privacidade · Ollama no seu PC · voz</summary>
                  <small>
                    Seu comando em texto e os itens do carrinho são processados
                    pelo Ollama no computador configurado. O modelo não
                    transcreve áudio. Quando configurada, a transcrição local
                    usa o servidor MARCON; áudio bruto não é guardado após o
                    processamento. A leitura usa Piper local quando configurado
                    ou a síntese do navegador, cujo processamento depende da voz
                    escolhida. Após ativar, a escuta continua ao recolher Marco
                    e navegar. Pausa na aba oculta e retoma ao voltar. Para
                    encerrar, use Desligar escuta ou saia da conta. O
                    reconhecimento do navegador é usado quando a transcrição
                    local está indisponível; conforme o navegador, o áudio pode
                    ser processado pelo serviço dele. A escuta só inicia após
                    você ativá-la e autorizar o microfone.
                  </small>
                </details>
                {voice.listening && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      dialog.current?.close();
                    }}
                  >
                    Minimizar e manter escuta nesta aba
                  </button>
                )}
              </form>
            </section>
          </>
        )}
      </dialog>
    </div>
  );
}
