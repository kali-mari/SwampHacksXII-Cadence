import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { SENSORS, sensorKey, readingStatus, demoReadings } from './sensors.mjs';
import { buildTcnWindow, MAX_RUN_SAMPLES, MODEL_FEATURE_NAMES, MODEL_WINDOW_SIZE, validateRunPayload } from './training.mjs';
import { collectorBaseUrl } from '../collectorConfig.mjs';
import { CloudRunUploader } from '../cloudCapture.mjs';

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
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const collectorApiKey = process.env.EXPO_PUBLIC_COLLECTOR_API_KEY || '';
  const modelApiUrl = process.env.EXPO_PUBLIC_MODEL_API_URL || '';
  const [modelInfo, setModelInfo] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [modelError, setModelError] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [startingRun, setStartingRun] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [uploadedSampleCount, setUploadedSampleCount] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState(null);
  const [runEndedAt, setRunEndedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const client = useRef(null), cache = useRef({}), epoch = useRef(0), mounted = useRef(true);
  const captureActive = useRef(false), samples = useRef([]);
  const cloudUploader = useRef(null), captureSource = useRef(null), startingRunActive = useRef(false);
  const modelSamples = useRef([]);
  const predictionActive = useRef(false), lastPredictionAt = useRef(0);
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

  useEffect(() => {
    setModelInfo(null);
    setAssessment(null);
    setModelError(modelApiUrl.trim()
      ? 'Checking live posture assessment…'
      : 'Live posture assessment is not configured. Sensor capture and uploads can still work.');
    if (!modelApiUrl.trim()) return undefined;
    let active = true;
    fetch(`${modelApiUrl.trim().replace(/\/+$/, '')}/model/info`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || `TCN service returned ${response.status}.`);
        if (typeof body?.ready !== 'boolean') throw new Error('TCN service returned invalid model information.');
        if (body.ready && (body.model_type !== 'temporal_convolutional_network' ||
            body.window_size !== MODEL_WINDOW_SIZE ||
            JSON.stringify(body.channel_names) !== JSON.stringify(MODEL_FEATURE_NAMES))) {
          throw new Error('TCN service data contract does not match this app.');
        }
        return body;
      })
      .then(info => {
        if (!active) return;
        setModelInfo(info);
        setModelError(info.ready ? '' : info.message || 'The TCN has not been trained yet.');
      })
      .catch(error => {
        if (active) setModelError(`TCN service unavailable: ${error.message || String(error)}`);
      });
    return () => { active = false; };
  }, [modelApiUrl]);

  useEffect(() => {
    if (!collecting || !modelInfo?.ready || !modelApiUrl.trim()) return undefined;
    const timer = setInterval(async () => {
      const requestAt = Date.now();
      if (predictionActive.current || requestAt - lastPredictionAt.current < 1000) return;
      const frames = buildTcnWindow(modelSamples.current, requestAt);
      if (!frames) return;
      predictionActive.current = true;
      lastPredictionAt.current = requestAt;
      try {
        const response = await fetch(`${modelApiUrl.trim().replace(/\/+$/, '')}/predict`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({frames}),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || `TCN assessment failed (${response.status}).`);
        if (![0, 1].includes(body?.prediction) || !Number.isFinite(body.confidence) ||
            typeof body.form_status !== 'string' || typeof body.model_version !== 'string') {
          throw new Error('TCN service returned an invalid assessment.');
        }
        if (mounted.current) {
          setAssessment({...body, assessedAt: new Date().toISOString()});
          setModelError('');
        }
      } catch (error) {
        if (mounted.current) setModelError(`Live TCN assessment failed: ${error.message || String(error)}`);
      } finally {
        predictionActive.current = false;
      }
    }, 500);
    return () => clearInterval(timer);
  }, [collecting, modelApiUrl, modelInfo?.ready]);

  const reset = () => { cache.current = {}; setReadings({}); setError(''); };

  function receiveReading(reading) {
    const receivedAt = Date.now();
    const stored = { ...reading, receivedAt };
    cache.current[sensorKey(reading)] = stored;
    if (captureActive.current && reading.valid && !reading.simulated) {
      if (samples.current.length >= MAX_RUN_SAMPLES) {
        finishRun();
        setError(`Reached the maximum of ${MAX_RUN_SAMPLES} samples. Save or discard this run before starting another.`);
        return;
      }
      const sample = { ...stored };
      delete sample.receivedAt;
      const timestamped = {...sample, capturedAt: new Date(receivedAt).toISOString()};
      samples.current.push(timestamped);
      try {
        cloudUploader.current?.addSample(timestamped);
      } catch (uploadError) {
        setError(`Cloud sample upload failed: ${uploadError.message || String(uploadError)}`);
      }
      modelSamples.current.push(timestamped);
      modelSamples.current = modelSamples.current.filter(
        item => receivedAt - Date.parse(item.capturedAt) <= 5000,
      );
    }
  }

  async function startRun(source) {
    if (mode !== 'live' || status !== 'Connected') {
      setError('Connect to the shirt over Bluetooth before starting a run.');
      return;
    }
    if (startingRunActive.current) return;
    const baseUrl = collectorBaseUrl(apiUrl);
    if (!baseUrl) {
      setError('Cloud capture is not configured for this app build. The HTTPS collector address must be set at build time.');
      return;
    }
    if (!collectorApiKey.trim()) {
      setError('Cloud capture is not configured for this app build. The collector token is missing from its build configuration.');
      return;
    }

    startingRunActive.current = true;
    setStartingRun(true);
    setError('');
    const connectionAttempt = epoch.current;
    try {
      const startedAt = new Date().toISOString();
      const uploader = new CloudRunUploader({
        baseUrl,
        apiKey: collectorApiKey,
        onError: message => { if (mounted.current) setError(`Cloud sample upload failed: ${message}`); },
        onProgress: count => { if (mounted.current) setUploadedSampleCount(count); },
      });
      const result = await uploader.start(source, startedAt);
      if (connectionAttempt !== epoch.current) {
        await uploader.discard();
        return;
      }
      samples.current = [];
      modelSamples.current = [];
      cloudUploader.current = uploader;
      captureSource.current = source;
      setSampleCount(0);
      setUploadedSampleCount(0);
      setRunStartedAt(result.startedAt || startedAt);
      setRunEndedAt(null);
      setAssessment(null);
      lastPredictionAt.current = 0;
      captureActive.current = true;
      setCollecting(true);
    } catch (startError) {
      setError(`Could not start cloud capture: ${startError.message || String(startError)}`);
    } finally {
      startingRunActive.current = false;
      setStartingRun(false);
    }
  }

  function finishRun() {
    if (!captureActive.current) return;
    captureActive.current = false;
    setCollecting(false);
    setSampleCount(samples.current.length);
    setRunEndedAt(new Date().toISOString());
    cloudUploader.current?.finish();
  }

  function clearRun() {
    cloudUploader.current = null;
    captureSource.current = null;
    samples.current = [];
    modelSamples.current = [];
    setSampleCount(0);
    setUploadedSampleCount(0);
    setRunStartedAt(null);
    setRunEndedAt(null);
    setAssessment(null);
    setError('');
  }

  async function discardRun() {
    try {
      await cloudUploader.current?.discard();
      clearRun();
    } catch (discardError) {
      setError(`Could not discard cloud capture: ${discardError.message || String(discardError)}`);
    }
  }

  // source: 'dev_testing' (Dev Testing screen, manually labeled good/bad) or
  // 'user_run' (Current Run screen — label is null until a trained model can
  // infer it; see docs/HARDWARE_AND_FIRMWARE.md and the cloudbackend README
  // for where that inference step plugs in later).
  async function saveRun(source, label = null) {
    const uploader = cloudUploader.current;
    if (!uploader || captureSource.current !== source) {
      setError('This run has no active cloud capture. Start a new run while connected to the cloud collector.');
      return;
    }
    const payload = { startedAt: runStartedAt, endedAt: runEndedAt, source, label, samples: samples.current };
    try {
      validateRunPayload(payload);
      setSaving(true);
      setError('');
      const result = await uploader.finalize(runEndedAt, source, label);
      clearRun();
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

  const liveCount = SENSORS.filter(s => readingStatus(readings[sensorKey(s)], now) === 'Live').length;
  const simulatedCount = SENSORS.filter(s => readings[sensorKey(s)]?.simulated &&
    readingStatus(readings[sensorKey(s)], now) === 'Live').length;

  return {
    mode, status, error, devices, readings, now, apiUrl, collectorApiKey,
    modelApiUrl, modelInfo, assessment, modelError,
    collecting, startingRun, sampleCount, uploadedSampleCount, runStartedAt, runEndedAt, saving, isExpoGo, liveCount, simulatedCount,
    scan, connect, stop, startDemo, startRun, finishRun, discardRun, saveRun, setError,
  };
}
