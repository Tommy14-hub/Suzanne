"use client";

/* ============================================================
   WAVEFORM — barres animées quand Suzanne parle.
   Le rendu CSS est TOUJOURS affiché quand speaking=true (visuel
   garanti). Rive se superpose en bonus si le fichier se charge.
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
    <div className="relative flex h-10 w-24 shrink-0 items-center justify-center" aria-hidden="true">
      {/* Barres CSS — toujours visibles quand Suzanne parle */}
      <div className="flex items-center justify-center gap-[3px]">
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-indigo-500"
            style={{
              height: 4,
              animation: speaking
                ? `suzanne-wave 0.9s ease-in-out ${i * 0.09}s infinite`
                : "none",
              opacity: speaking ? 1 : 0.25,
              transition: "opacity 0.3s",
            }}
          />
        ))}
      </div>

      {/* Rive en superposition (bonus, si dispo) */}
      {riveOk && (
        <div className="absolute inset-0">
          <RiveComponent style={{ width: "100%", height: "100%" }} />
        </div>
      )}

      <style>{`
        @keyframes suzanne-wave {
          0%, 100% { height: 4px; }
          50%      { height: 24px; }
        }
      `}</style>
    </div>
  );
}
