"use client";

/* ============================================================
   WAVEFORM — barres animées quand Suzanne parle.
   Rendu CSS garanti (indépendant de Rive). Rive se superpose
   si le fichier .riv se charge correctement.
   ============================================================ */

import { useEffect, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { useSuzanneStore } from "./store";

const STATE_MACHINE = "State Machine 1";

export default function RiveWaveform() {
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  const [riveOk, setRiveOk] = useState(false);

  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
    onLoad: () => setRiveOk(true),
  });
  const isActive = useStateMachineInput(rive, STATE_MACHINE, "isActive", false);

  useEffect(() => {
    if (isActive) isActive.value = speaking;
  }, [speaking, isActive]);

  return (
    <div
      className="relative flex h-8 w-40 items-center justify-center"
      aria-hidden="true"
    >
      {/* Barres CSS — visibles dès que Suzanne parle */}
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

      {/* Rive en superposition si dispo */}
      {riveOk && (
        <div className="absolute inset-0">
          <RiveComponent style={{ width: "100%", height: "100%" }} />
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
