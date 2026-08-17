/**
 * Novelka Admin Control Plane API Client.
 *
 * All requests communicate with the server-side `/api/admin/*` endpoints
 * requiring `Authorization: Bearer <owner-jwt>`.
 */

export interface AdminApiError {
  status: number;
  message: string;
  code?: string;
  isAuthError?: boolean;
  isForbidden?: boolean;
  isNetworkError?: boolean;
}

export interface AdminOverviewMetrics {
  totalUsers: number;
  tierBreakdown: {
    free: number;
    basic: number;
    pro: number;
    enterprise: number;
  };
  activeSubscriptions: number;
  templates: {
    published: number;
    draft: number;
    unpublished: number;
    archived: number;
  };
  dailyExportsToday: number;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  displayName: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  isOwner: boolean;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFeatureFlag {
  featureId: string;
  enabled: boolean;
  routeFree: boolean;
  routeAd: boolean;
  routePaid: boolean;
  minTier: 'free' | 'basic' | 'pro' | 'enterprise';
  dailyLimit: number | null;
  adUnlockMinutes: number | null;
  note: string;
  updatedAt: string;
}

export interface AdminTemplateRecord {
  templateId: string;
  version: string;
  name: string;
  description: string;
  generatorKinds: string[];
  supportedSizes: string[];
  schemaPayload: Record<string, unknown>;
  styleTokens: Record<string, unknown>;
  status: 'draft' | 'published' | 'unpublished' | 'archived';
  accessLevel: 'free' | 'basic' | 'pro' | 'enterprise';
  createdBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLogRecord {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeState: unknown;
  afterState: unknown;
  ipAddress: string;
  requestId: string;
  reason: string;
  createdAt: string;
}

async function request<T>(
  path: string,
  token: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.trim()}`,
    ...(options.headers ?? {}),
  };

  const reqInit: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };

  if (options.body !== undefined) {
    reqInit.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url, reqInit);
  } catch {
    const error: AdminApiError = {
      status: 0,
      message: 'Cannot connect to Novelka server. Network error or server unavailable.',
      isNetworkError: true,
    };
    throw error;
  }

  let json: Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    json = { error: `Server returned status ${res.status}` };
  }

  if (!res.ok) {
    const error: AdminApiError = {
      status: res.status,
      message: String(json.error || json.message || `Request failed with status ${res.status}`),
      code: typeof json.code === 'string' ? json.code : undefined,
      isAuthError: res.status === 401,
      isForbidden: res.status === 403,
    };
    throw error;
  }

  return json as T;
}

export const adminApi = {
  getOverview(token: string) {
    return request<{ ok: boolean; metrics: AdminOverviewMetrics }>('/api/admin/overview', token);
  },

  getUsers(token: string, limit = 50, offset = 0, search = '') {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search.trim()) params.set('search', search.trim());
    return request<{ ok: boolean; users: AdminUserRecord[]; total: number }>(
      `/api/admin/users?${params.toString()}`,
      token,
    );
  },

  updateUserTier(token: string, userId: string, tier: string, reason: string) {
    return request<{
      ok: boolean;
      userId: string;
      previousTier: string;
      newTier: string;
      updatedAt: string;
    }>(`/api/admin/users/${encodeURIComponent(userId)}/tier`, token, {
      method: 'PATCH',
      body: { tier, reason },
    });
  },

  getFlags(token: string) {
    return request<{ ok: boolean; flags: AdminFeatureFlag[] }>('/api/admin/flags', token);
  },

  updateFlag(
    token: string,
    featureKey: string,
    data: Partial<AdminFeatureFlag>,
    reason?: string,
  ) {
    return request<{ ok: boolean; featureId: string; updatedAt: string }>(
      `/api/admin/flags/${encodeURIComponent(featureKey)}`,
      token,
      {
        method: 'PUT',
        body: { ...data, reason },
      },
    );
  },

  getTemplates(token: string, status?: string) {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<{ ok: boolean; templates: AdminTemplateRecord[] }>(
      `/api/admin/templates${qs}`,
      token,
    );
  },

  createTemplate(
    token: string,
    templateData: {
      templateId: string;
      version: string;
      name: string;
      description?: string;
      generatorKinds?: string[];
      supportedSizes?: string[];
      schemaPayload?: Record<string, unknown>;
      styleTokens?: Record<string, unknown>;
      status?: string;
      accessLevel?: string;
      reason?: string;
    },
  ) {
    return request<{ ok: boolean; template: AdminTemplateRecord }>(
      '/api/admin/templates',
      token,
      {
        method: 'POST',
        body: templateData,
      },
    );
  },

  updateTemplate(
    token: string,
    templateId: string,
    templateData: Partial<AdminTemplateRecord> & { reason?: string },
  ) {
    return request<{ ok: boolean; template: AdminTemplateRecord }>(
      `/api/admin/templates/${encodeURIComponent(templateId)}`,
      token,
      {
        method: 'PATCH',
        body: templateData,
      },
    );
  },

  updateTemplateStatus(
    token: string,
    templateId: string,
    status: 'draft' | 'published' | 'unpublished' | 'archived',
    reason: string,
  ) {
    return request<{
      ok: boolean;
      templateId: string;
      previousStatus: string;
      currentStatus: string;
      updatedAt: string;
    }>(`/api/admin/templates/${encodeURIComponent(templateId)}/status`, token, {
      method: 'PATCH',
      body: { status, reason },
    });
  },

  getAuditLogs(
    token: string,
    limit = 50,
    offset = 0,
    action?: string,
    targetType?: string,
  ) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action) params.set('action', action);
    if (targetType) params.set('targetType', targetType);
    return request<{ ok: boolean; logs: AdminAuditLogRecord[]; total: number }>(
      `/api/admin/audit-logs?${params.toString()}`,
      token,
    );
  },
};
