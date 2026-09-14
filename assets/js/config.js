/**
 * Configurações e utilitários globais do RePix Frontend
 */
// Detecção Dinâmica da API (Suporta Local, Custom Domain e Produção Cloudflare)
const CUSTOM_API_URL = localStorage.getItem("repix_custom_api_url") || window.REPIX_API_URL || "";
let API_BASE_URL = CUSTOM_API_URL;

if (!API_BASE_URL) {
    if (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1") || window.location.origin.includes(":8000")) {
        API_BASE_URL = `${window.location.origin}/api/v1`;
    } else if (window.location.protocol === 'file:') {
        API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
    } else {
        // Produção oficial RePix
        API_BASE_URL = 'https://api.repix.site/api/v1';
    }
}

const REPIX_CONFIG = {
    apiBaseUrl: API_BASE_URL,
    
    // Gerenciamento de Tema (Modo Noturno / Claro)
    initTheme() {
        const savedTheme = localStorage.getItem("repix_theme") || "dark";
        if (savedTheme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        return savedTheme;
    },
    toggleTheme() {
        const isDark = document.documentElement.classList.toggle("dark");
        const theme = isDark ? "dark" : "light";
        localStorage.setItem("repix_theme", theme);
        return theme;
    },
    isDark() {
        return document.documentElement.classList.contains("dark");
    },

    // Autenticação e Sessão
    getToken() {
        return localStorage.getItem("repix_auth_token") || "";
    },
    setToken(token) {
        localStorage.setItem("repix_auth_token", token);
    },
    getUser() {
        try {
            return JSON.parse(localStorage.getItem("repix_user_data") || "null");
        } catch (e) {
            return null;
        }
    },
    setUser(user) {
        localStorage.setItem("repix_user_data", JSON.stringify(user));
    },
    exitImpersonation() {
        const savedToken = localStorage.getItem("repix_saved_admin_token");
        const savedUser = localStorage.getItem("repix_saved_admin_user");
        sessionStorage.removeItem("repix_impersonation_active");
        sessionStorage.removeItem("repix_impersonated_name");
        if (savedToken && savedUser) {
            localStorage.setItem("repix_auth_token", savedToken);
            localStorage.setItem("repix_user_data", savedUser);
            localStorage.removeItem("repix_saved_admin_token");
            localStorage.removeItem("repix_saved_admin_user");
        }
        window.location.href = "/admin";
    },
    logout() {
        localStorage.removeItem("repix_auth_token");
        localStorage.removeItem("repix_user_data");
        localStorage.removeItem("repix_saved_admin_token");
        localStorage.removeItem("repix_saved_admin_user");
        sessionStorage.removeItem("repix_impersonation_active");
        sessionStorage.removeItem("repix_impersonated_name");
        window.location.href = "/login";
    },
    getAuthHeaders() {
        const token = this.getToken();
        const headers = { "Content-Type": "application/json" };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        return headers;
    },

    formatBRL(centsOrReais, isCents = true) {
        const val = isCents ? centsOrReais / 100 : centsOrReais;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(val || 0);
    },

    formatDateTime(isoString) {
        if (!isoString) return "-";
        try {
            const dt = new Date(isoString);
            return new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).format(dt);
        } catch (e) {
            return isoString;
        }
    },

    formatTime(isoString) {
        if (!isoString) return "-";
        try {
            const dt = new Date(isoString);
            return new Intl.DateTimeFormat('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            }).format(dt);
        } catch (e) {
            return isoString;
        }
    },

    getStatusBadge(status, hasProof, isDivergent, isRecovered = false) {
        // 1. Venda Recuperada (Azul)
        if (isRecovered) {
            return `<span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60">
                Recuperada
            </span>`;
        }
        // 2. Divergência (Vermelho)
        if (isDivergent || (hasProof && status !== 'paid')) {
            return `<span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60">
                Divergência
            </span>`;
        }
        // 3. Pago (Verde)
        if (status === 'paid') {
            return `<span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60">
                Pago
            </span>`;
        }
        // 4. Pendente (Amarelo)
        return `<span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60">
            Pendente
        </span>`;
    },

    getWhatsAppBadge(recoverySent, recoverySentAt) {
        if (recoverySent) {
            return `<span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" title="Enviado em ${this.formatDateTime(recoverySentAt)}">
                Disparado
            </span>`;
        }
        return `<span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                Não enviado
            </span>`;
    },

    openDirectWhatsApp(tx, customTemplate = null) {
        if (!tx) return;
        let rawPhone = (tx.customer_phone || '').replace(/\D/g, '');
        if (!rawPhone) {
            const input = prompt("Informe o WhatsApp do cliente com DDD (ex: 11999998888):");
            if (!input) return;
            rawPhone = input.replace(/\D/g, '');
        }
        if (!rawPhone) return;

        // Garante DDI 55 (Brasil)
        let fullPhone = rawPhone;
        if (fullPhone.length === 10 || fullPhone.length === 11) {
            fullPhone = '55' + fullPhone;
        } else if (!fullPhone.startsWith('55') && fullPhone.length > 8) {
            fullPhone = '55' + fullPhone;
        }

        const customerName = tx.customer_name ? tx.customer_name.trim().split(' ')[0] : 'Cliente';
        const amountFormatted = this.formatBRL(tx.amount_cents);
        const pixCode = tx.pix_copy_paste || `00020126580014br.gov.bcb.pix0136rep_${tx.id}520400005303986540${(tx.amount_cents/100).toFixed(2)}5802BR5913RePix6009SaoPaulo62070503***6304`;
        const proofLink = `${window.location.origin}/checkout?sale_id=${tx.id}`;

        let template = customTemplate || `{Olá|Oi|Tudo bem}, {nome}!

Notamos que seu pedido no valor de *{valor}* via Pix ainda está pendente de confirmação.

Caso já tenha realizado a transferência, envie o seu comprovante pelo link abaixo para agilizar a liberação:
{link_comprovante}

Se ainda não realizou, você pode utilizar o Pix Copia e Cola:
\`{codigo_pix}\`

Se precisar de qualquer ajuda, estamos à disposição!`;

        // Processa spintax {Opção1|Opção2}
        let message = template.replace(/\{([^{}]+)\}/g, (match, choices) => choices.split('|')[0]);

        // Substitui variáveis do template
        message = message
            .replace(/\{nome\}/g, customerName)
            .replace(/\{valor\}/g, amountFormatted)
            .replace(/\{codigo_pix\}/g, pixCode)
            .replace(/\{link_comprovante\}/g, proofLink)
            .replace(/\{sale_id\}/g, tx.id);

        // Remove emojis problemáticos e caracteres de substituição
        message = message.replace(/👋/g, '').replace(/👉/g, '').replace(/[\uFFFD]/g, '').trim();

        const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    }
};

// Inicialização imediata do tema para evitar flash branco (Default: Dark)
REPIX_CONFIG.initTheme();

window.REPIX_CONFIG = REPIX_CONFIG;
