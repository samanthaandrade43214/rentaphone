function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" }
  });
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function addBusinessDays(date, days) {
  const due = new Date(date);
  let added = 0;
  while (added < days) {
    due.setDate(due.getDate() + 1);
    if (due.getDay() !== 0 && due.getDay() !== 6) added += 1;
  }
  return due;
}

function addBusinessHours(date, hours) {
  const expires = new Date(date);
  let added = 0;
  while (added < hours) {
    expires.setHours(expires.getHours() + 1);
    if (expires.getDay() !== 0 && expires.getDay() !== 6) added += 1;
  }
  return expires;
}

function localDateISO(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(value) {
  if (!value) return localDateISO(addBusinessDays(new Date(), 2));
  const text = String(value);
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return localDateISO(parsed);
  return localDateISO(addBusinessDays(new Date(), 2));
}

function randomPaymentCode() {
  return `FACILITA-${Math.random().toString(36).slice(2, 10).toUpperCase()}${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function mod10CheckDigit(value) {
  const digits = onlyDigits(value).split("").reverse().map(Number);
  let sum = 0;
  digits.forEach((digit, index) => {
    const multiplied = digit * (index % 2 === 0 ? 2 : 1);
    sum += multiplied > 9 ? Math.floor(multiplied / 10) + (multiplied % 10) : multiplied;
  });
  return (10 - (sum % 10)) % 10;
}

function billetLineFromBarcode(barcode) {
  const digits = onlyDigits(barcode);
  if (digits.length !== 44) return "";
  const free = digits.slice(19);
  const field1 = digits.slice(0, 4) + free.slice(0, 5);
  const field2 = free.slice(5, 15);
  const field3 = free.slice(15, 25);
  const field4 = digits.slice(4, 5);
  const field5 = digits.slice(5, 19);
  const line = field1 + mod10CheckDigit(field1) + field2 + mod10CheckDigit(field2) + field3 + mod10CheckDigit(field3) + field4 + field5;
  return `${line.slice(0, 5)}.${line.slice(5, 10)} ${line.slice(10, 15)}.${line.slice(15, 21)} ${line.slice(21, 26)}.${line.slice(26, 32)} ${line.slice(32, 33)} ${line.slice(33)}`;
}

function barcodeFromBilletLine(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 47) return "";
  return digits.slice(0, 4) + digits.slice(32, 33) + digits.slice(33, 47) +
    digits.slice(4, 9) + digits.slice(10, 20) + digits.slice(21, 31);
}

function fallbackBillet(payload) {
  const amount = String(Math.max(500, Number(payload.payment_amount) || 500)).padStart(10, "0").slice(-10);
  const seed = String(Date.now()).padEnd(30, "7");
  const barcode = `3419${seed.slice(0, 5)}${amount}${seed.slice(5, 30)}`.slice(0, 44);
  const billetCode = billetLineFromBarcode(barcode);
  return {
    mode: "preview_mock",
    payment_code: randomPaymentCode(),
    payment_method: "billet",
    payment_status: "pending",
    payment_amount: Number(payload.payment_amount),
    installments: Number(payload.selected_installments || payload.installments || 1),
    installment_number: 1,
    due_date: normalizeDate(),
    issued_at: new Date().toISOString(),
    availability_expires_at: addBusinessHours(new Date(), 72).toISOString(),
    billet_code: billetCode,
    barcode,
    gateway: "MangoFy"
  };
}

function fallbackPix(payload) {
  const paymentCode = randomPaymentCode();
  const pixCode = `00020101021226840014br.gov.bcb.pix0136${paymentCode}520400005303986540${(Number(payload.payment_amount) / 100).toFixed(2)}5802BR5915FACILITA IPHONE6009SAO PAULO62070503***6304ABCD`;
  return {
    mode: "preview_mock",
    payment_code: paymentCode,
    payment_method: "pix",
    payment_status: "pending",
    payment_amount: Number(payload.payment_amount),
    installments: Number(payload.selected_installments || payload.installments || 1),
    installment_number: 1,
    issued_at: new Date().toISOString(),
    expires_at: addBusinessHours(new Date(), 24).toISOString(),
    pix: {
      pix_qrcode_text: pixCode,
      pix_qrcode_image: "",
      pix_expires_at: addBusinessHours(new Date(), 24).toISOString()
    },
    gateway: "MangoFy"
  };
}

function normalizeMangofyResponse(data, payload, method = "billet") {
  if (method === "pix") {
    const pix = data.pix || data.payment || {};
    const issuedAt = data.issued_at || data.created_at || new Date().toISOString();
    return {
      ...data,
      payment_code: data.payment_code || data.code || data.transaction_id || pix.payment_code || randomPaymentCode(),
      payment_method: "pix",
      payment_status: data.payment_status || data.status || "pending",
      payment_amount: Number(data.payment_amount || payload.payment_amount),
      installments: Number(payload.selected_installments || data.installments || payload.installments || 1),
      installment_number: 1,
      issued_at: issuedAt,
      expires_at: data.expires_at || pix.pix_expires_at || addBusinessHours(new Date(issuedAt), 24).toISOString(),
      pix: {
        ...pix,
        pix_qrcode_text: data.pix_qrcode_text || data.pix_code || data.qr_code || data.qrcode || data.copy_paste || data.brcode || pix.pix_qrcode_text || pix.pix_code || pix.qr_code || pix.qrcode || pix.copy_paste || pix.brcode || "",
        pix_qrcode_image: data.pix_qrcode_image || data.pix_qr_code_image || data.qr_code_image || data.qrcode_image || data.pix_qrcode_base64 || data.qr_code_base64 || data.qrcode_base64 || pix.pix_qrcode_image || pix.pix_qr_code_image || pix.qr_code_image || pix.qrcode_image || pix.pix_qrcode_base64 || pix.qr_code_base64 || pix.qrcode_base64 || "",
        pix_expires_at: data.pix_expires_at || pix.pix_expires_at || data.expires_at || addBusinessHours(new Date(issuedAt), 24).toISOString()
      },
      gateway: "MangoFy"
    };
  }
  const billet = data.billet || data.boleto || data.payment || {};
  const issuedAt = data.issued_at || data.created_at || new Date().toISOString();
  const billetCode = data.billet_code || data.digitable_line || data.linha_digitavel || billet.billet_code || billet.billet_digitable_line || billet.digitable_line || billet.linha_digitavel || "";
  const directBarcode = data.barcode || data.billet_barcode || billet.barcode || billet.billet_barcode || "";
  const normalizedBarcode = onlyDigits(directBarcode).length === 44 ? onlyDigits(directBarcode) : barcodeFromBilletLine(billetCode);
  return {
    ...data,
    payment_code: data.payment_code || data.code || data.transaction_id || billet.payment_code || randomPaymentCode(),
    payment_method: "billet",
    payment_status: data.payment_status || data.status || "pending",
    payment_amount: Number(data.payment_amount || payload.payment_amount),
    installments: Number(payload.selected_installments || data.installments || payload.installments || 1),
    installment_number: 1,
    due_date: normalizeDate(data.due_date || billet.due_date || billet.expiration_date || billet.billet_expires_at),
    issued_at: issuedAt,
    availability_expires_at: data.availability_expires_at || addBusinessHours(new Date(issuedAt), 72).toISOString(),
    billet_code: billetCode,
    barcode: normalizedBarcode || onlyDigits(billetCode),
    gateway: "MangoFy"
  };
}

async function parseGatewayResponse(response, authMode) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data, authMode };
}

async function createMangofyPayment(apiUrl, payload, apiKey, storeCode) {
  const baseHeaders = {
    "content-type": "application/json",
    "accept": "application/json"
  };
  const body = JSON.stringify(payload);
  const basicAuth = typeof btoa === "function"
    ? `Basic ${btoa(`${apiKey}:${storeCode}`)}`
    : "";
  const attempts = [
    {
      authMode: "authorization-raw-store-code",
      headers: { ...baseHeaders, "authorization": apiKey, "store-code": storeCode }
    },
    {
      authMode: "api-key-store-code",
      headers: { ...baseHeaders, "api-key": apiKey, "store-code": storeCode }
    },
    {
      authMode: "x-api-key-x-store-code",
      headers: { ...baseHeaders, "x-api-key": apiKey, "x-store-code": storeCode }
    },
    {
      authMode: "api_key-store_code",
      headers: { ...baseHeaders, "api_key": apiKey, "store_code": storeCode }
    },
    {
      authMode: "bearer-plus-store-code",
      headers: { ...baseHeaders, "authorization": `Bearer ${apiKey}`, "store-code": storeCode }
    },
    ...(basicAuth ? [{
      authMode: "basic",
      headers: { ...baseHeaders, "authorization": basicAuth }
    }] : [])
  ];

  let lastResult = null;
  for (const attempt of attempts) {
    const response = await fetch(`${apiUrl}/payment`, {
      method: "POST",
      headers: attempt.headers,
      body
    });
    const result = await parseGatewayResponse(response, attempt.authMode);
    lastResult = result;
    if (result.ok) return result;
    if (result.status !== 401 && result.status !== 403) return result;
  }
  return lastResult;
}

export async function handlePaymentRequest(context, method = "billet") {
  const { request, env } = context;
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "JSON invalido." }, 400);
  }

  const amount = Number(payload.payment_amount || 0);
  if (!amount || amount < 500) {
    return json({ error: method === "pix" ? "Valor minimo do PIX nao atingido." : "Valor minimo do boleto nao atingido." }, 422);
  }

  const selectedInstallments = Number(payload.selected_installments || payload.installments || 1);

  payload.payment_method = method;
  const requestedPaymentFormat = String(payload.payment_format || "regular").toLowerCase();
  payload.payment_format = ["regular", "orderbump", "upsell", "subscription"].includes(requestedPaymentFormat)
    ? requestedPaymentFormat
    : "regular";
  payload.selected_installments = selectedInstallments;
  payload.installments = 1;
  payload.payment_amount = amount;
  payload.postback_url = env.MANGOFY_POSTBACK_URL || "https://api.repix.site/api/v1/webhooks/mangofy";
  if (method === "pix") {
    payload.pix = { expires_in_days: 1, ...(payload.pix || {}) };
    delete payload.billet;
  } else {
    payload.billet = { expires_in_days: 2, ...(payload.billet || {}) };
    delete payload.pix;
  }
  payload.customer = payload.customer || {};
  payload.customer.ip = payload.customer.ip
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "177.18.29.10";

  if (env.MANGOFY_PREVIEW_MODE === "true") {
    return json(method === "pix" ? fallbackPix(payload) : fallbackBillet(payload));
  }

  const apiKey = String(env.MANGOFY_API_KEY || "2bc3a3914cbd387faf948b2295e7737099kooqldm4vbr899ymhrkpsnpxz3eyh").trim();
  const storeCode = String(env.MANGOFY_STORE_CODE || "2e8bb35f110c3419ac9fa351beceb122").trim();

  if (!apiKey || !storeCode) {
    return json({
      error: "Credenciais MangoFy nao configuradas no Cloudflare Pages. Confira as variaveis MANGOFY_API_KEY e MANGOFY_STORE_CODE em Production."
    }, 500);
  }

  const apiUrl = (env.MANGOFY_API_URL || "https://checkout.mangofy.com.br/api/v1").replace(/\/$/, "");
  const gatewayPayload = { ...payload };
  delete gatewayPayload.selected_installments;
  delete gatewayPayload.installment_number;

  let result;
  try {
    result = await createMangofyPayment(apiUrl, gatewayPayload, apiKey, storeCode);
  } catch (error) {
    return json({
      error: "Falha de comunicacao com a MangoFy. Tente novamente em instantes.",
      details: { message: error.message }
    }, 502);
  }

  if (!result.ok) {
    const authError = result.status === 401 || result.status === 403;
    return json({
      error: authError
        ? "MangoFy recusou a autenticacao. Confira se a API Key e o Store Code estao ativos na conta MangoFy e se pertencem a mesma loja."
        : method === "pix" ? "Falha ao criar PIX na MangoFy." : "Falha ao criar boleto na MangoFy.",
      details: result.data,
      status: result.status,
      auth_mode: result.authMode
    }, result.status);
  }

  return json(normalizeMangofyResponse(result.data, payload, method));
}

export async function onRequestPost(context) {
  return handlePaymentRequest(context, "billet");
}
