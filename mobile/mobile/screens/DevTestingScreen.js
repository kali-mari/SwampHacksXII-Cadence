import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SENSORS, sensorKey } from '../sensors.mjs';
import { shared } from '../theme';
import { Button, BackButton, ConnectionPanel, DeviceList, SensorCard } from '../components';

export default function DevTestingScreen({ navigate, shirt }) {
  const [label, setLabel] = useState('good');
  const { apiUrl, setApiUrl, collectorApiKey, setCollectorApiKey, collecting, sampleCount, runEndedAt, saving,
    startRun, finishRun, discardRun, saveRun, error, mode, readings, now } = shirt;
  const [backendCheck, setBackendCheck] = useState('');
  const [checkingBackend, setCheckingBackend] = useState(false);

  async function checkBackend() {
    let baseUrl;
    try {
      baseUrl = new URL(apiUrl.trim());
      if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.pathname !== '/' ||
          baseUrl.search || baseUrl.hash) throw new Error();
    } catch {
      setBackendCheck('Enter a base URL such as http://192.168.1.42:3000.');
      return;
    }
    setCheckingBackend(true);
    setBackendCheck('');
    try {
      const response = await fetch(`${baseUrl.origin}/health`);
      const result = await response.json();
      if (!response.ok || result.status !== 'ok')
        throw new Error(result.error || `Backend returned ${response.status}.`);
      setBackendCheck('Connected to collector backend and TigerData.');
    } catch (checkError) {
      setBackendCheck(`Could not reach backend: ${checkError.message || String(checkError)}`);
    } finally {
      setCheckingBackend(false);
    }
  }

  return <>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={shared.content}>
      <BackButton onPress={() => navigate('home')} />
      <Text style={shared.eyebrow}>DEV TESTING</Text>
      <Text style={shared.title}>Dev Testing</Text>
      <Text style={shared.subtitle}>Capture labeled sensor data to train the posture model.</Text>

      <ConnectionPanel shirt={shirt} />
      <DeviceList shirt={shirt} />

      <View style={[shared.hero, { marginTop: 18 }]}>
        <Text style={shared.axisLabel}>COLLECTOR BACKEND URL</Text>
        <TextInput accessibilityLabel="Cloudbackend API URL" autoCapitalize="none" autoCorrect={false}
          keyboardType="url" placeholder="http://192.168.1.42:3000" placeholderTextColor="#7f9a8c"
          value={apiUrl} onChangeText={setApiUrl} style={shared.input} />
        <Text style={shared.muted}>For same-Wi-Fi testing, use your computer's IPv4 address, not localhost. Keep the backend running on port 3000.</Text>
        <Text style={shared.axisLabel}>COLLECTOR TOKEN</Text>
        <TextInput accessibilityLabel="Collector token" autoCapitalize="none" autoCorrect={false}
          secureTextEntry value={collectorApiKey} onChangeText={setCollectorApiKey}
          placeholder="Token from backend COLLECTOR_API_KEY" placeholderTextColor="#7f9a8c" style={shared.input} />
        <View style={shared.actions}>
          <Button label={checkingBackend ? 'Checking…' : 'Test backend'} secondary
            onPress={checkBackend} disabled={checkingBackend} />
        </View>
        {!!backendCheck && <Text style={backendCheck.startsWith('Connected') ? shared.muted : shared.notice}>{backendCheck}</Text>}

        <View style={shared.actions}>
          <Button label={label === 'good' ? 'Labeling: Good' : 'Labeling: Bad'} secondary
            disabled={collecting} onPress={() => setLabel(l => l === 'good' ? 'bad' : 'good')} />
          {collecting
            ? <Button label={`Stop · ${sampleCount} samples`} onPress={finishRun} />
            : <Button label="Start" onPress={startRun} disabled={mode === 'idle'} />}
        </View>

        {runEndedAt && !collecting && <>
          <Text style={shared.muted}>Run ready · {sampleCount} samples · labeled {label}</Text>
          <View style={shared.actions}>
            <Button label="💾 Save" onPress={() => saveRun('dev_testing', label)} disabled={saving || sampleCount === 0} />
            <Button label="Discard" secondary disabled={saving} onPress={discardRun} />
          </View>
          {saving && <Text style={shared.muted}>Saving run and samples…</Text>}
          {sampleCount === 0 && <Text style={shared.notice}>No valid sensor samples were captured. Connect the shirt and record again.</Text>}
        </>}
      </View>

      {!!error && <Text accessibilityRole="alert" style={shared.error}>{error}</Text>}

      <Text style={shared.section}>Value readouts</Text>
      {['Flex', 'IMU'].map(group => <View key={group}>
        {SENSORS.filter(s => s.group === group).map(s => <SensorCard key={sensorKey(s)} sensor={s} reading={readings[sensorKey(s)]} now={now} />)}
      </View>)}

      <Text style={shared.footer}>Demo and simulated ESP32 readings are excluded from saved runs. Samples stay in memory until saved; keep the app open while recording.</Text>
    </ScrollView>
  </>;
}
