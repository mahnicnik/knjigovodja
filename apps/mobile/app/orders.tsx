import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';

export default function OrdersScreen() {
  const auth = useContext(AuthContext);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today'|'week'|'month'>('today');

  useEffect(() => { if (auth?.businessId) loadOrders(); }, [auth?.businessId, period]);

  async function loadOrders() {
    setLoading(true);
    const now = new Date();
    let from: Date;
    if (period === 'today') from = new Date(now.toISOString().slice(0,10) + 'T00:00:00.000Z');
    else if (period === 'week') { from = new Date(now); from.setDate(from.getDate()-7); }
    else { from = new Date(now.getFullYear(), now.getMonth(), 1); }

    const { data } = await supabase
      .from('orders')
      .select('id, total, status, closed_at, invoice_number, payments(method, amount)')
      .eq('business_id', auth!.businessId)
      .eq('status', 'paid')
      .gte('closed_at', from.toISOString())
      .order('closed_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  }

  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Nazaj</Text></TouchableOpacity>
        <Text style={s.title}>Računi</Text>
        <View />
      </View>

      <View style={s.periodRow}>
        {(['today','week','month'] as const).map(p => (
          <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodBtnActive]} onPress={() => setPeriod(p)}>
            <Text style={[s.periodText, period === p && s.periodTextActive]}>
              {p === 'today' ? 'Danes' : p === 'week' ? '7 dni' : 'Mesec'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.summary}>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{orders.length}</Text>
          <Text style={s.summaryLabel}>Računov</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{totalRevenue.toFixed(2)} €</Text>
          <Text style={s.summaryLabel}>Promet</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item: o }) => {
            const method = o.payments?.[0]?.method || 'cash';
            const methodIcon = method === 'cash' ? '💵' : method === 'card' ? '💳' : '🎟';
            const date = new Date(o.closed_at);
            return (
              <View style={s.orderCard}>
                <View style={s.orderLeft}>
                  <Text style={s.orderNum}>{o.invoice_number || o.id.slice(0,8).toUpperCase()}</Text>
                  <Text style={s.orderDate}>{date.toLocaleDateString('sl-SI')} {date.toLocaleTimeString('sl-SI', {hour:'2-digit',minute:'2-digit'})}</Text>
                </View>
                <View style={s.orderRight}>
                  <Text style={s.orderMethod}>{methodIcon}</Text>
                  <Text style={s.orderTotal}>{(o.total || 0).toFixed(2)} €</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={s.empty}>Ni računov za to obdobje</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: colors.brand, fontSize: 14 },
  title: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  periodRow: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.lightGray },
  periodBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  periodBtnActive: { borderColor: colors.accent },
  periodText: { fontSize: 13, color: colors.gray, fontWeight: '500' },
  periodTextActive: { color: colors.accent, fontWeight: '700' },
  summary: { flexDirection: 'row', gap: 12, padding: 12 },
  summaryCard: { flex: 1, backgroundColor: colors.white, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.lightGray },
  summaryValue: { fontSize: 22, fontWeight: 'bold', color: colors.accent },
  summaryLabel: { fontSize: 12, color: colors.gray, marginTop: 2 },
  orderCard: { backgroundColor: colors.white, borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.lightGray },
  orderLeft: { flex: 1 },
  orderNum: { fontSize: 13, fontWeight: 'bold', color: colors.text },
  orderDate: { fontSize: 11, color: colors.gray, marginTop: 2 },
  orderRight: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, alignItems: 'center' },
  orderMethod: { fontSize: 18 },
  orderTotal: { fontSize: 16, fontWeight: 'bold', color: colors.accent },
  empty: { textAlign: 'center', color: colors.gray, marginTop: 40, fontSize: 14 },
});
