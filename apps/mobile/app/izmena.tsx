import React, { useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';
import { Zaslon, HIT_SLOP } from '../lib/zaslon';
import { trenutnaNaprava, type Naprava } from '../lib/naprava';
import { trenutnaOseba } from '../lib/osebje';
import { stanjeIzmene, odpriIzmeno, zakljuciIzmeno, eur, type StanjeIzmene } from '../lib/izmena';
import BluetoothPrinter from '../modules/bluetooth-printer';

/**
 * IZMENA BLAGAJNE (trznice, 17.10.2026)
 *
 * Odpri izmeno (zacetna gotovina), vmesno stanje in zakljucek z Z-porocilom.
 * Pri locenih izmenah po napravi je to izmena TE naprave (svoj predal).
 * Izracun je isti kot v spletni blagajni (/api/pos/izmena).
 */
const vStevilo = (t: string) => Number(String(t).replace(',', '.').replace(/[^0-9.]/g, ''));

export default function IzmenaScreen() {
  const auth = useContext(AuthContext);
  const [naprava, setNaprava] = useState<Naprava | null>(null);
  const [stanje, setStanje] = useState<StanjeIzmene | null>(null);
  const [nalagam, setNalagam] = useState(true);
  const [delam, setDelam] = useState(false);
  const [napaka, setNapaka] = useState('');
  const [gotovina, setGotovina] = useState('');
  const [presteta, setPresteta] = useState('');
  const [rezultat, setRezultat] = useState<null | { zReportNumber: number; razlika: number; stats: any; zakljuceno: string; opened_at: string; cash_opening: number }>(null);

  const nalozi = useCallback(async () => {
    if (!auth?.orgId) return;
    setNalagam(true); setNapaka('');
    try {
      const n = await trenutnaNaprava(auth.orgId);
      if (n.izbira) { router.push('/naprava'); return; }
      setNaprava(n.naprava);
      const s = await stanjeIzmene(auth.orgId, n.naprava?.id ?? null);
      setStanje(s);
      if (!s.izmena && s.prenos != null) setGotovina(String(s.prenos).replace('.', ','));
    } catch (e: any) {
      setNapaka(e?.message || 'Stanja izmene ni bilo mogoče prebrati');
    }
    setNalagam(false);
  }, [auth?.orgId]);

  useFocusEffect(useCallback(() => { nalozi(); }, [nalozi]));

  async function odpri() {
    const z = vStevilo(gotovina || '0');
    if (!Number.isFinite(z) || z < 0) { Alert.alert('Napaka', 'Vnesi veljavno začetno gotovino'); return; }
    setDelam(true);
    try {
      await odpriIzmeno(auth!.orgId, naprava?.id ?? null, z, trenutnaOseba()?.id);
      await nalozi();
      if (router.canGoBack()) router.back();
    } catch (e: any) { Alert.alert('Izmene ni bilo mogoče odpreti', e?.message || ''); }
    setDelam(false);
  }

  function zakljuci() {
    if (!stanje?.izmena) return;
    const z = vStevilo(presteta);
    if (!presteta || !Number.isFinite(z) || z < 0) { Alert.alert('Napaka', 'Vnesi preštet znesek gotovine v predalu'); return; }
    Alert.alert('Zaključi izmeno', `Prešteta gotovina: ${eur(z)}\nPričakovano: ${eur(stanje.stats?.cashExpected)}\n\nZaključka ni mogoče preklicati.`, [
      { text: 'Prekliči', style: 'cancel' },
      { text: 'Zaključi', style: 'destructive', onPress: async () => {
        setDelam(true);
        try {
          const r = await zakljuciIzmeno(auth!.orgId, naprava?.id ?? null, stanje.izmena!.id, z, trenutnaOseba()?.id);
          setRezultat({ ...r, opened_at: stanje.izmena!.opened_at, cash_opening: stanje.izmena!.cash_opening });
          setPresteta('');
          natisniZ({ ...r, opened_at: stanje.izmena!.opened_at, cash_opening: stanje.izmena!.cash_opening }, z);
          await nalozi();
        } catch (e: any) { Alert.alert('Zaključek ni uspel', e?.message || ''); }
        setDelam(false);
      } },
    ]);
  }

  async function natisniZ(r: NonNullable<typeof rezultat>, prest: number) {
    try {
      const fix = (s: string) => s.replace(/š/g,'s').replace(/Š/g,'S').replace(/č/g,'c').replace(/Č/g,'C').replace(/ž/g,'z').replace(/Ž/g,'Z');
      const vr = (l: string, d: string) => { const sp = Math.max(1, 32 - l.length - d.length); return l + ' '.repeat(sp) + d + '\n'; };
      const e = (n: number) => Number(n || 0).toFixed(2) + ' EUR';
      const dt = (s: string) => new Date(s).toLocaleString('sl-SI');
      let t = '================================\n';
      t += fix(`Z-POROCILO st. ${r.zReportNumber}`) + '\n';
      t += fix(auth?.orgName || '').substring(0, 32) + '\n';
      if (naprava) t += `Naprava: ${naprava.prostorOznaka}-${naprava.oznaka}\n`;
      t += `Od: ${dt(r.opened_at)}\nDo: ${dt(r.zakljuceno)}\n`;
      t += '--------------------------------\n';
      t += vr('Racunov', String(r.stats.orderCount));
      t += vr('Gotovina', e(r.stats.cash));
      t += vr('Kartica', e(r.stats.card));
      if (r.stats.bon) t += vr('Bon', e(r.stats.bon));
      if (r.stats.other || r.stats.prep) t += vr('Drugo', e((r.stats.other || 0) + (r.stats.prep || 0)));
      t += vr('PROMET', e(r.stats.totalRevenue));
      if (r.stats.refundTotal) t += vr('Vracila', e(r.stats.refundTotal));
      t += '--------------------------------\n';
      t += vr('Zacetna gotovina', e(r.cash_opening));
      t += vr('Pricakovano', e(r.stats.cashExpected));
      t += vr('Presteto', e(prest));
      t += vr('Razlika', e(r.razlika));
      t += '================================\n\n\n';
      await BluetoothPrinter.printText(t);
    } catch { /* tiskalnik ni povezan - Z je shranjen v Racunku */ }
  }

  const st = stanje?.stats;
  return (
    <Zaslon style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/pos')} hitSlop={HIT_SLOP} style={s.backBtn}>
          <Text style={s.back}>← Nazaj</Text>
        </TouchableOpacity>
        <Text style={s.title}>Izmena</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={s.info}>
          <Text style={s.infoTxt} numberOfLines={1}>{auth?.orgName}</Text>
          <Text style={s.infoSub}>
            {stanje?.poNapravi
              ? `Svoja izmena naprave ${naprava ? naprava.prostorOznaka + '-' + naprava.oznaka : ''}`
              : 'Skupna izmena podjetja'}
          </Text>
        </View>

        {nalagam && <ActivityIndicator color={colors.accent} />}
        {!!napaka && <Text style={s.napaka}>{napaka}</Text>}

        {rezultat && (
          <View style={[s.card, { borderColor: colors.accent }]}>
            <Text style={s.cardTitle}>✓ Izmena zaključena – Z-poročilo št. {rezultat.zReportNumber}</Text>
            <Vrstica l="Promet" d={eur(rezultat.stats.totalRevenue)} krepko />
            <Vrstica l="Razlika gotovine" d={Math.abs(rezultat.razlika) < 0.01 ? 'Ujema se' : `${rezultat.razlika > 0 ? '+' : ''}${eur(rezultat.razlika)} ${rezultat.razlika > 0 ? '(višek)' : '(manjko)'}`} />
            <Text style={s.hint}>Z-poročilo je shranjeno v Računku. Če je tiskalnik povezan, se je natisnilo.</Text>
          </View>
        )}

        {!nalagam && stanje && !stanje.izmena && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Izmena ni odprta</Text>
            <Text style={s.label}>Začetna gotovina v predalu (€)</Text>
            <TextInput value={gotovina} onChangeText={setGotovina} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.gray} style={s.input} />
            {stanje.prenos != null && <Text style={s.hint}>Predlog iz zadnjega zaključka: {eur(stanje.prenos)}</Text>}
            <TouchableOpacity style={[s.btn, delam && { opacity: 0.5 }]} onPress={odpri} disabled={delam}>
              <Text style={s.btnTxt}>{delam ? 'Odpiram …' : 'Odpri izmeno'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!nalagam && stanje?.izmena && st && (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>Vmesno stanje</Text>
              <Text style={s.hint}>Odprta od {new Date(stanje.izmena.opened_at).toLocaleString('sl-SI')}</Text>
              <Vrstica l="Računov" d={String(st.orderCount)} />
              <Vrstica l="Gotovina" d={eur(st.cash)} />
              <Vrstica l="Kartica" d={eur(st.card)} />
              {!!st.bon && <Vrstica l="Bon" d={eur(st.bon)} />}
              {!!(st.other || st.prep) && <Vrstica l="Drugo" d={eur((st.other || 0) + (st.prep || 0))} />}
              <Vrstica l="Promet" d={eur(st.totalRevenue)} krepko />
              {!!st.refundTotal && <Vrstica l="Vračila" d={eur(st.refundTotal)} />}
              <View style={s.sep} />
              <Vrstica l="Začetna gotovina" d={eur(stanje.izmena.cash_opening)} />
              <Vrstica l="Pričakovana gotovina" d={eur(st.cashExpected)} krepko />
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Zaključi izmeno</Text>
              <Text style={s.label}>Prešteta gotovina v predalu (€)</Text>
              <TextInput value={presteta} onChangeText={setPresteta} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.gray} style={s.input} />
              <TouchableOpacity style={[s.btn, { backgroundColor: colors.header }, delam && { opacity: 0.5 }]} onPress={zakljuci} disabled={delam}>
                <Text style={s.btnTxt}>{delam ? 'Zaključujem …' : 'Zaključi in natisni Z-poročilo'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </Zaslon>
  );
}

function Vrstica({ l, d, krepko }: { l: string; d: string; krepko?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 14, color: colors.text, fontWeight: krepko ? '700' : '400' }}>{l}</Text>
      <Text style={{ fontSize: 14, color: colors.text, fontWeight: krepko ? '700' : '400', fontVariant: ['tabular-nums'] }}>{d}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { paddingVertical: 8, paddingRight: 12, minWidth: 70 },
  back: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  title: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  info: { backgroundColor: colors.header, borderRadius: 12, padding: 14 },
  infoTxt: { color: colors.white, fontSize: 15, fontWeight: 'bold' },
  infoSub: { color: colors.brand, fontSize: 13, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.lightGray, padding: 16, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: colors.header, marginBottom: 4 },
  label: { fontSize: 12, color: colors.gray, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.lightGray, borderRadius: 10, padding: 12, fontSize: 20, color: colors.text, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.gray, lineHeight: 17 },
  napaka: { color: colors.danger, fontSize: 13 },
  sep: { height: 1, backgroundColor: colors.lightGray, marginVertical: 6 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 8 },
  btnTxt: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
});
