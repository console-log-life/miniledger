import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, type Loan, type Summary, type User } from '../api';
import { Banner, type BannerMessage } from '../components/Banner';
import { colors, shared } from '../theme';
import { addDays, confirmAction, formatDate, isoDate, isValidIsoDate, money } from '../utils';

type FieldErrors = Partial<Record<'friendName' | 'amount' | 'dueDate', string>>;

const DUE_DATE_PRESETS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

export function LedgerScreen({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: User;
  onLogout: (message?: BannerMessage) => void;
}) {
  const [tab, setTab] = useState<'home' | 'add'>('home');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<BannerMessage | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [friendName, setFriendName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  // Any 401 means the token is invalid or expired: return to the login screen.
  const handleError = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ApiError && error.status === 401) {
        onLogout({ tone: 'info', text: 'Your session has expired. Please log in again.' });
        return;
      }
      setMessage({ tone: 'error', text: (error as Error).message || fallback });
    },
    [onLogout],
  );

  const loadData = useCallback(async () => {
    const [loanData, summaryData] = await Promise.all([api.loans(token), api.summary(token)]);
    setLoans(loanData);
    setSummary(summaryData);
  }, [token]);

  const initialLoad = useCallback(async () => {
    setStatus('loading');
    try {
      await loadData();
      setStatus('ready');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return handleError(error, '');
      setLoadError((error as Error).message);
      setStatus('error');
    }
  }, [loadData, handleError]);

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadData();
      setStatus('ready');
    } catch (error) {
      handleError(error, 'Could not refresh.');
    } finally {
      setRefreshing(false);
    }
  }

  async function addLoan() {
    if (saving) return;
    const errors: FieldErrors = {};
    const numericAmount = Number(amount.replace(/,/g, ''));
    if (!friendName.trim()) errors.friendName = "Enter your friend's name.";
    else if (friendName.trim().length > 120) errors.friendName = 'Keep the name under 120 characters.';
    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Enter an amount greater than 0.';
    } else if (!/^\d+(\.\d{1,2})?$/.test(amount.replace(/,/g, '').trim())) {
      errors.amount = 'Use at most 2 decimal places.';
    } else if (numericAmount > 9_999_999_999.99) {
      errors.amount = 'That amount is too large.';
    }
    if (!isValidIsoDate(dueDate.trim())) errors.dueDate = 'Use a real date in YYYY-MM-DD format, e.g. 2026-11-15.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setMessage(null);
    try {
      const created = await api.addLoan(token, {
        friendName: friendName.trim(),
        amount: numericAmount,
        dueDate: dueDate.trim(),
      });
      setFriendName('');
      setAmount('');
      setDueDate('');
      await loadData();
      setStatus('ready');
      setTab('home');
      setMessage({ tone: 'success', text: `Saved: ${money(created.amount)} lent to ${created.friendName}.` });
    } catch (error) {
      handleError(error, 'Could not add the loan.');
    } finally {
      setSaving(false);
    }
  }

  async function markRepaid(loan: Loan) {
    if (pendingId) return;
    setPendingId(loan.id);
    setMessage(null);
    try {
      await api.markRepaid(token, loan.id);
      await loadData();
      setMessage({ tone: 'success', text: `${loan.friendName}'s loan marked as repaid.` });
    } catch (error) {
      handleError(error, 'Could not update the loan.');
    } finally {
      setPendingId(null);
    }
  }

  async function deleteLoan(loan: Loan) {
    if (pendingId) return;
    const confirmed = await confirmAction(
      'Delete loan?',
      `Remove the ${money(loan.amount)} loan to ${loan.friendName}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setPendingId(loan.id);
    setMessage(null);
    try {
      await api.deleteLoan(token, loan.id);
      await loadData();
      setMessage({ tone: 'success', text: 'Loan deleted.' });
    } catch (error) {
      handleError(error, 'Could not delete the loan.');
    } finally {
      setPendingId(null);
    }
  }

  const today = isoDate(new Date());
  const isOverdue = (loan: Loan) => !loan.repaid && loan.dueDate < today;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>YOUR PERSONAL FINANCE</Text>
          <Text style={styles.headerTitle}>MiniLedger</Text>
          <Text style={styles.headerPhone}>{user.phone}</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, refreshing && shared.buttonDisabled]}
          onPress={refresh}
          disabled={refreshing || status === 'loading'}
        >
          {refreshing ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.refreshText}>Refresh ↻</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(['home', 'add'] as const).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.activeTab]}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Text style={[styles.tabText, tab === key && styles.activeTabText]}>
              {key === 'home' ? 'Dashboard' : '+ Add loan'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Banner message={message} onDismiss={() => setMessage(null)} />

        {tab === 'home' ? (
          status === 'loading' ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateText}>Loading your ledger…</Text>
            </View>
          ) : status === 'error' ? (
            <View style={styles.stateCard}>
              <Text style={styles.emptyTitle}>Couldn't load your ledger</Text>
              <Text style={styles.emptyText}>{loadError}</Text>
              <TouchableOpacity style={shared.primaryButton} onPress={initialLoad}>
                <Text style={shared.primaryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Your overview</Text>
              <Text style={styles.sectionSubtitle}>A clear picture of money you've lent.</Text>

              <View style={styles.heroCard}>
                <Text style={styles.heroLabel}>OUTSTANDING</Text>
                <Text style={styles.heroAmount}>{money(summary?.outstandingAmount ?? 0)}</Text>
                <View style={styles.heroDivider} />
                <View style={styles.heroBottom}>
                  <View>
                    <Text style={styles.heroSmallLabel}>Total lent</Text>
                    <Text style={styles.heroSmallAmount}>{money(summary?.totalLent ?? 0)}</Text>
                  </View>
                  <View>
                    <Text style={styles.heroSmallLabel}>Repaid</Text>
                    <Text style={styles.heroSmallAmount}>{money(summary?.totalRepaid ?? 0)}</Text>
                  </View>
                  <View>
                    <Text style={styles.heroSmallLabel}>Overdue</Text>
                    <Text style={[styles.heroSmallAmount, (summary?.overdueAmount ?? 0) > 0 && styles.heroOverdue]}>
                      {money(summary?.overdueAmount ?? 0)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.listHeader}>
                <Text style={styles.sectionTitle}>Your loans</Text>
                <Text style={styles.count}>
                  {loans.length} {loans.length === 1 ? 'record' : 'records'}
                </Text>
              </View>

              {loans.length === 0 ? (
                <View style={styles.stateCard}>
                  <Text style={styles.emptyTitle}>No loans yet</Text>
                  <Text style={styles.emptyText}>Add your first loan to start tracking repayments.</Text>
                  <TouchableOpacity style={shared.primaryButton} onPress={() => setTab('add')}>
                    <Text style={shared.primaryButtonText}>+ Add your first loan</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                loans.map((loan) => {
                  const overdue = isOverdue(loan);
                  const busy = pendingId === loan.id;
                  return (
                    <View key={loan.id} style={[styles.loanCard, overdue && styles.overdueCard, loan.repaid && styles.repaidCard]}>
                      <View style={styles.loanTop}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{loan.friendName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.loanInfo}>
                          <Text style={styles.friendName} numberOfLines={1}>{loan.friendName}</Text>
                          <Text style={styles.dueDate}>Due {formatDate(loan.dueDate)}</Text>
                        </View>
                        <Text style={[styles.loanAmount, loan.repaid && styles.repaidAmount]}>{money(loan.amount)}</Text>
                      </View>
                      <View style={styles.loanBottom}>
                        <Text
                          style={[
                            styles.status,
                            loan.repaid ? styles.repaidStatus : overdue ? styles.overdueStatus : styles.pendingStatus,
                          ]}
                        >
                          {loan.repaid ? 'REPAID' : overdue ? 'OVERDUE' : 'PENDING'}
                        </Text>
                        <View style={styles.actions}>
                          {busy ? (
                            <ActivityIndicator color={colors.primary} />
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => deleteLoan(loan)}
                                disabled={!!pendingId}
                                accessibilityLabel={`Delete loan to ${loan.friendName}`}
                              >
                                <Text style={styles.deleteText}>Delete</Text>
                              </TouchableOpacity>
                              {!loan.repaid && (
                                <TouchableOpacity
                                  style={styles.repayButton}
                                  onPress={() => markRepaid(loan)}
                                  disabled={!!pendingId}
                                >
                                  <Text style={styles.repayText}>Mark repaid ✓</Text>
                                </TouchableOpacity>
                              )}
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )
        ) : (
          <>
            <Text style={styles.sectionTitle}>Add a loan</Text>
            <Text style={styles.sectionSubtitle}>Record money you've lent to a friend.</Text>

            <View style={styles.formCard}>
              <Text style={[shared.label, styles.firstLabel]}>Friend's name</Text>
              <TextInput
                style={[shared.input, fieldErrors.friendName && shared.inputError]}
                placeholder="e.g. Aarav Sharma"
                placeholderTextColor={colors.faint}
                value={friendName}
                onChangeText={setFriendName}
                maxLength={120}
                editable={!saving}
              />
              {fieldErrors.friendName && <Text style={shared.fieldError}>{fieldErrors.friendName}</Text>}

              <Text style={shared.label}>Amount (₹)</Text>
              <TextInput
                style={[shared.input, fieldErrors.amount && shared.inputError]}
                placeholder="e.g. 1500"
                placeholderTextColor={colors.faint}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                editable={!saving}
              />
              {fieldErrors.amount && <Text style={shared.fieldError}>{fieldErrors.amount}</Text>}

              <Text style={shared.label}>Due date (YYYY-MM-DD)</Text>
              <TextInput
                style={[shared.input, fieldErrors.dueDate && shared.inputError]}
                placeholder={addDays(30)}
                placeholderTextColor={colors.faint}
                value={dueDate}
                onChangeText={setDueDate}
                autoCapitalize="none"
                maxLength={10}
                editable={!saving}
              />
              <View style={styles.presets}>
                {DUE_DATE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.days}
                    style={styles.preset}
                    onPress={() => setDueDate(addDays(preset.days))}
                    disabled={saving}
                  >
                    <Text style={styles.presetText}>+{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {fieldErrors.dueDate && <Text style={shared.fieldError}>{fieldErrors.dueDate}</Text>}

              <TouchableOpacity
                style={[shared.primaryButton, saving && shared.buttonDisabled]}
                onPress={addLoan}
                disabled={saving}
              >
                {saving && <ActivityIndicator color="#FFFFFF" />}
                <Text style={shared.primaryButtonText}>{saving ? 'Saving…' : 'Save loan'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setTab('home')} style={styles.backLink}>
              <Text style={shared.linkText}>← Back to dashboard</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={() => onLogout()}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerEyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  headerTitle: { fontSize: 25, fontWeight: '800', color: colors.ink, marginTop: 4 },
  headerPhone: { color: colors.muted, fontSize: 12, marginTop: 2 },
  refreshButton: {
    backgroundColor: colors.primarySoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    minWidth: 92,
    alignItems: 'center',
  },
  refreshText: { color: colors.primary, fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  activeTab: { backgroundColor: colors.primary },
  tabText: { color: colors.muted, fontWeight: '700' },
  activeTabText: { color: '#FFFFFF' },
  content: { padding: 20, paddingBottom: 36 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: colors.ink, marginTop: 16 },
  sectionSubtitle: { color: colors.muted, marginTop: 5, marginBottom: 18 },
  centerState: { alignItems: 'center', paddingVertical: 60, gap: 14 },
  stateText: { color: colors.muted },
  heroCard: { backgroundColor: colors.primary, borderRadius: 22, padding: 22, marginBottom: 12 },
  heroLabel: { color: '#D9E4FF', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  heroAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', marginTop: 8 },
  heroDivider: { height: 1, backgroundColor: '#6589F0', marginVertical: 18 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  heroSmallLabel: { color: '#D9E4FF', fontSize: 12 },
  heroSmallAmount: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 5 },
  heroOverdue: { color: '#FFD3D3' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  count: { color: colors.muted, fontSize: 12, marginTop: 16 },
  stateCard: {
    padding: 24,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
  },
  emptyTitle: { fontSize: 18, color: colors.ink, fontWeight: '800' },
  emptyText: { color: colors.muted, lineHeight: 21, marginTop: 8 },
  loanCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overdueCard: { borderColor: '#F1A5A5', backgroundColor: '#FFF8F8' },
  repaidCard: { opacity: 0.75 },
  loanTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '800', fontSize: 18 },
  loanInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  friendName: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  dueDate: { color: colors.muted, fontSize: 12, marginTop: 4 },
  loanAmount: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  repaidAmount: { textDecorationLine: 'line-through', color: colors.muted },
  loanBottom: {
    borderTopWidth: 1,
    borderTopColor: '#EDF0F5',
    marginTop: 14,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 46,
  },
  status: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  repaidStatus: { color: colors.success },
  overdueStatus: { color: colors.danger },
  pendingStatus: { color: colors.warning },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  repayButton: { backgroundColor: colors.successSoft, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  repayText: { color: colors.success, fontWeight: '700', fontSize: 12 },
  deleteButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  formCard: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  firstLabel: { marginTop: 0 },
  presets: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  preset: { backgroundColor: colors.primarySoft, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  presetText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  backLink: { marginTop: 20 },
  logoutButton: { padding: 16, alignItems: 'center', marginTop: 12 },
  logoutText: { color: colors.muted, fontWeight: '700' },
});
