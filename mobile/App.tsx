import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, type User } from './src/api';
import type { BannerMessage } from './src/components/Banner';
import { LedgerScreen } from './src/screens/LedgerScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { colors } from './src/theme';

const SESSION_KEY = 'miniledger.session';

type Session = { token: string; user: User };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [loginMessage, setLoginMessage] = useState<BannerMessage | null>(null);

  // Restore a saved session, discarding it if the API rejects the token.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SESSION_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved) as Session;
        try {
          const { user } = await api.me(parsed.token);
          setSession({ token: parsed.token, user });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await AsyncStorage.removeItem(SESSION_KEY);
            setLoginMessage({ tone: 'info', text: 'Your session has expired. Please log in again.' });
          } else {
            // API unreachable: keep the session; the dashboard shows the error and a retry.
            setSession(parsed);
          }
        }
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const handleLoggedIn = useCallback((token: string, user: User) => {
    const next = { token, user };
    setSession(next);
    setLoginMessage(null);
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const handleLogout = useCallback((message?: BannerMessage) => {
    setSession(null);
    setLoginMessage(message ?? null);
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.frame}>
          {restoring ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : session ? (
            <LedgerScreen token={session.token} user={session.user} onLogout={handleLogout} />
          ) : (
            <LoginScreen initialMessage={loginMessage} onLoggedIn={handleLoggedIn} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  // Keeps the layout phone-sized and centred on wide browser windows.
  frame: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
