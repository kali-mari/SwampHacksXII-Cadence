import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SENSORS, sensorKey } from '../sensors.mjs';
import { collectorBaseUrl } from '../../collectorConfig.mjs';
import { shared } from '../theme';
import { Button, BackButton, ConnectionPanel, DeviceList, SensorCard } from '../components';

export default function DevTestingScreen({ navigate, shirt }) {
  const [label, setLabel] = useState('good');
  const { apiUrl, collectorApiKey, collecting, startingRun, sampleCount, uploadedSampleCount, runEndedAt, saving,
    startRun, finishRun, discardRun, saveRun, error, mode, readings, now } = shirt;
  const [backendCheck, setBackendCheck] = useState('');
  const [checkingBackend, setCheckingBackend] = useState(false);

  async function checkBackend() {
    const baseUrl = collectorBaseUrl(apiUrl);
    if (!baseUrl) {
      setBackendCheck('This app build needs an HTTPS collector address. Configure it with the app build settings; do not use a TigerData Console URL.');
      return;
    }
    setCheckingBackend(true);
    setBackendCheck('');
    try {
      const response = await fetch(`${baseUrl}/health`);
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
        <Text style={shared.muted}>Upload settings are configured for this app. Check that the collector is reachable before recording.</Text>
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
            : <Button label={startingRun ? 'Connecting to cloud…' : 'Start'}
              onPress={() => startRun('dev_testing')} disabled={mode === 'idle' || startingRun} />}
        </View>
        {collecting && <Text style={shared.muted}>{uploadedSampleCount} samples uploaded to the cloud</Text>}

        {runEndedAt && !collecting && <>
          <Text style={shared.muted}>Run ready · {sampleCount} samples · labeled {label}</Text>
          <Text style={shared.muted}>{uploadedSampleCount} samples uploaded · Save finalizes the label</Text>
          <View style={shared.actions}>
            <Button label="💾 Save" onPress={() => saveRun('dev_testing', label)} disabled={saving || sampleCount === 0} />
            <Button label="Discard" secondary disabled={saving} onPress={discardRun} />
          </View>
          {saving && <Text style={shared.muted}>Syncing remaining samples and saving run…</Text>}
          {sampleCount === 0 && <Text style={shared.notice}>No valid sensor samples were captured. Connect the shirt and record again.</Text>}
        </>}
      </View>

      {!!error && <Text accessibilityRole="alert" style={shared.error}>{error}</Text>}

      <Text style={shared.section}>Value readouts</Text>
      {['Flex', 'IMU'].map(group => <View key={group}>
        {SENSORS.filter(s => s.group === group).map(s => <SensorCard key={sensorKey(s)} sensor={s} reading={readings[sensorKey(s)]} now={now} />)}
      </View>)}

      <Text style={shared.footer}>Valid sensor samples upload in batches while recording. Keep the app open until Save confirms the final label; demo and simulated readings are excluded.</Text>
    </ScrollView>
  </>;
}
