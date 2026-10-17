import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { SENSORS, sensorKey, readingStatus, demoReadings } from './sensors.mjs';

const fmt = (v, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : '—';
function Button({label, onPress, disabled, secondary}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({pressed}) => [styles.button, secondary && styles.secondary, (disabled || pressed) && {opacity: .5}]}>
    <Text style={[styles.buttonText, secondary && {color: '#e6f1ed'}]}>{label}</Text>
  </Pressable>;
}
function SensorCard({sensor, reading, now}) {
  const status = readingStatus(reading, now);
  const usable = reading?.valid;
  return <View style={styles.card}>
    <View style={styles.row}><Text style={styles.cardTitle}>{sensor.name}</Text>
      <Text style={{color: status === 'Live' ? '#8eedba' : '#eac984'}}>{status}{reading?.simulated ? ' · Dummy' : ''}</Text></View>
    {sensor.type === 1 && <>
      <Text style={styles.value}>{usable ? fmt(reading.resistanceOhms / 1000, 1) : '—'} <Text style={styles.unit}>kΩ</Text></Text>
      <Text style={styles.muted}>{usable ? `${reading.millivolts} mV · ADC ${reading.raw}` : 'Waiting for a valid flex reading'}</Text>
    </>}
    {sensor.type === 2 && <>
      <Text style={styles.axisLabel}>ACCELERATION · m/s²</Text>
      <Text style={styles.axes}>{usable ? reading.accelerationMps2.map(v => fmt(v)).join('   /   ') : '—   /   —   /   —'}</Text>
      <Text style={styles.axisLabel}>ROTATION RATE · rad/s</Text>
      <Text style={styles.axes}>{usable ? reading.gyroRadps.map(v => fmt(v, 3)).join('   /   ') : '—   /   —   /   —'}</Text>
      <Text style={styles.muted}>X / Y / Z</Text>
    </>}
    {sensor.type === 3 && <Text style={styles.value}>
      {usable ? fmt(reading.humidityPct, 1) : '—'}<Text style={styles.unit}> % RH   </Text>
      {usable ? fmt(reading.temperatureC, 1) : '—'}<Text style={styles.unit}> °C</Text>
    </Text>}
    {reading && <Text style={styles.timestamp}>Device {reading.deviceMs} ms · received {Math.max(0, Math.floor((now - reading.receivedAt) / 1000))}s ago</Text>}
  </View>;
}
function Dashboard() {
  const [mode, setMode] = useState('idle');
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [readings, setReadings] = useState({});
  const [now, setNow] = useState(Date.now());
  const client = useRef(null), cache = useRef({}), epoch = useRef(0), mounted = useRef(true);
  const isExpoGo = Constants.executionEnvironment === 'storeClient';
  const reportError = e => { if (mounted.current) { setError(e.message || String(e)); setStatus('Needs attention'); } };
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      setNow(Date.now()); setReadings({...cache.current});
    }, 200);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'background') {
        epoch.current++;
        client.current?.disconnect().catch(() => {});
        setStatus('Paused — reconnect when active');
      }
    });
    return () => {
      mounted.current = false; epoch.current++;
      clearInterval(timer); appState.remove();
      client.current?.destroy().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (mode !== 'demo') return;
    const start = Date.now();
    const tick = () => {
      for (const r of demoReadings(Date.now() - start))
        cache.current[sensorKey(r)] = {...r, receivedAt: Date.now()};
    };
    tick(); const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [mode]);
  const reset = () => { cache.current = {}; setReadings({}); setError(''); };
  async function stop() {
    epoch.current++; setMode('idle'); setStatus('Ready'); setDevices([]);
    await client.current?.disconnect().catch(reportError);
    reset();
  }
  async function startDemo() {
    await stop(); setMode('demo'); setStatus('Demo running');
  }
  async function scan() {
    if (isExpoGo) { setError('Bluetooth needs a development build. Demo mode works in Expo Go. Install the Android EAS development APK, then open this project in Posture Check.'); return; }
    await stop();
    setMode('live');
    const attempt = ++epoch.current;
    try {
      if (!client.current) {
        const {createShirtClient} = require('./ble');
        const created = await createShirtClient();
        if (!mounted.current) { await created.destroy(); return; }
        client.current = created;
      }
      if (attempt !== epoch.current) return;
      await client.current.scan(found => {
        if (attempt !== epoch.current || !mounted.current) return;
        setDevices(previous => previous.some(d => d.id === found.id) ? previous : [...previous, found]);
      }, value => { if (attempt === epoch.current && mounted.current) setStatus(value); }, reportError);
    } catch (e) { if (attempt === epoch.current) reportError(e); }
  }
  async function connect(device) {
    reset(); setDevices([]);
    const attempt = epoch.current;
    try {
      await client.current.connect(device.id, r => {
        if (attempt === epoch.current && mounted.current)
          cache.current[sensorKey(r)] = {...r, receivedAt: Date.now()};
      }, value => { if (attempt === epoch.current && mounted.current) setStatus(value); }, reportError);
    } catch (e) { if (attempt === epoch.current) reportError(e); }
  }
  const liveCount = SENSORS.filter(s => readingStatus(readings[sensorKey(s)], now) === 'Live').length;
  return <SafeAreaView style={styles.screen}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>SWAMPHACKS / WEARABLE LAB</Text>
      <Text style={styles.title}>Posture Check</Text>
      <Text style={styles.subtitle}>Your shirt. Every signal.</Text>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{mode === 'demo' ? 'SIMULATED DATA' : 'SENSOR CONNECTION'}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.heroTitle}>{status}</Text>
        <Text style={styles.muted}>{liveCount} / 9 sensors reporting · {mode === 'demo' ? 'No hardware connected' : 'Four IMUs · three flex · two humidity'}</Text>
        <View style={styles.actions}>
          <Button label="Find my shirt" onPress={scan} disabled={['Checking Bluetooth', 'Scanning', 'Connecting'].includes(status)} />
          <Button label="Try demo" secondary onPress={startDemo} />
        </View>
        {mode !== 'idle' && <Button label="Disconnect / stop" secondary onPress={stop} />}
      </View>
      {mode === 'live' && Object.values(readings).some(r => r.simulated) &&
        <Text style={styles.notice}>ESP32 dummy mode: simulated sensor values received over real Bluetooth.</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {status === 'Scan finished' && devices.length === 0 && <Text style={styles.notice}>No shirts found. Power on the Feather, keep it nearby, and disconnect other BLE apps before scanning again.</Text>}
      {devices.map(d => <View key={d.id} style={styles.card}>
        <Text style={styles.cardTitle}>{d.name}</Text><Text style={styles.muted}>{d.id}</Text>
        <Button label="Connect" onPress={() => connect(d)} />
      </View>)}
      {['Flex', 'IMU', 'Environment'].map(group => <View key={group}>
        <Text style={styles.section}>{group === 'Flex' ? 'Bend signals' : group === 'IMU' ? 'Arm movement' : 'Shirt environment'}</Text>
        {SENSORS.filter(s => s.group === group).map(s => <SensorCard key={sensorKey(s)} sensor={s} reading={readings[sensorKey(s)]} now={now} />)}
      </View>)}
      <Text style={styles.footer}>Raw sensor dashboard · Flex readings require mounted calibration before estimating angles. Form scoring and cloud storage are not connected.</Text>
    </ScrollView>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Dashboard /></SafeAreaProvider>; }
const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#0b1713'},
  content: {padding: 22, paddingBottom: 40},
  eyebrow: {color: '#9db7aa', fontSize: 11, letterSpacing: 2, fontWeight: '700'},
  title: {color: '#f0f5ec', fontSize: 36, fontWeight: '800', marginTop: 14},
  subtitle: {color: '#9db7aa', fontSize: 17, marginTop: 5, marginBottom: 24},
  hero: {backgroundColor: '#193329', borderRadius: 22, padding: 20, gap: 12},
  heroTitle: {fontSize: 26, color: '#e8f6d4', fontWeight: '700'},
  muted: {color: '#a6bdb1', fontSize: 12, lineHeight: 19},
  actions: {flexDirection: 'row', gap: 10, flexWrap: 'wrap'},
  button: {backgroundColor: '#b8ed89', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, marginTop: 6, minHeight: 46},
  secondary: {backgroundColor: '#2a4438'},
  buttonText: {color: '#102312', fontSize: 14, fontWeight: '700', textAlign: 'center'},
  section: {color: '#e6f1ed', fontWeight: '700', fontSize: 21, marginTop: 28, marginBottom: 12},
  card: {backgroundColor: '#14251e', borderWidth: 1, borderColor: '#2a4034', borderRadius: 16, padding: 16, marginBottom: 10, gap: 7},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  cardTitle: {color: '#e6f1ed', fontSize: 15, fontWeight: '600'},
  value: {color: '#f0f5ec', fontSize: 27, fontWeight: '700', marginTop: 4},
  unit: {color: '#9db7aa', fontSize: 14, fontWeight: '400'},
  axisLabel: {color: '#9db7aa', fontSize: 10, letterSpacing: 1, marginTop: 7},
  axes: {color: '#e6f1ed', fontVariant: ['tabular-nums'], fontSize: 16},
  timestamp: {color: '#7f9a8c', fontSize: 10, marginTop: 4},
  error: {color: '#ffcfb5', backgroundColor: '#482a22', padding: 16, borderRadius: 12, marginTop: 12, lineHeight: 21},
  notice: {color: '#eac984', paddingVertical: 16, lineHeight: 21},
  footer: {color: '#9db7aa', lineHeight: 20, fontSize: 12, marginTop: 25},
});
