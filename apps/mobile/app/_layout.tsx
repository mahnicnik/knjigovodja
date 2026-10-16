import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { AuthContext, OrgContext, PodjetjaContext } from '../lib/auth';
import { CartProvider } from '../lib/cart';
import { colors } from '../lib/colors';
import { router } from 'expo-router';
import {
  Clanstvo, clanstvaZaBlagajno, izberiSamodejno, vKontekst,
  preberiIzbiro, shraniIzbiro, pobrisiIzbiro,
} from '../lib/podjetja';

export default function RootLayout() {
  const [auth, setAuth] = useState<OrgContext | null>(null);
  const [ready, setReady] = useState(false);
  // Clanstva, med katerimi uporabnik izbira (lib/podjetja.ts). Pri vec kot
  // enem in brez veljavne shranjene izbire se odpre /izberi-podjetje.
  const [clanstva, setClanstva] = useState<Clanstvo[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const nalozen = useRef<string | null>(null);

  useEffect(() => {
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        nalozen.current = null;
        pobrisiIzbiro();
        setClanstva([]);
        setUserId(null);
        setAuth(null);
        router.replace('/login');
      }
      // POPRAVLJENO (16.10.2026): po prijavi v aplikaciji se organizacija ni
      // nalozila - poslusali smo samo SIGNED_OUT, zato je login ostal na
      // zaslonu do ponovnega zagona. setTimeout: Supabase odsvetuje klice
      // baze neposredno v tem povratnem klicu (lahko zaklene sejo).
      if (event === 'SIGNED_IN' && session?.user && nalozen.current !== session.user.id) {
        const id = session.user.id;
        setTimeout(() => { loadOrg(id); }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (auth) {
      router.replace('/pin');
    } else if (clanstva.length > 1) {
      router.replace('/izberi-podjetje');
    } else {
      router.replace('/login');
    }
  }, [ready, auth, clanstva]);

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadOrg(session.user.id);
    } else {
      setReady(true);
    }
  }

  async function loadOrg(id: string) {
    nalozen.current = id;
    // POPRAVLJENO (16.10.2026): prej `.limit(1).single()` - pri vec clanstvih
    // je bila blagajna vedno ista (lib/podjetja.ts).
    const { data } = await supabase
      .from('org_members')
      .select('org_id, role, created_at, organizations(id, name, pos_business_id, address, city, post_code, tax_number, iban)')
      .eq('user_id', id)
      .order('created_at', { ascending: true });

    const izbira = clanstvaZaBlagajno((data ?? []) as unknown as Clanstvo[]);
    const shranjen = await preberiIzbiro();
    const samodejno = izberiSamodejno(izbira, shranjen);
    if (!samodejno && shranjen) await pobrisiIzbiro();

    setUserId(id);
    setClanstva(izbira);
    setAuth(samodejno ? vKontekst(id, samodejno) : null);
    setReady(true);
  }

  const izberi = useCallback(async (orgId: string) => {
    const c = clanstva.find((x) => x.org_id === orgId);
    if (!c || !userId) return;
    await shraniIzbiro(orgId);
    setAuth(vKontekst(userId, c));
    // Ce je bila izbrana ista organizacija, se auth ne spremeni po vsebini,
    // je pa nov objekt - zgornji effect vseeno odpre /pin.
  }, [clanstva, userId]);

  const zamenjaj = useCallback(() => {
    // Zapri zaslone nad prvim (blagajna, nastavitve), nato izbira. auth ostane
    // nastavljen, dokler uporabnik ne izbere - odprti zasloni ne ostanejo brez
    // organizacije.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/izberi-podjetje');
  }, []);

  const podjetja = useMemo(() => ({ clanstva, izberi, zamenjaj }), [clanstva, izberi, zamenjaj]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* orgId: menjava podjetja pobrise kosarice in aktivno mizo prejsnjega */}
      <CartProvider orgId={auth?.orgId}>
        <PodjetjaContext.Provider value={podjetja}>
          <AuthContext.Provider value={auth}>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }} />
            {!ready && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.brand} size="large" />
              </View>
            )}
          </AuthContext.Provider>
        </PodjetjaContext.Provider>
      </CartProvider>
    </SafeAreaProvider>
  );
}
