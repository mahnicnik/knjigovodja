import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  SafeAreaView, Alert, ActivityIndicator, ScrollView,
  TextInput, Modal, Dimensions, StatusBar, Switch
} from 'react-native';
import { router } from 'expo-router';
import { useCart } from '../lib/cart';
import { supabase } from '../lib/supabase';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';
import BluetoothPrinter from '../modules/bluetooth-printer';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Category { id: string; name: string; icon: string; color: string; sort_order: number; }
interface ModifierOption { id: string; name: string; price_delta: number; }
interface ModifierGroup { id: string; name: string; required: boolean; multi_select: boolean; options: ModifierOption[]; }
interface Item { id: string; name: string; price: number; vat_rate: number; category_id: string; fav: boolean; code: string; }
interface CartLine { lineId: string; item: Item; qty: number; }

export default function PosScreen() {
  const auth = useContext(AuthContext);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCat, setSelectedCat] = useState('fav');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { activeTableId, activeTableName, getCart, addItem: cartAddItem, adjQty: cartAdjQty, clearCart } = useCart();
  const tableId = activeTableId;
  const tableName = activeTableName;
  const cart = getCart(tableId);
  const [cartOpen, setCartOpen] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [modModal, setModModal] = useState<{item: Item, groups: ModifierGroup[]} | null>(null);
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
  const [payMethod, setPayMethod] = useState<'cash'|'card'|'bon'>('cash');
  const [given, setGiven] = useState('');
  const [discount, setDiscount] = useState(0);
  const [fursEnabled, setFursEnabled] = useState(true);

  useEffect(() => { if (auth?.businessId) loadData(); }, [auth?.businessId]);

  async function loadData() {
    const [catRes, itemRes] = await Promise.all([
      supabase.from('categories').select('id,name,icon,color,sort_order').eq('business_id', auth!.businessId).order('sort_order'),
      supabase.from('items').select('id,name,price,vat_rate,category_id,fav,code').eq('business_id', auth!.businessId).eq('archived', false).order('name'),
    ]);
    if (catRes.data) setCategories(catRes.data);
    if (itemRes.data) setItems(itemRes.data);
    setLoading(false);
  }

  async function loadModifiers(item: Item): Promise<ModifierGroup[]> {
    const { data: links } = await supabase
      .from('item_modifier_group_links')
      .select('group_id')
      .eq('item_id', item.id);
    if (!links || links.length === 0) return [];
    const groupIds = links.map((l: any) => l.group_id);
    const { data: groups } = await supabase
      .from('item_modifier_groups')
      .select('id, name, required, multi_select')
      .in('id', groupIds)
      .order('sort_order');
    if (!groups || groups.length === 0) return [];
    const result: ModifierGroup[] = [];
    for (const g of groups) {
      const { data: options } = await supabase
        .from('item_modifiers')
        .select('id, name, price_delta')
        .eq('group_id', g.id)
        .order('sort_order');
      result.push({ ...g, options: options || [] });
    }
    return result;
  }

  async function handleItemPress(item: Item) {
    const groups = await loadModifiers(item);
    if (groups.length === 0) {
      addItem(item, []);
      return;
    }
    const defaults: Record<string, string[]> = {};
    groups.forEach(g => { defaults[g.id] = []; });
    setSelectedMods(defaults);
    setModModal({ item, groups });
  }

  function toggleMod(groupId: string, optionId: string, multiSelect: boolean) {
    setSelectedMods(prev => {
      const current = prev[groupId] || [];
      if (multiSelect) {
        return { ...prev, [groupId]: current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId] };
      } else {
        return { ...prev, [groupId]: current.includes(optionId) ? [] : [optionId] };
      }
    });
  }

  function confirmMods() {
    if (!modModal) return;
    const { item, groups } = modModal;
    for (const g of groups) {
      if (g.required && (!selectedMods[g.id] || selectedMods[g.id].length === 0)) {
        Alert.alert('Obvezno', 'Izberi ' + g.name);
        return;
      }
    }
    const mods: {groupName: string, optionName: string, priceDelta: number}[] = [];
    groups.forEach(g => {
      (selectedMods[g.id] || []).forEach(optId => {
        const opt = g.options.find(o => o.id === optId);
        if (opt) mods.push({ groupName: g.name, optionName: opt.name, priceDelta: opt.price_delta });
      });
    });
    addItem(item, mods);
    setModModal(null);
  }

  const allCats = [
    { id: 'fav', name: 'Priljubljeni', icon: '⭐', color: '#c8970a', sort_order: -1 },
    { id: 'vse', name: 'Vse', icon: '🔲', color: colors.header, sort_order: -2 },
    ...categories,
  ];

  const filteredItems = useMemo(() => {
    if (search) return items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || (i.code||'').toLowerCase().includes(search.toLowerCase()));
    if (selectedCat === 'fav') return items.filter(i => i.fav);
    if (selectedCat === 'vse') return items;
    return items.filter(i => i.category_id === selectedCat);
  }, [selectedCat, search, items]);

  function addItem(item: Item, mods: {groupName: string, optionName: string, priceDelta: number}[] = []) {
    const currentCart = getCart(tableId);
    if (tableId !== 'quick' && currentCart.length === 0) {
      supabase.from('tables').update({ status: 'occupied' }).eq('id', tableId);
    }
    cartAddItem(tableId, item, mods);
    setCartOpen(false);
  }

  function adjQty(lineId: string, delta: number) {
    cartAdjQty(tableId, lineId, delta);
  }

  const subtotal = cart.reduce((s, l) => s + l.item.price * l.qty, 0);
  const discountAmt = subtotal * discount / 100;
  const total = subtotal - discountAmt;
  const change = payMethod === 'cash' && given ? Math.max(0, parseFloat(given) - total) : 0;
  const cartQty = cart.reduce((s, l) => s + l.qty, 0);

  async function printReceipt(order: any, invoice?: any, fursData?: any) {
    try {
      const now = new Date()
      const dateStr = now.toLocaleDateString('sl-SI') + ' ' + now.toLocaleTimeString('sl-SI', {hour:'2-digit',minute:'2-digit'})
      const fixChars = (s: string) => s
        .replace(/š/g,'s').replace(/Š/g,'S')
        .replace(/č/g,'c').replace(/Č/g,'C')
        .replace(/ž/g,'z').replace(/Ž/g,'Z')
        .replace(/đ/g,'d').replace(/Đ/g,'D')
        .replace(/ć/g,'c').replace(/Ć/g,'C')
      const center = (s: string, w: number = 32) => {
        const pad = Math.max(0, Math.floor((w - s.length) / 2))
        return ' '.repeat(pad) + s
      }
      const org = (auth as any)?.org
      let r = ''
      r += '================================\n'
      r += center(fixChars(org?.name || auth?.orgName || 'Racunko POS').substring(0,30)) + '\n'
      if (org?.address) r += center((org.address + (org.post_code ? ', ' + org.post_code : '') + (org.city ? ' ' + org.city : '')).substring(0,32)) + '\n'
      if (org?.tax_number) r += center('ID DDV: ' + org.tax_number) + '\n'
      r += '================================\n'
      r += 'Racun: ' + order.id.substring(0,8) + '\n'
      r += 'Datum: ' + dateStr + '\n'
      r += '--------------------------------\n'
      cart.forEach((l: any) => {
        const name = l.item.name.substring(0, 18)
        const price = (l.item.price * l.qty).toFixed(2) + ' EUR'
        r += fixChars(name).padEnd(32 - price.length) + price + '\n'
        if (l.qty > 1) r += '  ' + l.qty + ' x ' + l.item.price.toFixed(2) + ' EUR\n'
      })
      r += '--------------------------------\n'
      r += 'SKUPAJ:'.padEnd(23) + total.toFixed(2) + ' EUR\n'
      r += (payMethod === 'cash' ? 'Gotovina' : payMethod === 'card' ? 'Kartica' : 'Bon').padEnd(23) + total.toFixed(2) + ' EUR\n'
      if (change > 0) r += 'Vrniti:'.padEnd(23) + change.toFixed(2) + ' EUR\n'
      r += '================================\n'
      if (fursData?.eor) {
        r += '--------------------------------\n'
        r += 'EOR: ' + fursData.eor.substring(0,32) + '\n'
        if (fursData?.zoi) r += 'ZOI: ' + fursData.zoi.substring(0,32) + '\n'
        if (fursData?.invoiceNumber) r += 'St: ' + fursData.invoiceNumber + '\n'
      }
      r += center('Hvala za obisk!') + '\n'
      r += '================================\n'
      r += '\n\n\n'
      await BluetoothPrinter.printText(r)
    } catch (e: any) {
      console.log('PRINT ERROR:', e.message)
    }
  }

  async function confirmWithFurs(invoiceId: string): Promise<{eor?: string, zoi?: string, invoiceNumber?: string}> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return {}
      const res = await fetch('https://xn--raunko-j2a.si/api/furs/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
          'Cookie': 'sb-access-token=' + session.access_token,
        },
        body: JSON.stringify({ invoiceId, paymentType: payMethod === 'card' ? 'card' : 'cash' }),
      })
      const data = await res.json()
      if (data.success) return { eor: data.eor, zoi: data.zoi, invoiceNumber: data.invoiceNumber }
      console.log('FURS error:', data.error)
      return {}
    } catch (e: any) {
      console.log('FURS error:', e.message)
      return {}
    }
  }

  async function submitPayment() {
    if (cart.length === 0) return;
    setPaying(true);
    try {
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        business_id: auth!.businessId,
        status: 'paid',
        total,
        subtotal,
        discount_amount: discountAmt,
        closed_at: new Date().toISOString(),
      }).select().single();
      if (orderError || !order) throw new Error(orderError?.message);

      await supabase.from('order_lines').insert(
        cart.map(l => ({
          order_id: order.id,
          name: l.item.name,
          qty: l.qty,
          unit_price: l.item.price,
          vat_rate: l.item.vat_rate || 22,
          total: l.item.price * l.qty,
        }))
      );
      await supabase.from('payments').insert({
        order_id: order.id,
        method: payMethod,
        amount: total,
        business_id: auth!.businessId,
      });

      if (tableId !== 'quick') {
      supabase.from('tables').update({ status: 'free' }).eq('id', tableId);
    }
    clearCart(tableId);
      setPayModal(false);
      setCartOpen(false);
      setGiven('');
      setDiscount(0);
      printReceipt(order, {});
      Alert.alert('✅ Plačilo uspešno',
        `${payMethod === 'cash' ? 'Gotovina' : payMethod === 'card' ? 'Kartica' : 'Bon'} — ${total.toFixed(2)} €${change > 0 ? `\nVrniti: ${change.toFixed(2)} €` : ''}`
      );
    } catch (e: any) {
      Alert.alert('Napaka', e?.message || 'Plačilo ni uspelo');
    }
    setPaying(false);
  }

  const selectedCatName = allCats.find(c => c.id === selectedCat)?.name || '';

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Računko POS</Text>
          <Text style={s.orgName}>{auth?.orgName}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/orders')}>
            <Text style={s.headerBtnText}>🧾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/floor')}>
            <Text style={s.headerBtnText}>🪑</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/settings')}>
            <Text style={s.headerBtnText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/pin')}>
            <Text style={s.headerBtnText}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main body */}
      <View style={s.body}>
        {/* Levi sidebar — kategorije */}
        <View style={s.sidebar}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {allCats.map(cat => {
              const active = selectedCat === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catItem, active && s.catItemActive]}
                  onPress={() => { setSelectedCat(cat.id); setSearch(''); }}
                >
                  <Text style={s.catIcon}>{cat.icon || '📦'}</Text>
                  <Text style={[s.catName, active && s.catNameActive]} numberOfLines={2}>{cat.name}</Text>
                  {active && <View style={s.catActiveLine} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Desno — search + artikli */}
        <View style={s.mainPanel}>
          {/* Search */}
          <View style={s.searchBar}>
            <TextInput
              style={s.searchInput}
              placeholder="🔍 Išči..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={colors.gray}
            />
            <Text style={s.catLabel}>{selectedCatName}</Text>
          </View>

          {/* Artikli grid */}
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
          ) : filteredItems.length === 0 ? (
            <View style={s.emptyItems}>
              <Text style={s.emptyText}>Ni artiklov</Text>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={i => i.id}
              numColumns={3}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ gap: 8, padding: 10, paddingBottom: 100 }}
              renderItem={({ item }) => {
                const inCart = cart.find(l => l.item.id === item.id);
                return (
                  <View style={[s.itemBtn, inCart && s.itemBtnActive]}>
                    {item.fav && <Text style={s.itemFav}>★</Text>}
                    <TouchableOpacity
                      style={{flex:1, width:'100%', alignItems:'center', justifyContent:'center'}}
                      onPress={() => handleItemPress(item)}
                    >
                      <Text style={s.itemName} numberOfLines={3}>{item.name}</Text>
                      <Text style={s.itemPrice}>{item.price.toFixed(2)} €</Text>
                    </TouchableOpacity>
                    {inCart && (
                      <View style={s.itemControls}>
                        <TouchableOpacity
                          style={s.itemMinusBtn}
                          onPress={() => adjQty(inCart.lineId, -1)}
                        >
                          <Text style={s.itemMinusTxt}>{inCart.qty === 1 ? '🗑' : '−'}</Text>
                        </TouchableOpacity>
                        <Text style={s.itemQtyTxt}>{inCart.qty}</Text>
                        <TouchableOpacity
                          style={s.itemPlusBtn}
                          onPress={() => handleItemPress(item)}
                        >
                          <Text style={s.itemPlusTxt}>+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>

      {/* Košarica bar na dnu */}
      <View style={s.cartBar}>
        <TouchableOpacity style={s.cartBarInner} onPress={() => setCartOpen(true)}>
          <View style={s.cartBarLeft}>
            <Text style={s.cartBarIcon}>🛒</Text>
            {cartQty > 0 ? (
              <>
                <Text style={s.cartBarQty}>{cartQty} kos</Text>
                <View style={s.cartItems}>
                  {cart.slice(0, 2).map(l => (
                    <Text key={l.lineId} style={s.cartPreview} numberOfLines={1}>{l.item.name} ×{l.qty}</Text>
                  ))}
                  {cart.length > 2 && <Text style={s.cartPreview}>+{cart.length - 2} več</Text>}
                </View>
              </>
            ) : (
              <Text style={s.cartBarEmpty}>Košarica je prazna</Text>
            )}
          </View>
          <TouchableOpacity
            style={[s.payBarBtn, cart.length === 0 && s.btnDisabled]}
            onPress={() => cart.length > 0 && setPayModal(true)}
            disabled={cart.length === 0}
          >
            <Text style={s.payBarBtnText}>Plačaj {total.toFixed(2)} €</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

      {/* Košarica Modal */}
      <Modal visible={cartOpen} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.cartModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{tableName} · {cartQty} kos</Text>
              <View style={s.modalHeaderRight}>
                {cart.length > 0 && (
                  <TouchableOpacity onPress={() => clearCart(tableId)} style={{ marginRight: 12 }}>
                    <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Počisti</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setCartOpen(false)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {cart.length === 0 ? (
                <Text style={s.emptyCart}>Košarica je prazna</Text>
              ) : (
                cart.map(l => (
                  <View key={l.lineId} style={s.cartLine}>
                    <View style={s.cartLineLeft}>
                      <Text style={s.cartName}>{l.item.name}</Text>
                      <Text style={s.cartUnitPrice}>{l.item.price.toFixed(2)} € / kos</Text>
                    </View>
                    <View style={s.cartQty}>
                      <TouchableOpacity onPress={() => adjQty(l.lineId, -1)} style={s.qtyBtnView}>
                        <Text style={s.qtyBtnText}>{l.qty === 1 ? '🗑' : '−'}</Text>
                      </TouchableOpacity>
                      <Text style={s.qtyNum}>{l.qty}</Text>
                      <TouchableOpacity onPress={() => adjQty(l.lineId, 1)} style={[s.qtyBtnView, s.qtyBtnPlus]}>
                        <Text style={[s.qtyBtnText, { color: colors.white }]}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={s.cartTotal}>{(l.item.price * l.qty).toFixed(2)} €</Text>
                  </View>
                ))
              )}
            </ScrollView>

            {cart.length > 0 && (
              <View style={s.cartFooter}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Vmesna vsota</Text>
                  <Text style={s.summaryValue}>{subtotal.toFixed(2)} €</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>DDV 22%</Text>
                  <Text style={s.summaryValue}>{(total - total/1.22).toFixed(2)} €</Text>
                </View>
                <View style={[s.summaryRow, s.totalRow]}>
                  <Text style={s.totalLabel}>SKUPAJ</Text>
                  <Text style={s.totalAmount}>{total.toFixed(2)} €</Text>
                </View>
                <TouchableOpacity style={s.payBtn} onPress={() => { setCartOpen(false); setPayModal(true); }}>
                  <Text style={s.payBtnText}>→ Plačaj {total.toFixed(2)} €</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={payModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.payModalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Zaključi račun</Text>
              <TouchableOpacity onPress={() => !paying && setPayModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalBody}>
              <Text style={s.modalSection}>Način plačila</Text>
              <View style={s.methodRow}>
                {(['cash','card','bon'] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[s.methodBtn, payMethod === m && s.methodBtnActive]}
                    onPress={() => setPayMethod(m)}
                  >
                    <Text style={s.methodIcon}>{m === 'cash' ? '💵' : m === 'card' ? '💳' : '🎟'}</Text>
                    <Text style={[s.methodText, payMethod === m && s.methodTextActive]}>
                      {m === 'cash' ? 'Gotovina' : m === 'card' ? 'Kartica' : 'Bon'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {payMethod === 'card' && (
                <View style={s.cardBox}>
                  <Text style={s.cardLabel}>Vnesi na terminal</Text>
                  <Text style={s.cardAmount}>{total.toFixed(2)} €</Text>
                </View>
              )}

              {payMethod === 'cash' && (
                <View>
                  <Text style={s.modalSection}>Prejeto</Text>
                  <TextInput
                    style={s.givenInput}
                    value={given}
                    onChangeText={setGiven}
                    placeholder={total.toFixed(2)}
                    keyboardType="numeric"
                    placeholderTextColor={colors.gray}
                  />
                  <View style={s.quickAmounts}>
                    {[5,10,20,50,100].map(v => (
                      <TouchableOpacity key={v} style={s.quickBtn} onPress={() => setGiven(String(v))}>
                        <Text style={s.quickBtnText}>{v}€</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {change > 0 && (
                    <View style={s.changeBox}>
                      <Text style={s.changeLabel}>Za vrniti</Text>
                      <Text style={s.changeAmount}>{change.toFixed(2)} €</Text>
                    </View>
                  )}
                </View>
              )}

              <Text style={s.modalSection}>Popust</Text>
              <View style={s.discountRow}>
                {[0,5,10,20].map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[s.discountBtn, discount === p && s.discountBtnActive]}
                    onPress={() => setDiscount(p)}
                  >
                    <Text style={[s.discountText, discount === p && s.discountTextActive]}>
                      {p === 0 ? '—' : `${p}%`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.summaryBox}>
                {discount > 0 && (
                  <View style={s.summaryRow}>
                    <Text style={s.summaryLabel}>Popust {discount}%</Text>
                    <Text style={s.summaryValue}>-{discountAmt.toFixed(2)} €</Text>
                  </View>
                )}
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>DDV 22%</Text>
                  <Text style={s.summaryValue}>{(total - total/1.22).toFixed(2)} €</Text>
                </View>
                <View style={[s.summaryRow, { marginTop: 8, borderTopWidth: 1, borderColor: colors.lightGray, paddingTop: 8 }]}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, color: colors.header }}>Skupaj</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 24, color: colors.accent }}>{total.toFixed(2)} €</Text>
                </View>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f8f8f8', borderTopWidth: 1, borderColor: '#eee' }}>
              <Switch value={fursEnabled} onValueChange={setFursEnabled} trackColor={{ false: '#ccc', true: '#1f6b3a' }} thumbColor={'#fff'} />
              <Text style={{ marginLeft: 10, fontSize: 13, color: '#444', flex: 1 }}>Davčno potrdi (FURS)</Text>
            </View>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => !paying && setPayModal(false)} disabled={paying}>
                <Text style={s.cancelBtnText}>Prekliči</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, paying && s.btnDisabled]} onPress={submitPayment} disabled={paying}>
                <Text style={s.confirmBtnText}>{paying ? '⏳ Obdelujem...' : `✓ Zaključi ${total.toFixed(2)} €`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {modModal && (
        <Modal visible animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={s.cartModal}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{modModal.item.name}</Text>
                <TouchableOpacity onPress={() => setModModal(null)}>
                  <Text style={s.modalClose}>X</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 16 }}>
                {modModal.groups.map(group => (
                  <View key={group.id} style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.header }}>{group.name}</Text>
                      {group.required && (
                        <View style={{ backgroundColor: colors.danger, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>OBVEZNO</Text>
                        </View>
                      )}
                    </View>
                    {group.options.map(opt => {
                      const selected = (selectedMods[group.id] || []).includes(opt.id);
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: 2, borderColor: selected ? colors.accent : colors.lightGray, backgroundColor: selected ? '#f0faf4' : colors.white }}
                          onPress={() => toggleMod(group.id, opt.id, group.multi_select)}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: group.multi_select ? 4 : 11, borderWidth: 2, borderColor: selected ? colors.accent : colors.lightGray, backgroundColor: selected ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            {selected && <Text style={{ color: 'white', fontSize: 13, fontWeight: 'bold' }}>v</Text>}
                          </View>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text }}>{opt.name}</Text>
                          {opt.price_delta !== 0 && (
                            <Text style={{ fontSize: 13, fontWeight: '700', color: opt.price_delta > 0 ? colors.accent : colors.danger }}>
                              {opt.price_delta > 0 ? '+' : ''}{opt.price_delta.toFixed(2)} EUR
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
              <View style={{ padding: 16, borderTopWidth: 1, borderColor: colors.lightGray }}>
                <TouchableOpacity style={s.payBtn} onPress={confirmMods}>
                  <Text style={s.payBtnText}>Dodaj v kosarico</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: StatusBar.currentHeight || 0 },
  header: { backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  headerTitle: { color: colors.brand, fontSize: 15, fontWeight: 'bold' },
  orgName: { color: colors.white, fontSize: 10, opacity: 0.6 },
  headerRight: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerBtn: { padding: 4 },
  headerBtnText: { fontSize: 20 },
  body: { flex: 1, flexDirection: 'row' },

  // Sidebar kategorije
  sidebar: { width: 72, backgroundColor: colors.white, borderRightWidth: 1, borderColor: colors.lightGray },
  catItem: { paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', borderBottomWidth: 1, borderColor: colors.lightGray, position: 'relative' },
  catItemActive: { backgroundColor: '#f0faf4' },
  catIcon: { fontSize: 22, marginBottom: 4 },
  catName: { fontSize: 9, color: colors.gray, textAlign: 'center', fontWeight: '500' },
  catNameActive: { color: colors.accent, fontWeight: '700' },
  catActiveLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.accent, borderTopRightRadius: 3, borderBottomRightRadius: 3 },

  // Main panel
  mainPanel: { flex: 1 },
  searchBar: { backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.lightGray, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: colors.text },
  catLabel: { fontSize: 11, color: colors.gray, fontWeight: '600' },
  emptyItems: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 13, color: colors.gray },

  // Item buttons
  itemBtn: { flex: 1, backgroundColor: colors.white, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.lightGray, minHeight: 90, justifyContent: 'center', position: 'relative' },
  itemBtnActive: { borderColor: colors.accent, borderWidth: 2, backgroundColor: '#f0faf4' },
  itemBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: colors.accent, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  itemBadgeText: { color: colors.white, fontSize: 11, fontWeight: 'bold' },
  itemFav: { position: 'absolute', top: 5, left: 7, fontSize: 11, color: colors.brand },
  itemName: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center', marginTop: 4 },
  itemPrice: { fontSize: 14, color: colors.accent, fontWeight: 'bold', marginTop: 6 },

  // Cart bar spodaj
  cartBar: { backgroundColor: colors.header, paddingVertical: 10, paddingHorizontal: 14 },
  cartBarInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cartBarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartBarIcon: { fontSize: 20 },
  cartBarQty: { fontSize: 13, fontWeight: 'bold', color: colors.white },
  cartItems: { flex: 1 },
  cartPreview: { fontSize: 11, color: colors.white, opacity: 0.7 },
  cartBarEmpty: { fontSize: 13, color: colors.white, opacity: 0.5 },
  tableNameText: { fontSize: 11, color: colors.brand, fontWeight: '600' },
  payBarBtn: { backgroundColor: colors.brand, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  payBarBtnText: { color: colors.header, fontWeight: 'bold', fontSize: 14 },
  btnDisabled: { opacity: 0.4 },

  // Cart modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  cartModal: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_HEIGHT * 0.75 },
  payModalBox: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_HEIGHT * 0.90 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: colors.lightGray },
  modalHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: colors.header },
  modalClose: { fontSize: 18, color: colors.gray },
  modalBody: { padding: 16 },
  modalSection: { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 12 },

  emptyCart: { color: colors.gray, textAlign: 'center', marginVertical: 40, fontSize: 14 },
  cartLine: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.lightGray, gap: 10 },
  cartLineLeft: { flex: 1 },
  cartName: { fontSize: 14, fontWeight: '600', color: colors.text },
  cartUnitPrice: { fontSize: 11, color: colors.gray, marginTop: 2 },
  cartQty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtnView: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.lightGray, alignItems: 'center', justifyContent: 'center' },
  qtyBtnPlus: { backgroundColor: colors.accent, borderColor: colors.accent },
  qtyBtnText: { fontSize: 16, color: colors.text },
  qtyNum: { fontSize: 16, fontWeight: 'bold', minWidth: 24, textAlign: 'center', color: colors.text },
  cartTotal: { fontSize: 15, fontWeight: 'bold', color: colors.text, minWidth: 60, textAlign: 'right' },

  cartFooter: { padding: 16, borderTopWidth: 1, borderColor: colors.lightGray },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 13, color: colors.gray },
  summaryValue: { fontSize: 13, color: colors.gray },
  totalRow: { paddingTop: 10, borderTopWidth: 2, borderColor: colors.header, marginTop: 6 },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: colors.header },
  totalAmount: { fontSize: 22, fontWeight: 'bold', color: colors.accent },
  payBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 12 },
  payBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },

  // Payment
  methodRow: { flexDirection: 'row', gap: 8 },
  methodBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.lightGray },
  methodBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  methodIcon: { fontSize: 24, marginBottom: 4 },
  methodText: { fontSize: 12, fontWeight: '600', color: colors.text },
  methodTextActive: { color: colors.white },
  cardBox: { backgroundColor: '#f0faf4', borderRadius: 12, padding: 24, alignItems: 'center', marginTop: 8 },
  cardLabel: { fontSize: 12, color: colors.gray, marginBottom: 8 },
  cardAmount: { fontSize: 48, fontWeight: 'bold', color: colors.accent },
  givenInput: { backgroundColor: colors.bg, borderRadius: 8, padding: 14, fontSize: 24, fontWeight: 'bold', color: colors.text, borderWidth: 1, borderColor: colors.lightGray },
  quickAmounts: { flexDirection: 'row', gap: 6, marginTop: 8 },
  quickBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: colors.bg, alignItems: 'center', borderWidth: 1, borderColor: colors.lightGray },
  quickBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  changeBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0faf4', borderRadius: 8, padding: 14, marginTop: 8 },
  changeLabel: { fontSize: 14, fontWeight: '600', color: colors.accent },
  changeAmount: { fontSize: 20, fontWeight: 'bold', color: colors.accent },
  discountRow: { flexDirection: 'row', gap: 8 },
  discountBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.lightGray },
  discountBtnActive: { backgroundColor: '#f0faf4', borderColor: colors.accent },
  discountText: { fontSize: 14, fontWeight: '600', color: colors.gray },
  discountTextActive: { color: colors.accent },
  summaryBox: { backgroundColor: colors.bg, borderRadius: 10, padding: 14, marginTop: 12 },
  modalFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderColor: colors.lightGray },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.lightGray },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent },
  confirmBtnText: { fontSize: 14, fontWeight: 'bold', color: colors.white },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 2 },
  itemMinusBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.lightGray, alignItems: 'center', justifyContent: 'center' },
  itemMinusTxt: { fontSize: 14, color: colors.text },
  itemQtyTxt: { fontSize: 13, fontWeight: 'bold', color: colors.accent, minWidth: 22, textAlign: 'center' },
  itemPlusBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  itemPlusTxt: { fontSize: 16, color: colors.white, fontWeight: 'bold' },
});
