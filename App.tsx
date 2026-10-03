import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { StyleSheet, Text, View } from 'react-native';

/** Step 1: plain screen to prove the dev build runs on the phone. */
export default function App() {
  const [loaded] = useFonts({
    'PixelifySans-Regular': require('./assets/fonts/PixelifySans-Regular.ttf'),
    'PixelifySans-Bold': require('./assets/fonts/PixelifySans-Bold.ttf'),
  });
  return (
    <View style={styles.container}>
      <Text style={[styles.title, loaded && { fontFamily: 'PixelifySans-Bold' }]}>Aloft</Text>
      <Text style={[styles.sub, loaded && { fontFamily: 'PixelifySans-Regular' }]}>dev build is running</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3d3d3d', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#e87d0d', fontSize: 44, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  sub: { color: '#9a9a9a', fontSize: 14, marginTop: 8 },
});
