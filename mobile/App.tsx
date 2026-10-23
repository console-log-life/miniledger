
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// Replace this with your Codespaces forwarded port 3000 URL.
const API_URL = 'https://scaling-robot-976vpvqp79xgc9567-3000.app.github.dev';

type Loan = {
  id: string | number;
  friendName: string;
  amount: number;
  dueDate: string;
  repaid: boolean;
};

type Summary = {
  totalLent: number;
  totalRepaid: number;
  overdueAmount: number;
};

const money = (amount: number) =>
  '₹' + Number(amount || 0).toLocaleString('en-IN');

export default function App() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [screen, setScreen] = useState<'home' | 'add'>('home');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalLent: 0,
    totalRepaid: 0,
    overdueAmount: 0,
  });
  const [friendName, setFriendName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    if (!/^\+?[0-9]{10,15}$/.test(phone.trim())) {
      Alert.alert('Invalid phone', 'Enter a valid phone number.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not request OTP');
      setOtpSent(true);
      Alert.alert(
        'Demo OTP requested',
        'Check the backend server terminal for the 6-digit OTP.',
      );
    } catch (error) {
      Alert.alert('Connection error', String(error));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invalid OTP');
      setLoggedIn(true);
      await loadData();
    } catch (error) {
      Alert.alert('Login failed', String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadData() {
    try {
      const [loansResponse, summaryResponse] = await Promise.all([
        fetch(`${API_URL}/api/loans`),
        fetch(`${API_URL}/api/summary`),
      ]);

      if (!loansResponse.ok || !summaryResponse.ok) {
        throw new Error('Unable to load dashboard data');
      }

      const loanData = await loansResponse.json();
      const summaryData = await summaryResponse.json();
      setLoans(loanData);
      setSummary(summaryData);
    } catch (error) {
      Alert.alert('Could not load data', String(error));
    }
  }

  useEffect(() => {
    if (loggedIn) loadData();
  }, [loggedIn]);

  async function addLoan() {
    const numericAmount = Number(amount);

    if (!friendName.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid details', 'Enter a name and a positive amount.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        Number.isNaN(Date.parse(`${dueDate}T00:00:00`))) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format, e.g. 2026-11-15.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendName: friendName.trim(),
          amount: numericAmount,
          dueDate,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add loan');

      setFriendName('');
      setAmount('');
      setDueDate('');
      await loadData();
      setScreen('home');
      Alert.alert('Success', 'Loan added successfully!');
    } catch (error) {
      Alert.alert('Could not add loan', String(error));
    } finally {
      setLoading(false);
    }
  }

  async function markRepaid(id: string | number) {
    try {
      const response = await fetch(`${API_URL}/api/loans/${id}/repay`, {
        method: 'PATCH',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update loan');
      await loadData();
    } catch (error) {
      Alert.alert('Update failed', String(error));
    }
  }

  const isOverdue = (loan: Loan) =>
    !loan.repaid &&
    new Date(loan.dueDate).getTime() <
      new Date(new Date().toDateString()).getTime();

  if (!loggedIn) {
    return (
      <SafeAreaView style={styles.loginPage}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loginCard}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>M</Text>
          </View>
          <Text style={styles.brand}>MiniLedger</Text>
          <Text style={styles.subtitle}>Keep track. Stay connected.</Text>

          {!otpSent ? (
            <>
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your phone number"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={requestOtp}
                disabled={loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Please wait...' : 'Get demo OTP'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>6-digit OTP</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter OTP from server terminal"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
              />
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={verifyOtp}
                disabled={loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Verifying...' : 'Verify and login'}
                </Text>
              </TouchableOpacity>
            </>
          )}
          {loading && <ActivityIndicator style={styles.loader} />}
          <Text style={styles.note}>
            Demo assessment app · OTP appears in backend logs
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>YOUR PERSONAL FINANCE</Text>
          <Text style={styles.headerTitle}>MiniLedger</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadData}
        >
          <Text style={styles.refreshText}>Refresh ↻</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, screen === 'home' && styles.activeTab]}
          onPress={() => setScreen('home')}
        >
          <Text style={[styles.tabText, screen === 'home' && styles.activeTabText]}>
            Dashboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, screen === 'add' && styles.activeTab]}
          onPress={() => setScreen('add')}
        >
          <Text style={[styles.tabText, screen === 'add' && styles.activeTabText]}>
            + Add loan
          </Text>
        </TouchableOpacity>
      </View>

      {screen === 'home' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Your overview</Text>
          <Text style={styles.sectionSubtitle}>
            A clear picture of money you've lent.
          </Text>

          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>TOTAL LENT</Text>
            <Text style={styles.heroAmount}>{money(summary.totalLent)}</Text>
            <View style={styles.heroDivider} />
            <View style={styles.heroBottom}>
              <View>
                <Text style={styles.heroSmallLabel}>Repaid</Text>
                <Text style={styles.heroSmallAmount}>
                  {money(summary.totalRepaid)}
                </Text>
              </View>
              <View>
                <Text style={styles.heroSmallLabel}>Overdue</Text>
                <Text style={styles.heroSmallAmount}>
                  {money(summary.overdueAmount)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Your loans</Text>
            <Text style={styles.count}>{loans.length} records</Text>
          </View>

          {loans.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No loans yet</Text>
              <Text style={styles.emptyText}>
                Add your first loan to start tracking repayments.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setScreen('add')}
              >
                <Text style={styles.primaryButtonText}>+ Add your first loan</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={loans}
              scrollEnabled={false}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.loanCard,
                    isOverdue(item) && styles.overdueCard,
                  ]}
                >
                  <View style={styles.loanTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {item.friendName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.loanInfo}>
                      <Text style={styles.friendName}>{item.friendName}</Text>
                      <Text style={styles.dueDate}>
                        Due {String(item.dueDate).slice(0, 10)}
                      </Text>
                    </View>
                    <Text style={styles.loanAmount}>{money(item.amount)}</Text>
                  </View>
                  <View style={styles.loanBottom}>
                    <Text
                      style={[
                        styles.status,
                        item.repaid
                          ? styles.repaidStatus
                          : isOverdue(item)
                          ? styles.overdueStatus
                          : styles.pendingStatus,
                      ]}
                    >
                      {item.repaid ? 'REPAID' : isOverdue(item) ? 'OVERDUE' : 'PENDING'}
                    </Text>
                    {!item.repaid && (
                      <TouchableOpacity
                        style={styles.repayButton}
                        onPress={() => markRepaid(item.id)}
                      >
                        <Text style={styles.repayText}>Mark repaid ✓</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            />
          )}
          <TouchableOpacity style={styles.logoutButton} onPress={() => {
            setLoggedIn(false);
            setOtpSent(false);
            setOtp('');
          }}>
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Add a loan</Text>
          <Text style={styles.sectionSubtitle}>
            Record money you've lent to a friend.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Friend's name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Aarav Sharma"
              value={friendName}
              onChangeText={setFriendName}
            />

            <Text style={styles.label}>Amount (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1500"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.label}>Due date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="2026-11-15"
              value={dueDate}
              onChangeText={setDueDate}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={addLoan}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Saving...' : 'Save loan'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setScreen('home')}>
            <Text style={styles.backText}>← Back to dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7FB' },
  loginPage: {
    flex: 1,
    backgroundColor: '#F5F7FB',
    justifyContent: 'center',
    padding: 24,
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    padding: 26,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E6EAF2',
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#2457E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  logoText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  brand: { fontSize: 30, fontWeight: '800', color: '#15213A' },
  subtitle: { color: '#718096', fontSize: 14, marginTop: 6, marginBottom: 28 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerEyebrow: {
    color: '#718096',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  headerTitle: { fontSize: 25, fontWeight: '800', color: '#15213A', marginTop: 4 },
  refreshButton: { backgroundColor: '#EDF2FF', padding: 10, borderRadius: 12 },
  refreshText: { color: '#2457E6', fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 14,
  },
  tab: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  activeTab: { backgroundColor: '#2457E6' },
  tabText: { color: '#718096', fontWeight: '700' },
  activeTabText: { color: '#FFFFFF' },
  content: { padding: 20, paddingBottom: 36 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: '#15213A' },
  sectionSubtitle: { color: '#718096', marginTop: 5, marginBottom: 18 },
  heroCard: {
    backgroundColor: '#2457E6',
    borderRadius: 22,
    padding: 22,
    marginBottom: 28,
  },
  heroLabel: { color: '#D9E4FF', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  heroAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', marginTop: 8 },
  heroDivider: { height: 1, backgroundColor: '#6589F0', marginVertical: 18 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  heroSmallLabel: { color: '#D9E4FF', fontSize: 12 },
  heroSmallAmount: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 5 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  count: { color: '#718096', fontSize: 12 },
  emptyCard: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E6EAF2',
  },
  emptyTitle: { fontSize: 18, color: '#15213A', fontWeight: '800' },
  emptyText: { color: '#718096', lineHeight: 21, marginTop: 8, marginBottom: 18 },
  loanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6EAF2',
  },
  overdueCard: { borderColor: '#F1A5A5', backgroundColor: '#FFF8F8' },
  loanTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EDF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#2457E6', fontWeight: '800', fontSize: 18 },
  loanInfo: { flex: 1, marginLeft: 12 },
  friendName: { color: '#15213A', fontWeight: '800', fontSize: 15 },
  dueDate: { color: '#718096', fontSize: 12, marginTop: 4 },
  loanAmount: { color: '#15213A', fontSize: 16, fontWeight: '800' },
  loanBottom: {
    borderTopWidth: 1,
    borderTopColor: '#EDF0F5',
    marginTop: 14,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  status: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  repaidStatus: { color: '#13805B' },
  overdueStatus: { color: '#D63939' },
  pendingStatus: { color: '#B7791F' },
  repayButton: { backgroundColor: '#E6F7EF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  repayText: { color: '#13805B', fontWeight: '700', fontSize: 12 },
  formCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6EAF2',
  },
  label: { color: '#34415B', fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#DCE2EC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#15213A',
    backgroundColor: '#FFFFFF',
  },
  primaryButton: {
    backgroundColor: '#2457E6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  loader: { marginTop: 14 },
  note: { color: '#8994A8', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 17 },
  backText: { color: '#2457E6', textAlign: 'center', fontWeight: '700', marginTop: 20 },
  logoutButton: { padding: 16, alignItems: 'center' },
  logoutText: { color: '#718096', fontWeight: '700' },
});
