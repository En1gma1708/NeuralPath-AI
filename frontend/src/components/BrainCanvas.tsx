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

function DynamicNeuralBrain() {
  const groupRef = useRef<THREE.Group>(null);
  
  const { points, lines } = useMemo(() => {
    const pts = [];
    const count = 600;
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      
      const rx = 1.8;
      const ry = 1.4;
      const rz = 2.2;
      
      const r = Math.cbrt(Math.random()); 
      
      const x = r * rx * Math.sin(phi) * Math.cos(theta);
      const y = r * ry * Math.sin(phi) * Math.sin(theta);
      const z = r * rz * Math.cos(phi);
      
      pts.push(new THREE.Vector3(x, y, z));
    }
    
    const lns = [];
    const maxDistance = 0.5;
    for (let i = 0; i < pts.length; i++) {
      let connections = 0;
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[i].distanceTo(pts[j]) < maxDistance && connections < 4) {
          lns.push(pts[i].x, pts[i].y, pts[i].z);
          lns.push(pts[j].x, pts[j].y, pts[j].z);
          connections++;
        }
      }
    }
    
    const positions = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      positions[i * 3] = pts[i].x;
      positions[i * 3 + 1] = pts[i].y;
      positions[i * 3 + 2] = pts[i].z;
    }
    
    return {
      points: positions,
      lines: new Float32Array(lns)
    };
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
      groupRef.current.scale.set(scale, scale, scale);
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.3;
      groupRef.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <Points positions={points} stride={3}>
        <PointMaterial
          transparent
          color="#38bdf8"
          size={0.06}
          sizeAttenuation={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.9}
        />
      </Points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={lines.length / 3}
            array={lines}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#1e40af"
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

export default function BrainCanvas() {
  return (
    <div className="w-full h-full min-h-[400px] relative cursor-move">
      <Canvas camera={{ position: [0, 0, 9], fov: 45 }}>
        {/* @ts-ignore */}
        <ambientLight intensity={0.5} />
        {/* @ts-ignore */}
        <pointLight position={[10, 10, 10]} intensity={2} color="#60a5fa" />
        {/* @ts-ignore */}
        <pointLight position={[-10, -10, -10]} intensity={1.5} color="#2dd4bf" />
        
        <NeuralRain />
        <DynamicNeuralBrain />
        
        <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1.5} />
        
        <OrbitControls enableZoom={true} enablePan={true} autoRotate autoRotateSpeed={0.8} maxDistance={15} minDistance={3} />
      </Canvas>
      
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_black_100%)] opacity-50" />
    </div>
  );
}

