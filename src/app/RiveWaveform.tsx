"use client";

/* ============================================================
   RIVE WAVEFORM — onde sonore réelle (client-only)
   Importé via next/dynamic({ ssr: false }) depuis page.tsx
   pour éviter tout crash au build/SSR sur Vercel.
   ============================================================ */

import { useEffect } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { useSuzanneStore } from "./page";

const STATE_MACHINE = "StateMachine 1";

export default function RiveWaveform() {
  const speaking = useSuzanneStore((s) => s.status === "speaking");
  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
  });
  const isActive = useStateMachineInput(rive, STATE_MACHINE, "isActive", false);

  useEffect(() => {
    if (isActive) isActive.value = speaking;
  }, [speaking, isActive]);

  return (
    <div className="h-10 w-32 shrink-0" aria-hidden="true">
      <RiveComponent style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
