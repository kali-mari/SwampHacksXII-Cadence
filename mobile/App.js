import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useShirtConnection } from './useShirtConnection';
import { colors, shared } from './theme';
import HomeScreen from './screens/HomeScreen';
import CurrentRunScreen from './screens/CurrentRunScreen';
import DevTestingScreen from './screens/DevTestingScreen';
import CalibrateScreen from './screens/CalibrateScreen';
import PastRunsScreen from './screens/PastRunsScreen';

const SCREENS = {
  home: HomeScreen,
  run: CurrentRunScreen,
  devTesting: DevTestingScreen,
  calibrate: CalibrateScreen,
  pastRuns: PastRunsScreen,
};

const TABS = [
  { page: 'home', icon: '⌂', label: 'Home' },
  { page: 'run', icon: '≈', label: 'Run' },
  { page: 'devTesting', icon: '⚡︎', label: 'Testing' },
  { page: 'calibrate', icon: '◉', label: 'Calibrate' },
  { page: 'pastRuns', icon: '▥', label: 'History' },
];

function App() {
  const [page, setPage] = useState('home');
  // Keep one live connection across all five screens.
  const shirt = useShirtConnection();
  const Screen = SCREENS[page] || HomeScreen;
  return <SafeAreaView style={shared.screen}>
    <View style={styles.screenBody}><Screen navigate={setPage} shirt={shirt} /></View>
    <View style={styles.tabBar} accessibilityRole="tablist">
      {TABS.map(tab => {
        const active = page === tab.page;
        return <Pressable key={tab.page} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label}
          onPress={() => setPage(tab.page)} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.65 }]}>
          <View style={[styles.iconPill, active && styles.iconPillActive]}><Text style={[styles.tabIcon, active && styles.tabIconActive]}>{tab.icon}</Text></View>
          <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
        </Pressable>;
      })}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screenBody: { flex: 1 },
  tabBar: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#ddcfc2', backgroundColor: colors.bg, paddingHorizontal: 2, paddingTop: 3 },
  tab: { minWidth: 59, height: 64, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 14 },
  iconPill: { width: 51, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  iconPillActive: { backgroundColor: colors.active },
  tabIcon: { color: '#88746a', fontSize: 19, lineHeight: 24 },
  tabIconActive: { color: colors.dark },
  tabLabel: { color: '#88746a', fontSize: 8, fontWeight: '600' },
  tabLabelActive: { color: colors.dark, fontWeight: '700' },
});

export default function Root() { return <SafeAreaProvider><App /></SafeAreaProvider>; }
