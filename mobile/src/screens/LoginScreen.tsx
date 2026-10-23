import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, type User } from '../api';
import { Banner, type BannerMessage } from '../components/Banner';
import { colors, shared } from '../theme';

const RESEND_COOLDOWN_SECONDS = 30;
const normalizePhone = (value: string) => value.replace(/[\s()-]/g, '');

export function LoginScreen({
  initialMessage,
  onLoggedIn,
}: {
  initialMessage: BannerMessage | null;
  onLoggedIn: (token: string, user: User) => void;
}) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<BannerMessage | null>(initialMessage);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function requestOtp() {
    if (loading) return;
    const cleaned = normalizePhone(phone);
    if (!/^\+?[0-9]{10,15}$/.test(cleaned)) {
      setMessage({ tone: 'error', text: 'Enter a valid phone number (10–15 digits, optional +).' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await api.requestOtp(cleaned);
      setPhone(result.phone);
      setDevOtp(result.devOtp ?? null);
      setOtp('');
      setStep('otp');
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setMessage({
        tone: 'success',
        text: `OTP generated for ${result.phone}. It is valid for ${Math.round(result.expiresInSeconds / 60)} minutes — ` +
          'find the 6-digit code in the backend terminal ([DEMO OTP] line).',
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 429 && step === 'otp') {
        setMessage({ tone: 'info', text: error.message });
      } else {
        setMessage({ tone: 'error', text: (error as Error).message });
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (loading) return;
    if (!/^[0-9]{6}$/.test(otp.trim())) {
      setMessage({ tone: 'error', text: 'Enter the 6-digit OTP.' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const { token, user } = await api.verifyOtp(phone, otp.trim());
      onLoggedIn(token, user);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
      setOtp('');
      setLoading(false);
    }
  }

  function changeNumber() {
    setStep('phone');
    setOtp('');
    setDevOtp(null);
    setMessage(null);
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>M</Text>
        </View>
        <Text style={styles.brand}>MiniLedger</Text>
        <Text style={styles.subtitle}>Keep track. Stay connected.</Text>

        {step === 'phone' ? (
          <>
            <Text style={shared.label}>Phone number</Text>
            <TextInput
              style={shared.input}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={colors.faint}
              keyboardType="phone-pad"
              autoComplete="tel"
              value={phone}
              onChangeText={setPhone}
              onSubmitEditing={requestOtp}
              editable={!loading}
            />
            <TouchableOpacity
              style={[shared.primaryButton, loading && shared.buttonDisabled]}
              onPress={requestOtp}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading && <ActivityIndicator color="#FFFFFF" />}
              <Text style={shared.primaryButtonText}>{loading ? 'Sending…' : 'Get demo OTP'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={shared.label}>6-digit OTP sent to {phone}</Text>
            <TextInput
              style={[shared.input, styles.otpInput]}
              placeholder="••••••"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/[^0-9]/g, ''))}
              onSubmitEditing={verifyOtp}
              editable={!loading}
              autoFocus
            />
            {devOtp && (
              <TouchableOpacity style={styles.devOtp} onPress={() => setOtp(devOtp)}>
                <Text style={styles.devOtpText}>
                  Dev mode OTP: <Text style={styles.devOtpCode}>{devOtp}</Text> · tap to fill
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[shared.primaryButton, loading && shared.buttonDisabled]}
              onPress={verifyOtp}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading && <ActivityIndicator color="#FFFFFF" />}
              <Text style={shared.primaryButtonText}>{loading ? 'Verifying…' : 'Verify and log in'}</Text>
            </TouchableOpacity>
            <View style={styles.secondaryRow}>
              <TouchableOpacity onPress={changeNumber} disabled={loading}>
                <Text style={shared.linkText}>← Change number</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={requestOtp} disabled={loading || resendIn > 0}>
                <Text style={[shared.linkText, resendIn > 0 && styles.disabledLink]}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Banner message={message} onDismiss={() => setMessage(null)} />

        <Text style={styles.note}>
          Demo assessment app · no SMS is sent; the OTP is printed in the backend terminal
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.card,
    padding: 26,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  logoText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  brand: { fontSize: 30, fontWeight: '800', color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 14 },
  otpInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center', fontWeight: '700' },
  devOtp: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#F3D58B',
  },
  devOtpText: { color: '#7A5200', fontSize: 12, textAlign: 'center' },
  devOtpCode: { fontWeight: '800', letterSpacing: 2 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  disabledLink: { color: colors.faint },
  note: { color: colors.faint, fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 17 },
});
