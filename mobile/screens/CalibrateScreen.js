import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SENSORS, sensorKey } from '../sensors.mjs';
import { captureNeutralPose } from '../pose.mjs';
import { shared } from '../theme';
import { Button, BackButton, ConnectionPanel, DeviceList, SensorCard } from '../components';
import TorsoPreview from './TorsoPreview';

export default function CalibrateScreen({ navigate, shirt }) {
  const { readings, now } = shirt;
  const [baseline, setBaseline] = useState(null);
  const [baselineAt, setBaselineAt] = useState(null);

  function calibrate() {
    const next = captureNeutralPose(readings, now);
    if (!next) return;
    setBaseline(next);
    setBaselineAt(new Date());
  }

  const neutralSensorCount = Object.keys(baseline?.sensors || {}).length;
  const freshSensorCount = Object.keys(captureNeutralPose(readings, now)?.sensors || {}).length;

  return <>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={shared.content}>
      <BackButton onPress={() => navigate('home')} />
      <Text style={shared.eyebrow}>CALIBRATE</Text>
      <Text style={shared.title}>Calibrate</Text>
      <Text style={shared.subtitle}>Connect the shirt, stand in the starting pose, and set neutral before moving your arms to check the sensor-to-bone mapping. The chest and spine stay still because this shirt has no torso sensor.</Text>

      <ConnectionPanel shirt={shirt} />
      <DeviceList shirt={shirt} />

      <View style={{ alignItems: 'center', marginVertical: 22 }}>
        <Text style={[shared.axisLabel, { marginBottom: 10 }]}>LIVE POSE PREVIEW</Text>
        <TorsoPreview readings={readings} baseline={baseline} now={now} />
      </View>

      <View style={shared.hero}>
        <Button label="Set current pose as neutral" onPress={calibrate} disabled={freshSensorCount === 0} />
        <Text style={shared.muted}>
          {baselineAt
            ? `Neutral set ${baselineAt.toLocaleTimeString()} · ${neutralSensorCount}/6 fresh sensors calibrated`
            : `${freshSensorCount}/6 fresh physical sensors · Capture a neutral pose before moving.`}
        </Text>
      </View>

      <Text style={shared.section}>Sensor readouts</Text>
      {SENSORS.map(sensor =>
        <SensorCard key={sensorKey(sensor)} sensor={sensor} reading={readings[sensorKey(sensor)]} now={now} />,
      )}
    </ScrollView>
  </>;
}
