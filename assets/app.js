(() => {
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const steps = ["lead", "loading", "approved", "choice", "delivery", "contact", "summary"];
  const models = [
    { id: "iphone-17e", name: "iPhone 17e", price: 39.90, storage: ["256", "512"] },
    { id: "iphone-17", name: "iPhone 17", price: 49.90, storage: ["512"] },
    { id: "iphone-air", name: "iPhone Air", price: 49.90, storage: ["512"] },
    { id: "iphone-17-pro", name: "iPhone 17 Pro", price: 69.90, storage: ["512"] },
    { id: "iphone-17-pro-max", name: "iPhone 17 Pro MAX", price: 69.90, storage: ["512", "1tb"] },
    { id: "teste-repix-5", name: "Produto Teste Real (RePix)", price: 5.00, storage: ["256"], isTest: true }
  ];
  const storages = [
    { id: "256", name: "256GB", label: "Padrão", surcharge: 0 },
    { id: "512", name: "512GB", label: "+ R$ 9,90/mês", surcharge: 9.90 },
    { id: "1tb", name: "1TB", label: "+ R$ 19,90/mês", surcharge: 19.90 }
  ];
  const plans = [
    { id: "monthly", name: "Mensal", months: 1, discount: 0, description: "Pague um mês agora" },
    { id: "quarterly", name: "Trimestral", months: 3, discount: .30, description: "3 meses com 30% de desconto" },
    { id: "semester", name: "Semestral", months: 6, discount: .50, description: "6 meses com 50% de desconto" }
  ];

  const state = loadState();
  let currentStep = "lead";
  let paymentData = null;
  let paymentPoll = null;
  let loadingRun = 0;

  function loadState() {
    const initial = {
      lead: { name: "", cpf: "" },
      model: "iphone-17e",
      storage: "256",
      delivery: { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" },
      contact: { email: "", phone: "" },
      plan: "monthly",
      insurance: false
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem("facilitaOrder") || "{}");
      return {
        ...initial,
        ...saved,
        lead: { ...initial.lead, ...(saved.lead || {}) },
        delivery: { ...initial.delivery, ...(saved.delivery || {}) },
        contact: { ...initial.contact, ...(saved.contact || {}) }
      };
    } catch {
      return initial;
    }
  }

  function saveState() {
    sessionStorage.setItem("facilitaOrder", JSON.stringify(state));
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function maskCpf(value) {
    return onlyDigits(value).slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function maskCep(value) {
    return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
  }

  function maskPhone(value) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  }

  function validCpf(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    const digit = (length) => {
      let sum = 0;
      for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
      const result = (sum * 10) % 11;
      return result === 10 ? 0 : result;
    };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
  }

  function showError(id, message) {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.toggle("visible", Boolean(message));
  }

  function goTo(step, push = true) {
    if (!steps.includes(step)) return;
    currentStep = step;
    document.querySelectorAll(".step").forEach((section) => section.classList.toggle("active", section.dataset.step === step));
    const index = steps.indexOf(step);
    document.getElementById("progressFill").style.width = `${((index + 1) / steps.length) * 100}%`;
    document.getElementById("progressLabel").textContent = `Etapa ${index + 1} de ${steps.length}`;
    if (push) history.replaceState(null, "", `${location.pathname}?etapa=${step}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (step === "loading") runAnalysis();
    if (step === "choice") renderChoices();
    if (step === "summary") renderSummary();
    scheduleSubtotalDock();
  }

  function runAnalysis() {
    const runId = ++loadingRun;
    const messages = [
      [0, "Validando informações"],
      [1100, "Consultando disponibilidade"],
      [2400, "Finalizando análise"],
      [3500, "Preparando resultado"]
    ];
    messages.forEach(([delay, message]) => {
      setTimeout(() => {
        if (runId === loadingRun && currentStep === "loading") document.getElementById("analysisStatus").textContent = message;
      }, delay);
    });
    setTimeout(() => {
      if (runId === loadingRun && currentStep === "loading") goTo("approved");
    }, 4000);
  }

  function currentModel() {
    return models.find((model) => model.id === state.model) || models[0];
  }

  function currentStorage() {
    return storages.find((storage) => storage.id === state.storage) || storages[0];
  }

  function monthlyPrice() {
    if (currentModel().isTest) return 5.00;
    return currentModel().price + currentStorage().surcharge;
  }

  function planTotal(plan = plans.find((item) => item.id === state.plan) || plans[0]) {
    if (currentModel().isTest) return 5.00;
    const discountedRent = monthlyPrice() * plan.months * (1 - plan.discount);
    const insurance = state.insurance ? 9.90 * plan.months : 0;
    return discountedRent + insurance;
  }

  function renderChoices() {
    const modelList = document.getElementById("modelList");
    const storageList = document.getElementById("storageList");
    modelList.innerHTML = models.map((model) => `
      <button class="choice-card ${state.model === model.id ? "selected" : ""} ${model.isTest ? "test-choice-card" : ""}" type="button" data-model="${model.id}" aria-pressed="${state.model === model.id}">
        <span class="choice-dot" aria-hidden="true"></span>
        <span class="choice-copy"><strong>${model.name}</strong><span>${model.isTest ? "Ambiente de Teste Real R$ 5,00" : model.storage.map((id) => id === "1tb" ? "1TB" : `${id}GB`).join(" ou ")}</span></span>
        <span class="choice-price">${currency.format(model.price)}${model.isTest ? "" : "/mês"}</span>
      </button>
    `).join("");

    storageList.innerHTML = storages.map((storage) => {
      const available = currentModel().storage.includes(storage.id);
      return `
        <button class="choice-card ${state.storage === storage.id ? "selected" : ""} ${available ? "" : "disabled"}" type="button" data-storage="${storage.id}" ${available ? "" : "disabled"} aria-pressed="${state.storage === storage.id}">
          <span class="choice-dot" aria-hidden="true"></span>
          <span class="choice-copy"><strong>${storage.name}</strong><span>${storage.label}</span></span>
          <span class="choice-price">${storage.surcharge ? currency.format(storage.surcharge) : "Incluso"}</span>
        </button>
      `;
    }).join("");

    modelList.querySelectorAll("[data-model]").forEach((button) => {
      button.addEventListener("click", () => {
        state.model = button.dataset.model;
        if (!currentModel().storage.includes(state.storage)) state.storage = currentModel().storage[0];
        saveState();
        renderChoices();
      });
    });
    storageList.querySelectorAll("[data-storage]").forEach((button) => {
      button.addEventListener("click", () => {
        state.storage = button.dataset.storage;
        saveState();
        renderChoices();
      });
    });

    document.getElementById("monthlyValue").innerHTML = `${currency.format(monthlyPrice())} <span>/mês</span>`;
    document.getElementById("choiceDescription").textContent = `${currentModel().name}, ${currentStorage().name}`;
    scheduleSubtotalDock();
  }

  function fullAddress() {
    const address = state.delivery;
    return `${address.street}, ${address.number}${address.complement ? `, ${address.complement}` : ""} - ${address.neighborhood}, ${address.city}/${address.state} - CEP ${address.cep}`;
  }

  function renderSummary() {
    document.getElementById("customerSummary").innerHTML = `
      <article class="data-panel summary-full">
        <h2>Cliente</h2>
        <p>${escapeHtml(state.lead.name)}<br>CPF ${escapeHtml(state.lead.cpf)}<br>${escapeHtml(state.contact.email)}<br>${escapeHtml(state.contact.phone)}</p>
      </article>
      <article class="data-panel summary-full">
        <h2>Entrega</h2>
        <p>${escapeHtml(fullAddress())}<br>Frete grátis<br>5 a 7 dias úteis</p>
      </article>
      <article class="data-panel">
        <h2>Aparelho</h2>
        <p>${escapeHtml(currentModel().name)}<br>${currentModel().isTest ? "Homologação de Teste Real" : `${escapeHtml(currentStorage().name)}<br>Novo, com carregador`}</p>
      </article>
      <article class="data-panel">
        <h2>${currentModel().isTest ? "Valor do teste" : "Mensalidade base"}</h2>
        <p>${currentModel().isTest ? "Cobrança única de R$ 5,00 para teste real e captura de comprovante." : `${currency.format(monthlyPrice())} por mês durante 36x meses para contemplar o aparelho. <strong>(Sem fidelidade).</strong>`}</p>
      </article>
    `;

    document.getElementById("planList").innerHTML = plans.map((plan) => `
      <button class="plan-card ${state.plan === plan.id ? "selected" : ""}" type="button" data-plan="${plan.id}" aria-pressed="${state.plan === plan.id}">
        <span class="choice-dot" aria-hidden="true"></span>
        <span class="choice-copy"><strong>${plan.name}</strong><span>${plan.description}</span>${plan.discount ? `<span class="plan-badge">${Math.round(plan.discount * 100)}% de desconto</span>` : ""}</span>
        <span class="choice-price"><strong>${currency.format(planTotal({ ...plan, discount: plan.discount }))}</strong><span>total</span></span>
      </button>
    `).join("");

    document.querySelectorAll("[data-plan]").forEach((button) => {
      button.addEventListener("click", () => {
        state.plan = button.dataset.plan;
        saveState();
        renderSummary();
      });
    });

    const insuranceSwitch = document.getElementById("insuranceSwitch");
    insuranceSwitch.classList.toggle("active", state.insurance);
    insuranceSwitch.setAttribute("aria-checked", String(state.insurance));
    const plan = plans.find((item) => item.id === state.plan) || plans[0];
    document.getElementById("orderPeriod").textContent = currentModel().isTest
      ? "Ambiente de Teste Real RePix"
      : (state.insurance ? `Plano ${plan.name.toLowerCase()} + Seguro` : `Plano ${plan.name.toLowerCase()}`);
    document.getElementById("orderTotal").textContent = currency.format(planTotal(plan));
    scheduleSubtotalDock();
  }

  let subtotalDockFrame = 0;

  function scheduleSubtotalDock() {
    if (subtotalDockFrame) cancelAnimationFrame(subtotalDockFrame);
    subtotalDockFrame = requestAnimationFrame(() => {
      subtotalDockFrame = 0;
      updateSubtotalDock();
    });
  }

  function updateSubtotalDock() {
    const dock = document.getElementById("subtotalDock");
    const activeStep = document.querySelector(".step.active");
    const step = activeStep?.dataset.step || "";
    const supportsDock = step === "choice" || step === "summary";
    const paymentOpen = document.getElementById("paymentBackdrop").classList.contains("visible");

    if (!supportsDock || paymentOpen) {
      dock.classList.remove("visible");
      dock.setAttribute("aria-hidden", "true");
      dock.inert = true;
      return;
    }

    const fullSummary = activeStep.querySelector(".sticky-summary");
    const summaryRect = fullSummary.getBoundingClientRect();
    const fullSummaryVisible = summaryRect.top < window.innerHeight - 24 && summaryRect.bottom > 70;

    if (step === "choice") {
      document.getElementById("subtotalDockLabel").textContent = "Subtotal por mês";
      document.getElementById("subtotalDockValue").textContent = currency.format(monthlyPrice());
      document.getElementById("subtotalDockAction").textContent = "Definir";
    } else {
      document.getElementById("subtotalDockLabel").textContent = document.getElementById("orderPeriod").textContent;
      document.getElementById("subtotalDockValue").textContent = document.getElementById("orderTotal").textContent;
      document.getElementById("subtotalDockAction").textContent = "Pedir iPhone";
    }

    dock.dataset.step = step;
    dock.classList.toggle("visible", !fullSummaryVisible);
    dock.setAttribute("aria-hidden", String(fullSummaryVisible));
    dock.inert = fullSummaryVisible;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  async function fetchCep() {
    const cep = onlyDigits(document.getElementById("cep").value);
    const helper = document.getElementById("cepHelper");
    if (cep.length !== 8) return;
    helper.textContent = "Buscando endereço...";
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error("CEP indisponível");
      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado");
      document.getElementById("street").value = data.logradouro || "";
      document.getElementById("neighborhood").value = data.bairro || "";
      document.getElementById("city").value = data.localidade || "";
      document.getElementById("state").value = data.uf || "";
      helper.textContent = "Endereço localizado. Complete o número para calcular o frete.";
      syncDelivery();
      updateShipping();
      document.getElementById("number").focus();
    } catch (error) {
      helper.textContent = "Não foi possível localizar o CEP. Preencha o endereço manualmente.";
    }
  }

  function syncDelivery() {
    ["cep", "street", "number", "complement", "neighborhood", "city", "state"].forEach((id) => {
      state.delivery[id] = document.getElementById(id).value.trim();
    });
    saveState();
  }

  function updateShipping() {
    const complete = ["cep", "street", "number", "neighborhood", "city", "state"].every((key) => state.delivery[key]);
    document.getElementById("shippingResult").classList.toggle("visible", complete);
  }

  function setNoNumberState(active) {
    const input = document.getElementById("number");
    const button = document.getElementById("noNumberButton");
    input.disabled = active;
    input.value = active ? "S/N" : "";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Desmarcar endereço sem número" : "Marcar endereço sem número");
    syncDelivery();
    updateShipping();
    if (!active) input.focus();
  }

  function randomOrderCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(10);
    if (crypto?.getRandomValues) crypto.getRandomValues(values);
    else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * alphabet.length); });
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  }

  function pixCodeFromPayment(payment) {
    const pix = payment.pix || {};
    return payment.pix_qrcode_text || payment.pix_code || payment.qr_code || payment.qrcode || payment.copy_paste || payment.brcode
      || pix.pix_qrcode_text || pix.pix_code || pix.qr_code || pix.qrcode || pix.copy_paste || pix.brcode || "";
  }

  function pixImageFromPayment(payment) {
    const pix = payment.pix || {};
    const raw = payment.pix_qrcode_image || payment.pix_qr_code_image || payment.qr_code_image || payment.qrcode_image
      || payment.pix_qrcode_base64 || payment.qr_code_base64 || payment.qrcode_base64 || pix.pix_qrcode_image
      || pix.pix_qr_code_image || pix.qr_code_image || pix.qrcode_image || pix.pix_qrcode_base64 || pix.qr_code_base64 || pix.qrcode_base64 || "";
    const image = String(raw).trim();
    if (!image) return "";
    if (/^(data:image\/|https?:\/\/|blob:)/i.test(image)) return image;
    if (image.startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`;
    return `data:image/png;base64,${image.replace(/\s/g, "")}`;
  }

  function localQrImage(code) {
    if (!code || typeof window.qrcode !== "function") return "";
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(code);
      qr.make();
      return qr.createDataURL(7, 10);
    } catch {
      return "";
    }
  }

  function paymentIdentifier(payment) {
    return payment.id || payment.payment_id || payment.transaction_id || payment.payment_code || payment.code || payment.pix?.id || "";
  }

  function buildPayload(orderCode) {
    const plan = plans.find((item) => item.id === state.plan) || plans[0];
    const isTest = Boolean(currentModel().isTest);
    const amount = isTest ? 500 : Math.round(planTotal(plan) * 100);
    return {
      payment_method: "pix",
      payment_format: "regular",
      installments: 1,
      selected_installments: 1,
      payment_amount: amount,
      external_code: `FACILITA-${orderCode}`,
      items: [{
        code: isTest ? "TESTE-REPIX-500" : `${currentModel().id}-${state.storage}-${plan.id}`,
        name: isTest ? "Produto Teste Real RePix R$ 5,00" : `Plano ${plan.name}`,
        amount,
        price: amount,
        total: 1,
        quantity: 1
      }],
      customer: {
        email: state.contact.email,
        name: state.lead.name,
        document: onlyDigits(state.lead.cpf),
        phone: onlyDigits(state.contact.phone)
      },
      shipping: {
        street: state.delivery.street,
        street_number: state.delivery.number,
        complement: state.delivery.complement,
        neighborhood: state.delivery.neighborhood,
        city: state.delivery.city,
        state: state.delivery.state,
        zip_code: state.delivery.cep,
        country: "Brasil"
      },
      extra: {
        metadata: {
          plan: plan.id,
          insurance: state.insurance,
          monthly_value: Math.round(monthlyPrice() * 100),
          pedido_origem: "facilita-iphone"
        }
      },
      pix: { expires_in_days: 1 }
    };
  }

  function localPreviewPayment(payload, orderCode) {
    const code = `00020101021226840014br.gov.bcb.pix0136FACILITA${Date.now()}520400005303986540${(payload.payment_amount / 100).toFixed(2)}5802BR5915FACILITA IPHONE6009SAO PAULO62070503***6304ABCD`;
    return {
      mode: "local_preview",
      payment_code: `FACILITA-${orderCode}`,
      payment_status: "pending",
      payment_amount: payload.payment_amount,
      pix: { pix_qrcode_text: code }
    };
  }

  async function createPayment() {
    const button = document.getElementById("orderButton");
    const orderCode = randomOrderCode();
    const payload = buildPayload(orderCode);
    const plan = plans.find((item) => item.id === state.plan) || plans[0];
    showError("paymentError", "");
    button.disabled = true;
    button.textContent = "Gerando PIX...";
    if (window.trackMetaEvent) {
      window.trackMetaEvent("InitiateCheckout", {
        currency: "BRL",
        value: Number((payload.payment_amount / 100).toFixed(2)),
        content_ids: [payload.items[0].code],
        content_name: payload.items[0].name,
        content_type: "product",
        num_items: 1,
        plan: plan.id
      }, {
        userData: {
          email: state.contact.email,
          phone: state.contact.phone,
          external_id: state.lead.cpf
        }
      });
    }
    try {
      let data;
      if (["localhost", "127.0.0.1"].includes(location.hostname) || location.protocol === "file:") {
        data = localPreviewPayment(payload, orderCode);
      } else {
        const response = await fetch("/api/mangofy/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload)
        });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível gerar o PIX.");
      }
      paymentData = { ...data, order_code: orderCode, request_payload: payload };
      sessionStorage.setItem("facilitaPayment", JSON.stringify(paymentData));
      syncRePixWidget(paymentData);
      openPayment();
      startPaymentPolling();
    } catch (error) {
      showError("paymentError", error.message || "Não foi possível gerar o PIX agora. Tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = "Pedir iPhone";
    }
  }

  function syncRePixWidget(payment) {
    if (!payment) return;
    const identifier = paymentIdentifier(payment);
    if (!identifier) return;
    const amountCents = Number(payment.payment_amount || payment.request_payload?.payment_amount || 500);
    const customerName = state.lead?.name || payment.request_payload?.customer?.name || "";
    const customerPhone = onlyDigits(state.contact?.phone || payment.request_payload?.customer?.phone || "");
    const upsellUrl = window.location.origin + "/sucesso/";

    const widgetScript = document.getElementById("repix-widget-script") || document.querySelector('script[src*="repix-widget"]');
    if (widgetScript) {
      widgetScript.setAttribute("data-sale-id", identifier);
      widgetScript.setAttribute("data-amount-cents", String(amountCents));
      if (customerName) widgetScript.setAttribute("data-customer-name", customerName);
      if (customerPhone) widgetScript.setAttribute("data-customer-phone", customerPhone);
      widgetScript.setAttribute("data-upsell-url", upsellUrl);
    }

    if (window.RePixWidget && typeof window.RePixWidget.setConfig === "function") {
      window.RePixWidget.setConfig({
        saleId: identifier,
        amountCents,
        customerName,
        customerPhone,
        upsellUrl,
        onSuccess: () => {
          sessionStorage.setItem(`facilitaPurchase:${identifier}`, "true");
          sessionStorage.setItem("facilitaPaid", "true");
        }
      });
    }
  }

  function openPayment() {
    if (!paymentData) return;
    const code = pixCodeFromPayment(paymentData);
    const image = pixImageFromPayment(paymentData) || localQrImage(code);
    document.getElementById("orderCode").textContent = paymentData.order_code;
    document.getElementById("pixCode").textContent = code || "O código PIX não foi retornado. Gere o pagamento novamente.";
    const qrFrame = document.getElementById("qrFrame");
    qrFrame.innerHTML = image
      ? `<img src="${escapeHtml(image)}" alt="QR Code do PIX">`
      : '<div class="qr-placeholder" aria-label="Use o código PIX Copia e Cola"></div>';
    syncRePixWidget(paymentData);
    document.getElementById("paymentBackdrop").classList.add("visible");
    document.body.style.overflow = "hidden";
    scheduleSubtotalDock();
    document.getElementById("copyPix").focus();
  }

  function closePayment() {
    document.getElementById("paymentBackdrop").classList.remove("visible");
    document.body.style.overflow = "";
    scheduleSubtotalDock();
  }

  async function copyPix() {
    if (!paymentData) return;
    const code = pixCodeFromPayment(paymentData);
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.createElement("textarea");
      area.value = code;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    document.getElementById("copyPix").textContent = "Código copiado";
    setTimeout(() => { document.getElementById("copyPix").textContent = "Copiar código PIX"; }, 1800);
  }

  function approvedStatus(value) {
    return ["approved", "paid", "completed", "confirmed", "success", "succeeded"].includes(String(value || "").toLowerCase());
  }

  function extractStatus(data) {
    return data.payment_status || data.status || data.payment?.status || data.pix?.status || "";
  }

  function startPaymentPolling() {
    if (paymentPoll) {
      clearInterval(paymentPoll);
      clearTimeout(paymentPoll);
    }
    const identifier = paymentIdentifier(paymentData);
    if (!identifier) return;
    const check = async () => {
      try {
        const response = await fetch(`/api/mangofy/status?id=${encodeURIComponent(identifier)}`, { headers: { "Accept": "application/json" } });
        const data = await response.json();
        if (!response.ok) return;
        const status = extractStatus(data);
        if (approvedStatus(status)) {
          clearInterval(paymentPoll);
          document.getElementById("paymentStatus").textContent = "Pagamento confirmado. Preparando seu pedido.";
          const purchaseMarker = `facilitaPurchase:${identifier}`;
          if (sessionStorage.getItem(purchaseMarker) !== "true") {
            const payload = paymentData.request_payload || {};
            const item = payload.items?.[0] || {};
            const purchaseValue = Number((Number(paymentData.payment_amount || payload.payment_amount || 0) / 100).toFixed(2));
            if (window.trackMetaEvent) {
              window.trackMetaEvent("Purchase", {
                currency: "BRL",
                value: purchaseValue,
                content_ids: item.code ? [item.code] : [],
                content_name: item.name || `${currentModel().name} ${currentStorage().name}`,
                content_type: "product",
                num_items: 1
              }, {
                userData: {
                  email: state.contact.email,
                  phone: state.contact.phone,
                  external_id: state.lead.cpf
                }
              });
            }
            sessionStorage.setItem(purchaseMarker, "true");
          }
          sessionStorage.setItem("facilitaPaid", "true");
          setTimeout(() => { location.href = "/sucesso/"; }, 900);
        }
      } catch {
        // A confirmação automática continua na próxima tentativa.
      }
    };
    const beginPolling = () => {
      check();
      paymentPoll = setInterval(check, 5000);
    };
    const isPreviewPayment = ["local_preview", "preview_mock"].includes(String(paymentData.mode || ""));
    if (isPreviewPayment) {
      document.getElementById("paymentStatus").textContent = "PIX de teste gerado. A confirmação simulada ocorrerá em alguns segundos.";
      paymentPoll = setTimeout(beginPolling, 6000);
    } else {
      beginPolling();
    }
  }

  document.getElementById("cpf").addEventListener("input", (event) => { event.target.value = maskCpf(event.target.value); });
  document.getElementById("leadForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("fullName").value.trim().replace(/\s+/g, " ");
    const cpf = document.getElementById("cpf").value;
    if (name.split(" ").filter(Boolean).length < 2) {
      showError("leadError", "Digite seu nome completo.");
      return;
    }
    if (!validCpf(cpf)) {
      showError("leadError", "Digite um CPF válido.");
      return;
    }
    state.lead = { name, cpf };
    saveState();
    showError("leadError", "");
    goTo("loading");
  });

  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => goTo(button.dataset.go)));
  document.getElementById("confirmChoice").addEventListener("click", () => {
    saveState();
    goTo("delivery");
  });

  document.getElementById("cep").addEventListener("input", (event) => {
    event.target.value = maskCep(event.target.value);
    syncDelivery();
    updateShipping();
    if (onlyDigits(event.target.value).length === 8) fetchCep();
  });
  document.getElementById("cep").addEventListener("blur", fetchCep);
  document.getElementById("noNumberButton").addEventListener("click", () => {
    const active = document.getElementById("noNumberButton").getAttribute("aria-pressed") !== "true";
    setNoNumberState(active);
  });
  ["street", "number", "complement", "neighborhood", "city", "state"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      if (id === "state") document.getElementById(id).value = document.getElementById(id).value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      syncDelivery();
      updateShipping();
    });
  });
  document.getElementById("deliveryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    syncDelivery();
    const required = ["cep", "street", "number", "neighborhood", "city", "state"];
    if (onlyDigits(state.delivery.cep).length !== 8 || required.some((key) => !state.delivery[key])) {
      showError("deliveryError", "Preencha o endereço completo para prosseguir.");
      return;
    }
    showError("deliveryError", "");
    goTo("contact");
  });

  document.getElementById("phone").addEventListener("input", (event) => { event.target.value = maskPhone(event.target.value); });
  document.getElementById("contactForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const phone = document.getElementById("phone").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError("contactError", "Digite um e-mail válido.");
      return;
    }
    if (onlyDigits(phone).length < 10) {
      showError("contactError", "Digite um telefone válido com DDD.");
      return;
    }
    state.contact = { email, phone };
    saveState();
    showError("contactError", "");
    goTo("summary");
  });

  document.getElementById("insuranceSwitch").addEventListener("click", () => {
    state.insurance = !state.insurance;
    saveState();
    renderSummary();
  });
  document.getElementById("orderButton").addEventListener("click", createPayment);
  const openRepixBtn = document.getElementById("openRepixModal");
  if (openRepixBtn) {
    openRepixBtn.addEventListener("click", () => {
      if (paymentData) syncRePixWidget(paymentData);
      if (window.RePixWidget && typeof window.RePixWidget.open === "function") {
        window.RePixWidget.open();
      }
    });
  }
  document.getElementById("subtotalDockAction").addEventListener("click", () => {
    const dockStep = document.getElementById("subtotalDock").dataset.step;
    if (dockStep === "choice") document.getElementById("confirmChoice").click();
    if (dockStep === "summary") document.getElementById("orderButton").click();
  });
  document.getElementById("copyPix").addEventListener("click", copyPix);
  document.getElementById("closePayment").addEventListener("click", closePayment);
  document.getElementById("paymentBackdrop").addEventListener("click", (event) => {
    if (event.target === document.getElementById("paymentBackdrop")) closePayment();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("paymentBackdrop").classList.contains("visible")) closePayment();
  });
  window.addEventListener("scroll", scheduleSubtotalDock, { passive: true });
  window.addEventListener("resize", scheduleSubtotalDock);

  document.getElementById("fullName").value = state.lead.name;
  document.getElementById("cpf").value = state.lead.cpf;
  Object.entries(state.delivery).forEach(([key, value]) => {
    const input = document.getElementById(key);
    if (input) input.value = value;
  });
  if (state.delivery.number.toUpperCase() === "S/N") {
    const numberInput = document.getElementById("number");
    numberInput.disabled = true;
    document.getElementById("noNumberButton").setAttribute("aria-pressed", "true");
    document.getElementById("noNumberButton").setAttribute("aria-label", "Desmarcar endereço sem número");
  } else {
    document.getElementById("noNumberButton").setAttribute("aria-label", "Marcar endereço sem número");
  }
  document.getElementById("email").value = state.contact.email;
  document.getElementById("phone").value = state.contact.phone;
  updateShipping();

  try {
    paymentData = JSON.parse(sessionStorage.getItem("facilitaPayment") || "null");
  } catch {
    paymentData = null;
  }
  if (paymentData) {
    syncRePixWidget(paymentData);
  }

  const requested = new URLSearchParams(location.search).get("etapa");
  const safeResume = ["lead", "approved", "choice", "delivery", "contact", "summary"];
  if (requested && safeResume.includes(requested)) goTo(requested, false);
  else goTo("lead", false);
})();
