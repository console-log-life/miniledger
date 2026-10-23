import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#2457E6',
  primarySoft: '#EDF2FF',
  ink: '#15213A',
  inkSoft: '#34415B',
  muted: '#718096',
  faint: '#8994A8',
  border: '#E6EAF2',
  inputBorder: '#DCE2EC',
  page: '#F5F7FB',
  card: '#FFFFFF',
  success: '#13805B',
  successSoft: '#E6F7EF',
  danger: '#D63939',
  dangerSoft: '#FFF1F1',
  warning: '#B7791F',
};

export const shared = StyleSheet.create({
  label: { color: colors.inkSoft, fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 6 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  linkText: { color: colors.primary, fontWeight: '700', textAlign: 'center' },
});
