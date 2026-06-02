import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { AuthContext } from '../lib/auth';
import { colors } from '../lib/colors';

export default function SettingsScreen() {
  const auth = useContext(AuthContext);

  async function logout() {
    Alert.alert('Odjava', 'Se res želiš odjaviti?', [
      { text: 'Prekliči', style: 'cancel' },
      { text: 'Odjava', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        router.replace('/login');
      }},
    ]);
  }

  const sections = [
    {
      title: 'Blagajna',
      items: [
        { icon: '🪑', label: 'Prostori & Mize', screen: '/floor' },
        { icon: '🏷️', label: 'Kategorije & Artikli', screen: '/catalog' },
        { icon: '🖨️', label: 'Bluetooth tiskalnik', screen: '/printer' },
      ]
    },
  ];

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Nazaj</Text></TouchableOpacity>
        <Text style={s.title}>Nastavitve</Text>
        <View />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={s.orgCard}>
          <Text style={s.orgName}>{auth?.orgName}</Text>
          <Text style={s.orgRole}>{auth?.role === 'owner' ? 'Lastnik' : auth?.role}</Text>
        </View>

        {sections.map(section => (
          <View key={section.title}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <View style={s.sectionCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[s.settingItem, idx < section.items.length - 1 && s.settingItemBorder]}
                  onPress={() => {
                    if (item.screen === '/floor') router.push('/floor');
                    else if (item.screen === '/catalog') router.push('/catalog');
                    else if (item.screen === '/printer') router.push('/printer');
                    else Alert.alert('Prihaja kmalu', item.label + ' bo kmalu na voljo.');
                  }}
                >
                  <Text style={s.settingIcon}>{item.icon}</Text>
                  <Text style={s.settingLabel}>{item.label}</Text>
                  <Text style={s.settingArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={s.logoutBtn} onPress={logout}>
          <Text style={s.logoutText}>Odjava</Text>
        </TouchableOpacity>

        <Text style={s.version}>Računko POS v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: colors.brand, fontSize: 14 },
  title: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  orgCard: { backgroundColor: colors.header, borderRadius: 12, padding: 16 },
  orgName: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  orgRole: { color: colors.brand, fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.lightGray, overflow: 'hidden' },
  settingItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  settingItemBorder: { borderBottomWidth: 1, borderColor: colors.lightGray },
  settingIcon: { fontSize: 20 },
  settingLabel: { flex: 1, fontSize: 14, color: colors.text },
  settingArrow: { fontSize: 18, color: colors.gray },
  logoutBtn: { backgroundColor: colors.white, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.danger },
  logoutText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
  version: { textAlign: 'center', color: colors.gray, fontSize: 12, marginTop: 8 },
});
