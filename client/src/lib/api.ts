/**
 * Thin fetch wrapper: attaches the JWT, parses the API's error shape into an
 * ApiError, and signals the auth layer when a session has expired.
 */

/**
 * Same-origin in dev (Vite proxy); set VITE_API_URL when the API is on another
 * host. A bare host (as Render's blueprint provides) is treated as https.
 */
const apiOrigin = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const API_BASE = `${apiOrigin && !/^https?:\/\//.test(apiOrigin) ? `https://${apiOrigin}` : apiOrigin}/api/v1`;

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
  const res = await send(path, init);
  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res, payload, path);
  return payload as T;
}

/** Low-level request: JSON bodies are serialised; FormData is sent as multipart. */
async function send(path: string, init: { method?: string; body?: unknown }) {
  const token = tokenStore.get();
  const isForm = init.body instanceof FormData;
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined && !isForm && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }
}

function toApiError(res: Response, payload: { error?: { code?: string; message?: string; details?: FieldError[] } } | null, path: string) {
  const err = payload?.error;
  if (res.status === 401 && tokenStore.get() && !path.startsWith("/auth/login")) onUnauthorized();
  return new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Request failed (${res.status})`, err?.details);
}

/** Uploads one file as multipart/form-data under the "file" field. */
export function apiUpload<T>(path: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<T>(path, { method: "POST", body: form });
}

/**
 * Downloads a protected file. A plain <a href> can't send the Authorization
 * header, so fetch it as a blob and hand the browser an object URL.
 */
export async function apiDownload(path: string, filename: string) {
  const res = await send(path, {});
  if (!res.ok) throw toApiError(res, await res.json().catch(() => null), path);
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
