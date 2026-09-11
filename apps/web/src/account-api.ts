export type AccountUser = { id: string; username: string; user_type: "ADMIN" | "USER"; status: "enabled" | "disabled"; created_at: number };
export type Profile = { user_id: string; avatar_id: string; name: string; relationship: string; persona: string; revision: number };
export async function accountFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.method && !["GET", "HEAD"].includes(init.method)) headers.set("x-account-request", "1");
  const response = await fetch(input, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  if (response.status === 401 && String(input) !== "/api/auth/login") window.dispatchEvent(new Event("account-expired"));
  return response;
}
export async function accountApi<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await accountFetch(path, { method, headers: { "content-type": "application/json" },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "操作失败，请重试");
  return result as T;
}
