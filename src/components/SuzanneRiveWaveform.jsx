/* ============================================================
   SuzanneRiveWaveform.jsx — POUR VOTRE PROJET RÉEL
   ------------------------------------------------------------
   Ce composant remplace la <Waveform /> canvas de l'aperçu.
   Il utilise votre fichier Rive personnalisé.

   Prérequis dans votre projet :
     npm install @rive-app/react-canvas
   Placez votre fichier dans /public/waveform.riv
   (accessible via le chemin "/waveform.riv")

   Spécifications respectées :
   - Machine à états : "StateMachine 1"
   - Input booléen : "isActive"
   - Fond transparent, h-16, intégré dans la command bar
   ============================================================ */

import { useEffect } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

const STATE_MACHINE = "StateMachine 1";
const INPUT_NAME = "isActive";

/**
 * @param {{ speaking: boolean }} props
 *   speaking — true quand Suzanne est dans l'état "speaking".
 *   L'input Rive "isActive" est synchronisé dessus :
 *   true  → animations 'active' + 'glow'
 *   false → retour à l'animation 'idle'
 */
export default function SuzanneRiveWaveform({ speaking }) {
  const { rive, RiveComponent } = useRive({
    src: "/waveform.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
  });

  const isActiveInput = useStateMachineInput(
    rive,
    STATE_MACHINE,
    INPUT_NAME,
    false // valeur initiale : idle
  );

  // Synchronisation : état de discussion → input Rive
  useEffect(() => {
    if (isActiveInput) {
      isActiveInput.value = speaking;
    }
  }, [speaking, isActiveInput]);

  return (
    <div className="h-16 w-full" style={{ background: "transparent" }}>
      <RiveComponent
        aria-hidden="true"
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />
    </div>
  );
}

/* ============================================================
   INTÉGRATION dans suzanne-interface.jsx (projet réel) :

   1. Importer :
        import SuzanneRiveWaveform from "./SuzanneRiveWaveform";

   2. Dans la command bar, remplacer :
        <Waveform active={state === STATES.SPEAKING} />
      par :
        <SuzanneRiveWaveform speaking={state === STATES.SPEAKING} />

   C'est tout — la logique d'états (idle/thinking/speaking)
   reste inchangée, seul le rendu visuel passe sur Rive.
   ============================================================ */
