"use client";

/* ============================================================
   WAVEFORM — barres animées quand Suzanne parle.
   Approche robuste : rendu CSS garanti (barres qui dansent),
   + tentative Rive par-dessus. Si le .riv se charge, il s'affiche ;
   sinon la version CSS assure toujours le visuel.
   ============================================================ */

import { useEffect, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { useSuzanneStore } from "./store";

const STATE_MACHINE = "State Machine 1";

export default function RiveWaveform() {
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  const [riveReady, setRiveReady] = useState(false);

  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
    onLoad: () => setRiveReady(true),
  });
  const isActive = useStateMachineInput(rive, STATE_MACHINE, "isActive", false);

  useEffect(() => {
    if (isActive) isActive.value = speaking;
  }, [speaking, isActive]);

  return (
    <div className="relative h-10 w-28 shrink-0" aria-hidden="true">
      {/* Waveform CSS — barres qui dansent (garantie de visuel) */}
      <div
        className="absolute inset-0 flex items-center justify-center gap-[3px]"
        style={{ opacity: riveReady ? 0 : 1, transition: "opacity 0.4s" }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-indigo-500"
            style={{
              height: speaking ? undefined : "3px",
              animation: speaking
                ? `suzanne-wave 0.9s ease-in-out ${i * 0.08}s infinite`
                : "none",
              transition: "height 0.3s",
            }}
          />
        ))}
      </div>

      {/* Rive par-dessus si dispo */}
      <div style={{ opacity: riveReady ? 1 : 0, transition: "opacity 0.4s" }}>
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      </div>

      <style>{`
        @keyframes suzanne-wave {
          0%, 100% { height: 4px; opacity: 0.4; }
          50%      { height: 26px; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
