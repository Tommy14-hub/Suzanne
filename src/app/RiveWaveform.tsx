"use client";

/* ============================================================
   WAVEFORM — animation Rive réelle.
   Le fichier .riv a 3 artboards ; seul "compose" possède
   l'input "isActive" utilisé pour piloter idle/active/glow.
   ============================================================ */

import { useEffect, useState } from "react";
import {
  useRive,
  useStateMachineInput,
  Layout,
  Fit,
  Alignment,
} from "@rive-app/react-canvas";
import { useSuzanneStore } from "./store";

const STATE_MACHINE = "State Machine 1";
const ARTBOARD = "compose";

export default function RiveWaveform() {
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  const [riveOk, setRiveOk] = useState(false);
  const [riveFailed, setRiveFailed] = useState(false);

  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    onLoad: () => setRiveOk(true),
    onLoadError: () => setRiveFailed(true),
  });
  const isActive = useStateMachineInput(rive, STATE_MACHINE, "isActive", false);

  useEffect(() => {
    if (isActive) isActive.value = speaking;
  }, [speaking, isActive]);

  const showCss = !riveOk || riveFailed;

  return (
    <div
      className="relative flex h-16 w-40 items-center justify-center"
      aria-hidden="true"
    >
      {/* RiveComponent TOUJOURS monté — le canvas doit exister dès le
          départ pour que Rive puisse s'y attacher correctement.
          Le rendre conditionnel (sur riveOk) casse le rattachement. */}
      <div className="absolute inset-0">
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Repli CSS superposé tant que Rive n'a pas confirmé son chargement */}
      {showCss && (
        <div className="absolute inset-0 flex items-center justify-center gap-1 bg-transparent">
          {Array.from({ length: 13 }).map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-indigo-500"
              style={{
                height: speaking ? undefined : 4,
                animation: speaking
                  ? `suzanne-wave 0.85s ease-in-out ${i * 0.06}s infinite`
                  : "none",
                opacity: speaking ? 0.9 : 0.2,
                transition: "opacity 0.3s, height 0.3s",
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes suzanne-wave {
          0%, 100% { height: 5px; }
          25%      { height: 28px; }
          50%      { height: 12px; }
          75%      { height: 22px; }
        }
      `}</style>
    </div>
  );
}
