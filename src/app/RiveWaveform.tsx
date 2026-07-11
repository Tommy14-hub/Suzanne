"use client";

/* ============================================================
   WAVEFORM — animation Rive réelle + diagnostic visible.
   Un badge temporaire affiche l'état de chargement pour
   comprendre précisément ce qui se passe dans le navigateur.
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
  const [debug, setDebug] = useState("init");

  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    onLoad: () => setDebug("loaded"),
    onLoadError: (e) => setDebug("error:" + JSON.stringify(e)),
    onStateChange: (e) => setDebug("state:" + JSON.stringify(e.data)),
  });
  const isActive = useStateMachineInput(rive, STATE_MACHINE, "isActive", false);

  useEffect(() => {
    if (isActive) {
      isActive.value = speaking;
      setDebug((d) => d + ` | isActive=${speaking}`);
    } else {
      setDebug((d) => d + " | isActive input NOT FOUND");
    }
  }, [speaking, isActive]);

  const showCss = debug !== "loaded" && !debug.startsWith("loaded");

  return (
    <div className="flex flex-col items-center gap-1" aria-hidden="true">
      <div className="relative flex h-16 w-40 items-center justify-center">
        {/* Animation Rive réelle */}
        <div className="absolute inset-0">
          <RiveComponent style={{ width: "100%", height: "100%" }} />
        </div>

        {/* Repli CSS visible tant que le statut n'est pas confirmé "loaded" */}
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
      </div>

      {/* Badge de diagnostic — TEMPORAIRE, à retirer une fois le bug résolu */}
      <span className="max-w-[260px] break-all text-center font-mono text-[9px] text-neutral-400">
        {debug}
      </span>

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
