import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './colors';

/**
 * Ovoj zaslona z varnimi odmiki (16.10.2026).
 *
 * NAPAKA: zasloni so uporabljali SafeAreaView iz 'react-native', ki na
 * Androidu nima ucinka (deluje samo na iOS), Expo 56 pa na Androidu rise cez
 * cel zaslon. Glava z gumbom "← Nazaj" je zato zlezla pod statusno vrstico
 * in se je ni dalo pritisniti (Nastavitve, Naročila). Nekateri zasloni so si
 * pomagali s `paddingTop: StatusBar.currentHeight`, ki pa ne uposteva
 * izreza kamere, navigacijske vrstice spodaj in lezecega telefona.
 *
 * Pas pod statusno vrstico je v barvi glave (`vrh`), da je bel tekst
 * statusne vrstice (StatusBar style="light") berljiv. Spodaj in ob straneh
 * zaslon ne gre pod navigacijsko vrstico oziroma izrez.
 */
export function Zaslon({
  children,
  style,
  vrh = colors.header,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  vrh?: string;
}) {
  const insets = useSafeAreaInsets();
  const ozadje = StyleSheet.flatten(style)?.backgroundColor ?? colors.bg;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: ozadje,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View style={{ height: insets.top, backgroundColor: vrh }} />
      <View style={[style, { flex: 1 }]}>{children}</View>
    </View>
  );
}

/** Spodnji odmik za liste (sheet) v Modal oknih - gumbi ne pod navigacijsko vrstico. */
export function useSpodnjiOdmik(): { paddingBottom: number } {
  return { paddingBottom: useSafeAreaInsets().bottom };
}

/** Vecja tarca za majhne gumbe v glavi (vsaj ~44 dp). */
export const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };
