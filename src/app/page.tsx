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
import { useShallow } from "zustand/react/shallow";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { GlyphMatrix } from "./GlyphMatrix";
import { resolveGlobeIntent, type GlobeIntent } from "./networkSim";
import { useSuzanneStore, type Message } from "./store";

/* Rive chargé uniquement côté client (évite tout crash SSR au build Vercel) */
const RiveWaveform = dynamic(() => import("./RiveWaveform"), {
  ssr: false,
  loading: () => <div className="h-10 w-32 shrink-0" aria-hidden="true" />,
});


/* ============================================================
   2. STREAMING SIMULÉ
   ------------------------------------------------------------
   🔌 OLLAMA : remplacer le corps par un fetch streaming vers
   http://localhost:11434/api/chat — la structure (streamToken
   par chunk, commitResponse à la fin) reste identique.
   ============================================================ */

/* ============================================================
   MOTEUR DE RÉPONSE TEMPORAIRE — mini "intent matching".
   Réagit à des mots-clés dans le message. À remplacer par
   l'appel Ollama réel (garder generateReply → fetch stream).
   ============================================================ */

interface Intent {
  keywords: string[];
  replies: string[];
}

const INTENTS: Intent[] = [
  {
    keywords: ["bonjour", "salut", "hello", "coucou", "hey", "bonsoir"],
    replies: [
      "Bonjour Thomas. Ravie de te retrouver. Sur quoi travaille-t-on aujourd'hui ?",
      "Salut ! Le serveur est chaud, la VRAM au repos. Je t'écoute.",
    ],
  },
  {
    keywords: ["gpu", "carte", "vram", "6750", "radeon", "température", "temp"],
    replies: [
      "La RX 6750 XT tourne à 42°C, VRAM utilisée à 60 %. Tout est nominal pour un modèle 14B.",
      "Ta carte a 12 Go de VRAM — largement de quoi charger Qwen 2.5 14B quantifié en Q4.",
    ],
  },
  {
    keywords: ["ubuntu", "dual", "boot", "partition", "installer", "linux"],
    replies: [
      "Pour le dual-boot : 250 Go en ext4, 16 Go de swap, et garde ton EFI Windows intact. Je te détaille si tu veux.",
      "Ubuntu 24.04 LTS est le bon choix ici — support ROCm officiel et noyau récent pour ta carte.",
    ],
  },
  {
    keywords: ["rocm", "pilote", "driver", "amd"],
    replies: [
      "ROCm laisse Ollama parler directement à ta carte, sans passer par le CPU. C'est la clé de la vitesse.",
      "Vérifie bien la compatibilité ROCm de ton noyau — la RX 6750 XT (gfx1031) demande parfois HSA_OVERRIDE_GFX_VERSION=10.3.0.",
    ],
  },
  {
    keywords: ["ollama", "modèle", "model", "llm", "qwen", "deepseek", "llama"],
    replies: [
      "Ollama encapsule llama.cpp et gère le chargement en VRAM. Un simple `ollama run qwen2.5:14b` et je prends vie.",
      "Pour ton matériel, je conseille Qwen 2.5 14B en Q4_K_M : bon équilibre qualité/mémoire.",
    ],
  },
  {
    keywords: ["docker", "conteneur", "container", "compose"],
    replies: [
      "Docker isolera proprement Open WebUI, la TTS et le monitoring. Un docker-compose.yml et tout se lance ensemble.",
      "Bon réflexe DevOps : chaque service dans son conteneur, orchestré par Compose. On versionnera ça sur ton Git.",
    ],
  },
  {
    keywords: ["merci", "super", "génial", "parfait", "top", "cool"],
    replies: [
      "Avec plaisir. On avance bien sur le projet.",
      "C'est un vrai plaisir de construire ça avec toi.",
    ],
  },
  {
    keywords: ["voix", "parle", "tts", "kokoro", "piper", "audio", "son"],
    replies: [
      "Ma voix passera par Kokoro ou Piper, sur CPU, pour ne pas voler de VRAM au modèle. Français fluide garanti.",
      "La synthèse vocale tournera en tâche de fond — tu me parleras, je te répondrai à voix haute.",
    ],
  },
];

const FALLBACKS = [
  "Intéressant. Développe un peu — je veux être sûre de bien saisir ton besoin.",
  "Je note ça. Tu veux qu'on creuse cet aspect du projet ensemble ?",
  "Bien reçu. Dis-m'en plus, et je t'oriente vers la meilleure approche.",
  "D'accord. On peut aborder ça côté architecture ou côté mise en œuvre — tu préfères quoi ?",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Moteur temporaire. 🔌 OLLAMA : remplacer par un fetch streaming
    vers http://localhost:11434/api/chat qui renvoie la réponse. */
function generateReply(userText: string): string {
  const lower = userText.toLowerCase();
  const matched = INTENTS.filter((intent) =>
    intent.keywords.some((k) => lower.includes(k))
  );
  if (matched.length > 0) {
    // si plusieurs intents matchent, on en combine deux pour + de répondant
    if (matched.length > 1 && Math.random() > 0.5) {
      return `${pick(matched[0].replies)} ${pick(matched[1].replies)}`;
    }
    return pick(matched[0].replies);
  }
  return pick(FALLBACKS);
}

function useStreamText() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const stream = useCallback((userText: string) => {
    const { setStatus, addMessage, commitResponse, setGlobeIntent } =
      useSuzanneStore.getState();

    addMessage({ id: crypto.randomUUID(), text: userText, isUser: true });
    // choisit l'animation du globe selon le contenu du message
    setGlobeIntent(resolveGlobeIntent(userText));
    setStatus("thinking");

    const reply = generateReply(userText);
    const thinkMs = 2000 + Math.min(2000, reply.length * 14);

    timers.current.push(
      setTimeout(() => {
        commitResponse(reply);
        setGlobeIntent(null); // fin de la recherche visuelle
      }, thinkMs)
    );
  }, []);

  return { stream };
}

/* ============================================================
   3. GLOBE COBE — hyper-interactif, zéro re-render React
   ============================================================ */


/* ============================================================
   4. GLOBE — react-globe.gl (arcs, satellite, anneaux)
   Chargé client-only (three.js n'aime pas le SSR).
   ============================================================ */

const GlobeScene = dynamic(() => import("./GlobeScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-40 w-40 rounded-full bg-indigo-100/50 blur-3xl" />
    </div>
  ),
});

function GlobeCanvas() {
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
      <GlobeScene />
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

/* ============================================================
   HYPERTEXT — effet de brouillage/déchiffrage des caractères
   (façon Magic UI). Chaque lettre scramble aléatoirement puis
   se fixe, de gauche à droite. Utilisé pour révéler le dernier
   mot streamé par Suzanne.
   ============================================================ */

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&?!";

/**
 * Déchiffrage : chaque caractère commence brouillé puis se fixe de
 * gauche à droite. `speed` = caractères/seconde.
 * - onSettle() est appelé quand tout est fixé.
 * - onProgress() est appelé à chaque nouveau caractère fixé
 *   (sert à faire pulser le globe en rythme).
 */
function HyperText({
  text,
  className = "",
  speed = 34,
  onSettle,
  onProgress,
}: {
  text: string;
  className?: string;
  speed?: number;
  onSettle?: () => void;
  onProgress?: () => void;
}) {
  const [display, setDisplay] = useState("");
  const raf = useRef<number>(0);
  const lastSettled = useRef(0);

  useEffect(() => {
    const chars = text.split("");
    const start = performance.now();
    lastSettled.current = 0;

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const settledCount = Math.floor(elapsed * speed);

      // pulse le globe à chaque nouveau caractère fixé
      if (settledCount > lastSettled.current) {
        lastSettled.current = settledCount;
        onProgress?.();
      }

      let done = true;
      const out = chars.map((c, i) => {
        if (c === " " || i < elapsed * speed) return c;
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
        onSettle?.();
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // onSettle/onProgress volontairement hors deps (refs stables)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed]);

  return <span className={className}>{display}</span>;
}

const MessageItem = memo(function MessageItem({
  msg,
  animate = false,
}: {
  msg: Message;
  animate?: boolean;
}) {
  const finishSpeaking = useSuzanneStore((s) => s.finishSpeaking);

  // pulse le globe pendant le déchiffrage (via tokenPulse hors-React)
  const pulse = useCallback(() => {
    useSuzanneStore.setState((s) => ({ tokenPulse: s.tokenPulse + 1 }));
  }, []);

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
        {animate ? (
          <HyperText
            text={msg.text}
            speed={msg.isUser ? 120 : 110}
            onProgress={msg.isUser ? undefined : pulse}
            onSettle={msg.isUser ? undefined : finishSpeaking}
          />
        ) : (
          msg.text
        )}
      </p>
    </motion.div>
  );
});

function ThinkingIndicator() {
  const thinking = useSuzanneStore((s) => s.status === "thinking");
  const intent = useSuzanneStore((s) => s.globeIntent);
  return (
    <AnimatePresence>
      {thinking && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="self-start"
        >
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="font-mono text-xs text-neutral-400"
          >
            {intent?.label ?? "…"}
          </motion.span>
        </motion.div>
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
          {messages.map((m, i) => (
            <MessageItem
              key={m.id}
              msg={m}
              animate={i === messages.length - 1 && m.id !== "welcome"}
            />
          ))}
          <ThinkingIndicator />
        </div>
      </main>

      <CommandBar />
    </div>
  );
}
