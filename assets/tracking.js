(() => {
  const PIXEL_ID = "2163835031230117";
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

  }

  window.trackMetaEvent("PageView");
})();
