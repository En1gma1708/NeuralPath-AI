"use client";

import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, MeshDistortMaterial, Float, Stars, Ring } from "@react-three/drei";
import * as THREE from "three";

function MRIBrain() {
  const tumorRef = useRef<THREE.Mesh>(null);
  const scanRingRef = useRef<THREE.Mesh>(null);
  const brainRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    // Pulse the tumor's emissive intensity to make it look alive/anomalous
    if (tumorRef.current) {
      const material = tumorRef.current.material as any;
      material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 0.8;
    }
    
    // Move the MRI scanning ring up and down along the Y axis
    if (scanRingRef.current) {
      scanRingRef.current.position.y = Math.sin(t * 1.2) * 1.5;
    }

    // Slowly rotate the entire brain construct
    if (brainRef.current) {
      brainRef.current.rotation.y = t * 0.15;
    }
  });

  return (
    <group ref={brainRef}>
      {/* The clean, glass-like outer brain shell (ellipsoid) */}
      <Sphere args={[2, 64, 64]} scale={[1, 0.85, 1.25]}>
        <meshPhysicalMaterial
          color="#bae6fd"
          transmission={0.95}
          opacity={1}
          metalness={0.1}
          roughness={0.1}
          ior={1.4}
          thickness={1}
          specularIntensity={1}
          specularColor="#ffffff"
          side={THREE.DoubleSide}
          transparent
        />
      </Sphere>

      {/* The Anomaly / Tumor inside the brain */}
      <Float speed={4} rotationIntensity={0.5} floatIntensity={0.5}>
        <Sphere ref={tumorRef} args={[0.35, 32, 32]} position={[0.6, 0.3, 0.7]}>
          <MeshDistortMaterial
            color="#ef4444"
            emissive="#dc2626"
            emissiveIntensity={2}
            speed={6}
            distort={0.5}
            radius={1}
          />
        </Sphere>
      </Float>

      {/* Second smaller anomaly to represent metastasis or multi-focal tumor */}
      <Float speed={3} rotationIntensity={0.8} floatIntensity={0.2}>
        <Sphere args={[0.15, 16, 16]} position={[-0.8, -0.2, -0.4]}>
          <MeshDistortMaterial
            color="#f97316"
            emissive="#ea580c"
            emissiveIntensity={1.5}
            speed={4}
            distort={0.4}
            radius={1}
          />
        </Sphere>
      </Float>

      {/* MRI Scanning Laser Ring */}
      <Ring ref={scanRingRef} args={[2.3, 2.35, 64]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.8} />
      </Ring>
    </group>
  );
}

export default function BrainCanvas() {
  return (
    <div className="w-full h-full min-h-[400px] relative cursor-move">
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
        {/* @ts-ignore */}
        <ambientLight intensity={1} />
        {/* @ts-ignore */}
        <directionalLight position={[10, 10, 5]} intensity={2.5} color="#ffffff" />
        {/* @ts-ignore */}
        <pointLight position={[-10, -10, -10]} intensity={1.5} color="#0284c7" />
        
        <MRIBrain />
        
        {/* Cleaner background with fewer stars for a clinical feel */}
        <Stars radius={100} depth={50} count={800} factor={3} saturation={0} fade speed={0.5} />
        
        <OrbitControls enableZoom={true} enablePan={true} autoRotate={false} maxDistance={15} minDistance={3} />
      </Canvas>
      
      {/* Cinematic vignette overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_black_100%)] opacity-30" />
    </div>
  );
}

