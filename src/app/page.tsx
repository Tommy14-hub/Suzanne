"use client";

/* ============================================================
   SUZANNE — v4 « Cinématique »  ·  app/page.tsx
   ------------------------------------------------------------
   Globe cobe hyper-interactif : drag + inertie, parallaxe
   magnétique, cinématique d'états, marqueurs évolutifs,
   micro-impulsions de zoom synchronisées au streaming.
   Rive waveform réelle intégrée dans la command bar.
   ============================================================ */

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  memo,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import createGlobe, { type Marker } from "cobe";
import { motion, AnimatePresence } from "framer-motion";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

/* ============================================================
   1. STORE ZUSTAND
   ============================================================ */

type SuzanneStatus = "idle" | "thinking" | "speaking";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
}

interface SuzanneStore {
  status: SuzanneStatus;
  messages: Message[];
  currentResponseText: string;
  /** Compteur incrémenté à chaque token streamé — le globe s'y
      abonne hors-React pour ses micro-impulsions de zoom. */
  tokenPulse: number;
  setStatus: (s: SuzanneStatus) => void;
  addMessage: (m: Message) => void;
  streamToken: (fullText: string) => void;
  commitResponse: () => void;
}

export const useSuzanneStore = create<SuzanneStore>((set, get) => ({
  status: "idle",
  messages: [
    {
      id: "welcome",
      text: "Bonjour. Je suis Suzanne. Fais glisser le globe, survole-le, et écris-moi pour voir mes états en action.",
      isUser: false,
    },
  ],
  currentResponseText: "",
  tokenPulse: 0,
  setStatus: (status) => set({ status }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  streamToken: (fullText) =>
    set((s) => ({
      currentResponseText: fullText,
      tokenPulse: s.tokenPulse + 1,
    })),
  commitResponse: () => {
    const { currentResponseText, messages } = get();
    set({
      messages: [
        ...messages,
        { id: crypto.randomUUID(), text: currentResponseText, isUser: false },
      ],
      currentResponseText: "",
      status: "idle",
    });
  },
}));

/* ============================================================
   2. STREAMING SIMULÉ
   ------------------------------------------------------------
   🔌 OLLAMA : remplacer le corps par un fetch streaming vers
   http://localhost:11434/api/chat — la structure (streamToken
   par chunk, commitResponse à la fin) reste identique.
   ============================================================ */

const FAKE_REPLIES = [
  "Ton serveur tourne parfaitement. La RX 6750 XT est à 42°C, la VRAM utilisée à 60 %. Que puis-je faire pour toi ?",
  "Pour le dual-boot Ubuntu, pars sur 250 Go en ext4 avec 16 Go de swap. Je peux détailler le partitionnement si tu veux.",
  "ROCm permet à Ollama de dialoguer directement avec les 12 Go de VRAM de ta carte graphique, sans passer par le CPU.",
  "C'est noté. Je viens de l'enregistrer dans ma mémoire vectorielle — je m'en souviendrai la prochaine fois.",
];

function useStreamText() {
  const replyIdx = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const stream = useCallback((userText: string) => {
    const { setStatus, addMessage, streamToken, commitResponse } =
      useSuzanneStore.getState();

    addMessage({ id: crypto.randomUUID(), text: userText, isUser: true });
    setStatus("thinking");

    const reply = FAKE_REPLIES[replyIdx.current++ % FAKE_REPLIES.length];

    timers.current.push(
      setTimeout(() => {
        setStatus("speaking");
        const words = reply.split(" ");
        let i = 0;
        const iv = setInterval(() => {
          i++;
          streamToken(words.slice(0, i).join(" "));
          if (i >= words.length) {
            clearInterval(iv);
            timers.current.push(setTimeout(commitResponse, 450));
          }
        }, 85);
      }, 2200)
    );
  }, []);

  return { stream };
}

/* ============================================================
   3. GLOBE COBE — hyper-interactif, zéro re-render React
   ============================================================ */

const FRANCE: Marker = { location: [46.6, 2.35], size: 0.08 };

function randomMarker(): Marker & { born: number } {
  return {
    location: [(Math.random() - 0.5) * 140, (Math.random() - 0.5) * 340],
    size: 0.03 + Math.random() * 0.04,
    born: performance.now(),
  };
}

const GlobeCanvas = memo(function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* --- refs mutables lues par onRender (jamais de re-render) --- */
  const phi = useRef(0);
  const speed = useRef(0.003);
  const targetSpeed = useRef(0.003);
  const theta = useRef(0.25);
  const targetTheta = useRef(0.25);
  const zoomPulse = useRef(0); // micro-impulsion par token
  const heartbeat = useRef(0);
  const status = useRef<SuzanneStatus>("idle");

  /* drag + inertie */
  const dragging = useRef(false);
  const lastX = useRef(0);
  const velocity = useRef(0);

  /* parallaxe magnétique */
  const pointerOffset = useRef({ x: 0, y: 0 });

  /* marqueurs éphémères */
  const ephemeral = useRef<(Marker & { born: number })[]>([]);
  const markerTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    /* Abonnements hors cycle React */
    const unsub = useSuzanneStore.subscribe((state, prev) => {
      status.current = state.status;

      /* micro-impulsion de zoom à chaque token streamé */
      if (state.tokenPulse !== prev.tokenPulse) zoomPulse.current = 1;

      /* cinématique des états */
      if (state.status === "thinking") {
        targetSpeed.current = 0.016;
        targetTheta.current = 0.85; // bascule vers le pôle nord
        if (!markerTimer.current) {
          markerTimer.current = setInterval(() => {
            if (ephemeral.current.length < 14)
              ephemeral.current.push(randomMarker());
          }, 220);
        }
      } else {
        if (markerTimer.current) {
          clearInterval(markerTimer.current);
          markerTimer.current = null;
        }
        if (state.status === "speaking") {
          targetSpeed.current = 0.006;
          targetTheta.current = 0.3;
        } else {
          targetSpeed.current = 0.003;
          targetTheta.current = 0.25;
        }
      }
    });
    return () => {
      unsub();
      if (markerTimer.current) clearInterval(markerTimer.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let width = canvas.offsetWidth;
    const onResize = () => (width = canvas.offsetWidth);
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.25,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 26000,
      mapBrightness: 4.2,
      baseColor: [0.93, 0.93, 0.96],
      markerColor: [99 / 255, 102 / 255, 241 / 255],
      glowColor: [0.86, 0.87, 0.99],
      scale: 1,
      markers: [FRANCE],
      onRender: (state) => {
        const now = performance.now();
        const s = status.current;

        /* --- inertie du drag : friction douce --- */
        if (!dragging.current) {
          if (Math.abs(velocity.current) > 0.0002) {
            phi.current += velocity.current;
            velocity.current *= 0.94; // friction
          } else {
            velocity.current = 0;
            /* lissage vitesse auto + rotation */
            speed.current += (targetSpeed.current - speed.current) * 0.045;
            phi.current += speed.current;
          }
        }

        /* --- inclinaison d'axe (état) + parallaxe magnétique --- */
        theta.current += (targetTheta.current - theta.current) * 0.03;
        const parallaxTheta = pointerOffset.current.y * 0.12;
        const parallaxPhi = pointerOffset.current.x * 0.1;

        /* --- battement de cœur en thinking --- */
        heartbeat.current += 0.055;
        const beat =
          s === "thinking"
            ? Math.pow(Math.max(0, Math.sin(heartbeat.current * 2.4)), 6) * 0.5
            : 0;

        /* --- micro-impulsion de zoom (token) : décroissance --- */
        zoomPulse.current *= 0.86;
        const pulseScale =
          s === "speaking" ? 1 + zoomPulse.current * 0.035 : 1;

        /* --- marqueurs éphémères : fade-out --- */
        const fadeSpan = s === "thinking" ? 2600 : 700; // s'estompent vite quand elle parle
        ephemeral.current = ephemeral.current.filter(
          (m) => now - m.born < fadeSpan
        );
        const markers: Marker[] = [
          FRANCE,
          ...ephemeral.current.map((m) => ({
            location: m.location,
            size: m.size * Math.max(0, 1 - (now - m.born) / fadeSpan),
          })),
        ];

        state.phi = phi.current + parallaxPhi;
        state.theta = theta.current + parallaxTheta;
        state.scale = pulseScale;
        state.mapBrightness = 4.2 + beat * 2.2;
        state.markers = markers;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /* --- interactions pointeur --- */
  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    velocity.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    /* parallaxe magnétique : offset normalisé -1..1 */
    pointerOffset.current = {
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    };
    if (dragging.current) {
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      phi.current += dx * 0.005;
      velocity.current = dx * 0.005;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onPointerLeave = useCallback(() => {
    dragging.current = false;
    pointerOffset.current = { x: 0, y: 0 };
  }, []);

  return (
    <div
      className="absolute -right-[16vw] top-1/2 -translate-y-1/2 md:-right-[8vw]"
      style={{ width: "88vmin", height: "88vmin", minWidth: 520 }}
    >
      {/* halo cristallin diffus sous le globe */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[6%] rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 42% 38%, rgba(129,140,248,0.16), rgba(165,180,252,0.07) 45%, transparent 70%)",
        }}
      />
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        className="h-full w-full cursor-grab opacity-95 active:cursor-grabbing"
        style={{ contain: "layout paint size", touchAction: "none" }}
      />
    </div>
  );
});

/* ============================================================
   4. RIVE WAVEFORM — onde sonore réelle dans la capsule
   ============================================================ */

const STATE_MACHINE = "StateMachine 1";

function RiveWaveform() {
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
  });
  const isActive = useStateMachineInput(rive, STATE_MACHINE, "isActive", false);

  useEffect(() => {
    if (isActive) isActive.value = speaking;
  }, [speaking, isActive]);

  return (
    <div className="h-10 w-32 shrink-0" aria-hidden="true">
      <RiveComponent style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

/* ============================================================
   5. CHAT — typographie pure, zéro étiquette
   ============================================================ */

const spring = {
  type: "spring" as const,
  stiffness: 250,
  damping: 26,
  mass: 0.8,
};

const MessageItem = memo(function MessageItem({ msg }: { msg: Message }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={msg.isUser ? "self-end pl-16 text-right" : "self-start pr-16"}
    >
      <p
        className={`text-lg leading-relaxed ${
          msg.isUser ? "text-neutral-500" : "text-neutral-900"
        }`}
      >
        {msg.text}
      </p>
    </motion.div>
  );
});

function StreamingText() {
  const text = useSuzanneStore((s) => s.currentResponseText);
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  if (!speaking || !text) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="self-start pr-16"
    >
      <p className="text-lg leading-relaxed text-neutral-900">
        {text}
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-indigo-400 align-middle" />
      </p>
    </motion.div>
  );
}

function ThinkingIndicator() {
  const thinking = useSuzanneStore((s) => s.status === "thinking");
  return (
    <AnimatePresence>
      {thinking && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.2, 0.9, 0.2] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.3, repeat: Infinity }}
          className="self-start text-sm text-neutral-300"
        >
          ● ● ●
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/* ============================================================
   6. COMMAND BAR — capsule vitrée minimale
   ============================================================ */

function CommandBar() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const idle = useSuzanneStore((s) => s.status === "idle");
  const { stream } = useStreamText();

  const send = useCallback(() => {
    const text = value.trim();
    if (!text || !idle) return;
    setValue("");
    stream(text);
  }, [value, idle, stream]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") send();
      if (e.key === "Escape") inputRef.current?.blur();
    },
    [send]
  );

  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.15 }}
        className="flex w-full max-w-xl items-center gap-3 rounded-full border border-neutral-200/50 bg-white/70 py-1.5 pl-5 pr-2 shadow-2xl shadow-neutral-200/60 backdrop-blur-md"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Écrire à Suzanne…"
          aria-label="Écrire à Suzanne"
          disabled={!idle}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300 disabled:opacity-50"
        />
        <RiveWaveform />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={send}
          disabled={!idle || !value.trim()}
          aria-label="Envoyer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm text-white transition-colors hover:bg-indigo-600 disabled:bg-neutral-200"
        >
          ↑
        </motion.button>
      </motion.div>
    </div>
  );
}

/* ============================================================
   7. HEADER — titre seul + statut discret
   ============================================================ */

function StatusIndicator() {
  const status = useSuzanneStore((s) => s.status);
  const label =
    status === "thinking"
      ? "Réflexion"
      : status === "speaking"
      ? "Parle"
      : "En veille";
  return (
    <div className="flex items-center gap-2 opacity-50">
      <motion.span
        animate={
          status === "thinking" ? { opacity: [0.3, 1, 0.3] } : { opacity: 1 }
        }
        transition={
          status === "thinking"
            ? { duration: 0.9, repeat: Infinity }
            : undefined
        }
        className={`h-1.5 w-1.5 rounded-full ${
          status === "idle" ? "bg-neutral-400" : "bg-indigo-500"
        }`}
      />
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
}

/* ============================================================
   8. PAGE
   ============================================================ */

export default function SuzannePage() {
  const messages = useSuzanneStore(useShallow((s) => s.messages));
  const currentLen = useSuzanneStore((s) => s.currentResponseText.length);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, currentLen]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#FAFAFA] font-sans antialiased">
      <GlobeCanvas />

      <header className="relative z-10 flex items-center justify-between px-8 py-6 md:px-16">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
          Suzanne
        </h1>
        <StatusIndicator />
      </header>

      <main
        ref={scrollRef}
        className="relative z-10 h-[calc(100vh-84px)] overflow-y-auto px-8 pb-48 pt-2 md:px-16"
      >
        <div className="flex max-w-xl flex-col gap-16">
          {messages.map((m) => (
            <MessageItem key={m.id} msg={m} />
          ))}
          <StreamingText />
          <ThinkingIndicator />
        </div>
      </main>

      <CommandBar />
    </div>
  );
}
