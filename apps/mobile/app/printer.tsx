import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  SafeAreaView, Alert, ActivityIndicator, StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { colors } from '../lib/colors';

import BluetoothPrinter from '../modules/bluetooth-printer'

export default function PrinterScreen() {
  const [devices, setDevices] = useState<any[]>([]);
  const [connected, setConnected] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  async function scanDevices() {
    if (!BluetoothPrinter) {
      Alert.alert('Napaka', 'Tiskalnik ni na voljo v tej verziji app-a.');
      return;
    }
    setScanning(true);
    try {
      const paired = await BluetoothPrinter.getDeviceList();
      const devices = JSON.parse(paired || '[]');
      setDevices(devices);
    } catch (e: any) {
      console.log('SCAN ERROR:', e.message);
      Alert.alert('Napaka', e.message || 'Iskanje ni uspelo');
    }
    setScanning(false);
  }

  async function connectDevice(device: any) {
    const deviceId = device.macAddress || device.inner_mac_address;
    setConnecting(deceId);
    try {
      await BLEPrinter.connect(deviceId);
      setConnected(device);
      Alert.alert('Uspeh', 'Tiskalnik ' + device.deviceName + ' povezan!');
    } catch (e: any) {
      console.log('CONNECT ERROR:', JSON.stringify(e), e.message);
      Alert.alert('Napaka', e.message || 'Povezava ni uspela');
    }
    setConnecting(null);
  }

  async function testPrint() {
    if (!connected || !BluetoothPrinter) return;
    try {
      await BluetoothPrinter.printText('\n', {});
      await BluetoothPrinter.printText('=== RACUNKO POS ===\n', {});
      await BluetoothPrinter.printText('Test tiskanje\n', {});
      await BluetoothPrinter.printText('Tiskalnik deluje!\n', {});
      await BluetoothPrinter.printText('==================\n', {});
      await BluetoothPrinter.printText('\n\n\n', {});
      Alert.alert('Uspeh', 'Test natisnjen!');
    } catch (e: any) {
      Alert.alert('Napaka tiskanja', e.message);
    }
  }

  async function disconnect() {
    try {
      await BluetoothPrinter.disconnect();
      setConnected(null);
    } catch (e) {}
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Nazaj</Text></TouchableOpacity>
        <Text style={s.title}>Bluetooth tiskalnik</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Status */}
      {connected && (
        <View style={s.connectedBar}>
          <Text style={s.connectedIcon}>🖨️</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.connectedName}>{connected.deviceName}</Text>
            <Text style={s.connectedStatus}>Povezan</Text>
          </View>
          <TouchableOpacity style={s.testBtn} onPress={testPrint}>
            <Text style={s.testBtnText}>Test</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.disconnectBtn} onPress={disconnect}>
            <Text style={s.disconnectBtnText}>Odklopiti</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Scan button */}
      <View style={s.scanSection}>
        <TouchableOpacity style={s.scanBtn} onPress={scanDevices} disabled={scanning}>
          {scanning ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={s.scanBtnText}>🔍 Išči Bluetooth tiskalnike</Text>
          )}
        </TouchableOpacity>
        <Text style={s.scanHint}>Prepričaj se da je tiskalnik vklopljen in v dosegu</Text>
      </View>

      {/* Devices list */}
      <FlatList
        data={devices}
        keyExtractor={(d, i) => d.address || d.macAddress || String(i)}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={
          !scanning ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📡</Text>
              <Text style={s.emptyText}>Ni najdenih naprav</Text>
              <Text style={s.emptyHint}>Pritisni "Išči" da poiščeš Bluetooth tiskalnike</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.deviceCard, connected?.macAddress === item.macAddress && s.deviceCardActive]}
            onPress={() => connectDevice(item)}
            disabled={!!connecting}
          >
            <Text style={s.deviceIcon}>🖨️</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.deviceName}>{item.name || item.deviceName || 'Neznana naprava'}</Text>
              <Text style={s.deviceMac}>{item.address || item.macAddress}</Text>
            </View>
            {connecting === item.macAddress ? (
              <ActivityIndicator color={colors.accent} />
            ) : connected?.macAddress === item.macAddress ? (
              <Text style={s.deviceConnected}>✓ Povezan</Text>
            ) : (
              <Text style={s.deviceConnect}>Poveži</Text>
            )}
          </TouchableOpacity>
        )}
      />

      {/* Info */}
      <View style={s.infoBox}>
        <Text style={s.infoText}>Podprti tiskalniki: ESC/POS Bluetooth (Epson, Star, Xprinter, generični)</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: StatusBar.currentHeight || 0 },
  header: { backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: colors.brand, fontSize: 14 },
  title: { color: colors.white, fontSize: 15, fontWeight: 'bold' },
  connectedBar: { backgroundColor: '#f0faf4', borderBottomWidth: 1, borderColor: colors.accent, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  connectedIcon: { fontSize: 28 },
  connectedName: { fontSize: 14, fontWeight: 'bold', color: colors.accent },
  connectedStatus: { fontSize: 11, color: colors.accent, opacity: 0.7 },
  testBtn: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  testBtnText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  disconnectBtn: { backgroundColor: colors.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.lightGray },
  disconnectBtnText: { color: colors.danger, fontSize: 12 },
  scanSection: { padding: 16 },
  scanBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  scanBtnText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
  scanHint: { fontSize: 12, color: colors.gray, textAlign: 'center', marginTop: 8 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  deviceCard: { backgroundColor: colors.white, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.lightGray },
  deviceCardActive: { borderColor: colors.accent, backgroundColor: '#f0faf4' },
  deviceIcon: { fontSize: 24 },
  deviceName: { fontSize: 14, fontWeight: '600', color: colors.text },
  deviceMac: { fontSize: 11, color: colors.gray, marginTop: 2 },
  deviceConnected: { fontSize: 13, color: colors.accent, fontWeight: '700' },
  deviceConnect: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  infoBox: { margin: 16, padding: 12, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.lightGray },
  infoText: { fontSize: 12, color: colors.gray, textAlign: 'center' },
});
