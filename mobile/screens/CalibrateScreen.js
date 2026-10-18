import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SENSORS, sensorKey } from '../sensors.mjs';
import { colors, shared } from '../theme';
import { Button, BackButton, ConnectionPanel, DeviceList, SensorCard } from '../components';

const FLEX = SENSORS.filter(s => s.type === 1);
const FLAT_OHMS = 25000;     // nominal unbent resistance, see docs/HARDWARE_AND_FIRMWARE.md
const MAX_BEND_OHMS = 125000; // nominal full-bend resistance

// Turns a flex sensor's resistance into a rough bend angle, relative to
// whatever "neutral" the person last calibrated. This is deliberately crude —
// resistance isn't linear in joint angle (see the hardware doc) — it only
// exists to drive the schematic figure below until the real model is in.
function bendDegrees(ohms, baselineOhms) {
  if (!Number.isFinite(ohms)) return 0;
  const base = Number.isFinite(baselineOhms) ? baselineOhms : FLAT_OHMS;
  const span = Math.max(1000, MAX_BEND_OHMS - base);
  return Math.max(-10, Math.min(100, ((ohms - base) / span) * 90));
}

export default function CalibrateScreen({ navigate, shirt }) {
  const { readings, now } = shirt;
  // Per-sensor "neutral" resistance captured by the Calibrate button. Swap this
  // for persisted storage (per shirt, per wearer) once that matters.
  const [baseline, setBaseline] = useState(null);
  const [baselineAt, setBaselineAt] = useState(null);

  const reading = s => readings[sensorKey(s)];
  const ohms = s => reading(s)?.valid ? reading(s).resistanceOhms : undefined;
  const leftElbowDeg = bendDegrees(ohms(FLEX[0]), baseline?.[sensorKey(FLEX[0])]);
  const rightElbowDeg = bendDegrees(ohms(FLEX[1]), baseline?.[sensorKey(FLEX[1])]);

  function calibrate() {
    const next = {};
    for (const s of FLEX) if (Number.isFinite(ohms(s))) next[sensorKey(s)] = ohms(s);
    setBaseline(next);
    setBaselineAt(new Date());
  }

  return <>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={shared.content}>
      <BackButton onPress={() => navigate('home')} />
      <Text style={shared.eyebrow}>CALIBRATE</Text>
      <Text style={shared.title}>Calibrate</Text>
      <Text style={shared.subtitle}>See how the shirt fits.</Text>

      <ConnectionPanel shirt={shirt} />
      <DeviceList shirt={shirt} />

      <View style={{ alignItems: 'center', marginVertical: 22 }}>
        <Text style={[shared.axisLabel, { marginBottom: 10 }]}>LIVE POSE PREVIEW</Text>
        {/* Placeholder schematic — swap this block for the Blender-exported
            avatar (glTF/GLB) once it's ready. Feed it the same leftElbowDeg /
            rightElbowDeg / spineDeg values (or the raw per-sensor readings
            above them) as its joint-rotation inputs so nothing else here has
            to change. */}
        <StickFigure leftElbowDeg={leftElbowDeg} rightElbowDeg={rightElbowDeg} spineDeg={0} />
      </View>

      <View style={shared.hero}>
        <Button label="Set current pose as neutral" onPress={calibrate} />
        <Text style={shared.muted}>{baselineAt ? `Neutral set ${baselineAt.toLocaleTimeString()}` : 'Using factory-nominal resistance until you calibrate.'}</Text>
      </View>

      <Text style={shared.section}>Sensor readouts</Text>
      {FLEX.map(s => <SensorCard key={sensorKey(s)} sensor={s} reading={readings[sensorKey(s)]} now={now} />)}
    </ScrollView>
  </>;
}

function StickFigure({ leftElbowDeg, rightElbowDeg, spineDeg }) {
  return <View style={{ width: 200, height: 250, alignItems: 'center' }}>
    <View style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 3, borderColor: colors.accent, marginBottom: 4 }} />
    <View style={{
      width: 56, height: 90, borderWidth: 3, borderColor: colors.accent, borderRadius: 10,
      transform: [{ rotate: `${spineDeg}deg` }], transformOrigin: 'top center',
    }}>
      {/* Left arm (viewer's left = figure's right shoulder, kept simple/unmirrored) */}
      <View style={{
        position: 'absolute', top: -3, left: -10, width: 10, height: 55, backgroundColor: colors.accent, borderRadius: 5,
        transform: [{ rotate: '-18deg' }], transformOrigin: 'top center',
      }}>
        <View style={{
          position: 'absolute', top: 55, left: -1, width: 10, height: 50, backgroundColor: colors.accent, borderRadius: 5,
          transform: [{ rotate: `${leftElbowDeg}deg` }], transformOrigin: 'top center',
        }} />
      </View>
      {/* Right arm */}
      <View style={{
        position: 'absolute', top: -3, right: -10, width: 10, height: 55, backgroundColor: colors.accent, borderRadius: 5,
        transform: [{ rotate: '18deg' }], transformOrigin: 'top center',
      }}>
        <View style={{
          position: 'absolute', top: 55, left: -1, width: 10, height: 50, backgroundColor: colors.accent, borderRadius: 5,
          transform: [{ rotate: `${-rightElbowDeg}deg` }], transformOrigin: 'top center',
        }} />
      </View>
      {/* Legs, static — no leg sensors yet */}
      <View style={{ position: 'absolute', top: 90, left: 2, width: 10, height: 70, backgroundColor: colors.border, borderRadius: 5, transform: [{ rotate: '8deg' }], transformOrigin: 'top center' }} />
      <View style={{ position: 'absolute', top: 90, right: 2, width: 10, height: 70, backgroundColor: colors.border, borderRadius: 5, transform: [{ rotate: '-8deg' }], transformOrigin: 'top center' }} />
    </View>
  </View>;
}
