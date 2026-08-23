async function request(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error(data.error || "Family OS API request failed");
  return data.result;
}

export function getBbHealth() {
  return request("/api/health");
}

export function callBbAction(action, payload = {}, requestText = "") {
  return request("/api/family-os", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload, request_text: requestText }),
  });
}

export const activeFeedingApi = Object.freeze({
  start: (payload) => callBbAction("start_active_feeding", payload, "PWA start active feeding"),
  get: () => callBbAction("get_active_feeding"),
  complete: (payload) => callBbAction("complete_active_feeding", payload, "PWA complete active feeding"),
  cancel: (payload) => callBbAction("cancel_active_feeding", payload, "PWA cancel active feeding"),
});
