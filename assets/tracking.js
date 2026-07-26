(() => {
  const PIXEL_ID = "1011678908165044";
  const TABOOLA_ID = 2081268;
  const isPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname) || location.protocol === "file:";

  function eventId(name) {
    if (crypto && typeof crypto.randomUUID === "function") return `${name}-${crypto.randomUUID()}`;
    return `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function cookie(name) {
    return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] || "";
  }

  function sendServerEvent(name, customData, id, userData) {
    const body = JSON.stringify({
      event_name: name,
      event_id: id,
      event_source_url: location.href,
      custom_data: customData || {},
      user_data: userData || {},
      fbp: cookie("_fbp"),
      fbc: cookie("_fbc")
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/meta/events", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch("/api/meta/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  }

  window.trackMetaEvent = function trackMetaEvent(name, customData = {}, options = {}) {
    const id = options.eventId || eventId(name);
    if (isPreview) {
      console.info("[Meta preview]", name, customData, id);
      return id;
    }
    if (typeof window.fbq === "function") {
      window.fbq("trackSingle", PIXEL_ID, name, customData, { eventID: id });
    }
    sendServerEvent(name, customData, id, options.userData);
    return id;
  };

  window.trackTaboolaEvent = function trackTaboolaEvent(name, eventData = {}) {
    const event = {
      notify: "event",
      name,
      id: TABOOLA_ID,
      ...eventData
    };
    if (isPreview) {
      console.info("[Taboola preview]", event);
      return;
    }
    window._tfa = window._tfa || [];
    window._tfa.push(event);
  };

  if (!isPreview) {
    window.fbq = window.fbq || function fbq() {
      window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = window.fbq;
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = "2.0";
    window.fbq.queue = [];
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/pt_BR/fbevents.js";
    document.head.appendChild(script);
    window.fbq("init", PIXEL_ID);

    window._tfa = window._tfa || [];
    const taboolaScript = document.createElement("script");
    taboolaScript.async = true;
    taboolaScript.src = `https://cdn.taboola.com/libtrc/unip/${TABOOLA_ID}/tfa.js`;
    taboolaScript.id = "tb_tfa_script";
    document.head.appendChild(taboolaScript);
  }

  window.trackMetaEvent("PageView");
  window.trackTaboolaEvent("page_view");
})();
