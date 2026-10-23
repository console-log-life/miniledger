import { Platform } from 'react-native';

export type User = { id: string; phone: string };

export type Loan = {
  id: string;
  friendName: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  repaid: boolean;
  repaidAt: string | null;
  createdAt: string;
};

export type Summary = {
  totalLent: number;
  totalRepaid: number;
  outstandingAmount: number;
  overdueAmount: number;
  loanCount: number;
};

export type OtpRequestResult = {
  message: string;
  phone: string;
  expiresInSeconds: number;
  devOtp?: string;
};

// Resolution order:
// 1. EXPO_PUBLIC_API_URL (set in mobile/.env.local), e.g. a deployed API.
// 2. On the web in GitHub Codespaces, swap the frontend port in the
//    forwarded hostname for 3000 (…-8081.app.github.dev → …-3000.app.github.dev).
// 3. On the web elsewhere, the same host on port 3000.
// 4. Native fallback: localhost:3000 (use EXPO_PUBLIC_API_URL with your LAN IP on a device).
function resolveApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const codespace = hostname.match(/^(.+)-\d+\.(app\.github\.dev)$/);
    if (codespace) return `${protocol}//${codespace[1]}-3000.${codespace[2]}`;
    return `${protocol}//${hostname}:3000`;
  }
  return 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // fetch only rejects on network/CORS failures (including a private
    // Codespaces port redirecting to GitHub sign-in) or our timeout.
    throw new ApiError(
      `Can't reach the MiniLedger API at ${API_URL}. Make sure the backend is running` +
        (API_URL.includes('github.dev') ? ' and port 3000 is set to Public in the Ports tab.' : '.'),
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(`Unexpected response from the API (HTTP ${response.status}).`, response.status);
  }

  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (HTTP ${response.status}).`, response.status);
  }
  return data as T;
}

export const api = {
  requestOtp: (phone: string) =>
    request<OtpRequestResult>('/api/auth/request-otp', { method: 'POST', body: { phone } }),
  verifyOtp: (phone: string, otp: string) =>
    request<{ token: string; user: User }>('/api/auth/verify-otp', { method: 'POST', body: { phone, otp } }),
  me: (token: string) => request<{ user: User }>('/api/auth/me', { token }),
  loans: (token: string) => request<Loan[]>('/api/loans', { token }),
  summary: (token: string) => request<Summary>('/api/summary', { token }),
  addLoan: (token: string, loan: { friendName: string; amount: number; dueDate: string }) =>
    request<Loan>('/api/loans', { method: 'POST', body: loan, token }),
  markRepaid: (token: string, id: string) =>
    request<Loan>(`/api/loans/${id}/repay`, { method: 'PATCH', token }),
  deleteLoan: (token: string, id: string) =>
    request<void>(`/api/loans/${id}`, { method: 'DELETE', token }),
};
