/**
 * RePix Widget SDK (v1.2.0) — Captura de Comprovante Pix White-Label
 * Componente inteligente para checkouts e funis (MangoFy, etc.)
 * Exibição estrita: Ativa-se exclusivamente na tela em que o Pix foi gerado.
 */
(function (window, document) {
    'use strict';

    if (window.RePixWidget && window.RePixWidget.initialized) {
        return;
    }

    const defaultConfig = {
        apiBaseUrl: window.location.origin + '/api/v1',
        tenantKey: '',
        saleId: '',
        amountCents: 0,
        customerName: '',
        customerPhone: '',
        nominalName: '',
        upsellUrl: '',
        nextUrl: '',
        buttonText: 'Já realizou o Pix? Envie seu comprovante para liberar o pedido',
        btnActionText: 'Enviar Comprovante',
        btnColor: '#10b981',
        btnTextColor: '#ffffff',
        position: 'dock', // 'dock', 'bottom-bar', 'floating'
        theme: 'auto',
        autoShow: false, // Por padrão, NÃO exibe a barra no funil inteiro!
        autoDetectPix: true, // Detecta automaticamente quando o container do Pix for exibido
        pixSelector: '.pix-qrcode, [data-pix], #pix-container, #qrcode, canvas, [data-pix-code]',
        onSuccess: null
    };

    let widgetConfig = Object.assign({}, defaultConfig);
    let modalElement = null;
    let bottomBarElement = null;
    let selectedFile = null;
    let isUploading = false;
    let observer = null;
    let isPixVisible = false;

    // Detecta se a página hospedeira é tema claro ou escuro
    function detectPageTheme() {
        if (widgetConfig.theme === 'dark') return 'dark';
        if (widgetConfig.theme === 'light') return 'light';

        try {
            const bodyBg = window.getComputedStyle(document.body).backgroundColor;
            if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
                const rgb = bodyBg.match(/\d+/g);
                if (rgb && rgb.length >= 3) {
                    const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                    return brightness < 128 ? 'dark' : 'light';
                }
            }
        } catch (e) {}

        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    // Leitura de atributos da tag <script>
    function parseScriptAttributes() {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i];
            if (s.src && s.src.includes('repix-widget')) {
                return {
                    tenantKey: s.getAttribute('data-tenant-key') || '',
                    saleId: s.getAttribute('data-sale-id') || '',
                    amountCents: parseInt(s.getAttribute('data-amount-cents') || s.getAttribute('data-amount') || '0', 10),
                    customerName: s.getAttribute('data-customer-name') || '',
                    customerPhone: s.getAttribute('data-customer-phone') || '',
                    nominalName: s.getAttribute('data-nominal-name') || '',
                    upsellUrl: s.getAttribute('data-upsell-url') || s.getAttribute('data-redirect-url') || s.getAttribute('data-next-url') || '',
                    buttonText: s.getAttribute('data-button-text') || defaultConfig.buttonText,
                    btnActionText: s.getAttribute('data-btn-text') || defaultConfig.btnActionText,
                    btnColor: s.getAttribute('data-btn-color') || s.getAttribute('data-color') || defaultConfig.btnColor,
                    btnTextColor: s.getAttribute('data-btn-text-color') || defaultConfig.btnTextColor,
                    position: s.getAttribute('data-position') || defaultConfig.position,
                    theme: s.getAttribute('data-theme') || defaultConfig.theme,
                    autoShow: s.getAttribute('data-auto-show') === 'true',
                    autoDetectPix: s.getAttribute('data-auto-detect') !== 'false',
                    pixSelector: s.getAttribute('data-pix-selector') || defaultConfig.pixSelector,
                    apiBaseUrl: s.getAttribute('data-api-url') || defaultConfig.apiBaseUrl
                };
            }
        }
        return {};
    }

    // Leitura de parâmetros de URL
    function parseUrlParameters() {
        try {
            const params = new URLSearchParams(window.location.search);
            const data = {};
            if (params.get('sale_id')) data.saleId = params.get('sale_id');
            if (params.get('amount_cents')) data.amountCents = parseInt(params.get('amount_cents'), 10);
            if (params.get('amount')) data.amountCents = Math.round(parseFloat(params.get('amount')) * 100);
            if (params.get('customer_name')) data.customerName = params.get('customer_name');
            if (params.get('customer_phone')) data.customerPhone = params.get('customer_phone');
            if (params.get('upsell_url')) data.upsellUrl = params.get('upsell_url');
            if (params.get('next_url')) data.upsellUrl = params.get('next_url');
            if (params.get('redirect_url')) data.upsellUrl = params.get('redirect_url');
            if (params.get('btn_color')) data.btnColor = params.get('btn_color');
            return data;
        } catch (e) {
            return {};
        }
    }

    // Injeta estilos adaptativos CSS
    function injectStyles() {
        const existing = document.getElementById('repix-widget-styles');
        if (existing) existing.remove();

        const detected = detectPageTheme();
        const isDark = detected === 'dark';

        const dockBg = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
        const dockBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
        const dockShadow = isDark ? '0 12px 32px rgba(0, 0, 0, 0.5)' : '0 12px 32px rgba(0, 0, 0, 0.15)';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const modalBg = isDark ? '#0f172a' : '#ffffff';
        const modalBorder = isDark ? '#334155' : '#e2e8f0';
        const dropzoneBg = isDark ? '#1e293b' : '#f8fafc';
        const dropzoneBorder = isDark ? '#334155' : '#cbd5e1';

        const css = `
            #repix-bottom-wrapper {
                position: fixed;
                bottom: 16px;
                left: 0;
                right: 0;
                z-index: 999990;
                display: flex;
                justify-content: center;
                padding: 0 16px;
                pointer-events: none;
                font-family: inherit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                animation: repixSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #repix-bottom-dock {
                pointer-events: auto;
                max-width: 680px;
                width: 100%;
                background: ${dockBg};
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid ${dockBorder};
                box-shadow: ${dockShadow};
                border-radius: 16px;
                padding: 10px 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }
            .repix-dock-left {
                display: flex;
                align-items: center;
                gap: 10px;
                min-width: 0;
            }
            .repix-icon-badge {
                width: 34px;
                height: 34px;
                border-radius: 10px;
                background: rgba(16, 185, 129, 0.15);
                color: #10b981;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .repix-dock-text {
                font-size: 12px;
                font-weight: 600;
                color: ${textColor};
                line-height: 1.3;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .repix-dock-btn {
                background: ${widgetConfig.btnColor};
                color: ${widgetConfig.btnTextColor};
                border: none;
                padding: 9px 18px;
                border-radius: 10px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
                flex-shrink: 0;
                transition: transform 0.15s ease, opacity 0.15s ease;
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
            }
            .repix-dock-btn:hover {
                transform: translateY(-1px);
                opacity: 0.95;
            }
            .repix-dock-btn:active {
                transform: translateY(0);
            }

            /* Botão Inline para inserção direta */
            .repix-inline-btn {
                width: 100%;
                background: ${widgetConfig.btnColor};
                color: ${widgetConfig.btnTextColor};
                border: none;
                padding: 12px 20px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
                margin-top: 12px;
                transition: all 0.2s ease;
            }
            .repix-inline-btn:hover {
                filter: brightness(1.05);
                transform: translateY(-1px);
            }

            /* Modal de Upload */
            #repix-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                animation: repixFadeIn 0.2s ease;
                font-family: inherit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            #repix-modal-card {
                background: ${modalBg};
                border: 1px solid ${modalBorder};
                border-radius: 20px;
                max-width: 440px;
                width: 100%;
                padding: 24px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                color: ${textColor};
                position: relative;
                animation: repixZoomIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .repix-close-btn {
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                color: #94a3b8;
                font-size: 22px;
                line-height: 1;
                cursor: pointer;
                padding: 4px;
            }
            .repix-close-btn:hover {
                color: ${textColor};
            }
            .repix-dropzone {
                border: 2px dashed ${dropzoneBorder};
                background: ${dropzoneBg};
                border-radius: 14px;
                padding: 24px 16px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s ease;
                margin: 16px 0;
            }
            .repix-dropzone:hover, .repix-dropzone.dragover {
                border-color: ${widgetConfig.btnColor};
                background: rgba(16, 185, 129, 0.05);
            }
            .repix-upload-btn {
                width: 100%;
                background: ${widgetConfig.btnColor};
                color: ${widgetConfig.btnTextColor};
                border: none;
                padding: 12px;
                border-radius: 12px;
                font-weight: 700;
                font-size: 14px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            .repix-upload-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }
            .repix-bridge-link {
                display: block;
                text-align: center;
                font-size: 11px;
                color: #64748b;
                text-decoration: underline;
                margin-top: 10px;
                cursor: pointer;
            }
            .repix-bridge-link:hover {
                color: #94a3b8;
            }

            @keyframes repixSlideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes repixFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes repixZoomIn {
                from { transform: scale(0.95); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            @media (max-width: 520px) {
                #repix-bottom-dock {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 8px;
                    padding: 10px 12px;
                }
                .repix-dock-text {
                    font-size: 11px;
                    white-space: normal;
                }
                .repix-dock-btn {
                    width: 100%;
                    justify-content: center;
                    padding: 8px 14px;
                }
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = 'repix-widget-styles';
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

    // Renderiza a barra inferior somente quando autorizado
    function renderBottomBar() {
        if (bottomBarElement) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'repix-bottom-wrapper';

        wrapper.innerHTML = `
            <div id="repix-bottom-dock">
                <div class="repix-dock-left">
                    <div class="repix-icon-badge">
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <span class="repix-dock-text">${widgetConfig.buttonText}</span>
                </div>
                <button type="button" class="repix-dock-btn" id="repix-trigger-btn">
                    <span>${widgetConfig.btnActionText}</span>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                    </svg>
                </button>
            </div>
        `;

        document.body.appendChild(wrapper);
        bottomBarElement = wrapper;

        document.getElementById('repix-trigger-btn').addEventListener('click', openModal);
    }

    function removeBottomBar() {
        if (bottomBarElement) {
            bottomBarElement.remove();
            bottomBarElement = null;
        }
    }

    // Abre modal de envio
    function openModal(customOptions) {
        if (customOptions) {
            Object.assign(widgetConfig, customOptions);
        }

        if (modalElement) return;

        injectStyles();

        const overlay = document.createElement('div');
        overlay.id = 'repix-modal-overlay';

        overlay.innerHTML = `
            <div id="repix-modal-card">
                <button type="button" class="repix-close-btn" id="repix-modal-close-btn">&times;</button>
                
                <div id="repix-modal-content">
                    <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700;">Envio de Comprovante Pix</h3>
                    <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748b;">
                        Anexe o comprovante bancário da transferência para liberação imediata do seu pedido.
                    </p>

                    ${widgetConfig.saleId ? `
                        <div style="background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.08); padding: 8px 12px; border-radius: 8px; font-size: 11px; margin-bottom: 12px; display: flex; justify-content: space-between;">
                            <span style="color: #64748b;">Código do Pedido:</span>
                            <span style="font-family: monospace; font-weight: 700;">${widgetConfig.saleId}</span>
                        </div>
                    ` : ''}

                    <div class="repix-dropzone" id="repix-dropzone">
                        <input type="file" id="repix-file-input" accept="image/*,application/pdf" style="display: none;">
                        <div style="color: ${widgetConfig.btnColor}; margin-bottom: 6px;">
                            <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin: 0 auto;">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                        </div>
                        <div style="font-size: 13px; font-weight: 600;" id="repix-filename-text">Toque ou arraste seu comprovante aqui</div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Formatos aceitos: PDF, JPG, PNG</div>
                    </div>

                    <button type="button" class="repix-upload-btn" id="repix-submit-btn" disabled>
                        Confirmar Comprovante
                    </button>

                    ${widgetConfig.upsellUrl ? `
                        <a href="${widgetConfig.upsellUrl}" class="repix-bridge-link">Continuar para o pedido sem anexar agora &rarr;</a>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        modalElement = overlay;

        document.getElementById('repix-modal-close-btn').addEventListener('click', closeModal);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal();
        });

        const dropzone = document.getElementById('repix-dropzone');
        const fileInput = document.getElementById('repix-file-input');
        const submitBtn = document.getElementById('repix-submit-btn');
        const filenameText = document.getElementById('repix-filename-text');

        dropzone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', function () {
            if (this.files && this.files[0]) {
                selectedFile = this.files[0];
                filenameText.textContent = `${selectedFile.name}`;
                submitBtn.disabled = false;
            }
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                selectedFile = e.dataTransfer.files[0];
                filenameText.textContent = `${selectedFile.name}`;
                submitBtn.disabled = false;
            }
        });

        submitBtn.addEventListener('click', uploadProof);
    }

    function closeModal() {
        if (modalElement) {
            modalElement.remove();
            modalElement = null;
            selectedFile = null;
        }
    }

    async function uploadProof() {
        if (!selectedFile || isUploading) return;

        const submitBtn = document.getElementById('repix-submit-btn');
        const modalContent = document.getElementById('repix-modal-content');

        isUploading = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Validando comprovante...';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('sale_id', widgetConfig.saleId || 'MGF-' + Date.now().toString().slice(-5));
            formData.append('tenant_key', widgetConfig.tenantKey);
            if (widgetConfig.amountCents) formData.append('amount_cents', widgetConfig.amountCents);
            if (widgetConfig.customerName) formData.append('customer_name', widgetConfig.customerName);
            if (widgetConfig.customerPhone) formData.append('customer_phone', widgetConfig.customerPhone);
            if (widgetConfig.nominalName) formData.append('nominal_name', widgetConfig.nominalName);
            if (widgetConfig.upsellUrl) formData.append('upsell_url', widgetConfig.upsellUrl);

            const res = await fetch(`${widgetConfig.apiBaseUrl}/widget/upload-proof`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            modalContent.innerHTML = `
                <div style="text-align: center; padding: 12px 0;">
                    <div style="width: 50px; height: 50px; border-radius: 50%; background: ${widgetConfig.btnColor}; color: white; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto;">
                        <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700;">Comprovante Recebido!</h3>
                    <p style="margin: 0; font-size: 12px; color: #64748b;">
                        Seu pagamento foi atrelado com sucesso. Redirecionando...
                    </p>
                </div>
            `;

            if (typeof widgetConfig.onSuccess === 'function') {
                widgetConfig.onSuccess(data);
            }

            const targetRedirectUrl = widgetConfig.upsellUrl || data.redirect_url || '';
            if (targetRedirectUrl) {
                setTimeout(() => {
                    window.location.href = targetRedirectUrl;
                }, 1200);
            } else {
                setTimeout(() => {
                    closeModal();
                    removeBottomBar();
                }, 2000);
            }

        } catch (err) {
            alert('Falha ao enviar comprovante: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Tentar Novamente';
        } finally {
            isUploading = false;
        }
    }

    // Detector Inteligente de Tela Pix
    function checkPixScreen() {
        if (!widgetConfig.autoDetectPix) return;

        try {
            // Verifica existência de elementos típicos de tela de Pix gerado
            let found = false;

            // 1. Procura por seletores configurados
            const candidates = document.querySelectorAll(widgetConfig.pixSelector);
            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i];
                if (el && el.offsetParent !== null && (el.offsetWidth > 20 || el.offsetHeight > 20)) {
                    found = true;
                    break;
                }
            }

            // 2. Procura por conteúdo de payload Pix (000201...)
            if (!found) {
                const textNodes = document.querySelectorAll('input, textarea, p, span, code');
                for (let i = 0; i < textNodes.length; i++) {
                    const val = textNodes[i].value || textNodes[i].textContent || '';
                    if (val.includes('000201') && val.includes('br.gov.bcb.pix')) {
                        if (textNodes[i].offsetParent !== null) {
                            found = true;
                            break;
                        }
                    }
                }
            }

            if (found && !isPixVisible) {
                isPixVisible = true;
                injectStyles();
                renderBottomBar();
            } else if (!found && isPixVisible && !widgetConfig.autoShow) {
                isPixVisible = false;
                removeBottomBar();
            }
        } catch (e) {}
    }

    function setupAutoDetection() {
        if (!widgetConfig.autoDetectPix) return;

        // Verificação imediata
        checkPixScreen();

        // Monitora mutações no DOM (SPA, abas, geração dinâmica de Pix)
        if (window.MutationObserver) {
            observer = new MutationObserver(() => {
                checkPixScreen();
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        } else {
            setInterval(checkPixScreen, 1500);
        }
    }

    // API Pública
    window.RePixWidget = {
        initialized: true,
        init: function (options) {
            const scriptAttrs = parseScriptAttributes();
            const urlParams = parseUrlParameters();
            widgetConfig = Object.assign({}, defaultConfig, scriptAttrs, urlParams, options || {});

            injectStyles();

            if (widgetConfig.autoShow) {
                renderBottomBar();
            } else if (widgetConfig.autoDetectPix) {
                setupAutoDetection();
            }
        },

        // Exibe a barra de comprovante
        show: function (options) {
            if (options) Object.assign(widgetConfig, options);
            injectStyles();
            renderBottomBar();
        },

        // Oculta a barra de comprovante
        hide: function () {
            removeBottomBar();
            closeModal();
        },

        // Abre o modal diretamente
        open: openModal,

        // Fecha o modal
        close: closeModal,

        // Monta um botão diretamente dentro de um elemento alvo na tela do Pix
        mount: function (targetSelector, options) {
            if (options) Object.assign(widgetConfig, options);
            injectStyles();

            const target = typeof targetSelector === 'string' ? document.querySelector(targetSelector) : targetSelector;
            if (!target) return false;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'repix-inline-btn';
            btn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                </svg>
                <span>${widgetConfig.buttonText || 'Já pagou? Envie seu comprovante aqui'}</span>
            `;

            btn.addEventListener('click', () => openModal(options));
            target.appendChild(btn);
            return true;
        },

        // Helper para obter URL da tela intermediária (Bridge)
        getBridgeUrl: function (saleId, amountCents, nextUrl) {
            const baseUrl = widgetConfig.apiBaseUrl.replace('/api/v1', '');
            const sId = saleId || widgetConfig.saleId;
            const amt = amountCents || widgetConfig.amountCents;
            const dest = nextUrl || widgetConfig.upsellUrl;
            return `${baseUrl}/bridge?sale_id=${encodeURIComponent(sId)}&amount_cents=${amt}&next_url=${encodeURIComponent(dest)}`;
        }
    };

    // Alias conveniente
    window.RePix = window.RePixWidget;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.RePixWidget.init());
    } else {
        window.RePixWidget.init();
    }

})(window, document);
