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
import {
  makeLink,
  resolveGlobeIntent,
  type NetLink,
  type GlobeIntent,
} from "./networkSim";

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
  tokenPulse: number;
  globeIntent: GlobeIntent | null;
  setStatus: (s: SuzanneStatus) => void;
  addMessage: (m: Message) => void;
  streamToken: (fullText: string) => void;
  commitResponse: (text: string) => void;
  finishSpeaking: () => void;
  setGlobeIntent: (i: GlobeIntent | null) => void;
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
  globeIntent: null,
  setStatus: (status) => set({ status }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setGlobeIntent: (globeIntent) => set({ globeIntent }),
  streamToken: (fullText) =>
    set((s) => ({
      currentResponseText: fullText,
      tokenPulse: s.tokenPulse + 1,
    })),
  commitResponse: (text: string) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), text, isUser: false },
      ],
      currentResponseText: "",
      status: "speaking", // reste en speaking pendant le déchiffrage HyperText
    })),
  finishSpeaking: () => set({ status: "idle" }),
}));

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
  const beatSmooth = useRef(0); // luminosité lissée → anti-saccade
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

  /* overlay réseau (arcs IP, satellite, ping) */
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const links = useRef<NetLink[]>([]);
  const linkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const intent = useRef<GlobeIntent | null>(null);

  useEffect(() => {
    /* Abonnements hors cycle React */
    const unsub = useSuzanneStore.subscribe((state, prev) => {
      status.current = state.status;
      intent.current = state.globeIntent;

      /* micro-impulsion de zoom à chaque token streamé */
      if (state.tokenPulse !== prev.tokenPulse) zoomPulse.current = 1;

      /* cinématique des états */
      if (state.status === "thinking") {
        targetSpeed.current = 0.016;
        targetTheta.current = 0.85; // bascule vers le pôle nord

        /* génère un trafic réseau intense selon le mode d'intent */
        if (!linkTimer.current) {
          const mode = state.globeIntent?.mode ?? "network";
          const target = state.globeIntent?.target;
          const spawn = () => {
            if (mode === "ping" || mode === "satellite") {
              // toutes les connexions convergent vers le pays cible
              if (links.current.length < 8 && target) {
                links.current.push(makeLink(undefined, target));
              }
            } else {
              // trafic mondial dense
              if (links.current.length < 12) links.current.push(makeLink());
            }
          };
          spawn();
          linkTimer.current = setInterval(spawn, mode === "network" ? 180 : 280);
        }

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
        if (linkTimer.current) {
          clearInterval(linkTimer.current);
          linkTimer.current = null;
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
      if (linkTimer.current) clearInterval(linkTimer.current);
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
        const targetBeat =
          s === "thinking"
            ? Math.pow(Math.max(0, Math.sin(clock.current * 3.2)), 4) * 0.5
            : 0;
        /* lissage du beat → pas de coupure brutale en sortie de thinking */
        beatSmooth.current += (targetBeat - beatSmooth.current) * 0.15;

        /* --- micro-impulsion de zoom (token) : décroissance --- */
        zoomPulse.current *= 0.92;

        /* --- échelle CIBLE selon l'état --- */
        let targetScale = 1;
        if (s === "thinking") {
          targetScale = 1 + Math.sin(clock.current * 2.4) * 0.05;
        } else if (s === "speaking") {
          targetScale = 1 + zoomPulse.current * 0.05;
        }
        /* lissage doux de l'échelle → transitions fluides, y compris
           le retour à 1 quand l'animation se termine */
        scaleSmooth.current += (targetScale - scaleSmooth.current) * 0.08;

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
        state.mapBrightness = 4.2 + beatSmooth.current * 2.2;
        state.markers = markers;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    /* ========================================================
       OVERLAY RÉSEAU — projette les villes avec la MÊME rotation
       que le globe (phi/theta) et dessine arcs, satellite, ping.
       Canvas superposé, transparent, purement décoratif.
       ======================================================== */
    const overlay = overlayRef.current;
    const octx = overlay?.getContext("2d") ?? null;
    let oraf = 0;

    /* projette lat/lng → point écran + z (profondeur) sur la sphère */
    const projectGeo = (lat: number, lng: number, R: number, cx: number, cy: number) => {
      const phase = phi.current;
      // cobe : lng->longitude autour de Y, lat->latitude
      const la = (lat * Math.PI) / 180;
      const lo = (lng * Math.PI) / 180 + phase;
      // point 3D sur sphère unité
      const x = Math.cos(la) * Math.sin(lo);
      const y = Math.sin(la);
      const z = Math.cos(la) * Math.cos(lo);
      // inclinaison (theta) autour de X
      const t = theta.current;
      const y2 = y * Math.cos(t) - z * Math.sin(t);
      const z2 = y * Math.sin(t) + z * Math.cos(t);
      return { x: cx + x * R, y: cy - y2 * R, z: z2 };
    };

    const drawOverlay = () => {
      oraf = requestAnimationFrame(drawOverlay);
      if (!overlay || !octx) return;
      const now = performance.now();
      const dpr = window.devicePixelRatio || 1;
      const size = width;
      if (overlay.width !== size * dpr) {
        overlay.width = size * dpr;
        overlay.height = size * dpr;
      }
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, size, size);

      const s = status.current;
      if (s !== "thinking") {
        // fade-out rapide des liens restants
        links.current = links.current.filter((l) => now - l.born < l.ttl);
      }
      if (links.current.length === 0) return;

      const cx = size / 2;
      const cy = size / 2;
      const R = size * 0.5 * 0.42 * scaleSmooth.current; // ~rayon du globe cobe
      const mode = intent.current?.mode ?? "network";

      // purge des liens expirés
      links.current = links.current.filter((l) => now - l.born < l.ttl);

      for (const link of links.current) {
        const age = (now - link.born) / link.ttl; // 0..1
        const a = projectGeo(link.from.lat, link.from.lng, R, cx, cy);
        const b = projectGeo(link.to.lat, link.to.lng, R, cx, cy);

        // opacité qui monte puis descend (cloche)
        const env = Math.sin(age * Math.PI);

        // arc en cloche entre a et b (point de contrôle surélevé)
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        // perpendiculaire pour bomber l'arc vers l'extérieur du globe
        const nx = -dy / (dist || 1);
        const ny = dx / (dist || 1);
        const lift = dist * 0.35 + 20;
        const ctrlX = mx + nx * lift;
        const ctrlY = my + ny * lift;

        // couleur selon le mode
        const col =
          mode === "satellite"
            ? "34,197,94" // vert
            : mode === "ping"
            ? "244,114,182" // rose
            : "99,102,241"; // indigo (network/scan)

        // trait de l'arc
        octx.beginPath();
        octx.moveTo(a.x, a.y);
        octx.quadraticCurveTo(ctrlX, ctrlY, b.x, b.y);
        octx.strokeStyle = `rgba(${col},${0.5 * env})`;
        octx.lineWidth = 1.2;
        octx.stroke();

        // paquet qui circule le long de l'arc (progression = age)
        const p = age;
        const qx =
          (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * ctrlX + p * p * b.x;
        const qy =
          (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * ctrlY + p * p * b.y;
        octx.beginPath();
        octx.arc(qx, qy, 2, 0, Math.PI * 2);
        octx.fillStyle = `rgba(${col},${0.9 * env})`;
        octx.fill();

        // points d'ancrage (villes) visibles seulement si face avant
        for (const pt of [a, b]) {
          if (pt.z > -0.1) {
            octx.beginPath();
            octx.arc(pt.x, pt.y, 1.6, 0, Math.PI * 2);
            octx.fillStyle = `rgba(${col},${0.7 * env})`;
            octx.fill();
          }
        }

        // étiquette IP près du point de départ (petit, discret)
        if (a.z > 0 && env > 0.3) {
          octx.font = "9px ui-monospace, monospace";
          octx.fillStyle = `rgba(${col},${0.6 * env})`;
          octx.fillText(link.ip, a.x + 5, a.y - 4);
        }
      }

      // SATELLITE : trace un faisceau depuis un point orbital vers la cible
      if (mode === "satellite" && intent.current?.target) {
        const tgt = intent.current.target;
        const b = projectGeo(tgt.lat, tgt.lng, R, cx, cy);
        if (b.z > -0.2) {
          // position du satellite : au-dessus, oscille légèrement
          const satX = cx + Math.sin(now / 900) * R * 0.5;
          const satY = cy - R * 1.35;
          const beat = 0.5 + 0.5 * Math.sin(now / 200);
          // faisceau
          octx.beginPath();
          octx.moveTo(satX, satY);
          octx.lineTo(b.x, b.y);
          octx.strokeStyle = `rgba(34,197,94,${0.25 + beat * 0.35})`;
          octx.lineWidth = 1;
          octx.stroke();
          // corps du satellite
          octx.beginPath();
          octx.arc(satX, satY, 3, 0, Math.PI * 2);
          octx.fillStyle = "rgba(34,197,94,0.9)";
          octx.fill();
          octx.beginPath();
          octx.arc(satX, satY, 7, 0, Math.PI * 2);
          octx.strokeStyle = `rgba(34,197,94,${beat * 0.5})`;
          octx.stroke();
          // cible au sol : cercle de visée
          octx.beginPath();
          octx.arc(b.x, b.y, 6 + beat * 4, 0, Math.PI * 2);
          octx.strokeStyle = `rgba(34,197,94,${0.6 * (1 - beat)})`;
          octx.stroke();
        }
      }
    };
    oraf = requestAnimationFrame(drawOverlay);

    return () => {
      globe.destroy();
      cancelAnimationFrame(oraf);
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
      {/* overlay réseau : arcs IP, satellite, ping — superposé, non interactif */}
      <canvas
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
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
            speed={msg.isUser ? 55 : 34}
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
          className="flex items-center gap-3 self-start"
        >
          <motion.span
            animate={{ opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: 1.3, repeat: Infinity }}
            className="text-sm text-neutral-300"
          >
            ● ● ●
          </motion.span>
          {intent && (
            <span className="font-mono text-xs text-neutral-400">
              {intent.label}
            </span>
          )}
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
