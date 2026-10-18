import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { SENSORS, sensorKey, readingStatus, demoReadings } from './sensors.mjs';
import { validateRunPayload } from './training.mjs';

const collectorApiKey = process.env.EXPO_PUBLIC_COLLECTOR_API_KEY || '';

// Everything that used to live inside the old Dashboard component, minus the
// "which screen am I" state — App.js owns navigation now, this hook just owns
// the shirt connection and whatever run is currently being captured. Every
// screen (Current Run, Dev Testing, Calibrate) shares one instance of this so
// connecting on one screen keeps you connected on the next.
export function useShirtConnection() {
  const [mode, setMode] = useState('idle');
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [readings, setReadings] = useState({});
  const [now, setNow] = useState(Date.now());
  const [apiUrl, setApiUrl] = useState(process.env.EXPO_PUBLIC_API_URL || '');
  const [collecting, setCollecting] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState(null);
  const [runEndedAt, setRunEndedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const client = useRef(null), cache = useRef({}), epoch = useRef(0), mounted = useRef(true);
  const captureActive = useRef(false), samples = useRef([]);
  const isExpoGo = Constants.executionEnvironment === 'storeClient';
  const reportError = e => { if (mounted.current) { setError(e.message || String(e)); setStatus('Needs attention'); } };

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      setNow(Date.now()); setReadings({ ...cache.current });
      if (captureActive.current) setSampleCount(samples.current.length);
    }, 200);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'background') {
        epoch.current++;
        if (captureActive.current) finishRun();
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
        cache.current[sensorKey(r)] = { ...r, receivedAt: Date.now() };
    };
    tick(); const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [mode]);

  const reset = () => { cache.current = {}; setReadings({}); setError(''); };

  function receiveReading(reading) {
    const receivedAt = Date.now();
    const stored = { ...reading, receivedAt };
    cache.current[sensorKey(reading)] = stored;
    if (captureActive.current && reading.valid && !reading.simulated) {
      const sample = { ...stored };
      delete sample.receivedAt;
      samples.current.push({ ...sample, capturedAt: new Date(receivedAt).toISOString() });
    }
  }

  function startRun() {
    if (mode !== 'live' || status !== 'Connected') {
      setError('Connect to the shirt over Bluetooth before starting a run.');
      return;
    }
    samples.current = [];
    setSampleCount(0);
    setRunStartedAt(new Date().toISOString());
    setRunEndedAt(null);
    captureActive.current = true;
    setCollecting(true);
    setError('');
  }

  function finishRun() {
    if (!captureActive.current) return;
    captureActive.current = false;
    setCollecting(false);
    setSampleCount(samples.current.length);
    setRunEndedAt(new Date().toISOString());
  }

  function discardRun() {
    samples.current = [];
    setSampleCount(0);
    setRunStartedAt(null);
    setRunEndedAt(null);
    setError('');
  }

  // source: 'dev_testing' (Dev Testing screen, manually labeled good/bad) or
  // 'user_run' (Current Run screen — label is null until a trained model can
  // infer it; see docs/HARDWARE_AND_FIRMWARE.md and the cloudbackend README
  // for where that inference step plugs in later).
  async function saveRun(source, label = null) {
    if (!apiUrl.trim()) {
      setError('Set EXPO_PUBLIC_API_URL to your deployed cloudbackend API URL before saving.');
      return;
    }
    if (!collectorApiKey) {
      setError('Set EXPO_PUBLIC_COLLECTOR_API_KEY for the developer collector before saving.');
      return;
    }
    const payload = { startedAt: runStartedAt, endedAt: runEndedAt, source, label, samples: samples.current };
    try {
      validateRunPayload(payload);
      setSaving(true);
      setError('');
      const response = await fetch(`${apiUrl.trim().replace(/\/+$/, '')}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${collectorApiKey}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Cloud save failed (${response.status}).`);
      if (typeof result.runId !== 'string' || result.sampleCount !== payload.samples.length)
        throw new Error('Cloud API returned an invalid save confirmation. Check past runs before retrying.');
      discardRun();
      setStatus(`Saved ${label ? label + ' ' : ''}run · ${result.sampleCount} samples`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function stop() {
    if (captureActive.current) finishRun();
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
        const { createShirtClient } = require('./ble');
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
        if (attempt === epoch.current && mounted.current) receiveReading(r);
      }, value => { if (attempt === epoch.current && mounted.current) setStatus(value); }, reportError);
    } catch (e) { if (attempt === epoch.current) reportError(e); }
  }

  const liveCount = SENSORS.filter(s => {
    const reading = readings[sensorKey(s)];
    return !reading?.simulated && readingStatus(reading, now) === 'Live';
  }).length;
  const simulatedCount = SENSORS.filter(s => {
    const reading = readings[sensorKey(s)];
    return reading?.simulated && readingStatus(reading, now) === 'Live';
  }).length;

  return {
    mode, status, error, devices, readings, now, apiUrl, setApiUrl,
    collecting, sampleCount, runStartedAt, runEndedAt, saving, isExpoGo, liveCount, simulatedCount,
    scan, connect, stop, startDemo, startRun, finishRun, discardRun, saveRun, setError,
  };
}
