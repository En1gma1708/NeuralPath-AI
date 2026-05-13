"use client";

import React, { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

/* ── Glowing tumor hotspot marker ─────────────────────────────── */
function TumorMarker({ position, size = 0.12, speed = 3 }: {
  position: [number, number, number];
  size?: number;
  speed?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * speed) * 0.8;
    ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * speed) * 0.15);
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[size, 24, 24]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#dc2626"
        emissiveIntensity={2}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

/* ── Brain mesh loaded from GLB ───────────────────────────────── */
function BrainModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/brain.glb");

  // Slow auto-rotation
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * 0.15;
    }
  });

  // Style every mesh in the model with a clinical look
  React.useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: "#c4b5a8",
          roughness: 0.55,
          metalness: 0.1,
          clearcoat: 0.3,
          clearcoatRoughness: 0.4,
          side: THREE.DoubleSide,
        });
      }
    });
  }, [scene]);

  return (
    <group ref={groupRef} scale={1.6}>
      <primitive object={scene} />

      {/* Tumor detection zones — positioned on the brain surface */}
      <TumorMarker position={[0.45, 0.35, 0.5]} size={0.1} speed={3} />
      <TumorMarker position={[-0.55, 0.15, -0.3]} size={0.07} speed={4} />
      <TumorMarker position={[0.2, -0.2, 0.6]} size={0.05} speed={2.5} />
    </group>
  );
}

// Pre-load the GLB so it's cached
useGLTF.preload("/brain.glb");

/* ── Main canvas export ───────────────────────────────────────── */
export default function BrainCanvas() {
  return (
    <div className="w-full h-full min-h-[400px] relative cursor-grab active:cursor-grabbing">
      <Canvas camera={{ position: [0, 0.5, 3.5], fov: 40 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.8} color="#ffffff" />
        <pointLight position={[-4, -3, -4]} intensity={0.6} color="#60a5fa" />

        <Suspense fallback={null}>
          <BrainModel />
          <Environment preset="studio" />
        </Suspense>

        <OrbitControls
          enableZoom={true}
          enablePan={false}
          autoRotate={false}
          minDistance={2}
          maxDistance={6}
        />
      </Canvas>

      {/* Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none rounded-2xl bg-[radial-gradient(circle_at_center,_transparent_50%,_rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}
