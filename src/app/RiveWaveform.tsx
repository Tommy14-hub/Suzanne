"use client";

/* ============================================================
   WAVEFORM — animation Rive réelle (fichier .riv de l'utilisateur)
   avec repli CSS garanti en cas d'échec de chargement.
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

export default function RiveWaveform() {
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  const [riveOk, setRiveOk] = useState(false);
  const [riveFailed, setRiveFailed] = useState(false);

  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    // ⚠️ CRUCIAL : le fichier a 3 artboards ("base", "inout", "compose").
    // Seul "compose" possède l'input "isActive" — sans le préciser,
    // Rive charge "base" par défaut, qui n'a AUCUN input, et isActive
    // est silencieusement ignoré (c'était la cause de l'invisibilité).
    artboard: "compose",
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
      {/* Animation Rive réelle */}
      {riveOk && !riveFailed && (
        <div className="absolute inset-0">
          <RiveComponent style={{ width: "100%", height: "100%" }} />
        </div>
      )}

      {/* Repli CSS — affiché tant que Rive n'a pas confirmé son chargement,
          ou si le chargement a échoué */}
      {showCss && (
        <div className="flex h-full items-center justify-center gap-1">
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
