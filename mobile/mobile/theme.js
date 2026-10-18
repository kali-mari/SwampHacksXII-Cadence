import { StyleSheet } from 'react-native';

// Pulled out of the old single-file App.js so every screen matches the same
// dark-green look without copy-pasting the same StyleSheet five times.
export const colors = {
  bg: '#0b1713',
  panel: '#193329',
  panelAlt: '#14251e',
  border: '#2a4034',
  accent: '#b8ed89',
  accentText: '#102312',
  text: '#f0f5ec',
  textDim: '#e6f1ed',
  muted: '#9db7aa',
  mutedDark: '#7f9a8c',
  good: '#8eedba',
  warn: '#eac984',
  bad: '#ffcfb5',
  badBg: '#482a22',
};

export const shared = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 22, paddingBottom: 40 },
  eyebrow: { color: colors.muted, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 10 },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 5, marginBottom: 22 },
  hero: { backgroundColor: colors.panel, borderRadius: 22, padding: 20, gap: 12 },
  heroTitle: { fontSize: 24, color: '#e8f6d4', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, marginTop: 6, minHeight: 46 },
  secondary: { backgroundColor: '#2a4438' },
  buttonText: { color: colors.accentText, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  section: { color: colors.textDim, fontWeight: '700', fontSize: 19, marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: colors.panelAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 10, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  value: { color: colors.text, fontSize: 27, fontWeight: '700', marginTop: 4 },
  unit: { color: colors.muted, fontSize: 14, fontWeight: '400' },
  axisLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1, marginTop: 7 },
  axes: { color: colors.textDim, fontVariant: ['tabular-nums'], fontSize: 16 },
  timestamp: { color: colors.mutedDark, fontSize: 10, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  input: { color: colors.textDim, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 },
  error: { color: colors.bad, backgroundColor: colors.badBg, padding: 16, borderRadius: 12, marginTop: 12, lineHeight: 21 },
  notice: { color: colors.warn, paddingVertical: 16, lineHeight: 21 },
  footer: { color: colors.muted, lineHeight: 20, fontSize: 12, marginTop: 25 },
  backRow: { marginBottom: 14 },
});
