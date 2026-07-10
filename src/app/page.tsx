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
import dynamic from "next/dynamic";
import { GlyphMatrix } from "./GlyphMatrix";

/* Rive chargé uniquement côté client (évite tout crash SSR au build Vercel) */
const RiveWaveform = dynamic(() => import("./RiveWaveform"), {
  ssr: false,
  loading: () => <div className="h-10 w-32 shrink-0" aria-hidden="true" />,
});

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
  const clock = useRef(0); // horloge en secondes (temps réel)
  const lastFrame = useRef(0);
  const scaleSmooth = useRef(1); // échelle lissée → anti-saccade
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

        /* horloge basée sur le temps réel (évite les à-coups si le
           framerate varie) — delta en secondes depuis la frame précédente */
        const dt = lastFrame.current ? (now - lastFrame.current) / 1000 : 0.016;
        lastFrame.current = now;
        clock.current += dt;

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

        /* --- battement de cœur lumineux en thinking (horloge réelle) --- */
        const beat =
          s === "thinking"
            ? Math.pow(Math.max(0, Math.sin(clock.current * 3.2)), 6) * 0.5
            : 0;

        /* --- micro-impulsion de zoom (token) : décroissance --- */
        zoomPulse.current *= 0.9;

        /* --- échelle CIBLE selon l'état --- */
        let targetScale = 1;
        if (s === "thinking") {
          // respiration douce et régulière (horloge réelle)
          targetScale = 1 + Math.sin(clock.current * 2.4) * 0.05;
        } else if (s === "speaking") {
          targetScale = 1 + zoomPulse.current * 0.05;
        }
        /* lissage de l'échelle → plus aucun à-coup, transition fluide */
        scaleSmooth.current += (targetScale - scaleSmooth.current) * 0.12;

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
        state.scale = scaleSmooth.current;
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
   5. CHAT — typographie pure, zéro étiquette
   ============================================================ */

const spring = {
  type: "spring" as const,
  stiffness: 250,
  damping: 26,
  mass: 0.8,
};

/* ============================================================
   HYPERTEXT — effet de brouillage/déchiffrage des caractères
   (façon Magic UI). Chaque lettre scramble aléatoirement puis
   se fixe, de gauche à droite. Utilisé pour révéler le dernier
   mot streamé par Suzanne.
   ============================================================ */

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&?!";

/**
 * Chaque caractère commence brouillé puis se fixe de gauche à droite.
 * `speed` = caractères fixés par seconde. Les lettres non encore fixées
 * changent en continu pour un effet de "déchiffrage" bien visible.
 */
function HyperText({
  text,
  className = "",
  speed = 26,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const [display, setDisplay] = useState(text);
  const raf = useRef<number>(0);

  useEffect(() => {
    const chars = text.split("");
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const settled = elapsed * speed; // nb de caractères fixés
      let done = true;
      const out = chars.map((c, i) => {
        if (c === " " || i < settled) return c;
        done = false;
        return SCRAMBLE_CHARS[
          Math.floor(Math.random() * SCRAMBLE_CHARS.length)
        ];
      });
      setDisplay(out.join(""));
      if (!done) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [text, speed]);

  return <span className={className}>{display}</span>;
}

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
        {/* Les réponses de Suzanne se déchiffrent à l'apparition */}
        {msg.isUser ? msg.text : <HyperText text={msg.text} />}
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
        <HyperText text={text} speed={40} />
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
   6. COMMAND BAR — input flottant "dans le vide", zéro boîte
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
    <div className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.15 }}
        className="pointer-events-auto flex w-full max-w-xl items-center justify-center gap-3"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Écrire à Suzanne…"
          aria-label="Écrire à Suzanne"
          disabled={!idle}
          className="min-w-0 flex-1 border-none bg-transparent text-center text-xl text-neutral-900 outline-none placeholder:text-neutral-300 focus:ring-0 disabled:opacity-40"
        />
        {/* onde Rive ultra-discrète, collée au texte, sans boîte */}
        <div className="pointer-events-none shrink-0 opacity-80">
          <RiveWaveform />
        </div>
        <button
          onClick={send}
          disabled={!idle || !value.trim()}
          aria-label="Envoyer"
          className="shrink-0 text-lg text-neutral-400 transition-colors hover:text-indigo-500 disabled:opacity-0"
        >
          ↑
        </button>
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
      {/* Fond animé de glyphes — très discret, derrière tout le reste */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.35]">
        <GlyphMatrix
          glyphs="01·•+*/\<>="
          cellSize={14}
          mutationRate={0.04}
          interval={90}
          fadeBottom={0.6}
          color="#000000"
        />
      </div>

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
