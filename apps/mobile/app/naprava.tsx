import React, { useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';
import { Zaslon, HIT_SLOP } from '../lib/zaslon';
import { napraveBlagajne, preberiNapravo, shraniNapravo, type Naprava } from '../lib/naprava';

/**
 * Izbira davcne naprave telefona (16.10.2026). Na trznici vsak telefon
 * izdaja racune pod SVOJO oznako naprave - glej lib/naprava.ts.
 */
export default function NapravaScreen() {
  const auth = useContext(AuthContext);
  const [naprave, setNaprave] = useState<Naprava[]>([]);
  const [izbrana, setIzbrana] = useState<string | null>(null);
  const [nalagam, setNalagam] = useState(true);

  useEffect(() => {
    if (!auth?.orgId) return;
    Promise.all([napraveBlagajne(auth.orgId), preberiNapravo(auth.orgId)])
      .then(([n, s]) => { setNaprave(n); setIzbrana(s); })
      .finally(() => setNalagam(false));
  }, [auth?.orgId]);

  async function izberi(n: Naprava) {
    if (!auth?.orgId) return;
    await shraniNapravo(auth.orgId, n.id);
    if (router.canGoBack()) router.back(); else router.replace('/pos');
  }

  return (
    <Zaslon style={s.container}>
      <View style={s.header}>
        {router.canGoBack()
          ? <TouchableOpacity onPress={() => router.back()} hitSlop={HIT_SLOP} style={s.backBtn}><Text style={s.back}>← Nazaj</Text></TouchableOpacity>
          : <View style={s.backBtn} />}
        <Text style={s.title}>Davčna naprava</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={s.lead}>
          Pod katero napravo ta telefon izdaja račune? Vsak telefon naj ima svojo napravo – dva telefona z isto napravo bi si delila zaporedne številke računov.
        </Text>

        {nalagam && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}

        {!nalagam && naprave.length === 0 && (
          <Text style={s.empty}>
            Podjetje še nima naprav za blagajno. Dodaš jih v Računku v brskalniku: Nastavitve → Davčna blagajna → Naprave.
          </Text>
        )}

        {naprave.map(n => {
          const je = n.id === izbrana;
          return (
            <TouchableOpacity key={n.id} onPress={() => izberi(n)} style={[s.card, je && s.cardActive]}>
              <View style={{ flex: 1 }}>
                <Text style={s.code}>{n.prostorOznaka}-{n.oznaka}</Text>
                {!!n.opis && <Text style={s.opis} numberOfLines={2}>{n.opis}</Text>}
              </View>
              <Text style={[s.check, je && { color: colors.accent }]}>{je ? '✓' : '›'}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Zaslon>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { paddingVertical: 8, paddingRight: 12, minWidth: 70 },
  back: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  title: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  lead: { fontSize: 13, color: colors.text, lineHeight: 19, marginBottom: 6 },
  empty: { fontSize: 13, color: colors.gray, lineHeight: 19, marginTop: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.lightGray, padding: 16, minHeight: 64 },
  cardActive: { borderColor: colors.accent, borderWidth: 2 },
  code: { fontSize: 16, fontWeight: 'bold', color: colors.header, fontFamily: 'monospace' },
  opis: { fontSize: 12, color: colors.gray, marginTop: 3 },
  check: { fontSize: 22, color: colors.gray, fontWeight: 'bold' },
});
