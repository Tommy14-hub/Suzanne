"use client";

/* ============================================================
   GLOBE SCENE — react-globe.gl (three.js)
   Points de terre, arcs IP animés entre continents, satellite
   en orbite avec faisceau, anneaux de propagation. Réagit aux
   états du store (idle / thinking / speaking) et à l'intent.
   Chargé client-only via next/dynamic depuis page.tsx.
   ============================================================ */

import { useEffect, useRef, useState, useMemo } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
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

/* génère un point de "terre" cliquable — ici on s'appuie sur le
   material de points hexagonaux natif de react-globe.gl */

export default function GlobeScene() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(560);
  const [ready, setReady] = useState(false);

  const status = useSuzanneStore((s) => s.status);
  const intent = useSuzanneStore((s) => s.globeIntent);

  const [arcs, setArcs] = useState<ArcData[]>([]);
  const [rings, setRings] = useState<RingData[]>([]);
  const [landPolygons, setLandPolygons] = useState<object[]>([]);
  const [satellite, setSatellite] = useState<
    { lat: number; lng: number; alt: number } | null
  >(null);

  /* --- charge les contours des pays → hex polygons (continents pointillés) --- */
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

  /* --- responsive : mesure le conteneur --- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize(Math.min(el.clientWidth, el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* --- config initiale du globe --- */
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;

    // point de vue initial : centré Europe/Afrique
    g.pointOfView({ lat: 25, lng: 10, altitude: 2.4 }, 0);

    // rotation automatique douce
    const controls = g.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;
      controls.enableZoom = false;
      controls.enablePan = false;
    }
    setReady(true);
  }, []);

  /* --- vitesse de rotation selon l'état --- */
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    if (!controls) return;
    controls.autoRotateSpeed =
      status === "thinking" ? 2.2 : status === "speaking" ? 0.9 : 0.5;
  }, [status]);

  /* --- couleur des arcs selon le mode d'intent --- */
  const arcColor = useMemo(() => {
    const mode = intent?.mode ?? "network";
    if (mode === "satellite") return ["#22c55e", "#4ade80"];
    if (mode === "ping") return ["#f472b6", "#ec4899"];
    return ["#6366f1", "#818cf8"];
  }, [intent]);

  /* --- génération du trafic réseau pendant "thinking" --- */
  useEffect(() => {
    if (status !== "thinking") {
      setArcs([]);
      setSatellite(null);
      return;
    }

    const mode = intent?.mode ?? "network";
    const target = intent?.target;

    // satellite : positionne au-dessus de la cible et anime l'orbite
    if (mode === "satellite" && target) {
      setSatellite({ lat: target.lat, lng: target.lng, alt: 0.6 });
    }

    const spawn = () => {
      let from: City, to: City;
      if ((mode === "ping" || mode === "satellite") && target) {
        // tout converge vers la cible
        from = CITIES[Math.floor(Math.random() * CITIES.length)];
        to = target;
      } else {
        from = CITIES[Math.floor(Math.random() * CITIES.length)];
        to = CITIES[Math.floor(Math.random() * CITIES.length)];
        while (to === from)
          to = CITIES[Math.floor(Math.random() * CITIES.length)];
      }

      const arc: ArcData = {
        startLat: from.lat,
        startLng: from.lng,
        endLat: to.lat,
        endLng: to.lng,
        color: arcColor,
      };
      setArcs((prev) => [...prev.slice(-14), arc]);

      // anneau de propagation à l'arrivée
      setRings((prev) => [
        ...prev.slice(-10),
        { lat: to.lat, lng: to.lng, color: arcColor[0] },
      ]);
    };

    spawn();
    const interval = setInterval(spawn, mode === "network" ? 350 : 500);
    return () => clearInterval(interval);
  }, [status, intent, arcColor]);

  /* --- animation de l'orbite du satellite --- */
  useEffect(() => {
    if (!satellite) return;
    let raf = 0;
    const start = performance.now();
    const baseLng = satellite.lng;
    const animate = () => {
      const t = (performance.now() - start) / 1000;
      setSatellite((s) =>
        s ? { ...s, lng: baseLng + Math.sin(t * 0.6) * 25 } : s
      );
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellite?.lat]);

  /* --- objet 3D du satellite (petite sonde + anneau) --- */
  const satelliteObject = useMemo(() => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.25, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2.5;
    group.add(body);
    group.add(ring);
    return group;
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      {typeof window !== "undefined" && (
        <Globe
          ref={globeRef as React.MutableRefObject<GlobeMethods | undefined>}
          width={size}
          height={size}
          backgroundColor="rgba(0,0,0,0)"
          /* --- style "points" clairs, pas de texture bitmap --- */
          showGlobe={true}
          showAtmosphere={true}
          atmosphereColor="#a5b4fc"
          atmosphereAltitude={0.16}
          globeMaterial={
            new THREE.MeshPhongMaterial({
              color: 0xf5f5f7,
              transparent: true,
              opacity: 0.94,
            })
          }
          /* --- hex polygons pour l'effet "pointillé" des continents --- */
          hexPolygonsData={landPolygons}
          hexPolygonResolution={3}
          hexPolygonMargin={0.28}
          hexPolygonUseDots={true}
          hexPolygonColor={() => "#334155"}
          /* --- arcs réseau animés --- */
          arcsData={arcs}
          arcColor={"color"}
          arcAltitude={0.25}
          arcStroke={0.5}
          arcDashLength={0.5}
          arcDashGap={0.3}
          arcDashInitialGap={0}
          arcDashAnimateTime={1400}
          arcsTransitionDuration={0}
          /* --- anneaux de propagation --- */
          ringsData={rings}
          ringColor={(d: object) => (d as RingData).color}
          ringMaxRadius={4}
          ringPropagationSpeed={3}
          ringRepeatPeriod={800}
          /* --- points des villes --- */
          pointsData={CITIES}
          pointLat={(d: object) => (d as City).lat}
          pointLng={(d: object) => (d as City).lng}
          pointColor={() => "#6366f1"}
          pointAltitude={0.008}
          pointRadius={0.28}
          /* --- satellite en orbite --- */
          objectsData={satellite ? [satellite] : []}
          objectLat={(d: object) => (d as { lat: number }).lat}
          objectLng={(d: object) => (d as { lng: number }).lng}
          objectAltitude={(d: object) => (d as { alt: number }).alt}
          objectThreeObject={() => satelliteObject.clone()}
        />
      )}
      {!ready && (
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-40 w-40 rounded-full bg-indigo-100/40 blur-2xl" />
        </div>
      )}
    </div>
  );
}
