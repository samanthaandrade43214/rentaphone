function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function parse(response) {
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: response.ok, status: response.status, data: { raw: text } };
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const identifier = new URL(request.url).searchParams.get("id")?.trim();
  if (!identifier || identifier.length > 160) {
    return json({ error: "Identificador de pagamento inválido." }, 400);
  }

  if (env.MANGOFY_PREVIEW_MODE === "true") {
    return json({ payment_status: "approved", id: identifier, mode: "preview_mock" });
  }

  const apiKey = String(env.MANGOFY_API_KEY || "").trim();
  const storeCode = String(env.MANGOFY_STORE_CODE || "").trim();
  if (!apiKey || !storeCode) {
    return json({ error: "Credenciais MangoFy não configuradas." }, 500);
  }

  const baseUrl = (env.MANGOFY_API_URL || "https://checkout.mangofy.com.br/api/v1").replace(/\/$/, "");
  const endpoint = `${baseUrl}/payment/${encodeURIComponent(identifier)}`;
  try {
    const result = await parse(await fetch(endpoint, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "authorization": apiKey,
        "store-code": storeCode
      }
    }));
    if (result.ok) return json(result.data);
    return json({
      error: result.status === 404 ? "Pagamento ainda não localizado para consulta." : "Não foi possível consultar o pagamento.",
      details: result.data
    }, result.status);
  } catch (error) {
    return json({ error: "Falha de comunicação com a MangoFy.", details: { message: error.message } }, 502);
  }
}
