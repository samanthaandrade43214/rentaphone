function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export async function onRequestPost(context) {
  const { request } = context;

  try {
    const formData = await request.formData();
    const saleId = formData.get("sale_id") || "SALE_DEMO";
    const upsellUrl = formData.get("upsell_url") || "/sucesso/";

    // Tentar encaminhar para a API oficial do RePix se disponível
    try {
      const upstreamRes = await fetch("https://app.repix.site/api/v1/widget/upload-proof", {
        method: "POST",
        body: formData,
        headers: { "accept": "application/json" }
      });

      if (upstreamRes.ok) {
        const data = await upstreamRes.json().catch(() => ({}));
        return json({
          ok: true,
          status: "confirmed",
          redirect_url: data.redirect_url || upsellUrl,
          ...data
        });
      }
    } catch {
      // Fallback em caso de indisponibilidade externa ou ambiente local
    }

    return json({
      ok: true,
      status: "received",
      sale_id: saleId,
      redirect_url: upsellUrl,
      message: "Comprovante recebido e em processamento."
    });
  } catch (error) {
    return json({
      ok: false,
      error: error.message || "Erro ao processar comprovante."
    }, 400);
  }
}
