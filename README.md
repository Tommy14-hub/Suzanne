# Suzanne# 🌐 Suzanne : Assistante IA Locale & Privée

Suzanne est un serveur d'intelligence artificielle domestique 100% souverain, conçu pour tourner localement sur une machine Ubuntu (avec GPU RX 6750 XT). Pensée comme un véritable "copilote SysAdmin", elle allie une puissance d'inférence locale à une interface web néo-minimaliste d'une fluidité absolue.

## ✨ Fonctionnalités clés

*   **100% Local & Privé :** Aucune donnée ne quitte votre machine. Zéro API cloud, zéro abonnement.
*   **Interface Néo-Minimaliste :** Un design "Light Mode" épuré inspiré des meilleurs standards (Vercel, Apple Intelligence, Linear).
*   **Incarnation 3D :** Un globe terrestre interactif (`cobe`) qui réagit en temps réel aux états de réflexion et de parole de l'IA.
*   **Voix Neuronale Intégrée :** Onde sonore dynamique animée via `Rive` pour synchroniser visuellement la synthèse vocale (Kokoro TTS).
*   **Barre de commande flottante :** Une zone d'interaction type "Raycast" en glassmorphism pour une UX optimale.

## 🛠️ Stack Technique

### Frontend (L'interface web)
*   **Framework :** Next.js (App Router) & React
*   **Style & UI :** Tailwind CSS, Shadcn/ui, Radix Primitives
*   **State Management :** Zustand (pour une gestion d'état optimisée sans re-rendu de la 3D)
*   **Animations 3D & 2D :** Cobe (Globe WebGL), Rive (Onde sonore), Framer Motion

### Backend (Le moteur IA - *En cours d'intégration*)
*   **Système :** Ubuntu Linux Server
*   **LLM :** Modèle 14B (ex: Qwen) via Ollama
*   **Voix :** Moteur Text-to-Speech (TTS) neuronal open-source (Kokoro)

## 🚀 Installation de l'interface (Mockup Frontend)

Pour lancer l'interface web de Suzanne en local sur votre machine de développement :

1. Clonez ce dépôt :
   ```bash
   git clone [https://github.com/votre-nom/suzanne-ui.git](https://github.com/votre-nom/suzanne-ui.git)
   cd suzanne-ui
