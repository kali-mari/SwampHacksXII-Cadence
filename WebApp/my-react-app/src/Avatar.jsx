// Avatar.jsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Avatar({ sensorData }) {
  const spineRef = useRef();
  const rightArmRef = useRef();
  const leftArmRef = useRef();

  // Animate the procedural dummy based on sensor data
  useFrame(() => {
    if (sensorData) {
      // Bend the spine forward/backward based on flex sensor input
      if (spineRef.current && sensorData.flexSpine !== undefined) {
        spineRef.current.rotation.x = THREE.MathUtils.lerp(
          spineRef.current.rotation.x,
          sensorData.flexSpine,
          0.1
        );
      }

      // Swing the arms based on IMU/arm pitch input
      if (rightArmRef.current && sensorData.armPitch !== undefined) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          sensorData.armPitch,
          0.1
        );
      }
      if (leftArmRef.current && sensorData.armPitch !== undefined) {
        // Swing left arm opposite to right arm for a running motion look
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x,
          -sensorData.armPitch,
          0.1
        );
      }
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Lower Body (Static / Placeholder for legs) */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.4, 0.8, 0.3]} />
        <meshStandardMaterial color="#3b82f6" /> {/* Blue hips */}
      </mesh>

      {/* Spine / Upper Body Group (Rotates with Spine Flex Sensor) */}
      <group ref={spineRef} position={[0, 0.8, 0]}>
        {/* Torso */}
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.5, 0.8, 0.3]} />
          <meshStandardMaterial color="#ef4444" /> {/* Red torso */}
        </mesh>

        {/* Head */}
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#fde047" /> {/* Yellow head */}
        </mesh>

        {/* Right Arm */}
        <group ref={rightArmRef} position={[-0.35, 0.7, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color="#10b981" />
          </mesh>
        </group>

        {/* Left Arm */}
        <group ref={leftArmRef} position={[0.35, 0.7, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <boxGeometry args={[0.15, 0.6, 0.15]} />
            <meshStandardMaterial color="#10b981" />
          </mesh>
        </group>
      </group>
    </group>
  );
}