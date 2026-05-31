import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import React from 'react';

export function App() {
  const ctx = require.context('./app');
  return React.createElement(ExpoRoot, { context: ctx });
}

registerRootComponent(App);
