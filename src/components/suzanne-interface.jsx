import { useState, useRef, useEffect, useCallback } from "react";

/* ============================================================
   SUZANNE — v2 « Premium »
   Globe majestueux débordant · Command bar flottante (glass)
   Typographie au centre · Waveform intégrée à la barre
   ------------------------------------------------------------
   NOTE RIVE : dans l'aperçu Claude, @rive-app/react-canvas
   n'est pas disponible. La waveform est donc rendue en canvas
   natif AU MÊME EMPLACEMENT que votre futur composant Rive.
   → Le fichier `SuzanneRiveWaveform.jsx` (fourni à côté)
     contient le code exact ("StateMachine 1" / "isActive")
     à substituer dans votre vrai projet.
   ============================================================ */

const STATES = { IDLE: "idle", THINKING: "thinking", SPEAKING: "speaking" };

const FAKE_REPLIES = [
  "Bonjour Thomas. Ton serveur tourne parfaitement — la RX 6750 XT est à 42°C et la VRAM n'est utilisée qu'à 60 %. Que puis-je faire pour toi ?",
  "Pour le dual-boot Ubuntu, je te recommande 250 Go en ext4, avec 16 Go de swap pour correspondre à ta RAM. Je peux te détailler le partitionnement si tu veux.",
  "ROCm est l'écosystème open-source d'AMD. Il permet à Ollama de dialoguer directement avec les 12 Go de VRAM de ta carte graphique, sans passer par le CPU.",
  "Bien noté. J'ai mémorisé cette préférence dans ma base vectorielle. Je m'en souviendrai lors de nos prochaines conversations.",
];

/* ============================================================
   GLOBE — présence organique majestueuse, déborde de l'écran
   ============================================================ */
function Globe({ state }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let rotation = 0;
    let t = 0;
    let stopped = false;
    let speed = 0.0032;

    const N = 1300;
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
    }
    const markers = [40, 210, 455, 700, 930, 1150, 620, 88].map((i) => pts[i]);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      if (stopped) return;
      t += 1;
      const s = stateRef.current;
      const target =
        s === STATES.THINKING ? 0.013 : s === STATES.SPEAKING ? 0.0055 : 0.0032;
      speed += (target - speed) * 0.035;
      rotation += speed;

      const { clientWidth: w, clientHeight: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      let scale = 1;
      if (s === STATES.SPEAKING) scale = 1 + Math.sin(t * 0.14) * 0.015;
      // Le rayon dépasse volontairement le conteneur → présence, pas widget
      const R = Math.min(w, h) * 0.52 * scale;

      const pulse =
        s === STATES.THINKING
          ? 0.55 + Math.sin(t * 0.22) * 0.35
          : s === STATES.SPEAKING
          ? 0.45 + Math.sin(t * 0.14) * 0.15
          : 0.28;

      const glow = ctx.createRadialGradient(cx, cy, R * 0.35, cx, cy, R * 1.5);
      glow.addColorStop(0, `rgba(129, 140, 248, ${0.09 * pulse + 0.035})`);
      glow.addColorStop(1, "rgba(129, 140, 248, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      const tilt = -0.32;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      const project = (p) => {
        const x1 = p.x * cosR + p.z * sinR;
        const z1 = -p.x * sinR + p.z * cosR;
        const y1 = p.y * cosT - z1 * sinT;
        const z2 = p.y * sinT + z1 * cosT;
        return { x: cx + x1 * R, y: cy + y1 * R, z: z2 };
      };

      for (const p of pts) {
        const q = project(p);
        if (q.z < -0.12) continue;
        const depth = (q.z + 1) / 2;
        const alpha = 0.05 + depth * 0.38;
        const size = 0.7 + depth * 1.4;
        ctx.fillStyle = `rgba(71, 85, 105, ${alpha})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const m of markers) {
        const q = project(m);
        if (q.z < 0) continue;
        const depth = (q.z + 1) / 2;
        const mPulse =
          s === STATES.THINKING ? 0.6 + Math.sin(t * 0.28) * 0.4 : 0.85;
        ctx.fillStyle = `rgba(99, 102, 241, ${0.65 * depth * mPulse})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 2.4 + depth * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(99, 102, 241, ${0.12 * depth * mPulse})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 8 + depth * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    />
  );
}

/* ============================================================
   WAVEFORM — intégrée à la command bar.
   (À remplacer par SuzanneRiveWaveform dans votre projet réel.)
   ============================================================ */
function Waveform({ active }) {
  const canvasRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let t = 0;
    let amp = 0;
    let stopped = false;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      if (stopped) return;
      t += 0.055;
      const target = activeRef.current ? 1 : 0;
      amp += (target - amp) * 0.055;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // trois couches de courbes pour un rendu « respiration vocale »
      const layers = [
        { f: 8, speed: 2.1, alpha: 0.55, lw: 1.6 },
        { f: 5, speed: -1.4, alpha: 0.28, lw: 1.2 },
        { f: 11, speed: 1.7, alpha: 0.18, lw: 1 },
      ];
      const mid = h / 2;

      for (const L of layers) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const nx = x / w;
          const env = Math.sin(nx * Math.PI); // atténue les bords
          const y =
            mid +
            amp *
              env *
              Math.sin(nx * L.f + t * L.speed) *
              Math.sin(nx * 3.3 - t * 0.9) *
              (h * 0.36);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(99, 102, 241, ${
          (0.1 + amp * L.alpha) * (amp > 0.02 ? 1 : 0.6)
        })`;
        ctx.lineWidth = L.lw;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-16 w-full"
      style={{ display: "block", background: "transparent" }}
      aria-hidden="true"
    />
  );
}

/* ============================================================
   MESSAGE — la typographie est l'interface
   ============================================================ */
function Message({ role, text }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isUser = role === "user";
  return (
    <div
      className="transition-all duration-700 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(14px)",
      }}
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-gray-400">
        {isUser ? "Vous" : "Suzanne"}
      </p>
      <p
        className={`max-w-prose text-lg leading-relaxed ${
          isUser ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */
export default function SuzanneInterface() {
  const [state, setState] = useState(STATES.IDLE);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Bonjour. Je suis Suzanne, ton assistante locale. Écris-moi quelque chose pour voir mes états en action.",
    },
  ]);
  const [input, setInput] = useState("");
  const replyIndex = useRef(0);
  const scrollRef = useRef(null);
  const timeouts = useRef([]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => timeouts.current.forEach(clearTimeout), []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || state !== STATES.IDLE) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setState(STATES.THINKING);

    const reply = FAKE_REPLIES[replyIndex.current % FAKE_REPLIES.length];
    replyIndex.current += 1;

    timeouts.current.push(
      setTimeout(() => {
        setState(STATES.SPEAKING);
        setMessages((m) => [...m, { role: "assistant", text: "" }]);

        const words = reply.split(" ");
        let i = 0;
        const interval = setInterval(() => {
          i += 1;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              text: words.slice(0, i).join(" "),
            };
            return copy;
          });
          if (i >= words.length) {
            clearInterval(interval);
            timeouts.current.push(setTimeout(() => setState(STATES.IDLE), 600));
          }
        }, 85);
      }, 1800)
    );
  }, [input, state]);

  const stateLabel =
    state === STATES.THINKING
      ? "Suzanne réfléchit"
      : state === STATES.SPEAKING
      ? "Suzanne répond"
      : "En veille";

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{
        backgroundColor: "#FAFAFA",
        fontFamily:
          "'Inter', 'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        @keyframes suzanne-blink {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* ---------- GLOBE : présence majestueuse, déborde à droite ----------
           Positionné en absolu, plus grand que sa zone : il est coupé
           par les bords haut/droit de l'écran. -------------------------- */}
      <div
        className="pointer-events-none absolute -right-[18vw] top-1/2 -translate-y-1/2 md:-right-[12vw]"
        style={{ width: "72vmin", height: "72vmin", minWidth: 420 }}
        aria-hidden="true"
      >
        <div className="h-full w-full md:scale-[1.6]" style={{ transformOrigin: "center" }}>
          <Globe state={state} />
        </div>
      </div>

      {/* ---------- Header minimal ---------- */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 md:px-16">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            Suzanne
          </h1>
          <span className="text-[11px] text-gray-400">
            serveur local · privé
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              state === STATES.IDLE ? "bg-gray-300" : "bg-indigo-500"
            }`}
            style={{
              animation:
                state === STATES.THINKING
                  ? "suzanne-blink 0.8s ease-in-out infinite"
                  : "none",
            }}
          />
          <span className="text-[11px] text-gray-400">{stateLabel}</span>
        </div>
      </header>

      {/* ---------- Chat : typographie flottante à gauche ---------- */}
      <main
        ref={scrollRef}
        className="relative z-10 h-[calc(100vh-88px)] overflow-y-auto px-8 pb-56 pt-4 md:px-16"
      >
        <div className="flex max-w-xl flex-col gap-14">
          {messages.map((m, i) => (
            <Message key={i} role={m.role} text={m.text} />
          ))}
          {state === STATES.THINKING && (
            <p className="text-sm text-gray-300">
              <span style={{ animation: "suzanne-blink 1s infinite" }}>
                ● ● ●
              </span>
            </p>
          )}
        </div>
      </main>

      {/* ---------- COMMAND BAR flottante : glass, centrée, chevauche tout ---------- */}
      <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
        <div className="w-full max-w-2xl rounded-2xl border border-white/60 bg-white/80 shadow-2xl shadow-gray-200/50 backdrop-blur-md">
          {/* Waveform intégrée — la voix émane de la barre.
              → Emplacement exact du futur composant Rive. */}
          <Waveform active={state === STATES.SPEAKING} />

          <div className="flex items-center gap-3 px-5 pb-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Écrire à Suzanne…"
              aria-label="Écrire à Suzanne"
              disabled={state !== STATES.IDLE}
              className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder-gray-300 outline-none disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={state !== STATES.IDLE || !input.trim()}
              aria-label="Envoyer"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm text-white transition-all hover:bg-indigo-600 disabled:bg-gray-200"
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      <p className="absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2 text-[10px] text-gray-300">
        100 % local · vos données ne quittent jamais votre machine
      </p>
    </div>
  );
}
