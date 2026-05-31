import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/colors';

const PIN_KEY = 'racunko_pos_pin';
const DEFAULT_PIN = '1234';

export default function PinScreen() {
  const [pin, setPin] = useState('');

  function pressKey(key: string) {
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) setTimeout(() => checkPin(next), 100);
  }

  async function checkPin(entered: string) {
    const saved = await AsyncStorage.getItem(PIN_KEY) || DEFAULT_PIN;
    if (entered === saved) {
      setPin('');
      router.replace('/pos');
    } else {
      Alert.alert('Napačna PIN koda');
      setPin('');
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Računko POS</Text>
      <Text style={styles.subtitle}>Vnesi PIN kodo</Text>

      <View style={styles.dots}>
        {[0,1,2,3].map(i => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.grid}>
        {keys.map((k, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.key, k === '' && styles.keyEmpty]}
            onPress={() => { if (k === '⌫') setPin(p => p.slice(0,-1)); else if (k) pressKey(k); }}
            disabled={k === ''}
          >
            <Text style={styles.keyText}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Odjava</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
  logo: { fontSize: 28, fontWeight: 'bold', color: colors.brand, marginBottom: 8 },
  subtitle: { fontSize: 16, color: colors.white, opacity: 0.7, marginBottom: 40 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 40 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.brand, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: colors.brand },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12 },
  key: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { fontSize: 24, color: colors.white, fontWeight: '500' },
  logoutBtn: { marginTop: 40 },
  logoutText: { color: colors.white, opacity: 0.4, fontSize: 13 },
});
