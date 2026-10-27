// Gọi EHO Agent chạy trên chính PC của admin (xem ksnb-backend/tools/eho_agent). Dùng chung cho các popup cần agent.
export const AGENT_URL = "http://127.0.0.1:8765";

export async function agentCall(path, { method = "GET", body, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(AGENT_URL + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
