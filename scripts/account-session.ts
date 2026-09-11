/** Opt-in diagnostic login. Credentials and session cookies never enter reports. */
export async function diagnosticSession(base: string, username = process.env.DIAGNOSTIC_USERNAME, password = process.env.DIAGNOSTIC_PASSWORD) {
  if (!username || !password) throw new Error("Set DIAGNOSTIC_USERNAME and DIAGNOSTIC_PASSWORD in the process environment before authenticated gateway diagnostics");
  const origin = "http://127.0.0.1:5173";
  const response = await fetch(base + "/api/auth/login", { method: "POST", headers: { origin, "content-type": "application/json", "x-account-request": "1" }, body: JSON.stringify({ username, password }) });
  if (!response.ok) throw new Error(`Diagnostic login failed (${response.status})`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0]; if (!cookie) throw new Error("No diagnostic login session");
  const request = (input: string, init: RequestInit = {}) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), cookie, origin, "x-account-request": "1" } });
  return { cookie, request, logout: () => request(base + "/api/auth/logout", { method: "POST" }) };
}
