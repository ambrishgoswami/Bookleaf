/**
 * Thin fetch wrapper: attaches the JWT, parses the API's error shape into an
 * ApiError, and signals the auth layer when a session has expired.
 */

/** Same-origin in dev (Vite proxy); set VITE_API_URL when the API is on another host. */
export const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

const TOKEN_KEY = "bookleaf.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface FieldError {
  field: string | null;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
  }

  /** Field-level validation messages keyed by field name. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).filter((d) => d.field).map((d) => [d.field!, d.message]));
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }

  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = payload?.error;
    if (res.status === 401 && token && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return payload as T;
}
