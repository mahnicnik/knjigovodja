import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { AuthContext, OrgContext } from '../lib/auth';
import { CartProvider } from '../lib/cart';
import { colors } from '../lib/colors';
import { router } from 'expo-router';

export default function RootLayout() {
  const [auth, setAuth] = useState<OrgContext | null>(null);
  const [ready, setReady] = useState(false);

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

  useEffect(() => {
    if (!ready) return;
    if (auth) {
      router.replace('/pin');
    } else {
      router.replace('/login');
    }
  }, [ready, auth]);

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadOrg(session.user.id);
    } else {
      setReady(true);
    }
  }

  async function loadOrg(userId: string) {
    const { data } = await supabase
      .from('org_members')
      .select('org_id, role, organizations(id, name, pos_business_id)')
      .eq('user_id', userId)
      .limit(1)
      .single();
    if (data) {
      const org = data.organizations as any;
      setAuth({
        userId,
        orgId: data.org_id,
        businessId: org?.pos_business_id || data.org_id,
        orgName: org?.name || '',
        role: data.role,
      });
    }
    setReady(true);
  }

  return (
    <CartProvider>
      <AuthContext.Provider value={auth}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
        {!ready && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.brand} size="large" />
          </View>
        )}
      </AuthContext.Provider>
    </CartProvider>
  );
}
