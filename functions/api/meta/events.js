const PIXEL_ID = "1011678908165044";
const ALLOWED_EVENTS = new Set(["PageView", "InitiateCheckout", "Purchase"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store" }
  });
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "";
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalizedUserData(input, request) {
  const provided = input.user_data || {};
  const email = String(provided.email || "").trim().toLowerCase();
  let phone = String(provided.phone || "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  const externalId = String(provided.external_id || "").replace(/\D/g, "");
  const data = {
    client_ip_address: clientIp(request),
    client_user_agent: request.headers.get("User-Agent") || "",
    fbp: String(input.fbp || ""),
    fbc: String(input.fbc || "")
  };
  if (email) data.em = [await sha256(email)];
  if (phone) data.ph = [await sha256(phone)];
  if (externalId) data.external_id = [await sha256(externalId)];
  Object.keys(data).forEach((key) => !data[key] && delete data[key]);
  return data;
}

export async function onRequestPost({ request, env }) {
  const input = await request.json().catch(() => null);
  if (!input || !ALLOWED_EVENTS.has(input.event_name) || !input.event_id) {
    return json({ ok: false, error: "Evento inválido." }, 400);
  }
  if (!env.META_CONVERSIONS_API_TOKEN) {
    return json({ ok: false, error: "API de Conversões não configurada." }, 503);
  }

  const payload = {
    data: [{
      event_name: input.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(input.event_id),
      event_source_url: input.event_source_url || request.headers.get("Referer") || undefined,
      action_source: "website",
      user_data: await normalizedUserData(input, request),
      custom_data: input.custom_data || {}
    }]
  };

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CONVERSIONS_API_TOKEN)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    console.error("Meta Conversions API request failed", response.status);
    return json({ ok: false }, 502);
  }
  return json({ ok: true });
}
