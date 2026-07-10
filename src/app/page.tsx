"use client";

/* ============================================================
   SUZANNE — page.tsx (production, Next.js 14+ App Router)
   ------------------------------------------------------------
   Monolithique volontairement : à coller dans app/page.tsx.
   
   Dépendances à installer :
     npm install zustand cobe framer-motion
     npx shadcn@latest init   (pour la base Tailwind/Radix)
     npm install @rive-app/react-canvas   (waveform finale)

   Polices — dans app/layout.tsx :
     import { GeistSans } from "geist/font/sans";
     // ou : import { Inter } from "next/font/google";
     // const inter = Inter({ subsets: ["latin"], display: "swap" });
     <body className={GeistSans.className}> → zéro CLS.

   Architecture :
   - Zustand store : status / messages / currentResponseText
   - Sélecteurs atomiques → le Globe et la Waveform ne re-render
     JAMAIS pendant le streaming des tokens (seul <StreamingText>
     s'abonne à currentResponseText).
   - cobe : vitesse pilotée via ref mutable dans onRender,
     le contexte WebGL n'est jamais ré-instancié.
   ============================================================ */

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  memo,
  type KeyboardEvent,
} from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import createGlobe from "cobe";
import { motion, AnimatePresence } from "framer-motion";

/* ============================================================
   1. STORE ZUSTAND — état global, abonnements atomiques
   ============================================================ */

type SuzanneStatus = "idle" | "thinking" | "speaking";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface SuzanneStore {
  status: SuzanneStatus;
  messages: Message[];
  /** Texte en cours de streaming — SEUL StreamingText s'y abonne. */
  currentResponseText: string;
  setStatus: (s: SuzanneStatus) => void;
  addMessage: (m: Message) => void;
  setCurrentResponseText: (t: string) => void;
  commitResponse: () => void;
}

export const useSuzanneStore = create<SuzanneStore>((set, get) => ({
  status: "idle",
  messages: [
    {
      id: "welcome",
      role: "assistant",
      text: "Bonjour. Je suis Suzanne, ton assistante locale. Écris-moi quelque chose pour voir mes états en action.",
    },
  ],
  currentResponseText: "",
  setStatus: (status) => set({ status }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setCurrentResponseText: (currentResponseText) => set({ currentResponseText }),
  commitResponse: () => {
    const { currentResponseText, messages } = get();
    set({
      messages: [
        ...messages,
        { id: crypto.randomUUID(), role: "assistant", text: currentResponseText },
      ],
      currentResponseText: "",
      status: "idle",
    });
  },
}));

/* ============================================================
   2. useStreamText — émulation de l'arrivée des tokens.
   ------------------------------------------------------------
   ⚠️ INTÉGRATION OLLAMA : remplacer le corps de `stream()` par :
     const res = await fetch("http://localhost:11434/api/chat", {
       method: "POST",
       body: JSON.stringify({ model: "qwen2.5:14b", messages, stream: true }),
     });
     const reader = res.body!.getReader(); // puis décoder les chunks
   La structure du hook (setCurrentResponseText token par token,
   commitResponse à la fin) reste identique.
   ============================================================ */

const FAKE_REPLIES = [
  "Bonjour Thomas. Ton serveur tourne parfaitement — la RX 6750 XT est à 42°C et la VRAM n'est utilisée qu'à 60 %. Que puis-je faire pour toi ?",
  "Pour le dual-boot Ubuntu, je te recommande 250 Go en ext4, avec 16 Go de swap. Je peux te détailler le partitionnement si tu veux.",
  "ROCm est l'écosystème open-source d'AMD. Il permet à Ollama de dialoguer directement avec les 12 Go de VRAM de ta carte graphique.",
  "Bien noté. J'ai mémorisé cette préférence dans ma base vectorielle pour nos prochaines conversations.",
];

function useStreamText() {
  const replyIdx = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const stream = useCallback((userText: string) => {
    const { setStatus, addMessage, setCurrentResponseText, commitResponse } =
      useSuzanneStore.getState();

    addMessage({ id: crypto.randomUUID(), role: "user", text: userText });
    setStatus("thinking");

    const reply = FAKE_REPLIES[replyIdx.current++ % FAKE_REPLIES.length];

    timers.current.push(
      setTimeout(() => {
        setStatus("speaking");
        const words = reply.split(" ");
        let i = 0;
        const iv = setInterval(() => {
          i++;
          // Seul <StreamingText> re-render ici — pas le Globe, pas la bar.
          setCurrentResponseText(words.slice(0, i).join(" "));
          if (i >= words.length) {
            clearInterval(iv);
            timers.current.push(setTimeout(commitResponse, 500));
          }
        }, 80);
      }, 1800)
    );
  }, []);

  return { stream };
}

/* ============================================================
   3. GLOBE (cobe) — isolé, memo, ZÉRO re-render pendant stream.
   ------------------------------------------------------------
   La vitesse est lue depuis une ref mutable mise à jour par un
   abonnement Zustand hors-React (`subscribe`) : le contexte
   WebGL vit une seule fois, onRender lit rotation.current.
   ============================================================ */

const GlobeCanvas = memo(function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const speed = useRef(0.003);
  const targetSpeed = useRef(0.003);
  const glowPulse = useRef(0);

  useEffect(() => {
    // Abonnement HORS cycle React : aucun re-render du composant.
    const unsub = useSuzanneStore.subscribe((state) => {
      targetSpeed.current =
        state.status === "thinking"
          ? 0.014
          : state.status === "speaking"
          ? 0.006
          : 0.003;
    });
    return unsub;
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
      mapSamples: 24000,
      mapBrightness: 4,
      baseColor: [0.92, 0.92, 0.95],
      markerColor: [99 / 255, 102 / 255, 241 / 255],
      glowColor: [0.85, 0.86, 0.98],
      markers: [
        { location: [48.8566, 2.3522], size: 0.06 }, // Paris — Suzanne est là
        { location: [37.7749, -122.4194], size: 0.04 },
        { location: [35.6762, 139.6503], size: 0.04 },
        { location: [-33.8688, 151.2093], size: 0.03 },
      ],
      onRender: (state) => {
        // Lissage de la vitesse — jamais de saut visuel entre états.
        speed.current += (targetSpeed.current - speed.current) * 0.04;
        rotation.current += speed.current;
        state.phi = rotation.current;
        glowPulse.current += 0.05;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute -right-[18vw] top-1/2 -translate-y-1/2 md:-right-[10vw]"
      style={{ width: "80vmin", height: "80vmin", minWidth: 480 }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-90"
        style={{ contain: "layout paint size" }}
      />
    </div>
  );
});

/* ============================================================
   4. VISUAL WAVEFORM — remplacement safe (SVG + framer-motion).
   ------------------------------------------------------------
   🔌 INJECTION RIVE FINALE — remplacer ce composant par :

     import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

     function RiveWaveform() {
       const speaking = useSuzanneStore((s) => s.status === "speaking");
       const { rive, RiveComponent } = useRive({
         src: "/waveform.riv",               // fichier dans /public
         stateMachines: "StateMachine 1",    // nom exact
         autoplay: true,
       });
       const isActive = useStateMachineInput(rive, "StateMachine 1", "isActive", false);
       useEffect(() => { if (isActive) isActive.value = speaking; }, [speaking, isActive]);
       return <RiveComponent className="h-16 w-full" />;
     }
   ============================================================ */

const WAVE_PATHS = {
  flat: "M0,32 C80,32 160,32 240,32 C320,32 400,32 480,32 C560,32 640,32 720,32",
  a: "M0,32 C60,12 120,52 180,30 C240,8 300,50 360,34 C420,18 480,48 540,28 C600,10 660,46 720,32",
  b: "M0,32 C60,50 120,14 180,36 C240,54 300,16 360,30 C420,44 480,12 540,38 C600,52 660,20 720,32",
};

const VisualWaveform = memo(function VisualWaveform() {
  // Abonnement atomique : re-render uniquement quand `speaking` bascule.
  const speaking = useSuzanneStore((s) => s.status === "speaking");

  return (
    <div className="h-16 w-full overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 720 64"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        {[0.55, 0.28, 0.16].map((opacity, i) => (
          <motion.path
            key={i}
            fill="none"
            stroke="rgb(99 102 241)"
            strokeWidth={1.8 - i * 0.4}
            strokeOpacity={speaking ? opacity : 0.08}
            initial={{ d: WAVE_PATHS.flat }}
            animate={
              speaking
                ? { d: [WAVE_PATHS.a, WAVE_PATHS.b, WAVE_PATHS.a] }
                : { d: WAVE_PATHS.flat }
            }
            transition={
              speaking
                ? {
                    duration: 1.4 + i * 0.35,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
                : { type: "spring", stiffness: 120, damping: 20 }
            }
          />
        ))}
      </svg>
    </div>
  );
});

/* ============================================================
   5. MESSAGES — spring physics, streaming isolé
   ============================================================ */

const springTransition = {
  type: "spring" as const,
  stiffness: 260,
  damping: 26,
  mass: 0.8,
};

const MessageItem = memo(function MessageItem({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springTransition}
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
        {isUser ? "Vous" : "Suzanne"}
      </p>
      <p
        className={`max-w-prose text-lg leading-relaxed ${
          isUser ? "text-neutral-400" : "text-neutral-900 dark:text-neutral-50"
        }`}
      >
        {msg.text}
      </p>
    </motion.div>
  );
});

/** Seul composant abonné à currentResponseText → seul à re-render
    à chaque token. Le Globe/Waveform/CommandBar restent figés. */
function StreamingText() {
  const text = useSuzanneStore((s) => s.currentResponseText);
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  if (!speaking || !text) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-indigo-400">
        Suzanne
      </p>
      <p className="max-w-prose text-lg leading-relaxed text-neutral-900 dark:text-neutral-50">
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
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-sm text-neutral-300"
        >
          <motion.span
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            ● ● ●
          </motion.span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* ============================================================
   6. COMMAND BAR — logique Radix/shadcn : clavier complet.
   Entrée = envoyer · Maj+Entrée = nouvelle ligne · Échap = blur
   ============================================================ */

function CommandBar() {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const idle = useSuzanneStore((s) => s.status === "idle");
  const { stream } = useStreamText();

  const send = useCallback(() => {
    const text = value.trim();
    if (!text || !idle) return;
    setValue("");
    stream(text);
  }, [value, idle, stream]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
      if (e.key === "Escape") {
        textareaRef.current?.blur();
      }
      // Maj+Entrée : comportement natif du textarea (nouvelle ligne)
    },
    [send]
  );

  return (
    <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springTransition, delay: 0.15 }}
        className="w-full max-w-2xl rounded-2xl border border-neutral-200/50 bg-white/70 shadow-2xl shadow-neutral-200/50 backdrop-blur-md dark:border-neutral-800/50 dark:bg-black/70 dark:shadow-black/30"
      >
        <VisualWaveform />
        <div className="flex items-end gap-3 px-5 pb-4">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Écrire à Suzanne…"
            aria-label="Écrire à Suzanne"
            rows={1}
            disabled={!idle}
            className="max-h-32 flex-1 resize-none bg-transparent text-[15px] leading-6 text-neutral-900 outline-none placeholder:text-neutral-300 disabled:opacity-50 dark:text-neutral-50"
          />
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={send}
            disabled={!idle || !value.trim()}
            aria-label="Envoyer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm text-white transition-colors hover:bg-indigo-600 disabled:bg-neutral-200 dark:bg-neutral-50 dark:text-neutral-900 dark:disabled:bg-neutral-800"
          >
            ↑
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

/* ============================================================
   7. HEADER — statut atomique
   ============================================================ */

function StatusIndicator() {
  const status = useSuzanneStore((s) => s.status);
  const label =
    status === "thinking"
      ? "Suzanne réfléchit"
      : status === "speaking"
      ? "Suzanne répond"
      : "En veille";
  return (
    <div className="flex items-center gap-2">
      <motion.span
        animate={
          status === "thinking"
            ? { opacity: [0.2, 1, 0.2] }
            : { opacity: 1 }
        }
        transition={
          status === "thinking"
            ? { duration: 0.8, repeat: Infinity }
            : undefined
        }
        className={`h-1.5 w-1.5 rounded-full ${
          status === "idle" ? "bg-neutral-300" : "bg-indigo-500"
        }`}
      />
      <span className="text-[11px] text-neutral-400">{label}</span>
    </div>
  );
}

/* ============================================================
   8. PAGE
   ============================================================ */

export default function SuzannePage() {
  const messages = useSuzanneStore(useShallow((s) => s.messages));
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentLen = useSuzanneStore((s) => s.currentResponseText.length);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, currentLen]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#FAFAFA] font-sans antialiased dark:bg-neutral-950">
      <GlobeCanvas />

      <header className="relative z-10 flex items-center justify-between px-8 py-6 md:px-16">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Suzanne
          </h1>
          <span className="text-[11px] text-neutral-400">
            serveur local · privé
          </span>
        </div>
        <StatusIndicator />
      </header>

      <main
        ref={scrollRef}
        className="relative z-10 h-[calc(100vh-88px)] overflow-y-auto px-8 pb-56 pt-4 md:px-16"
      >
        <div className="flex max-w-xl flex-col gap-14">
          {messages.map((m) => (
            <MessageItem key={m.id} msg={m} />
          ))}
          <StreamingText />
          <ThinkingIndicator />
        </div>
      </main>

      <CommandBar />

      <p className="absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2 text-[10px] text-neutral-300">
        100 % local · vos données ne quittent jamais votre machine
      </p>
    </div>
  );
}
