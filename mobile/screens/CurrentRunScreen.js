import React from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SENSORS, sensorKey } from '../sensors.mjs';
import { shared } from '../theme';
import { Button, BackButton, ConnectionPanel, DeviceList, SensorCard } from '../components';

export default function CurrentRunScreen({ navigate, shirt }) {
  const { mode, readings, now, apiUrl, setApiUrl, collecting, sampleCount, runStartedAt, runEndedAt, saving,
    startRun, finishRun, discardRun, saveRun, error } = shirt;
  const elapsedS = collecting && runStartedAt ? Math.max(0, Math.floor((now - Date.parse(runStartedAt)) / 1000)) : null;

  return <>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={shared.content}>
      <BackButton onPress={() => navigate('home')} />
      <Text style={shared.eyebrow}>CURRENT RUN</Text>
      <Text style={shared.title}>Run</Text>
      <Text style={shared.subtitle}>Let's go for a run!</Text>

      <ConnectionPanel shirt={shirt} />
      <DeviceList shirt={shirt} />

      <View style={[shared.hero, { marginTop: 18 }]}>
        <Text style={shared.axisLabel}>CLOUDBACKEND API URL</Text>
        <TextInput accessibilityLabel="Cloudbackend API URL" autoCapitalize="none" autoCorrect={false}
          keyboardType="url" placeholder="https://your-api.example.com" placeholderTextColor="#7f9a8c"
          value={apiUrl} onChangeText={setApiUrl} style={shared.input} />
        {collecting
          ? <>
            <Text style={shared.heroTitle}>{String(Math.floor(elapsedS / 60)).padStart(2, '0')}:{String(elapsedS % 60).padStart(2, '0')}</Text>
            <Text style={shared.muted}>{sampleCount} samples captured so far</Text>
            <Button label="Stop run" onPress={finishRun} />
          </>
          : runEndedAt
            ? <>
              <Text style={shared.heroTitle}>Run ready · {sampleCount} samples</Text>
              <View style={shared.actions}>
                <Button label="Save run" onPress={() => saveRun('user_run')} disabled={saving || sampleCount === 0} />
                <Button label="Discard" secondary disabled={saving} onPress={discardRun} />
              </View>
              {saving && <Text style={shared.muted}>Saving run…</Text>}
              {sampleCount === 0 && <Text style={shared.notice}>No valid sensor samples were captured. Connect the shirt and try again.</Text>}
            </>
            : <Button label="Start run" onPress={startRun} disabled={mode === 'idle'} />}
      </View>

      {!!error && <Text accessibilityRole="alert" style={shared.error}>{error}</Text>}

      {['Flex', 'IMU', 'Environment'].map(group => <View key={group}>
        <Text style={shared.section}>{group === 'Flex' ? 'Bend signals' : group === 'IMU' ? 'Arm movement' : 'Shirt environment'}</Text>
        {SENSORS.filter(s => s.group === group).map(s => <SensorCard key={sensorKey(s)} sensor={s} reading={readings[sensorKey(s)]} now={now} />)}
      </View>)}
    </ScrollView>
  </>;
}
