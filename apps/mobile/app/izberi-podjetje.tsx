import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { AuthContext, usePodjetja } from '../lib/auth';
import { imeVloge } from '../lib/podjetja';
import { colors } from '../lib/colors';

/**
 * Izbira podjetja (16.10.2026): pokaze se samo uporabniku, ki je clan vec
 * organizacij (lib/podjetja.ts). Izbira se zapomni - ob naslednjem zagonu
 * se blagajna odpre neposredno. Zamenjava: Nastavitve → Zamenjaj podjetje.
 */
export default function IzberiPodjetjeScreen() {
  const auth = useContext(AuthContext);
  const { clanstva, izberi } = usePodjetja();
  const [izbiram, setIzbiram] = useState<string | null>(null);

  async function odpri(orgId: string) {
    setIzbiram(orgId);
    await izberi(orgId);
    // _layout ob spremembi auth odpre /pin
    setIzbiram(null);
  }

  function odjava() {
    Alert.alert('Odjava', 'Se res želiš odjaviti?', [
      { text: 'Prekliči', style: 'cancel' },
      { text: 'Odjava', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        router.replace('/login');
      }},
    ]);
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.head}>
        <Text style={s.logo}>Računko POS</Text>
        <Text style={s.title}>Izberi podjetje</Text>
        <Text style={s.sub}>Katero blagajno želiš odpreti?</Text>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {clanstva.map((c) => {
          const trenutno = auth?.orgId === c.org_id;
          return (
            <TouchableOpacity
              key={c.org_id}
              style={[s.card, trenutno && s.cardActive]}
              onPress={() => odpri(c.org_id)}
              disabled={!!izbiram}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={2}>{c.organizations?.name || 'Brez imena'}</Text>
                <Text style={s.role}>{imeVloge(c.role)}{trenutno ? ' · trenutno odprto' : ''}</Text>
              </View>
              {izbiram === c.org_id
                ? <ActivityIndicator color={colors.brand} />
                : <Text style={s.arrow}>›</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity onPress={odjava} style={s.logout} hitSlop={12}>
        <Text style={s.logoutText}>Odjava</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.header },
  head: { alignItems: 'center', paddingTop: 32, paddingBottom: 20, paddingHorizontal: 24 },
  logo: { fontSize: 26, fontWeight: 'bold', color: colors.brand, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.white },
  sub: { fontSize: 14, color: colors.white, opacity: 0.6, marginTop: 6 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 18, paddingHorizontal: 16, minHeight: 64,
  },
  cardActive: { borderColor: colors.brand },
  name: { color: colors.white, fontSize: 16, fontWeight: '600' },
  role: { color: colors.brand, fontSize: 13, marginTop: 4 },
  arrow: { color: colors.white, opacity: 0.5, fontSize: 24 },
  logout: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 24, marginBottom: 8 },
  logoutText: { color: colors.white, opacity: 0.6, fontSize: 14 },
});
