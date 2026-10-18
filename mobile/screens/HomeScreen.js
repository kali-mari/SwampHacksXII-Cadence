import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, shared } from '../theme';

const destinations = [
  { title: 'Dev testing', detail: 'Capture labeled training data.', icon: '⚡︎', page: 'devTesting' },
  { title: 'Calibrate sensors', detail: 'Check alignment before your next run.', icon: '◉', page: 'calibrate' },
  { title: 'Past runs', detail: 'See your sessions and sensor readings.', icon: '▥', page: 'pastRuns' },
];

export default function HomeScreen({ navigate, shirt }) {
  const demoMode = shirt.mode === 'demo';
  const connected = shirt.mode === 'live' && shirt.status === 'Connected' && shirt.liveCount > 0;
  const linkReady = shirt.mode === 'live' && shirt.status === 'Connected';
  const sensorTitle = demoMode ? 'Demo mode' : connected ? 'Shirt connected' : linkReady ? 'Bluetooth connected' : 'Shirt not connected';
  const sensorDetail = demoMode
    ? 'Simulated readings only · no shirt connected'
    : connected
      ? `${shirt.liveCount} of 9 sensors reporting`
      : linkReady
        ? 'Waiting for live sensor readings'
        : shirt.mode === 'live'
          ? `Bluetooth${shirt.status}`
          : 'Connect your shirt';
  return <>
    <StatusBar style="dark" backgroundColor={colors.bg} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View><Text style={styles.brand}>Cadence<Text style={styles.brandDot}>.</Text></Text></View>
      </View>

      <View style={styles.hero}>
        <View style={styles.rings}><View style={styles.ringInner}/></View>
        <Text style={styles.heroTitle}>Run your{'\n'}<Text style={styles.heroTitleLight}>rhythm.</Text></Text>
        <Text style={styles.heroText}>Track your form, understand every stride, and build a healthier run.</Text>
        <Pressable accessibilityRole="button" onPress={() => navigate('run')} style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.82 }]}>
          <View style={styles.play}><Text style={styles.playGlyph}>▶</Text></View><Text style={styles.startText}>Start a new run</Text><Text style={styles.arrow}>↗</Text>
        </Pressable>
      </View>

      <View style={styles.sensorStatus}><View style={[styles.statusDot, connected && styles.connectedDot, demoMode && styles.demoDot]}/><View style={styles.statusCopy}><Text style={styles.statusTitle}>{sensorTitle}</Text><Text style={styles.statusDetail}>{sensorDetail}</Text></View><Text style={styles.statusArrow}>⌁</Text></View>

      <View style={styles.sectionHeader}><View><Text style={shared.eyebrow}>YOUR TRAINING SPACE</Text><Text style={styles.sectionTitle}>Make it yours</Text></View></View>
      {destinations.map((item, index) => <Pressable key={item.page} accessibilityRole="button" onPress={() => navigate(item.page)} style={({ pressed }) => [styles.destination, pressed && { opacity: 0.72 }]}>
        <View style={[styles.destinationIcon, index === 1 && styles.sageIcon]}><Text style={styles.destinationGlyph}>{item.icon}</Text></View>
        <View style={styles.destinationCopy}><Text style={styles.destinationTitle}>{item.title}</Text><Text style={styles.destinationDetail}>{item.detail}</Text></View><Text style={styles.destinationArrow}>↗</Text>
      </Pressable>)}
      <Text style={styles.footer}>Cadence  ·  SwampHacks XII</Text>
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 23 },
  brand: { color: colors.dark, fontSize: 25, fontWeight: '700', letterSpacing: -1.2 },
  brandDot: { color: '#b77257' },
  tagline: { color: '#b4a295', fontSize: 7, fontWeight: '700', letterSpacing: 2, marginTop: 1 },
  hero: { position: 'relative', overflow: 'hidden', minHeight: 363, borderRadius: 25, backgroundColor: colors.dark, paddingHorizontal: 21, paddingTop: 22, paddingBottom: 19 },
  rings: { position: 'absolute', top: -73, right: -104, width: 282, height: 282, borderRadius: 145, borderWidth: 27, borderColor: '#6f382b99' },
  ringInner: { flex: 1, margin: 23, borderRadius: 110, borderWidth: 1, borderColor: '#b8806680' },
  heroEyebrow: { color: '#c9b4a8', fontSize: 9, fontWeight: '700', letterSpacing: 1.7 },
  heroTitle: { color: '#f4efe8', fontSize: 39, fontWeight: '700', letterSpacing: -1.7, lineHeight: 42, marginTop: 34 },
  heroTitleLight: { color: '#e6c9b6' },
  heroText: { maxWidth: 300, color: '#d3c2b8', fontSize: 12, lineHeight: 19, marginTop: 13 },
  startButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderRadius: 15, backgroundColor: '#f4efe8', paddingHorizontal: 11, marginTop: 22 },
  play: { width: 31, height: 31, borderRadius: 16, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center' },
  playGlyph: { color: '#fff', fontSize: 10, marginLeft: 2 },
  startText: { flex: 1, color: colors.dark, fontSize: 13, fontWeight: '700', textAlign: 'center', marginRight: 25 },
  arrow: { color: '#7d5141', fontSize: 17 },
  sensorStatus: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.panelAlt, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14, marginTop: 14 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#bca697' },
  connectedDot: { backgroundColor: '#758c68' },
  demoDot: { backgroundColor: '#c48958' },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  statusDetail: { color: colors.muted, fontSize: 10, marginTop: 4 },
  statusArrow: { color: '#a55f44', fontSize: 21 },
  sectionHeader: { marginTop: 23, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 5 },
  destination: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.panel, paddingHorizontal: 13, marginBottom: 9 },
  destinationIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ead8cb' },
  sageIcon: { backgroundColor: '#dce5d5' },
  destinationGlyph: { color: '#765144', fontSize: 18 },
  destinationCopy: { flex: 1 },
  destinationTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  destinationDetail: { color: colors.muted, fontSize: 9, marginTop: 5 },
  destinationArrow: { color: '#987360', fontSize: 15 },
  footer: { color: '#b4a295', fontSize: 7, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center', marginTop: 13 },
});
