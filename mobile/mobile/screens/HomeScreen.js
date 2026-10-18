import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, shared } from '../theme';
import { NavTile } from '../components';

export default function HomeScreen({ navigate }) {
  return <>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={shared.content}>
      <Text style={shared.eyebrow}>SWAMPHACKS / WEARABLE LAB</Text>
      <Text style={shared.title}>Posture Check</Text>
      <Text style={shared.subtitle}>Your shirt. Every signal.</Text>

      <Pressable accessibilityRole="button" onPress={() => navigate('run')}
        style={({ pressed }) => [styles.startCircle, pressed && { opacity: .7 }]}>
        <View style={styles.playMark} />
      </Pressable>
      <Text style={styles.startLabel}>Start new run</Text>

      <View style={styles.tileRow}>
        <View style={{ flex: 1 }}><NavTile label="Calibrate shirt" onPress={() => navigate('calibrate')} /></View>
        <View style={{ flex: 1 }}><NavTile label="See past runs" onPress={() => navigate('pastRuns')} /></View>
      </View>
      <NavTile label="Dev screen (ML testing)" onPress={() => navigate('devTesting')} />
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  startCircle: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: colors.panel,
    borderWidth: 2, borderColor: colors.accent, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 14,
  },
  playMark: {
    width: 0, height: 0, marginLeft: 8,
    borderTopWidth: 22, borderBottomWidth: 22, borderLeftWidth: 36,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: colors.accent,
  },
  startLabel: { color: colors.textDim, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 28 },
  tileRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
});
