import React, { useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useShirtConnection } from './useShirtConnection';
import { shared } from './theme';
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

function App() {
  const [page, setPage] = useState('home');
  // One connection/run-capture instance shared by every screen, so scanning
  // on Current Run and then tapping Calibrate doesn't lose the connection.
  const shirt = useShirtConnection();
  const Screen = SCREENS[page] || HomeScreen;
  return <SafeAreaView style={shared.screen}>
    <Screen navigate={setPage} shirt={shirt} />
  </SafeAreaView>;
}

export default function Root() { return <SafeAreaProvider><App /></SafeAreaProvider>; }
