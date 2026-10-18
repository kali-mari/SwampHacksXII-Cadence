import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SENSORS, sensorKey } from '../sensors.mjs';
import { shared } from '../theme';
import { Button, BackButton, ConnectionPanel, DeviceList, SensorCard } from '../components';

export default function DevTestingScreen({ navigate, shirt }) {
  const [label, setLabel] = useState('good');
  const { apiUrl, setApiUrl, collecting, sampleCount, runEndedAt, saving,
    startRun, finishRun, discardRun, saveRun, error, mode, readings, now } = shirt;

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
        <Text style={shared.axisLabel}>CLOUDBACKEND API URL</Text>
        <TextInput accessibilityLabel="Cloudbackend API URL" autoCapitalize="none" autoCorrect={false}
          keyboardType="url" placeholder="https://your-api.example.com" placeholderTextColor="#7f9a8c"
          value={apiUrl} onChangeText={setApiUrl} style={shared.input} />

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
