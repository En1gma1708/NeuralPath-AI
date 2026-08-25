"use client";

import React, { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

/* ── Glowing tumor hotspot marker ─────────────────────────────── */
/* Two-layer glow (a tight bright core + a soft translucent halo) reads as
   a real emissive light source instead of a flat colored dot - the halo
   is what a bloom postprocessing pass would otherwise be doing for us,
   without pulling in @react-three/postprocessing for one effect. */
function TumorMarker({ position, size = 0.12, speed = 3 }: {
  position: [number, number, number];
  size?: number;
  speed?: number;
}) {
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * speed) * 0.15;
    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2.2 + Math.sin(clock.elapsedTime * speed) * 0.9;
      coreRef.current.scale.setScalar(pulse);
    }
    if (haloRef.current) {
      const mat = haloRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 + Math.sin(clock.elapsedTime * speed) * 0.08;
      haloRef.current.scale.setScalar(pulse * 2.4);
    }
  });

  return (
    <group position={position}>
      <mesh ref={haloRef}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color="#f87171" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh ref={coreRef}>
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#dc2626"
          emissiveIntensity={2.2}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
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

  // Style every mesh in the model with a clinical, faintly translucent
  // look - low sheen (not glossy-plastic), a touch of transmission so
  // thin ridges catch light the way real tissue does, and a cool-toned
  // base color closer to a clinical model/scan render than the previous
  // beige.
  React.useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: "#e4e7ec",
          roughness: 0.42,
          metalness: 0,
          clearcoat: 0.5,
          clearcoatRoughness: 0.25,
          transmission: 0.06,
          thickness: 0.5,
          ior: 1.3,
          sheen: 0.4,
          sheenColor: new THREE.Color("#8fb8c9"),
          side: THREE.DoubleSide,
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
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
      <Canvas
        camera={{ position: [0, 0.4, 3.7], fov: 36 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        shadows
      >
        {/* Key light - the dominant, slightly warm light defining form */}
        <directionalLight
          position={[4, 4.5, 4]}
          intensity={2.2}
          color="#fff8f0"
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {/* Rim light - cool blue edge light from behind, separates the
            model from the dark background the way product photography does */}
        <directionalLight position={[-3, 1, -5]} intensity={1.4} color="#5eb8ff" />
        {/* Fill - soft, low-intensity, keeps shadow side from going pure black */}
        <pointLight position={[-3, -2, 2]} intensity={0.35} color="#93c5fd" />
        <ambientLight intensity={0.18} />

        <Suspense fallback={null}>
          <BrainModel />
          <Environment preset="studio" environmentIntensity={0.5} />
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
