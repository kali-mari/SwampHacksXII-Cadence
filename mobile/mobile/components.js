import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { readingStatus } from './sensors.mjs';
import { colors, shared } from './theme';

export const fmt = (v, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : '—';

export function Button({ label, onPress, disabled, secondary }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [shared.button, secondary && shared.secondary, (disabled || pressed) && { opacity: .5 }]}>
    <Text style={[shared.buttonText, secondary && { color: colors.textDim }]}>{label}</Text>
  </Pressable>;
}

// A square icon-style nav tile for the Home screen (Calibrate / Dev Testing / See past runs).
export function NavTile({ label, onPress }) {
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [shared.card, { alignItems: 'center', justifyContent: 'center', minHeight: 84 }, pressed && { opacity: .6 }]}>
    <Text style={[shared.cardTitle, { textAlign: 'center' }]}>{label}</Text>
  </Pressable>;
}

export function BackButton({ onPress }) {
  return <View style={shared.backRow}><Button label="← Home" secondary onPress={onPress} /></View>;
}

// The "Find my shirt / Try demo / Disconnect" block, shared by Current Run,
// Dev Testing, and Calibrate — all three need a live connection before they're useful.
export function ConnectionPanel({ shirt }) {
  const { mode, status, liveCount, scan, startDemo, stop } = shirt;
  return <View style={shared.hero}>
    <Text style={shared.eyebrow}>{mode === 'demo' ? 'SIMULATED DATA' : 'SENSOR CONNECTION'}</Text>
    <Text accessibilityLiveRegion="polite" style={shared.heroTitle}>{status}</Text>
    <Text style={shared.muted}>{liveCount} / 9 sensors reporting · {mode === 'demo' ? 'No hardware connected' : 'Four IMUs · three flex · two humidity'}</Text>
    <View style={shared.actions}>
      <Button label="Find my shirt" onPress={scan} disabled={['Checking Bluetooth', 'Scanning', 'Connecting'].includes(status)} />
      <Button label="Try demo" secondary onPress={startDemo} />
    </View>
    {mode !== 'idle' && <Button label="Disconnect / stop" secondary onPress={stop} />}
  </View>;
}

export function DeviceList({ shirt }) {
  const { devices, status, connect } = shirt;
  return <>
    {status === 'Scan finished' && devices.length === 0 &&
      <Text style={shared.notice}>No shirts found. Power on the Feather, keep it nearby, and disconnect other BLE apps before scanning again.</Text>}
    {devices.map(d => <View key={d.id} style={shared.card}>
      <Text style={shared.cardTitle}>{d.name}</Text><Text style={shared.muted}>{d.id}</Text>
      <Button label="Connect" onPress={() => connect(d)} />
    </View>)}
  </>;
}

export function SensorCard({ sensor, reading, now }) {
  const status = readingStatus(reading, now);
  const usable = reading?.valid;
  return <View style={shared.card}>
    <View style={shared.row}><Text style={shared.cardTitle}>{sensor.name}</Text>
      <Text style={{ color: status === 'Live' ? colors.good : colors.warn }}>{status}{reading?.simulated ? ' · Dummy' : ''}</Text></View>
    {sensor.type === 1 && <>
      <Text style={shared.value}>{usable ? fmt(reading.resistanceOhms / 1000, 1) : '—'} <Text style={shared.unit}>kΩ</Text></Text>
      <Text style={shared.muted}>{usable ? `${reading.millivolts} mV · ADC ${reading.raw}` : 'Waiting for a valid flex reading'}</Text>
    </>}
    {sensor.type === 2 && <>
      <Text style={shared.axisLabel}>ACCELERATION · m/s²</Text>
      <Text style={shared.axes}>{usable ? reading.accelerationMps2.map(v => fmt(v)).join('   /   ') : '—   /   —   /   —'}</Text>
      <Text style={shared.axisLabel}>ROTATION RATE · rad/s</Text>
      <Text style={shared.axes}>{usable ? reading.gyroRadps.map(v => fmt(v, 3)).join('   /   ') : '—   /   —   /   —'}</Text>
      <Text style={shared.muted}>X / Y / Z</Text>
    </>}
    {sensor.type === 3 && <Text style={shared.value}>
      {usable ? fmt(reading.humidityPct, 1) : '—'}<Text style={shared.unit}> % RH   </Text>
      {usable ? fmt(reading.temperatureC, 1) : '—'}<Text style={shared.unit}> °C</Text>
    </Text>}
    {reading && <Text style={shared.timestamp}>Device {reading.deviceMs} ms · received {Math.max(0, Math.floor((now - reading.receivedAt) / 1000))}s ago</Text>}
  </View>;
}
