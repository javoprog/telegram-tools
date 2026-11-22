import type {
  Account,
  ChatDialog,
  ChatTypeFilter,
  LogListResponse,
  Rule,
  RuleCreate,
  RuleUpdate,
  TelegramAuthResponse,
} from '../types';

const API_BASE = '/api';

interface ValidationIssue {
  msg?: string;
}

interface ApiErrorBody {
  detail?: string | ValidationIssue[];
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function readErrorMessage(body: ApiErrorBody, fallback: string): string {
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    const messages = body.detail.map((issue) => issue.msg).filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }
  return fallback;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      readErrorMessage(body, response.statusText || 'Запрос не выполнен'),
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function withQuery(endpoint: string, values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

export const api = {
  getAccount: () => request<Account | null>('/auth/telegram/account'),
  requestCode: (phoneNumber: string) =>
    request<TelegramAuthResponse>('/auth/telegram/request-code', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber }),
    }),
  verifyCode: (phoneNumber: string, code: string) =>
    request<TelegramAuthResponse>('/auth/telegram/verify-code', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber, code }),
    }),
  verify2FA: (phoneNumber: string, password: string) =>
    request<TelegramAuthResponse>('/auth/telegram/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber, password }),
    }),
  disconnectAccount: (accountId: number) =>
    request<{ status: string; account_id: number }>(`/auth/telegram/disconnect/${accountId}`, {
      method: 'POST',
    }),

  getDialogs: ({ refresh, ...params }: { query?: string; chat_type?: ChatTypeFilter; refresh?: boolean } = {}) =>
    request<{ total: number; chats: ChatDialog[] }>(
      withQuery('/chats/dialogs', { ...params, refresh: refresh ? 'true' : undefined }),
    ),

  getRules: () => request<Rule[]>('/rules/'),
  getRule: (id: number) => request<Rule>(`/rules/${id}`),
  createRule: (rule: RuleCreate) =>
    request<Rule>('/rules/', { method: 'POST', body: JSON.stringify(rule) }),
  updateRule: (id: number, rule: RuleUpdate) =>
    request<Rule>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(rule) }),
  toggleRule: (id: number) => request<Rule>(`/rules/${id}/toggle`, { method: 'PATCH' }),
  deleteRule: (id: number) =>
    request<{ status: string; id: number }>(`/rules/${id}`, { method: 'DELETE' }),

  getLogs: (params: { page?: number; page_size?: number; rule_id?: number; query?: string } = {}) =>
    request<LogListResponse>(withQuery('/logs/', params)),
  clearLogs: () => request<{ status: string }>('/logs/clear', { method: 'DELETE' }),
};
