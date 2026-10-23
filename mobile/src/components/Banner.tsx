import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme';

export type BannerMessage = { tone: 'error' | 'success' | 'info'; text: string };

const tones = {
  error: { background: colors.dangerSoft, border: '#F1A5A5', text: '#9B1C1C' },
  success: { background: colors.successSoft, border: '#9AD9BF', text: '#0E5E43' },
  info: { background: colors.primarySoft, border: '#BCCCF7', text: '#1B3FA6' },
};

// Inline status message. Used instead of Alert.alert, which does nothing on the web.
export function Banner({ message, onDismiss }: { message: BannerMessage | null; onDismiss?: () => void }) {
  if (!message) return null;
  const tone = tones[message.tone];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: tone.background, borderColor: tone.border }]}
    >
      <Text style={[styles.text, { color: tone.text }]}>{message.text}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} accessibilityLabel="Dismiss message" hitSlop={10}>
          <Text style={[styles.close, { color: tone.text }]}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  close: { fontSize: 14, fontWeight: '800' },
});
