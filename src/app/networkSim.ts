/* ============================================================
   NETWORK SIM — données et logique pour les animations du globe
   (trafic IP mondial, satellite, ping ciblé…)
   ============================================================ */

export interface City {
  name: string;
  cc: string; // code pays
  lat: number;
  lng: number;
}

/* Grandes villes réparties sur le globe pour un trafic crédible */
export const CITIES: City[] = [
  { name: "Paris", cc: "FR", lat: 48.85, lng: 2.35 },
  { name: "London", cc: "GB", lat: 51.5, lng: -0.12 },
  { name: "New York", cc: "US", lat: 40.71, lng: -74.0 },
  { name: "San Francisco", cc: "US", lat: 37.77, lng: -122.42 },
  { name: "Frankfurt", cc: "DE", lat: 50.11, lng: 8.68 },
  { name: "Amsterdam", cc: "NL", lat: 52.37, lng: 4.9 },
  { name: "Tokyo", cc: "JP", lat: 35.68, lng: 139.65 },
  { name: "Singapore", cc: "SG", lat: 1.35, lng: 103.82 },
  { name: "Mumbai", cc: "IN", lat: 19.08, lng: 72.88 },
  { name: "São Paulo", cc: "BR", lat: -23.55, lng: -46.63 },
  { name: "Sydney", cc: "AU", lat: -33.87, lng: 151.21 },
  { name: "Toronto", cc: "CA", lat: 43.65, lng: -79.38 },
  { name: "Dubai", cc: "AE", lat: 25.2, lng: 55.27 },
  { name: "Seoul", cc: "KR", lat: 37.57, lng: 126.98 },
  { name: "Cape Town", cc: "ZA", lat: -33.92, lng: 18.42 },
];

/* Une connexion réseau simulée entre deux villes */
export interface NetLink {
  id: string;
  from: City;
  to: City;
  ip: string;
  born: number;
  ttl: number; // durée de vie en ms
}

function randomIP(): string {
  const oct = () => 1 + Math.floor(Math.random() * 253);
  return `${oct()}.${oct()}.${oct()}.${oct()}`;
}

export function makeLink(from?: City, to?: City): NetLink {
  const a = from ?? CITIES[Math.floor(Math.random() * CITIES.length)];
  let b = to ?? CITIES[Math.floor(Math.random() * CITIES.length)];
  while (b === a) b = CITIES[Math.floor(Math.random() * CITIES.length)];
  return {
    id: crypto.randomUUID(),
    from: a,
    to: b,
    ip: randomIP(),
    born: performance.now(),
    ttl: 1600 + Math.random() * 1400,
  };
}

/* ============================================================
   INTENT D'ANIMATION — choisit le "mode visuel" du globe selon
   le message de l'utilisateur.
   ============================================================ */

export type GlobeMode = "network" | "satellite" | "ping" | "scan";

export interface GlobeIntent {
  mode: GlobeMode;
  target?: City; // pour satellite / ping
  label: string; // texte d'ambiance affiché pendant la recherche
}

/* Repère un pays cible mentionné dans le message */
function findTargetCity(lower: string): City | undefined {
  const map: Record<string, string> = {
    japon: "Tokyo",
    japan: "Tokyo",
    tokyo: "Tokyo",
    france: "Paris",
    paris: "Paris",
    londres: "London",
    london: "London",
    états: "New York",
    usa: "New York",
    york: "New York",
    inde: "Mumbai",
    india: "Mumbai",
    brésil: "São Paulo",
    bresil: "São Paulo",
    brazil: "São Paulo",
    australie: "Sydney",
    australia: "Sydney",
    corée: "Seoul",
    coree: "Seoul",
    korea: "Seoul",
    dubai: "Dubai",
    singapour: "Singapore",
    singapore: "Singapore",
  };
  for (const key in map) {
    if (lower.includes(key)) {
      return CITIES.find((c) => c.name === map[key]);
    }
  }
  return undefined;
}

export function resolveGlobeIntent(userText: string): GlobeIntent {
  const lower = userText.toLowerCase();
  const target = findTargetCity(lower);

  if (
    lower.includes("satellite") ||
    lower.includes("gps") ||
    lower.includes("localis") ||
    lower.includes("où") ||
    lower.includes("position")
  ) {
    return {
      mode: "satellite",
      target: target ?? CITIES[0],
      label: "Acquisition satellite…",
    };
  }

  if (
    lower.includes("ping") ||
    lower.includes("latence") ||
    lower.includes("connexion") ||
    lower.includes("serveur") ||
    target
  ) {
    return {
      mode: "ping",
      target: target ?? CITIES[0],
      label: target ? `Ping ${target.name}…` : "Test de connexion…",
    };
  }

  if (
    lower.includes("cherche") ||
    lower.includes("recherche") ||
    lower.includes("trouve") ||
    lower.includes("scan")
  ) {
    return { mode: "scan", label: "Analyse en cours…" };
  }

  return { mode: "network", label: "Interrogation du réseau…" };
}
