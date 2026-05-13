"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, MeshDistortMaterial, Float, Stars, Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

function NeuralRain() {
  const pointsRef = useRef<THREE.Points>(null);
  
  const count = 3000;
  // Initialize positions and velocities for the rain effect
  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Randomly distribute in a column/cylinder around the brain
      const theta = Math.random() * Math.PI * 2;
      const r = 2.5 + Math.random() * 3.5;
      
      pos[i * 3] = r * Math.cos(theta);
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12; // Random Y start
      pos[i * 3 + 2] = r * Math.sin(theta);
      
      vel[i] = 0.03 + Math.random() * 0.08; // Different speeds for depth
    }
    return [pos, vel];
  }, []);

  useFrame((state) => {
    if (pointsRef.current) {
      const positionAttribute = pointsRef.current.geometry.getAttribute('position');
      const array = positionAttribute.array as Float32Array;

      for (let i = 0; i < count; i++) {
        // Move down
        array[i * 3 + 1] -= velocities[i];
        
        // Reset if it goes below a certain point
        if (array[i * 3 + 1] < -6) {
          array[i * 3 + 1] = 6;
        }
      }
      
      positionAttribute.needsUpdate = true;
      pointsRef.current.rotation.y += 0.0015; // Slow rotation for parallax
    }
  });

  return (
    <Points ref={pointsRef} positions={positions} stride={3}>
      <PointMaterial
        transparent
        color="#38bdf8"
        size={0.05}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.8}
      />
    </Points>
  );
}

function CoreBrain() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      // Pulse the emissive intensity
      const material = meshRef.current.material as any;
      material.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * 2.5) * 0.4;
    }
  });

  return (
    <Float speed={2.5} rotationIntensity={1.2} floatIntensity={1.5}>
      <Sphere ref={meshRef} args={[1.6, 64, 64]}>
        <MeshDistortMaterial
          color="#1d4ed8"
          speed={4}
          distort={0.4}
          radius={1}
          emissive="#60a5fa"
          emissiveIntensity={0.8}
          transparent
          opacity={0.7}
        />
      </Sphere>
    </Float>
  );
}

export default function BrainCanvas() {
  return (
    <div className="w-full h-full min-h-[400px] relative">
      <Canvas camera={{ position: [0, 0, 9], fov: 45 }}>
        {/* @ts-ignore */}
        <ambientLight intensity={0.5} />
        {/* @ts-ignore */}
        <pointLight position={[10, 10, 10]} intensity={2} color="#60a5fa" />
        {/* @ts-ignore */}
        <pointLight position={[-10, -10, -10]} intensity={1.5} color="#2dd4bf" />
        
        <NeuralRain />
        <CoreBrain />
        
        {/* Subtle background stars */}
        <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1.5} />
        
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
      
      {/* Cinematic vignette overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_black_100%)] opacity-50" />
    </div>
  );
}
