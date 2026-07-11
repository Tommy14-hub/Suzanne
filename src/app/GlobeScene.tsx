"use client";

/* ============================================================
   GLOBE SCENE — react-globe.gl (three.js interne)
   IMPORTANT : ne PAS importer three.js séparément — react-globe.gl
   embarque sa propre instance. Deux instances = crash WebGL
   (matrixWorld.determinantAffine is not a function).
   ============================================================ */

import { useEffect, useRef, useState, useMemo } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { feature } from "topojson-client";
import { useSuzanneStore } from "./store";
import { CITIES, type City } from "./networkSim";

interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string[];
}
interface RingData {
  lat: number;
  lng: number;
  color: string;
}
interface PointData {
  lat: number;
  lng: number;
  color: string;
  radius: number;
  altitude: number;
}

export default function GlobeScene() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(560);

  const status = useSuzanneStore((s) => s.status);
  const intent = useSuzanneStore((s) => s.globeIntent);

  const [arcs, setArcs] = useState<ArcData[]>([]);
  const [rings, setRings] = useState<RingData[]>([]);
  const [landPolygons, setLandPolygons] = useState<object[]>([]);
  const [satellite, setSatellite] = useState<
    { lat: number; lng: number; alt: number } | null
  >(null);

  /* --- responsive --- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      // debounce via rAF : évite de redimensionner le renderer WebGL
      // à chaque micro-changement pendant les transitions CSS/Framer Motion
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const s = Math.min(el.clientWidth, el.clientHeight);
        // plancher minimal : jamais de resize vers une taille quasi-nulle
        if (s >= 50) setSize(s);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /* --- contours des pays → hex polygons --- */
  useEffect(() => {
    let cancelled = false;
    fetch("/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return;
        const geo = feature(
          topo,
          topo.objects.countries
        ) as unknown as { features: object[] };
        setLandPolygons(geo.features);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* --- config initiale + globe clair --- */
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 0);
    const c = g.controls();
    if (c) {
      c.autoRotate = true;
      c.autoRotateSpeed = 0.6;
      c.enableZoom = false;
    }

    // Rend le globe clair : on parcourt la scène three.js DÉJÀ créée
    // par react-globe.gl et on éclaircit le material de la sphère.
    // (aucune nouvelle instance three.js → pas de conflit WebGL)
    const recolor = () => {
      const scene = g.scene?.();
      if (!scene) return;
      scene.traverse((obj: unknown) => {
        const mesh = obj as {
          type?: string;
          geometry?: { type?: string };
          material?:
            | {
                color?: { set: (c: string) => void };
                emissive?: { set: (c: string) => void };
              }
            | Array<{
                color?: { set: (c: string) => void };
              }>;
        };
        // la sphère du globe : SphereGeometry
        if (
          mesh.geometry?.type === "SphereGeometry" &&
          mesh.material &&
          !Array.isArray(mesh.material)
        ) {
          mesh.material.color?.set("#eef0f5");
          mesh.material.emissive?.set("#e5e7f0");
        }
      });
    };
    // léger délai : laisse react-globe.gl construire la sphère
    const t = setTimeout(recolor, 100);
    return () => clearTimeout(t);
  }, [landPolygons]);

  /* --- vitesse selon l'état --- */
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    if (c)
      c.autoRotateSpeed =
        status === "thinking" ? 2.4 : status === "speaking" ? 1 : 0.6;
  }, [status]);

  const arcColor = useMemo(() => {
    const mode = intent?.mode ?? "network";
    if (mode === "satellite") return ["#22c55e", "#4ade80"];
    if (mode === "ping") return ["#f472b6", "#ec4899"];
    return ["#6366f1", "#818cf8"];
  }, [intent]);

  /* --- trafic réseau pendant 'thinking' --- */
  useEffect(() => {
    if (status !== "thinking") {
      setArcs([]);
      setSatellite(null);
      return;
    }
    const mode = intent?.mode ?? "network";
    const target = intent?.target;
    if (mode === "satellite" && target)
      setSatellite({ lat: target.lat, lng: target.lng, alt: 0.5 });

    const spawn = () => {
      let from: City, to: City;
      if ((mode === "ping" || mode === "satellite") && target) {
        from = CITIES[Math.floor(Math.random() * CITIES.length)];
        to = target;
      } else {
        from = CITIES[Math.floor(Math.random() * CITIES.length)];
        to = CITIES[Math.floor(Math.random() * CITIES.length)];
        while (to === from)
          to = CITIES[Math.floor(Math.random() * CITIES.length)];
      }
      setArcs((prev) => [
        ...prev.slice(-12),
        {
          startLat: from.lat,
          startLng: from.lng,
          endLat: to.lat,
          endLng: to.lng,
          color: arcColor,
        },
      ]);
      setRings((prev) => [
        ...prev.slice(-8),
        { lat: to.lat, lng: to.lng, color: arcColor[0] },
      ]);
    };
    spawn();
    const iv = setInterval(spawn, mode === "network" ? 350 : 500);
    return () => clearInterval(iv);
  }, [status, intent, arcColor]);

  /* --- orbite du satellite (mise à jour de longitude) --- */
  useEffect(() => {
    if (!satellite) return;
    let raf = 0;
    const start = performance.now();
    const baseLng = satellite.lng;
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      setSatellite((s) =>
        s ? { ...s, lng: baseLng + Math.sin(t * 0.6) * 25 } : s
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellite?.lat]);

  /* --- points : villes + satellite (comme point surélevé lumineux),
         PAS d'objet three.js custom pour éviter tout conflit --- */
  const points: PointData[] = useMemo(() => {
    const base: PointData[] = CITIES.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      color: "#6366f1",
      radius: 0.3,
      altitude: 0.01,
    }));
    if (satellite) {
      base.push({
        lat: satellite.lat,
        lng: satellite.lng,
        color: "#22c55e",
        radius: 0.55,
        altitude: satellite.alt, // surélevé = effet "en orbite"
      });
    }
    return base;
  }, [satellite]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <Globe
        ref={globeRef as React.MutableRefObject<GlobeMethods | undefined>}
        width={size}
        height={size}
        backgroundColor="rgba(0,0,0,0)"
        showGlobe={true}
        showGraticules={false}
        showAtmosphere={true}
        atmosphereColor="#c7d2fe"
        atmosphereAltitude={0.18}
        globeImageUrl={null}
        hexPolygonsData={landPolygons}
        hexPolygonResolution={3}
        hexPolygonMargin={0.3}
        hexPolygonUseDots={true}
        hexPolygonColor={() => "#475569"}
        arcsData={arcs}
        arcColor={"color"}
        arcAltitudeAutoScale={0.4}
        arcStroke={0.6}
        arcDashLength={0.5}
        arcDashGap={0.25}
        arcDashInitialGap={0}
        arcDashAnimateTime={1500}
        arcsTransitionDuration={0}
        ringsData={rings}
        ringColor={(d: object) => (d as RingData).color}
        ringMaxRadius={4}
        ringPropagationSpeed={3}
        ringRepeatPeriod={700}
        pointsData={points}
        pointLat={(d: object) => (d as PointData).lat}
        pointLng={(d: object) => (d as PointData).lng}
        pointColor={(d: object) => (d as PointData).color}
        pointAltitude={(d: object) => (d as PointData).altitude}
        pointRadius={(d: object) => (d as PointData).radius}
        pointsTransitionDuration={0}
      />
    </div>
  );
}
