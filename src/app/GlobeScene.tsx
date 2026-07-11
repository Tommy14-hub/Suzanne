"use client";

/* ============================================================
   GLOBE SCENE — react-globe.gl (three.js)
   Continents pointillés, arcs IP animés, satellite orbital,
   anneaux de propagation. Réactif au store (idle/thinking/speaking).
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
    const measure = () =>
      setSize(Math.min(el.clientWidth, el.clientHeight) || 560);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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

  /* --- config initiale (une fois le globe monté) --- */
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
  }, [landPolygons]);

  /* --- vitesse de rotation selon l'état --- */
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

  /* --- orbite du satellite --- */
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

  const satelliteObject = useMemo(() => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.28, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.7,
      })
    );
    ring.rotation.x = Math.PI / 2.4;
    group.add(body, ring);
    return group;
  }, []);

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
        pointsData={CITIES}
        pointLat={(d: object) => (d as City).lat}
        pointLng={(d: object) => (d as City).lng}
        pointColor={() => "#6366f1"}
        pointAltitude={0.01}
        pointRadius={0.3}
        objectsData={satellite ? [satellite] : []}
        objectLat={(d: object) => (d as { lat: number }).lat}
        objectLng={(d: object) => (d as { lng: number }).lng}
        objectAltitude={(d: object) => (d as { alt: number }).alt}
        objectThreeObject={() => satelliteObject.clone()}
      />
    </div>
  );
}
