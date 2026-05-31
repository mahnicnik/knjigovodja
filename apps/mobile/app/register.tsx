import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/colors';

export default function RegisterScreen() {
  const [orgName, setOrgName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function register() {
    if (!orgName || !email || !password || !fullName) {
      Alert.alert('Napaka', 'Izpolni vsa obvezna polja');
      return;
    }
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (authError || !authData.user) throw authError;

      const userId = authData.user.id;

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: orgName, tax_number: taxNumber, email })
        .select()
        .single();

      if (orgError || !org) throw orgError;

      await supabase.from('org_members').insert({
        org_id: org.id,
        user_id: userId,
        role: 'owner',
      });

      await supabase.from('user_profiles').insert({
        id: userId,
        full_name: fullName,
        email,
        onboarding_done: false,
      });

      Alert.alert('Uspeh', 'Račun ustvarjen! Preveri email za potrditev.');
      router.replace('/login');
    } catch (e: any) {
      Alert.alert('Napaka', e?.message || 'Registracija ni uspela');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.header }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>Računko POS</Text>
        <Text style={styles.subtitle}>Registracija</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Ime podjetja *</Text>
          <TextInput style={styles.input} placeholder="npr. Kavarna Miha d.o.o." placeholderTextColor={colors.gray} value={orgName} onChangeText={setOrgName} />

          <Text style={styles.label}>Davčna številka</Text>
          <TextInput style={styles.input} placeholder="SI12345678" placeholderTextColor={colors.gray} value={taxNumber} onChangeText={setTaxNumber} keyboardType="numeric" />

          <Text style={styles.label}>Tvoje ime *</Text>
          <TextInput style={styles.input} placeholder="Ime Priimek" placeholderTextColor={colors.gray} value={fullName} onChangeText={setFullName} />

          <Text style={styles.label}>Email *</Text>
          <TextInput style={styles.input} placeholder="email@podjetje.si" placeholderTextColor={colors.gray} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

          <Text style={styles.label}>Geslo *</Text>
          <TextInput style={styles.input} placeholder="Min. 8 znakov" placeholderTextColor={colors.gray} value={password} onChangeText={setPassword} secureTextEntry />

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 16 }} />
          ) : (
            <TouchableOpacity style={styles.btn} onPress={register}>
              <Text style={styles.btnText}>Ustvari račun</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backText}>Nazaj na prijavo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 60 },
  logo: { fontSize: 28, fontWeight: 'bold', color: colors.brand, marginBottom: 4 },
  subtitle: { fontSize: 18, color: colors.white, opacity: 0.7, marginBottom: 32 },
  form: { width: '100%', maxWidth: 360 },
  label: { color: colors.white, opacity: 0.8, fontSize: 13, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 14,
    color: colors.white,
    fontSize: 15,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  btnText: { color: colors.header, fontWeight: 'bold', fontSize: 16 },
  backLink: { marginTop: 20, alignItems: 'center' },
  backText: { color: colors.brand, opacity: 0.8, fontSize: 14 },
});
