"use client";

import React, { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, MeshDistortMaterial, Float, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { ErrorBoundary } from "react-error-boundary";
import { Brain } from "lucide-react";

// Real Brain Model Component
function RealBrainModel() {
  // This expects 'brain.glb' to be inside the /public folder.
  const { nodes } = useGLTF("/brain.glb");
  const brainRef = useRef<THREE.Group>(null);

  // Find the first mesh in the GLB to apply our custom MRI material
  // Safely fallback if nodes aren't structured as expected
  const brainMesh = Object.values(nodes).find((n) => (n as THREE.Mesh).isMesh) as THREE.Mesh;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (brainRef.current) {
      // Slowly rotate the brain
      brainRef.current.rotation.y = t * 0.15;
    }
  });

  return (
    <group ref={brainRef} scale={1.5} position={[0, -0.5, 0]}>
      {/* The Actual Brain Mesh */}
      {brainMesh && (
        <mesh geometry={brainMesh.geometry}>
          <meshPhysicalMaterial
            color="#bae6fd"
            transmission={0.9}
            opacity={1}
            metalness={0.1}
            roughness={0.1}
            ior={1.4}
            thickness={2}
            specularIntensity={1}
            specularColor="#ffffff"
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Primary Tumor Hotspot */}
      <Float speed={4} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh position={[0.5, 0.4, 0.3]}>
          <sphereGeometry args={[0.25, 32, 32]} />
          <MeshDistortMaterial
            color="#ef4444"
            emissive="#dc2626"
            emissiveIntensity={2}
            speed={6}
            distort={0.5}
            radius={1}
          />
        </mesh>
      </Float>

      {/* Secondary Hotspot (Metastasis) */}
      <Float speed={3} rotationIntensity={0.8} floatIntensity={0.2}>
        <mesh position={[-0.4, -0.1, -0.3]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <MeshDistortMaterial
            color="#f97316"
            emissive="#ea580c"
            emissiveIntensity={1.5}
            speed={4}
            distort={0.4}
            radius={1}
          />
        </mesh>
      </Float>
    </group>
  );
}

// Fallback UI when brain.glb is missing
function MissingModelFallback() {
  return (
    <Html center>
      <div className="flex flex-col items-center text-center p-6 bg-slate-900/90 border border-rose-500/30 rounded-2xl shadow-2xl backdrop-blur-md w-[320px]">
        <Brain className="w-12 h-12 text-rose-400 mb-4 animate-pulse" />
        <h3 className="text-xl font-bold text-white mb-2">Missing 3D Model</h3>
        <p className="text-slate-300 text-sm mb-4">
          Please download a <strong>brain.glb</strong> file from Sketchfab and place it in the <code>frontend/public/</code> folder.
        </p>
      </div>
    </Html>
  );
}

export default function BrainCanvas() {
  return (
    <div className="w-full h-full min-h-[400px] relative cursor-move">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[10, 10, 5]} intensity={2.5} color="#ffffff" />
        <pointLight position={[-10, -10, -10]} intensity={1.5} color="#0284c7" />
        
        <ErrorBoundary fallback={<MissingModelFallback />}>
          <Suspense fallback={null}>
            <RealBrainModel />
          </Suspense>
        </ErrorBoundary>

        <Stars radius={100} depth={50} count={800} factor={3} saturation={0} fade speed={0.5} />
        <OrbitControls enableZoom={true} enablePan={true} autoRotate={false} maxDistance={10} minDistance={2} />
      </Canvas>
      
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_black_100%)] opacity-30" />
    </div>
  );
}

