import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  Alert, ActivityIndicator, ScrollView, StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  pin: string;
  color: string;
}

export default function PinScreen() {
  const auth = useContext(AuthContext);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (auth?.businessId) loadStaff();
    else setLoading(false);
  }, [auth?.businessId]);

  async function loadStaff() {
    const { data } = await supabase
      .from('staff')
      .select('id, name, role, pin, color')
      .eq('business_id', auth!.businessId)
      .eq('active', true)
      .order('name');
    setStaff(data || []);
    setLoading(false);
  }

  function pressKey(key: string) {
    if (pin.length >= 6) return;
    const next = pin + key;
    setPin(next);
    setTimeout(() => checkPin(next), 150);
  }

  function checkPin(entered: string) {
    if (selectedStaff) {
      if (entered === selectedStaff.pin) {
        setPin('');
        router.replace('/pos');
      } else if (entered.length >= selectedStaff.pin.length) {
        Alert.alert('Napacna PIN koda');
        setPin('');
  }
    } else {
      const match = staff.find(s => s.pin === entered);
      if (match) {
        setPin('');
        router.replace('/pos');
      } else {
        const possible = staff.some(s => s.pin.startsWith(entered));
        if (!possible) {
          Alert.alert('Napacna PIN koda');
          setPin('');
        }
      }
    }
  }

  async function logout() {
    Alert.alert('Odjava', 'Se res želiš odjaviti?', [
      { text: 'Prekliči', style: 'cancel' },
      { text: 'Odjava', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        router.replace('/login');
      }},
    ]);
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  if (loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}>
        <Text style={s.orgName}>{auth?.orgName}</Text>
      </View>

      {/* Staff izbira */}
      {staff.length > 0 && (
        <View style={s.staffSection}>
          <Text style={s.staffLabel}>Kdo si?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.staffRow}>
            {staff.map(s2 => (
              <TouchableOpacity
                key={s2.id}
                style={[s.staffBtn, selectedStaff?.id === s2.id && s.staffBtnActive, { borderColor: s2.color || colors.accent }]}
                onPress={() => { setSelectedStaff(s2); setPin(''); }}
              >
                <View style={[s.staffAvatar, { backgroundColor: s2.color || colors.accent }]}>
                  <Text style={s.staffAvatarText}>{s2.name.split(' ').map((w: string) => w[0]).slice(0,2).join('')}</Text>
                </View>
                <Text style={[s.staffName, selectedStaff?.id === s2.id && s.staffNameActive]}>{s2.name}</Text>
                <Text style={s.staffRole}>{s2.role}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* PIN vnos */}
      <View style={s.pinSection}>
        <Text style={s.pinLabel}>
          {selectedStaff ? `PIN za ${selectedStaff.name}` : 'Vnesi PIN kodo'}
        </Text>

        <View style={s.dots}>
          {[0,1,2,3,4,5].slice(0, selectedStaff ? selectedStaff.pin.length : 4).map(i => (
            <View key={i} style={[s.dot, pin.length > i && s.dotFilled]} />
          ))}
        </View>

        <View style={s.grid}>
          {keys.map((k, i) => (
            <TouchableOpacity
              key={i}
              style={[s.key, k === '' && s.keyEmpty]}
              onPress={() => {
                if (k === '⌫') setPin(p => p.slice(0,-1));
                else if (k) pressKey(k);
              }}
              disabled={k === ''}
            >
              <Text style={s.keyText}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity onPress={logout} style={s.logoutBtn}>
        <Text style={s.logoutText}>Odjava</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.header,
    paddingTop: StatusBar.currentHeight || 0,
  },
  top: { alignItems: 'center', paddingTop: 20, paddingBottom: 10 },
  orgName: { color: colors.brand, fontSize: 18, fontWeight: 'bold' },
  staffSection: { paddingBottom: 16 },
  staffLabel: { color: colors.white, opacity: 0.6, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 10 },
  staffRow: { paddingHorizontal: 16, gap: 10 },
  staffBtn: { alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', minWidth: 80 },
  staffBtnActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  staffAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  staffAvatarText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  staffName: { color: colors.white, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  staffNameActive: { color: colors.brand },
  staffRole: { color: colors.white, opacity: 0.5, fontSize: 10, textAlign: 'center' },
  pinSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pinLabel: { color: colors.white, opacity: 0.7, fontSize: 14, marginBottom: 24 },
  dots: { flexDirection: 'row', gap: 12, marginBottom: 36 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.brand, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: colors.brand },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12 },
  key: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyText: { fontSize: 24, color: colors.white, fontWeight: '500' },
  logoutBtn: { alignItems: 'center', paddingBottom: 24 },
  logoutText: { color: colors.white, opacity: 0.3, fontSize: 12 },
});
