export async function onRequestPost(context) {
  const payload = await context.request.json().catch(() => ({}));
  console.log("MangoFy postback recebido", {
    payment_code: payload.payment_code || "",
    payment_status: payload.payment_status || ""
  });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json;charset=utf-8" }
  });
}
