"use client";

/* ============================================================
   STORE ZUSTAND — état global de Suzanne
   Extrait dans son propre module (une route Next.js ne peut pas
   exporter de membres non-standard comme un hook).
   ============================================================ */

import { create } from "zustand";
import { type GlobeIntent } from "./networkSim";

export type SuzanneStatus = "idle" | "thinking" | "speaking";

export interface Message {
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

export const useSuzanneStore = create<SuzanneStore>((set) => ({
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
