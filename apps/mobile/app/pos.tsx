import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  SafeAreaView, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';

interface Item {
  id: string;
  name: string;
  price: number;
  tax_rate: number;
}

interface CartLine {
  item: Item;
  qty: number;
}

export default function PosScreen() {
  const auth = useContext(AuthContext);
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (auth?.orgId) loadItems();
  }, [auth?.orgId]);

  async function loadItems() {
    const { data, error } = await supabase
      .from('items')
      .select('id, name, price, tax_rate')
      .eq('business_id', auth!.orgId)
      .eq('active', true)
      .order('name');
    if (!error && data) setItems(data);
    setLoading(false);
  }

  function addToCart(item: Item) {
    setCart(prev => {
      const ex = prev.find(l => l.item.id === item.id);
      if (ex) return prev.map(l => l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { item, qty: 1 }];
    });
  }

  function removeFromCart(itemId: string) {
    setCart(prev => {
      const ex = prev.find(l => l.item.id === itemId);
      if (!ex) return prev;
      if (ex.qty === 1) return prev.filter(l => l.item.id !== itemId);
      return prev.map(l => l.item.id === itemId ? { ...l, qty: l.qty - 1 } : l);
    });
  }

  const total = cart.reduce((sum, l) => sum + l.item.price * l.qty, 0);

  async function payOrder(method: 'cash' | 'card') {
    if (cart.length === 0) return;
    setPaying(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          business_id: auth!.orgId,
          status: 'closed',
          total_amount: total,
          closed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError || !order) throw orderError;

      await supabase.from('order_lines').insert(
        cart.map(l => ({
          order_id: order.id,
          item_id: l.item.id,
          item_name: l.item.name,
          qty: l.qty,
          unit_price: l.item.price,
          tax_rate: l.item.tax_rate,
          total: l.item.price * l.qty,
        }))
      );

      await supabase.from('payments').insert({
        order_id: order.id,
        method,
        amount: total,
        business_id: auth!.orgId,
      });

      setCart([]);
      Alert.alert('Plačilo uspešno', `${method === 'cash' ? 'Gotovina' : 'Kartica'} — ${total.toFixed(2)} €`);
    } catch (e) {
      Alert.alert('Napaka', 'Plačilo ni uspelo');
    }
    setPaying(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Računko POS</Text>
          <Text style={styles.orgName}>{auth?.orgName}</Text>
        </View>
        <TouchableOpacity onPress={() => router.replace('/pin')}>
          <Text style={styles.lockBtn}>🔒</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.itemsPanel}>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
          ) : items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyText}>Ni artiklov.</Text>
              <Text style={styles.emptySubText}>Dodaj artikle v Računko spletni POS.</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={i => i.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ gap: 8, padding: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.itemBtn} onPress={() => addToCart(item)}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>{item.price.toFixed(2)} €</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        <View style={styles.cartPanel}>
          <Text style={styles.cartTitle}>Košarica</Text>
          <ScrollView style={{ flex: 1 }}>
            {cart.length === 0 ? (
              <Text style={styles.emptyCart}>Prazna</Text>
            ) : (
              cart.map(l => (
                <View key={l.item.id} style={styles.cartLine}>
                  <Text style={styles.cartName} numberOfLines={1}>{l.item.name}</Text>
                  <View style={styles.cartQty}>
                    <TouchableOpacity onPress={() => removeFromCart(l.item.id)}>
                      <Text style={styles.qtyBtn}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyNum}>{l.qty}</Text>
                    <TouchableOpacity onPress={() => addToCart(l.item)}>
                      <Text style={styles.qtyBtn}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cartTotal}>{(l.item.price * l.qty).toFixed(2)}€</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>SKUPAJ</Text>
            <Text style={styles.totalAmount}>{total.toFixed(2)} €</Text>
          </View>

          {paying ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: 16 }} />
          ) : (
            <View style={styles.payBtns}>
              <TouchableOpacity
                style={[styles.payBtn, styles.cashBtn, cart.length === 0 && styles.btnDisabled]}
                onPress={() => payOrder('cash')}
                disabled={cart.length === 0}
              >
                <Text style={styles.payBtnText}>💵 Gotovina</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.payBtn, styles.cardBtn, cart.length === 0 && styles.btnDisabled]}
                onPress={() => payOrder('card')}
                disabled={cart.length === 0}
              >
                <Text style={styles.payBtnText}>💳 Kartica</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.header,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: { color: colors.brand, fontSize: 16, fontWeight: 'bold' },
  orgName: { color: colors.white, fontSize: 11, opacity: 0.6 },
  lockBtn: { fontSize: 22 },
  body: { flex: 1, flexDirection: 'row' },
  itemsPanel: { flex: 1, borderRightWidth: 1, borderColor: colors.lightGray },
  emptyItems: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: colors.gray, marginBottom: 8 },
  emptySubText: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  cartPanel: { width: 260, backgroundColor: colors.white, padding: 12 },
  cartTitle: { fontSize: 15, fontWeight: 'bold', color: colors.header, marginBottom: 8 },
  emptyCart: { color: colors.gray, textAlign: 'center', marginTop: 20, fontSize: 13 },
  itemBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.lightGray,
    minHeight: 76,
    justifyContent: 'center',
  },
  itemName: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
  itemPrice: { fontSize: 14, color: colors.accent, fontWeight: 'bold', marginTop: 4 },
  cartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: colors.lightGray,
    gap: 4,
  },
  cartName: { flex: 1, fontSize: 11, color: colors.text },
  cartQty: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: { fontSize: 18, color: colors.accent, paddingHorizontal: 4 },
  qtyNum: { fontSize: 13, fontWeight: 'bold', minWidth: 18, textAlign: 'center' },
  cartTotal: { fontSize: 12, fontWeight: 'bold', color: colors.text, minWidth: 44, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 2,
    borderColor: colors.header,
    marginTop: 8,
  },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: colors.header },
  totalAmount: { fontSize: 18, fontWeight: 'bold', color: colors.accent },
  payBtns: { flexDirection: 'row', gap: 6, marginTop: 8 },
  payBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  cashBtn: { backgroundColor: colors.accent },
  cardBtn: { backgroundColor: colors.header },
  btnDisabled: { opacity: 0.4 },
  payBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
