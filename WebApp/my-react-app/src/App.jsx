// App.jsx
import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Avatar } from './Avatar';

export default function App() {
  const [sensorData, setSensorData] = useState({
    flexSpine: 0, 
    armPitch: 0,  
  });

  const [isSimulating, setIsSimulating] = useState(false);

  React.useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      const time = Date.now() * 0.003;
      setSensorData({
        flexSpine: Math.sin(time) * 0.25,
        armPitch: Math.cos(time) * 0.4,
      });
    }, 30);

    return () => clearInterval(interval);
  }, [isSimulating]);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#111' }}>
      {/* Dev Control Panel */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '16px',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minWidth: '220px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', color: '#111' }}>Posture Testing Panel</h3>

        <label style={{ fontSize: '14px', color: '#333' }}>
          Spine Flex: {sensorData.flexSpine.toFixed(2)} rad
          <input
            type="range"
            min="-0.5"
            max="0.5"
            step="0.01"
            value={sensorData.flexSpine}
            disabled={isSimulating}
            onChange={(e) =>
              setSensorData((prev) => ({
                ...prev,
                flexSpine: parseFloat(e.target.value),
              }))
            }
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>

        <label style={{ fontSize: '14px', color: '#333' }}>
          Arm Pitch: {sensorData.armPitch.toFixed(2)} rad
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={sensorData.armPitch}
            disabled={isSimulating}
            onChange={(e) =>
              setSensorData((prev) => ({
                ...prev,
                armPitch: parseFloat(e.target.value),
              }))
            }
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>

        <button
          onClick={() => setIsSimulating(!isSimulating)}
          style={{ padding: '8px', cursor: 'pointer', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px' }}
        >
          {isSimulating ? 'Stop Auto-Simulation' : 'Start Auto-Simulation'}
        </button>
      </div>

      {/* 3D Scene with explicit style sizing */}
      <Canvas 
        style={{ width: '100%', height: '100%', display: 'block' }}
        camera={{ position: [0, 2, 4], fov: 50 }}
      >
        <color attach="background" args={['#1a1a1a']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 5, 5]} intensity={2} />
        
        <Grid position={[0, 0, 0]} args={[10, 10]} cellSize={0.5} cellThickness={1} cellColor="#444" sectionColor="#666" />

        {/* Center Origin Helper Sphere (Bright Orange) to verify rendering */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="orange" />
        </mesh>

        <Avatar sensorData={sensorData} />
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </div>
  );
}