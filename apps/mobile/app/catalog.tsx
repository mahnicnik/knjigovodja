import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  SafeAreaView, Alert, ActivityIndicator, TextInput, Modal, ScrollView, StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';

export default function CatalogScreen() {
  const auth = useContext(AuthContext);
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: '', vat_rate: '22', category_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (auth?.businessId) loadData(); }, [auth?.businessId]);

  async function loadData() {
    const [catRes, itemRes] = await Promise.all([
      supabase.from('categories').select('id,name,icon,color').eq('business_id', auth!.businessId).order('sort_order'),
      supabase.from('items').select('id,name,price,vat_rate,category_id,archived,fav').eq('business_id', auth!.businessId).eq('archived', false).order('name'),
    ]);
    if (catRes.data) setCategories(catRes.data);
    if (itemRes.data) setItems(itemRes.data);
    setLoading(false);
  }

  const filteredItems = selectedCat ? items.filter(i => i.category_id === selectedCat) : items;

  async function saveItem() {
    if (!newItem.name.trim()) { Alert.alert('Napaka', 'Ime je obvezno'); return; }
    if (!newItem.price || isNaN(parseFloat(newItem.price))) { Alert.alert('Napaka', 'Vnesi veljavno ceno'); return; }
    setSaving(true);
    const { error } = await supabase.from('items').insert({
      business_id: auth!.businessId,
      name: newItem.name.trim(),
      price: parseFloat(newItem.price),
      vat_rate: parseInt(newItem.vat_rate) || 22,
      category_id: newItem.category_id || null,
      archived: false,
    });
    if (error) {
      Alert.alert('Napaka', error.message);
    } else {
      setAddModal(false);
      setNewItem({ name: '', price: '', vat_rate: '22', category_id: '' });
      loadData();
    }
    setSaving(false);
  }

  async function toggleFav(item: any) {
    await supabase.from('items').update({ fav: !item.fav }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, fav: !i.fav } : i));
  }

  async function archiveItem(item: any) {
    Alert.alert('Izbriši artikel', item.name + '?', [
      { text: 'Prekliči', style: 'cancel' },
      { text: 'Izbriši', style: 'destructive', onPress: async () => {
        await supabase.from('items').update({ archived: true }).eq('id', item.id);
        setItems(prev => prev.filter(i => i.id !== item.id));
      }},
    ]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Nazaj</Text></TouchableOpacity>
        <Text style={s.title}>Kategorije & Artikli</Text>
        <TouchableOpacity onPress={() => setAddModal(true)}>
          <Text style={s.addBtn}>+ Artikel</Text>
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        {/* Kategorije sidebar */}
        <View style={s.sidebar}>
          <TouchableOpacity
            style={[s.catItem, !selectedCat && s.catItemActive]}
            onPress={() => setSelectedCat(null)}
          >
            <Text style={s.catIcon}>🔲</Text>
            <Text style={[s.catName, !selectedCat && s.catNameActive]}>Vse</Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[s.catItem, selectedCat === cat.id && s.catItemActive]}
              onPress={() => setSelectedCat(cat.id)}
            >
              <Text style={s.catIcon}>{cat.icon || '📦'}</Text>
              <Text style={[s.catName, selectedCat === cat.id && s.catNameActive]} numberOfLines={2}>{cat.name}</Text>
              {selectedCat === cat.id && <View style={s.catActiveLine} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Artikli */}
        <FlatList
          data={filteredItems}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 10, gap: 8 }}
          style={{ flex: 1 }}
          ListEmptyComponent={<Text style={s.empty}>Ni artiklov</Text>}
          renderItem={({ item }) => (
            <View style={s.itemRow}>
              <TouchableOpacity onPress={() => toggleFav(item)} style={s.favBtn}>
                <Text style={{ fontSize: 18, opacity: item.fav ? 1 : 0.3 }}>⭐</Text>
              </TouchableOpacity>
              <View style={s.itemInfo}>
                <Text style={s.itemName}>{item.name}</Text>
                <Text style={s.itemMeta}>DDV {item.vat_rate}%</Text>
              </View>
              <Text style={s.itemPrice}>{parseFloat(item.price).toFixed(2)} €</Text>
              <TouchableOpacity onPress={() => archiveItem(item)} style={s.deleteBtn}>
                <Text style={{ fontSize: 16 }}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      {/* Add Modal */}
      <Modal visible={addModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Nov artikel</Text>
              <TouchableOpacity onPress={() => setAddModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <Text style={s.fieldLabel}>Ime artikla *</Text>
              <TextInput
                style={s.input}
                value={newItem.name}
                onChangeText={v => setNewItem(p => ({ ...p, name: v }))}
                placeholder="npr. Espresso"
                placeholderTextColor={colors.gray}
              />

              <Text style={s.fieldLabel}>Cena (€) *</Text>
              <TextInput
                style={s.input}
                value={newItem.price}
                onChangeText={v => setNewItem(p => ({ ...p, price: v }))}
                placeholder="2.50"
                keyboardType="numeric"
                placeholderTextColor={colors.gray}
              />

              <Text style={s.fieldLabel}>DDV (%)</Text>
              <View style={s.vatRow}>
                {['9.5', '22'].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[s.vatBtn, newItem.vat_rate === v && s.vatBtnActive]}
                    onPress={() => setNewItem(p => ({ ...p, vat_rate: v }))}
                  >
                    <Text style={[s.vatBtnText, newItem.vat_rate === v && s.vatBtnTextActive]}>{v}%</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>Kategorija</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[s.catSelectBtn, !newItem.category_id && s.catSelectBtnActive]}
                    onPress={() => setNewItem(p => ({ ...p, category_id: '' }))}
                  >
                    <Text style={s.catSelectText}>Brez</Text>
                  </TouchableOpacity>
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[s.catSelectBtn, newItem.category_id === cat.id && s.catSelectBtnActive]}
                      onPress={() => setNewItem(p => ({ ...p, category_id: cat.id }))}
                    >
                      <Text style={s.catSelectText}>{cat.icon} {cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setAddModal(false)}>
                <Text style={s.cancelBtnText}>Prekliči</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, saving && { opacity: 0.5 }]} onPress={saveItem} disabled={saving}>
                <Text style={s.confirmBtnText}>{saving ? 'Shranjujem...' : 'Shrani artikel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: StatusBar.currentHeight || 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: colors.brand, fontSize: 14 },
  title: { color: colors.white, fontSize: 15, fontWeight: 'bold' },
  addBtn: { color: colors.brand, fontSize: 14, fontWeight: '600' },
  body: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 72, backgroundColor: colors.white, borderRightWidth: 1, borderColor: colors.lightGray },
  catItem: { paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', borderBottomWidth: 1, borderColor: colors.lightGray, position: 'relative' },
  catItemActive: { backgroundColor: '#f0faf4' },
  catIcon: { fontSize: 20, marginBottom: 4 },
  catName: { fontSize: 9, color: colors.gray, textAlign: 'center' },
  catNameActive: { color: colors.accent, fontWeight: '700' },
  catActiveLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.accent },
  empty: { textAlign: 'center', color: colors.gray, marginTop: 40 },
  itemRow: { backgroundColor: colors.white, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.lightGray },
  favBtn: { padding: 4 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.text },
  itemMeta: { fontSize: 11, color: colors.gray, marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: 'bold', color: colors.accent },
  deleteBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: colors.lightGray },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: colors.header },
  modalClose: { fontSize: 18, color: colors.gray },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.gray, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: colors.bg, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.lightGray, marginBottom: 4 },
  vatRow: { flexDirection: 'row', gap: 8 },
  vatBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.lightGray },
  vatBtnActive: { backgroundColor: '#f0faf4', borderColor: colors.accent },
  vatBtnText: { fontSize: 14, fontWeight: '600', color: colors.gray },
  vatBtnTextActive: { color: colors.accent },
  catSelectBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.lightGray },
  catSelectBtnActive: { backgroundColor: '#f0faf4', borderColor: colors.accent },
  catSelectText: { fontSize: 13, color: colors.text },
  modalFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderColor: colors.lightGray },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.lightGray },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent },
  confirmBtnText: { fontSize: 14, fontWeight: 'bold', color: colors.white },
});
