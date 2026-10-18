import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, shared } from '../theme';
import { Button, BackButton, fmt } from '../components';

const SENSOR_NAMES = {
  '1:0': 'Left elbow', '1:1': 'Right elbow', '1:2': 'Spine',
  '2:0': 'Left upper arm', '2:1': 'Left forearm', '2:2': 'Right upper arm', '2:3': 'Right forearm',
  '3:0': 'Inside shirt', '3:1': 'Outside shirt',
};

function averageLine(sensor) {
  const name = SENSOR_NAMES[`${sensor.sensorType}:${sensor.sensorId}`] || `Sensor ${sensor.sensorType}:${sensor.sensorId}`;
  const a = sensor.averages;
  if (sensor.sensorType === 1) return `${name}: ${fmt((a.resistanceOhms ?? 0) / 1000, 1)} kΩ`;
  if (sensor.sensorType === 2) return `${name}: accel ${fmt(a.accelX)} / ${fmt(a.accelY)} / ${fmt(a.accelZ)} m/s²`;
  return `${name}: ${fmt(a.temperatureC, 1)} °C · ${fmt(a.humidityPct, 1)} % RH`;
}

function labelPill(label) {
  if (label === 'good') return { text: 'Good', color: colors.good };
  if (label === 'bad') return { text: 'Bad', color: colors.bad };
  return { text: 'Pending', color: colors.warn };
}

export default function PastRunsScreen({ navigate, shirt }) {
  const { apiUrl, collectorApiKey } = shirt;
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!apiUrl.trim()) { setError('Set the cloudbackend API URL to load past runs.'); return; }
    if (!collectorApiKey.trim()) { setError('Enter the collector token on the Dev Testing screen to load past runs.'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(`${apiUrl.trim().replace(/\/+$/, '')}/api/runs`, {
        headers: { Authorization: `Bearer ${collectorApiKey.trim()}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Could not load runs (${response.status}).`);
      if (!Array.isArray(result.runs)) throw new Error('Cloud API returned an invalid past-runs response.');
      setRuns(result.runs);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiUrl, collectorApiKey]);

  useEffect(() => { load(); }, [load]);

  return <>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={shared.content}>
      <BackButton onPress={() => navigate('home')} />
      <Text style={shared.eyebrow}>SEE PAST RUNS</Text>
      <Text style={shared.title}>Past runs</Text>
      <Text style={shared.subtitle}>Average sensor values per run, and whether it looked like good form.</Text>

      <Text style={shared.axisLabel}>CLOUDBACKEND API URL</Text>
      <TextInput accessibilityLabel="Cloudbackend API URL" autoCapitalize="none" autoCorrect={false}
        keyboardType="url" placeholder="https://your-api.example.com" placeholderTextColor="#7f9a8c"
        value={apiUrl} onChangeText={setApiUrl} style={shared.input} />

      <View style={shared.actions}>
        <Button label={loading ? 'Loading…' : 'Refresh'} onPress={load} disabled={loading} />
      </View>
      {!!error && <Text accessibilityRole="alert" style={shared.error}>{error}</Text>}

      {!loading && !error && runs.length === 0 && <Text style={shared.notice}>No runs saved yet. Finish a run and save it from the Current Run or Dev Testing screen.</Text>}

      {runs.map(run => {
        const pill = labelPill(run.label);
        return <View key={run.runId} style={shared.card}>
          <View style={shared.row}>
            <Text style={shared.cardTitle}>{new Date(run.startedAt).toLocaleString()}</Text>
            <Text style={{ color: pill.color, fontWeight: '700' }}>{pill.text}</Text>
          </View>
          {run.sensors.map(s => <Text key={`${s.sensorType}:${s.sensorId}`} style={shared.muted}>{averageLine(s)}</Text>)}
        </View>;
      })}
    </ScrollView>
  </>;
}
