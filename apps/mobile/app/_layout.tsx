import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { AuthContext, OrgContext } from '../lib/auth';
import { colors } from '../lib/colors';
import { router } from 'expo-router';

export default function RootLayout() {
  const [auth, setAuth] = useState<OrgContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setAuth(null);
        router.replace('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadOrg(session.user.id);
    } else {
      setLoading(false);
      router.replace('/login');
    }
  }

  async function loadOrg(userId: string) {
    const { data } = await supabase
      .from('org_members')
      .select('org_id, role, organizations(id, name)')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (data) {
      const org = data.organizations as any;
      setAuth({
        userId,
        orgId: data.org_id,
        orgName: org?.name || '',
        role: data.role,
      });
      router.replace('/pin');
    } else {
      router.replace('/login');
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthContext.Provider>
  );
}
