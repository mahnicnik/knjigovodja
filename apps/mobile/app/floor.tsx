import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, ActivityIndicator, Alert, TextInput, Modal, StatusBar
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCart } from '../lib/cart';
import { supabase } from '../lib/supabase';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';

export default function FloorScreen() {
  const auth = useContext(AuthContext);
  const { setActiveTable, carts } = useCart();
  console.log('CARTS FROM CONTEXT:', JSON.stringify(Object.keys(carts || {})));
  const [spaces, setSpaces] = useState<any[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  // Modali
  const [spaceModal, setSpaceModal] = useState<{id?: string, name: string, color: string} | null>(null);
  const [tableModal, setTableModal] = useState<{id?: string, name: string, seats: string, space_id: string} | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (auth?.businessId) loadSpaces(); }, [auth?.businessId]);
  useFocusEffect(useCallback(() => { if (auth?.businessId) loadSpaces(); }, [auth?.businessId]));

  async function loadSpaces() {
    const { data: spacesData } = await supabase.from('spaces').select('*').eq('business_id', auth!.businessId).order('name');
    const { data: tablesData } = await supabase.from('tables').select('*');
    if (spacesData) {
      const spacesWithTables = spacesData.map((sp: any) => ({
        ...sp,
        tables: (tablesData || []).filter((t: any) => t.space_id === sp.id),
      }));
      setSpaces(spacesWithTables);
      if (spacesWithTables.length > 0 && !selectedSpace) setSelectedSpace(spacesWithTables[0].id);
    }
    setLoading(false);
  }

  function tableHasItems(tableId: string): boolean {
    const cart = (carts as any)[tableId] || [];
    return cart.length > 0;
  }

  const tableStatus = (table: any) => {
    const status = tableHasItems(table.id) ? 'occupied' : table.status;
    switch(status) {
      case 'occupied': return { bg: '#fef3c7', border: '#f59e0b', label: 'Zasedena' };
      case 'reserved': return { bg: '#ede9fe', border: '#8b5cf6', label: 'Rezervirana' };
      default: return { bg: colors.white, border: colors.lightGray, label: 'Prosta' };
    }
  };

  // Space CRUD
  async function saveSpace() {
    if (!spaceModal?.name.trim()) { Alert.alert('Napaka', 'Ime je obvezno'); return; }
    setSaving(true);
    if (spaceModal.id) {
      await supabase.from('spaces').update({ name: spaceModal.name, color: spaceModal.color }).eq('id', spaceModal.id);
    } else {
      await supabase.from('spaces').insert({ business_id: auth!.businessId, name: spaceModal.name, color: spaceModal.color || '#1f6b3a' });
    }
    setSpaceModal(null);
    setSaving(false);
    loadSpaces();
  }

  async function deleteSpace(space: any) {
    Alert.alert('Izbriši prostor', space.name + '?', [
      { text: 'Prekliči', style: 'cancel' },
      { text: 'Izbriši', style: 'destructive', onPress: async () => {
        await supabase.from('spaces').delete().eq('id', space.id);
        setSelectedSpace(null);
        loadSpaces();
      }},
    ]);
  }

  // Table CRUD
  async function saveTable() {
    if (!tableModal?.name.trim()) { Alert.alert('Napaka', 'Ime je obvezno'); return; }
    setSaving(true);
    if (tableModal.id) {
      await supabase.from('tables').update({ name: tableModal.name, seats: parseInt(tableModal.seats) || 4 }).eq('id', tableModal.id);
    } else {
      await supabase.from('tables').insert({
        space_id: tableModal.space_id,
        name: tableModal.name,
        seats: parseInt(tableModal.seats) || 4,
        x: 10, y: 10,
        status: 'free',
      });
    }
    setTableModal(null);
    setSaving(false);
    loadSpaces();
  }

  async function deleteTable(table: any) {
    Alert.alert('Izbriši mizo', table.name + '?', [
      { text: 'Prekliči', style: 'cancel' },
      { text: 'Izbriši', style: 'destructive', onPress: async () => {
        await supabase.from('tables').delete().eq('id', table.id);
        loadSpaces();
      }},
    ]);
  }

  const COLORS = ['#1f6b3a','#3a6e8f','#c26a3a','#7b61b8','#c76a98','#a83232','#e9b949'];

  const space = spaces.find(s => s.id === selectedSpace);

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Nazaj</Text></TouchableOpacity>
        <Text style={s.title}>Prostori & Mize</Text>
        <TouchableOpacity onPress={() => setEditMode(e => !e)}>
          <Text style={[s.editBtn, editMode && s.editBtnActive]}>{editMode ? 'Končaj' : 'Uredi'}</Text>
        </TouchableOpacity>
      </View>

      {/* Prostori tabs */}
      <View style={s.spaceBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.spaceTabs}>
          {spaces.map(sp => (
            <TouchableOpacity
              key={sp.id}
              style={[s.spaceTab, selectedSpace === sp.id && s.spaceTabActive]}
              onPress={() => setSelectedSpace(sp.id)}
              onLongPress={() => editMode && setSpaceModal({ id: sp.id, name: sp.name, color: sp.color || '#1f6b3a' })}
            >
              <View style={[s.spaceDot, { backgroundColor: sp.color || colors.accent }]} />
              <Text style={[s.spaceTabText, selectedSpace === sp.id && s.spaceTabTextActive]}>{sp.name}</Text>
              <Text style={s.spaceCount}>
                {(sp.tables || []).filter((t: any) => tableHasItems(t.id) || t.status === 'occupied').length}/{(sp.tables || []).length}
              </Text>
              {editMode && (
                <TouchableOpacity onPress={() => deleteSpace(sp)} style={s.deleteSpaceBtn}>
                  <Text style={s.deleteSpaceTxt}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
          {editMode && (
            <TouchableOpacity style={s.addSpaceBtn} onPress={() => setSpaceModal({ name: '', color: '#1f6b3a' })}>
              <Text style={s.addSpaceTxt}>+ Prostor</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Legenda */}
      <View style={s.legend}>
        {[{label:'Prosta', color: colors.lightGray}, {label:'Zasedena', color:'#f59e0b'}, {label:'Rezervirana', color:'#8b5cf6'}].map(l => (
          <View key={l.label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: l.color }]} />
            <Text style={s.legendText}>{l.label}</Text>
          </View>
        ))}
        <TouchableOpacity onPress={() => { setActiveTable('quick', 'Hitra prodaja'); router.replace('/pos'); }} style={s.quickBtn}>
          <Text style={s.quickBtnText}>+ Hitra prodaja</Text>
        </TouchableOpacity>
      </View>

      {/* Mize */}
      <ScrollView contentContainerStyle={s.tablesGrid}>
        {(space?.tables || []).map((table: any) => {
          const st = tableStatus(table);
          return (
            <TouchableOpacity
              key={table.id}
              style={[s.tableBtn, { backgroundColor: st.bg, borderColor: st.border }]}
              onPress={() => {
                if (editMode) {
                  setTableModal({ id: table.id, name: table.name, seats: String(table.seats), space_id: table.space_id });
                } else {
                  setActiveTable(table.id, table.name);
                  router.replace('/pos');
                }
              }}
              onLongPress={() => {
                if (!editMode) {
                  const { Alert: A } = require('react-native');
                  A.alert('Status mize', table.name, [
                    { text: 'Prosta', onPress: () => { supabase.from('tables').update({ status: 'free' }).eq('id', table.id).then(() => loadSpaces()); }},
                    { text: 'Zasedena', onPress: () => { supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id).then(() => loadSpaces()); }},
                    { text: 'Rezervirana', onPress: () => { supabase.from('tables').update({ status: 'reserved' }).eq('id', table.id).then(() => loadSpaces()); }},
                    { text: 'Prekliči', style: 'cancel' },
                  ]);
                }
              }}
            >
              {editMode && (
                <TouchableOpacity onPress={() => deleteTable(table)} style={s.deleteTableBtn}>
                  <Text style={s.deleteTableTxt}>✕</Text>
                </TouchableOpacity>
              )}
              <Text style={s.tableName}>{table.name}</Text>
              <Text style={s.tableSeats}>👤 {table.seats}</Text>
              {!editMode && <Text style={s.tableStatus}>{st.label}</Text>}
            </TouchableOpacity>
          );
        })}
        {editMode && selectedSpace && (
          <TouchableOpacity
            style={s.addTableBtn}
            onPress={() => setTableModal({ name: '', seats: '4', space_id: selectedSpace })}
          >
            <Text style={s.addTableTxt}>+ Miza</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Space Modal */}
      <Modal visible={!!spaceModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{spaceModal?.id ? 'Uredi prostor' : 'Nov prostor'}</Text>
              <TouchableOpacity onPress={() => setSpaceModal(null)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={s.fieldLabel}>Ime prostora *</Text>
              <TextInput
                style={s.input}
                value={spaceModal?.name || ''}
                onChangeText={v => setSpaceModal(p => p ? { ...p, name: v } : null)}
                placeholder="npr. Terasa"
                placeholderTextColor={colors.gray}
                autoFocus
              />
              <Text style={s.fieldLabel}>Barva</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setSpaceModal(p => p ? { ...p, color: c } : null)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: spaceModal?.color === c ? 3 : 0, borderColor: colors.header }}
                  />
                ))}
              </View>
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setSpaceModal(null)}>
                  <Text style={s.cancelBtnText}>Prekliči</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.confirmBtn, saving && {opacity:0.5}]} onPress={saveSpace} disabled={saving}>
                  <Text style={s.confirmBtnText}>{saving ? 'Shranjujem...' : 'Shrani'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Table Modal */}
      <Modal visible={!!tableModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{tableModal?.id ? 'Uredi mizo' : 'Nova miza'}</Text>
              <TouchableOpacity onPress={() => setTableModal(null)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={s.fieldLabel}>Ime mize *</Text>
              <TextInput
                style={s.input}
                value={tableModal?.name || ''}
                onChangeText={v => setTableModal(p => p ? { ...p, name: v } : null)}
                placeholder="npr. Miza 1"
                placeholderTextColor={colors.gray}
                autoFocus
              />
              <Text style={s.fieldLabel}>Število sedežev</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {['2','4','6','8'].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[s.seatsBtn, tableModal?.seats === n && s.seatsBtnActive]}
                    onPress={() => setTableModal(p => p ? { ...p, seats: n } : null)}
                  >
                    <Text style={[s.seatsBtnText, tableModal?.seats === n && s.seatsBtnTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setTableModal(null)}>
                  <Text style={s.cancelBtnText}>Prekliči</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.confirmBtn, saving && {opacity:0.5}]} onPress={saveTable} disabled={saving}>
                  <Text style={s.confirmBtnText}>{saving ? 'Shranjujem...' : 'Shrani'}</Text>
                </TouchableOpacity>
              </View>
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
  editBtn: { color: colors.white, fontSize: 14, opacity: 0.7 },
  editBtnActive: { color: colors.brand, opacity: 1, fontWeight: 'bold' },
  spaceBar: { backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.lightGray },
  spaceTabs: { paddingHorizontal: 8, paddingVertical: 4, gap: 6, flexDirection: 'row', alignItems: 'center' },
  spaceTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6, borderWidth: 2, borderColor: 'transparent' },
  spaceTabActive: { borderColor: colors.accent, backgroundColor: '#f0faf4' },
  spaceDot: { width: 8, height: 8, borderRadius: 4 },
  spaceTabText: { fontSize: 13, color: colors.gray, fontWeight: '500' },
  spaceTabTextActive: { color: colors.accent, fontWeight: '700' },
  spaceCount: { fontSize: 11, color: colors.gray },
  deleteSpaceBtn: { marginLeft: 4, padding: 2 },
  deleteSpaceTxt: { fontSize: 12, color: colors.danger },
  addSpaceBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.accent, borderStyle: 'dashed' },
  addSpaceTxt: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  legend: { flexDirection: 'row', gap: 12, padding: 10, backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.lightGray, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.gray },
  quickBtn: { marginLeft: 'auto', backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  quickBtnText: { fontSize: 11, color: colors.white, fontWeight: '700' },
  tablesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  tableBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' },
  tableName: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  tableSeats: { fontSize: 11, color: colors.gray },
  tableStatus: { fontSize: 10, color: colors.gray },
  deleteTableBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.danger, borderRadius: 8, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  deleteTableTxt: { fontSize: 10, color: colors.white, fontWeight: 'bold' },
  addTableBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderColor: colors.accent, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addTableTxt: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: colors.lightGray },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: colors.header },
  modalClose: { fontSize: 18, color: colors.gray },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.gray, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: colors.bg, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.lightGray, marginBottom: 8 },
  seatsBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.lightGray },
  seatsBtnActive: { backgroundColor: '#f0faf4', borderColor: colors.accent },
  seatsBtnText: { fontSize: 15, fontWeight: '600', color: colors.gray },
  seatsBtnTextActive: { color: colors.accent },
  modalFooter: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.lightGray },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent },
  confirmBtnText: { fontSize: 14, fontWeight: 'bold', color: colors.white },
});
