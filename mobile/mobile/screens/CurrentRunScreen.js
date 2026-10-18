import React from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SENSORS, sensorKey } from '../sensors.mjs';
import { shared } from '../theme';
import { Button, BackButton, ConnectionPanel, DeviceList, SensorCard } from '../components';

export default function CurrentRunScreen({ navigate, shirt }) {
  const { mode, readings, now, modelApiUrl, setModelApiUrl, modelInfo, assessment, modelError,
    collecting, sampleCount, runStartedAt, runEndedAt, saving,
    startRun, finishRun, discardRun, saveRun, error } = shirt;
  const elapsedS = collecting && runStartedAt ? Math.max(0, Math.floor((now - Date.parse(runStartedAt)) / 1000)) : null;
  const freshAssessment = assessment && (!collecting || now - Date.parse(assessment.assessedAt) <= 3000);

  return <>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={shared.content}>
      <BackButton onPress={() => navigate('home')} />
      <Text style={shared.eyebrow}>CURRENT RUN</Text>
      <Text style={shared.title}>Run</Text>
      <Text style={shared.subtitle}>Start the timer, wear the shirt, save when you're done.</Text>

      <ConnectionPanel shirt={shirt} />
      <DeviceList shirt={shirt} />

      <View style={[shared.hero, { marginTop: 18 }]}>
        <Text style={shared.axisLabel}>LIVE TCN API URL</Text>
        <TextInput accessibilityLabel="Live TCN API URL" autoCapitalize="none" autoCorrect={false}
          keyboardType="url" placeholder="https://your-tcn-service.example.com" placeholderTextColor="#7f9a8c"
          value={modelApiUrl} onChangeText={setModelApiUrl} style={shared.input} />
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

      <View style={shared.hero}>
        <Text style={shared.axisLabel}>LIVE TCN ASSESSMENT</Text>
        <Text style={shared.heroTitle}>
          {freshAssessment?.form_status || (modelInfo?.ready ? 'Waiting for a complete 2.56 s window' : 'TCN unavailable')}
        </Text>
        {freshAssessment
          ? <Text style={shared.muted}>{`Model score ${Math.round(freshAssessment.confidence * 100)}% · ${freshAssessment.model_version}`}</Text>
          : <Text style={shared.muted}>{modelError || modelInfo?.message || 'Connect all six sensors and configure the TCN service.'}</Text>}
        {modelInfo?.ready && modelInfo.metrics && <Text style={shared.muted}>
          {`Held-out accuracy ${Math.round(modelInfo.metrics.accuracy * 100)}% · bad-form recall ${Math.round(modelInfo.metrics.bad_recall * 100)}%`}
        </Text>}
      </View>

      {!!error && <Text accessibilityRole="alert" style={shared.error}>{error}</Text>}

      {['Flex', 'IMU'].map(group => <View key={group}>
        <Text style={shared.section}>{group === 'Flex' ? 'Elbow bend signals' : 'Arm movement'}</Text>
        {SENSORS.filter(s => s.group === group).map(s => <SensorCard key={sensorKey(s)} sensor={s} reading={readings[sensorKey(s)]} now={now} />)}
      </View>)}
    </ScrollView>
  </>;
}
