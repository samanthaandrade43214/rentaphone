const DEFAULT_REPIX_WHATSAPP_TEMPLATE = `{Olá|Oi|Tudo bem}, {nome}!

Notamos que seu pedido no valor de *{valor}* via Pix ainda está pendente de confirmação.

Caso já tenha realizado a transferência, envie o seu comprovante pelo link abaixo para agilizar a liberação:
{link_comprovante}

Se ainda não realizou, você pode utilizar o Pix Copia e Cola:
\`{codigo_pix}\`

Se precisar de qualquer ajuda, estamos à disposição!`;

/**
 * Lógica do Dashboard RePix — Conciliação, Retenção, Auditoria Pix e Recuperação WhatsApp (Evolution API)
 * Suporte a Sidebar Retrátil, Modo Noturno e Total Responsividade Mobile
 */

document.addEventListener('alpine:init', () => {
    Alpine.data('dashboardApp', () => ({
        // Usuário & Tenant
        currentUser: null,
        // Alteração de Senha do Lojista
        changePasswordModalOpen: false,
        changePasswordCurrent: '',
        changePasswordNew: '',
        changePasswordConfirm: '',
        changePasswordLoading: false,
        changePasswordMsg: '',
        changePasswordError: '',
        
                // Notificações do Sino
        notificationsOpen: false,
        notifications: [],
        unreadNotificationsCount: 0,

        // Pré-configuração Obrigatória (Onboarding do 1º Acesso)
        onboardingModalOpen: false,
        onboardingStep: 'mangofy',
        onboardingSaving: false,
        onboardingError: '',
        onboardingSuccess: false,
        onboardingData: {
            mangofy_api_key: '',
            mangofy_store_code: '',
            pix_beneficiary_name: 'RePix Pagamentos S.A.',
            pix_key_default: '',
            pix_expiration_minutes: 15
        },
        // Estado do Menu Lateral (Sidebar)
        sidebarOpen: false,
        isDarkTheme: false,

        // Filtros e Períodos (Single-Calendar DatePicker)
        isDatepickerOpen: false,
        currentPeriod: 'today',
        selectedPreset: 'today',
        customStartDate: new Date().toISOString().slice(0, 10),
        customEndDate: new Date().toISOString().slice(0, 10),
        tempStartDate: new Date().toISOString().slice(0, 10),
        tempEndDate: new Date().toISOString().slice(0, 10),
        hoverDate: '',
        calYear: new Date().getFullYear(),
        calMonth: new Date().getMonth(),
        customDateModalOpen: false,
        
        // Cards de Métricas
        cards: {
            total_paid_revenue_cents: 0,
            total_pix_generated: 0,
            total_pix_paid: 0,
            conversion_rate_percentage: 0.0,
            attention_transactions_count: 0
        },

        // Dados Gráficos e Tabelas
        hourlyConversion: [],
        nominalPerformance: [],
        latestTransactions: [],
        transactions: [],

        // Paginação e Busca
        totalTransactions: 0,
        currentPage: 1,
        pageSize: 10,
        totalPages: 1,
        searchQuery: '',
        statusFilter: 'all',
        divergentOnly: false,
        tableLoading: false,

        // Modal de Comprovante
        proofModalOpen: false,
        selectedTx: null,
        proofModalUrl: null,
        proofModalIsPdf: false,

        // Modal de Integração & Checkout Pix
        integrationModalOpen: false,
        integrationTab: 'ai_prompt',
        integrationUrlCopied: false,
        widgetSnippetCopied: false,
        aiPromptCopied: false,
        bridgeSnippetCopied: false,
        aiUpsellUrl: '',
        aiCheckoutFile: '',

        isMangofyConfigured: false,
        isPixConfigured: false,
        configFeedbackMessage: '',
        configFeedbackType: 'success',

        openIntegrationModal(tab = 'ai_prompt') {
            this.integrationTab = tab;
            this.integrationModalOpen = true;
            this.sidebarOpen = false;
            this.configFeedbackMessage = '';
        },

        // Sistema de Créditos & Recarga MangoFy
        balanceCents: 0,
        balanceReais: '0,00',
        lockedCount: 0,
        waitingDelayCount: 0,
        rechargeModalOpen: false,
        rechargeTab: 'pix', // 'pix', 'card', 'history'
        rechargeAmount: 50,
        customRechargeAmount: '',
        customRechargeDisplay: '',
        rechargeNotice: '',
        rechargePixData: null,
        rechargePollingInterval: null,
        rechargeLoading: false,
        pixCopied: false,
        rechargeSuccessMessage: '',
        rechargeErrorMessage: '',
        creditHistory: [],
        rechargeCardData: {
            number: '',
            holder: '',
            expMonth: '12',
            expYear: '2028',
            cvv: ''
        },

        async loadBalance() {
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/credits/balance`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this.balanceCents = data.balance_cents;
                    this.balanceReais = data.balance_reais;
                    this.lockedCount = data.locked_count;
                    this.waitingDelayCount = data.waiting_delay_count;
                    this.creditHistory = data.history || [];
                }
            } catch (err) {
                console.error("Erro ao carregar saldo:", err);
            }
        },

        openRechargeModal(notice = '') {
            this.rechargeNotice = notice;
            this.rechargeSuccessMessage = '';
            this.rechargeErrorMessage = '';
            this.rechargeModalOpen = true;
            this.sidebarOpen = false;
            this.rechargePixData = null; // Só gera ao clicar em "Gerar Cobrança Pix"
            this.loadBalance();
        },

        closeRechargeModal() {
            if (this.rechargePollingInterval) {
                clearInterval(this.rechargePollingInterval);
                this.rechargePollingInterval = null;
            }
            this.rechargeModalOpen = false;
            this.rechargeSuccessMessage = '';
            this.rechargeErrorMessage = '';
        },

        selectRechargeAmount(val) {
            this.rechargeAmount = val;
            this.customRechargeAmount = '';
            this.customRechargeDisplay = '';
            this.rechargePixData = null; // Reseta para exigir clique em "Gerar Cobrança Pix"
        },

        handleCustomAmountInput(e) {
            const input = e.target;
            const valStr = input.value || '';
            // Remove qualquer sufixo ',00' e caracteres não numéricos
            const cleanDigits = valStr.replace(/,00$/, '').replace(/,0$/, '').replace(/,/g, '').replace(/\D/g, '');

            if (!cleanDigits) {
                this.customRechargeAmount = '';
                this.customRechargeDisplay = '';
                this.rechargePixData = null;
                return;
            }

            let num = parseInt(cleanDigits, 10);
            // Limite máximo de R$ 600,00
            if (num > 600) {
                num = 600;
            }

            this.customRechargeAmount = num;
            this.customRechargeDisplay = num + ',00';
            this.rechargeAmount = 0; // Desmarca botões fixos
            this.rechargePixData = null;

            // Mantém o cursor exatamente antes do ",00"
            this.$nextTick(() => {
                const caretPos = String(num).length;
                try {
                    input.setSelectionRange(caretPos, caretPos);
                } catch (err) {}
            });
        },

        handleCustomAmountKeydown(e) {
            if (e.key === 'Backspace') {
                const numStr = String(this.customRechargeAmount || '');
                if (!numStr) return;

                const selStart = e.target.selectionStart;
                // Se o cursor estiver na área do ",00"
                if (selStart > numStr.length) {
                    e.preventDefault();
                    const trimmed = numStr.slice(0, -1);
                    if (!trimmed) {
                        this.customRechargeAmount = '';
                        this.customRechargeDisplay = '';
                    } else {
                        const num = parseInt(trimmed, 10);
                        this.customRechargeAmount = num;
                        this.customRechargeDisplay = num + ',00';
                        this.$nextTick(() => {
                            e.target.setSelectionRange(trimmed.length, trimmed.length);
                        });
                    }
                    this.rechargePixData = null;
                }
            } else if (e.key === ',' || e.key === '.') {
                // Bloqueia digitação de casas decimais para manter ,00 fixo
                e.preventDefault();
            }
        },

        isOddCustomAmount() {
            if (!this.customRechargeAmount) return false;
            const val = parseInt(this.customRechargeAmount, 10) || 0;
            return val > 0 && val % 2 !== 0;
        },

        calculateRePixCoins(amountReais) {
            const amount = parseFloat(amountReais) || 0;
            if (amount <= 0) return 0;
            if (amount >= 200) {
                // Preço promocional: R$ 1,50 por RePix
                return Math.floor(amount / 1.50);
            }
            // Preço base: R$ 2,00 por RePix
            return Math.floor(amount / 2.00);
        },

        getFinalRechargeAmount() {
            if (this.customRechargeAmount) {
                let val = parseInt(this.customRechargeAmount, 10) || 0;
                if (val > 600) val = 600;
                // Se for ímpar, arredonda 1 para baixo para bater exatamente com a paridade dos RePix
                if (val % 2 !== 0) {
                    val = val - 1;
                }
                return val;
            }
            return parseFloat(this.rechargeAmount) || 50;
        },

        async generatePix() {
            this.rechargeLoading = true;
            this.rechargeErrorMessage = '';
            try {
                const amount = this.getFinalRechargeAmount();
                if (amount < 20) {
                    this.rechargeErrorMessage = 'O valor mínimo para recarga é de R$ 20,00.';
                    this.rechargeLoading = false;
                    return;
                }

                // Se o valor digitado era ímpar, atualiza o campo de texto para o valor ajustado
                if (this.customRechargeAmount && parseInt(this.customRechargeAmount, 10) !== amount) {
                    this.customRechargeAmount = amount;
                    this.customRechargeDisplay = amount + ',00';
                }

                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/credits/recharge`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        amount_reais: amount,
                        payment_method: 'pix'
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    const rawPix = (data.pix && (data.pix.pix_qrcode_text || data.pix.pix_qrcode_image))
                        ? data.pix
                        : (data.data?.pix && (data.data.pix.pix_qrcode_text || data.data.pix.pix_qrcode_image))
                            ? data.data.pix
                            : (data.data?.pix_qrcode_text ? data.data : (data.pix || {}));

                    this.rechargePixData = {
                        ...data,
                        pix: {
                            pix_qrcode_text: rawPix.pix_qrcode_text || '',
                            pix_qrcode_image: rawPix.pix_qrcode_image || '',
                            pix_expires_at: rawPix.pix_expires_at || ''
                        }
                    };
                    this.startRechargePolling(data.external_code);
                } else {
                    this.rechargeErrorMessage = data.detail || 'Erro ao gerar PIX de recarga.';
                }
            } catch (err) {
                this.rechargeErrorMessage = err.message;
            } finally {
                this.rechargeLoading = false;
            }
        },

        
        startRechargePolling(code) {
            if (this.rechargePollingInterval) clearInterval(this.rechargePollingInterval);
            this.rechargePollingInterval = setInterval(async () => {
                if (!this.rechargePixData) {
                    clearInterval(this.rechargePollingInterval);
                    return;
                }
                try {
                    const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/credits/check-payment-status?code=${code}`, {
                        headers: REPIX_CONFIG.getAuthHeaders()
                    });
                    const st = await res.json();
                    if (st.paid) {
                        clearInterval(this.rechargePollingInterval);
                        this.rechargePollingInterval = null;
                        this.rechargeSuccessMessage = 'Pagamento confirmado pela MangoFy! Seus RePix foram creditados com sucesso.';
                        this.rechargePixData = null;
                        await this.loadBalance();
            await this.loadNotifications();
            }
                } catch (e) {}
            }, 3500);
        },
    
        copyPixCode() {
            const qrcodeText = this.rechargePixData?.pix?.pix_qrcode_text 
                || this.rechargePixData?.data?.pix?.pix_qrcode_text 
                || '';
            if (!qrcodeText) return;
            navigator.clipboard.writeText(qrcodeText).then(() => {
                this.pixCopied = true;
                setTimeout(() => this.pixCopied = false, 3000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = qrcodeText;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this.pixCopied = true;
                setTimeout(() => this.pixCopied = false, 3000);
            });
        },

        cancelPixRecharge() {
            this.stopRechargePolling();
            this.rechargePixData = null;
        },

        async payWithCard() {
            this.rechargeErrorMessage = 'O pagamento via cartão de crédito está desabilitado temporariamente. Por favor, utilize a opção PIX.';
            this.rechargeTab = 'pix';
        },

        exportHistoryTxt() {
            try {
                const user = this.currentUser || { name: 'Lojista RePix', tenant_id: 'tenant_default', email: 'loja@repix.com.br' };
                const now = new Date();
                const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');
                const balance = (this.balanceReais || '0,00').replace('.', ',');
                const repixCoins = Math.floor((this.balanceCents || 0) / 200);

                let lines = [];
                lines.push('================================================================================');
                lines.push('                   REPIX - EXTRATO OFICIAL DE MOEDAS REPIX E SALDO              ');
                lines.push('================================================================================');
                lines.push(`Lojista / Conta:  ${user.name || 'Loja RePix'} (${user.email || user.tenant_id})`);
                lines.push(`Identificador:    ${user.tenant_id}`);
                lines.push(`Data de Emissão:  ${dateStr}`);
                lines.push(`Saldo Disponível: ${repixCoins} RePix (equivalente a R$ ${balance})`);
                lines.push('--------------------------------------------------------------------------------');
                lines.push(
                    'DATA / HORA'.padEnd(20) + ' | ' +
                    'OPERAÇÃO'.padEnd(12) + ' | ' +
                    'DESCRIÇÃO'.padEnd(32) + ' | ' +
                    'VALOR'
                );
                lines.push('--------------------------------------------------------------------------------');

                if (!this.creditHistory || this.creditHistory.length === 0) {
                    lines.push('Nenhuma movimentação registrada no histórico.');
                } else {
                    this.creditHistory.forEach(item => {
                        const dt = new Date(item.created_at);
                        const dtStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR');
                        const isCredit = item.amount_cents > 0;
                        const op = isCredit ? 'CRÉDITO' : 'DÉBITO';
                        const desc = (item.description || '').padEnd(32).substring(0, 32);
                        const val = (isCredit ? '+R$ ' : '-R$ ') + (Math.abs(item.amount_cents) / 100).toFixed(2).replace('.', ',');
                        lines.push(
                            dtStr.padEnd(20) + ' | ' +
                            op.padEnd(12) + ' | ' +
                            desc + ' | ' +
                            val
                        );
                    });
                }

                lines.push('--------------------------------------------------------------------------------');
                lines.push(`Total de Lançamentos: ${this.creditHistory ? this.creditHistory.length : 0}`);
                lines.push(`Saldo Final em Conta: R$ ${balance}`);
                lines.push('================================================================================');

                const content = lines.join('\r\n');
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const fileDate = now.toISOString().slice(0, 10);
                a.download = `extrato_repix_${user.tenant_id}_${fileDate}.txt`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 100);
            } catch (err) {
                console.error('Erro ao exportar extrato:', err);
                alert('Erro ao exportar extrato: ' + err.message);
            }
        },

        // ==========================================
        // MÓDULO WHATSAPP (EVOLUTION API)
        // ==========================================
        whatsappModalOpen: false,
        whatsappQrModalOpen: false,
        whatsappActiveTab: 'template', // 'template' como padrão
        whatsappLoading: false,
        whatsappQrData: null,
        whatsappQrPollingTimer: null,
        whatsappSaveSuccess: false,
        whatsappTestPhone: '',
        whatsappTestLoading: false,
        whatsappTestResult: null,

        whatsappConfig: {
            instance_name: 'rep_tenant_loja1',
            instance_status: 'disconnected',
            api_url: 'http://localhost:8080',
            api_key: '',
            delay_minutes: 15,
            is_active: false,
            message_template: DEFAULT_REPIX_WHATSAPP_TEMPLATE
        },

        // Modal de Disparo Manual de WhatsApp
        manualWhatsAppModalOpen: false,
        manualTx: null,
        manualPhone: '',
        manualCustomMessage: '',
        manualSending: false,
        manualResult: null,

        // Instância do Chart.js
        hourlyChart: null,

        getIntegrationWebhookUrl() {
            const tenantId = this.currentUser?.tenant_id || 'tenant_default';
            if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')) {
                return `${window.location.origin}/api/v1/webhooks/mangofy/${tenantId}`;
            }
            return `https://api.repix.site/api/v1/webhooks/mangofy/${tenantId}`;
        },

        copyIntegrationWebhookUrl() {
            const url = this.getIntegrationWebhookUrl();
            navigator.clipboard.writeText(url).then(() => {
                this.integrationUrlCopied = true;
                setTimeout(() => this.integrationUrlCopied = false, 3000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this.integrationUrlCopied = true;
                setTimeout(() => this.integrationUrlCopied = false, 3000);
            });
        },

        
        getAiPromptCode() {
            const origin = window.location.origin.includes('file:') ? 'http://127.0.0.1:8000' : window.location.origin;
            const upsell = this.aiUpsellUrl || 'https://sualoja.com/upsell-1';
            const targetFile = this.aiCheckoutFile || 'meu checkout (HTML/JS)';

            return `Você é um desenvolvedor frontend especialista em integrações de checkout e pagamentos Pix.
Preciso integrar o RePix (sistema de captura e conciliação de comprovantes Pix) ao meu funil de vendas (${targetFile}).

DADOS DE CONFIGURAÇÃO DO REPIX:
- URL Base do RePix: ${origin}
- URL da Próxima Etapa / Upsell 1: ${upsell}

REGRAS DE NEGÓCIO OBRIGATÓRIAS:
1. O botão/barra de anexo de comprovante NÃO PODE aparecer em todo o funil! Ele deve aparecer ESTRITAMENTE e EXCLUSIVAMENTE na tela em que a cobrança Pix for gerada com sucesso (onde o cliente visualiza o QR Code e a chave Copia e Cola).
2. Se o cliente mudar de aba (ex: para Cartão de Crédito) ou voltar para o formulário, a barra de comprovante deve ser ocultada imediatamente.
3. Se o cliente estiver em uma página de UPSELL com opção de pagamento Pix, a mesma regra se aplica: exibir o botão somente quando o Pix do Upsell for gerado.
4. TELA INTERMEDIÁRIA (BRIDGE): Se o cliente gerar o Pix mas NÃO anexar o comprovante na tela do QR Code e clicar no botão "Já paguei / Continuar", ele deve ser redirecionado para a tela intermediária de captura do RePix antes de ir ao Upsell:
   ${origin}/bridge?sale_id={ID_DA_VENDA}&amount_cents={VALOR_CENTAVOS}&next_url=${encodeURIComponent(upsell)}

INSTRUÇÕES DE IMPLEMENTAÇÃO NO MEU CÓDIGO:

1. Carregar o SDK do RePix no <head> ou antes do </body>:
<script src="${origin}/assets/js/repix-widget.js" data-auto-show="false"></script>

2. Disparar a exibição no momento exato em que a resposta da API do gateway gerar o Pix:
// No seu callback/função que renderiza o QR Code do Pix:
if (window.RePixWidget) {
    window.RePixWidget.show({
        saleId: venda.id, // ou codigo_venda
        amountCents: venda.valor_centavos,
        upsellUrl: '${upsell}'
    });
}

3. Ocultar caso o cliente selecione Cartão ou saia do Pix:
if (window.RePixWidget) window.RePixWidget.hide();

4. No botão "Já fiz o Pix / Continuar", caso não tenha enviado o comprovante, redirecionar para a ponte:
const bridgeUrl = "${origin}/bridge?sale_id=" + encodeURIComponent(venda.id) + "&amount_cents=" + venda.valor_centavos + "&next_url=" + encodeURIComponent("${upsell}");
window.location.href = bridgeUrl;

Analise o código do meu checkout abaixo e aplique exatamente essa lógica, mantendo o design do meu checkout intacto.`;
        },

        copyAiPrompt() {
            const code = this.getAiPromptCode();
            navigator.clipboard.writeText(code).then(() => {
                this.aiPromptCopied = true;
                setTimeout(() => this.aiPromptCopied = false, 3000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this.aiPromptCopied = true;
                setTimeout(() => this.aiPromptCopied = false, 3000);
            });
        },

        getBridgeSnippetCode() {
            const origin = window.location.origin.includes('file:') ? 'http://127.0.0.1:8000' : window.location.origin;
            return `// Redirecionamento para Tela Intermediária (Bridge) entre Checkout e Upsell:
const bridgeUrl = "${origin}/bridge?sale_id=" + encodeURIComponent(saleId) + 
                  "&amount_cents=" + amountCents + 
                  "&next_url=" + encodeURIComponent("https://sualoja.com/upsell-1");

// Redireciona o comprador para a tela intermediária:
window.location.href = bridgeUrl;`;
        },

        copyBridgeSnippet() {
            const code = this.getBridgeSnippetCode();
            navigator.clipboard.writeText(code).then(() => {
                this.bridgeSnippetCopied = true;
                setTimeout(() => this.bridgeSnippetCopied = false, 3000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this.bridgeSnippetCopied = true;
                setTimeout(() => this.bridgeSnippetCopied = false, 3000);
            });
        },

        getWidgetSnippetCode() {
            const origin = window.location.origin.includes('file:') ? 'http://127.0.0.1:8000' : window.location.origin;
            return `<!-- Widget RePix White-Label: Cole antes do </body> no seu Checkout -->\n<script src="${origin}/assets/js/repix-widget.js"\n        data-sale-id="CODIGO_DA_VENDA_MANGOFY"\n        data-upsell-url="https://sualoja.com/upsell-1"\n        data-button-text="Já realizou o Pix? Envie seu comprovante para liberar o pedido">\n</script>`;
        },

        copyWidgetSnippet() {
            const code = this.getWidgetSnippetCode();
            navigator.clipboard.writeText(code).then(() => {
                this.widgetSnippetCopied = true;
                setTimeout(() => this.widgetSnippetCopied = false, 3000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this.widgetSnippetCopied = true;
                setTimeout(() => this.widgetSnippetCopied = false, 3000);
            });
        },

        toggleTheme() {
            REPIX_CONFIG.toggleTheme();
            this.isDarkTheme = REPIX_CONFIG.isDark();
            this.renderHourlyChart();
        },

        // Inicialização
        
        async loadNotifications() {
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/notifications`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this.notifications = data.notifications || [];
                    this.unreadNotificationsCount = data.unread_count || 0;
                }
            } catch (e) {}
        },

        async markNotificationsRead() {
            try {
                this.unreadNotificationsCount = 0;
                this.notifications.forEach(n => n.read = true);
                await fetch(`${REPIX_CONFIG.apiBaseUrl}/notifications/mark-read`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
            } catch (e) {}
        },

        
        async loadIntegrationStatus() {
            const tenantId = this.currentUser?.tenant_id || 'tenant_default';
            if (localStorage.getItem(`repix_mangofy_configured_${tenantId}`) === 'true') {
                this.isMangofyConfigured = true;
            }
            if (localStorage.getItem(`repix_pix_configured_${tenantId}`) === 'true') {
                this.isPixConfigured = true;
            }

            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/settings/onboarding`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.mangofy_configured) {
                        this.isMangofyConfigured = true;
                        localStorage.setItem(`repix_mangofy_configured_${tenantId}`, 'true');
                    }
                    if (data.pix_configured) {
                        this.isPixConfigured = true;
                        localStorage.setItem(`repix_pix_configured_${tenantId}`, 'true');
                    }
                }
            } catch (e) {
                console.warn('Erro ao carregar status de integração:', e);
            }
        },

        async toggleMangofyConfigured(status = null) {
            const tenantId = this.currentUser?.tenant_id || 'tenant_default';
            this.isMangofyConfigured = status !== null ? status : !this.isMangofyConfigured;
            localStorage.setItem(`repix_mangofy_configured_${tenantId}`, this.isMangofyConfigured ? 'true' : 'false');
            this.configFeedbackType = 'success';
            this.configFeedbackMessage = this.isMangofyConfigured 
                ? 'Integração MangoFy concluída com sucesso! Pendência removida.' 
                : 'Integração MangoFy marcada como pendente.';
            setTimeout(() => { this.configFeedbackMessage = ''; }, 4000);

            try {
                await fetch(`${REPIX_CONFIG.apiBaseUrl}/settings/onboarding`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({ mangofy_configured: this.isMangofyConfigured })
                });
            } catch (err) {}
        },

        async togglePixConfigured(status = null) {
            const tenantId = this.currentUser?.tenant_id || 'tenant_default';
            this.isPixConfigured = status !== null ? status : !this.isPixConfigured;
            localStorage.setItem(`repix_pix_configured_${tenantId}`, this.isPixConfigured ? 'true' : 'false');
            this.configFeedbackType = 'success';
            this.configFeedbackMessage = this.isPixConfigured 
                ? 'Widget de Checkout Pix marcado como instalado! Pendência removida.' 
                : 'Checkout Pix marcado como pendente.';
            setTimeout(() => { this.configFeedbackMessage = ''; }, 4000);

            try {
                await fetch(`${REPIX_CONFIG.apiBaseUrl}/settings/onboarding`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({ pix_configured: this.isPixConfigured })
                });
            } catch (err) {}
        },

        async init() {
            this.isDarkTheme = REPIX_CONFIG.isDark();
            this.currentUser = REPIX_CONFIG.getUser();
            if (!this.currentUser) {
                this.currentUser = {
                    id: "tenant_default",
                    name: "Loja Matriz RePix",
                    email: "loja1@repix.com.br",
                    role: "tenant",
                    tenant_id: "tenant_default",
                    api_key: "tenant_default_key"
                };
                REPIX_CONFIG.setUser(this.currentUser);
            }

            await this.loadAll();
            await this.loadIntegrationStatus();
            await this.loadWhatsAppConfig();
            await this.loadBalance();

            // Auto-refresh suave a cada 15 segundos
            setInterval(() => {
                this.loadLatestTransactions();
                this.loadStats(false);
                this.loadBalance();
            }, 15000);
        },

                openPasswordModal() {
            this.changePasswordCurrent = '';
            this.changePasswordNew = '';
            this.changePasswordConfirm = '';
            this.changePasswordMsg = '';
            this.changePasswordError = '';
            this.changePasswordModalOpen = true;
        },

        closePasswordModal() {
            this.changePasswordModalOpen = false;
        },

        async submitChangePassword() {
            if (this.changePasswordNew !== this.changePasswordConfirm) {
                this.changePasswordError = 'A confirmação de senha não confere com a nova senha.';
                return;
            }

            if (this.changePasswordNew.length < 6) {
                this.changePasswordError = 'A nova senha deve ter no mínimo 6 caracteres.';
                return;
            }

            this.changePasswordLoading = true;
            this.changePasswordMsg = '';
            this.changePasswordError = '';

            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/auth/change-password`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        tenant_id: this.currentUser?.tenant_id || this.currentUser?.id,
                        current_password: this.changePasswordCurrent,
                        new_password: this.changePasswordNew,
                        confirm_password: this.changePasswordConfirm
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || 'Falha ao alterar senha.');
                }

                this.changePasswordMsg = data.message || 'Senha alterada com sucesso!';
                setTimeout(() => {
                    this.closePasswordModal();
                }, 2000);
            } catch (err) {
                this.changePasswordError = err.message;
            } finally {
                this.changePasswordLoading = false;
            }
        },

        logout() {
            REPIX_CONFIG.logout();
        },

        async loadAll() {
            await Promise.all([
                this.loadStats(),
                this.loadLatestTransactions(),
                this.loadTransactions(1)
            ]);
        },

        // ==========================================
        // SINGLE-CALENDAR DATEPICKER METHODS
        // ==========================================
        formatDateISO(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        },

        formatDateBR(isoStr) {
            if (!isoStr) return '';
            const parts = isoStr.split('-');
            if (parts.length !== 3) return isoStr;
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        },

        toggleDatepicker() {
            this.isDatepickerOpen = !this.isDatepickerOpen;
            if (this.isDatepickerOpen) {
                this.tempStartDate = this.customStartDate;
                this.tempEndDate = this.customEndDate;
                const baseDate = this.customStartDate ? new Date(this.customStartDate + 'T00:00:00') : new Date();
                this.calYear = baseDate.getFullYear();
                this.calMonth = baseDate.getMonth();
            }
        },

        closeDatepicker() {
            this.isDatepickerOpen = false;
        },

        getFormattedPeriodLabel() {
            if (this.currentPeriod === 'today') {
                return `Hoje (${this.formatDateBR(this.customStartDate)})`;
            } else if (this.currentPeriod === 'yesterday') {
                return `Ontem (${this.formatDateBR(this.customStartDate)})`;
            } else if (this.currentPeriod === '7days') {
                return 'Últimos 7 dias';
            } else if (this.currentPeriod === '30days') {
                return 'Últimos 30 dias';
            } else if (this.currentPeriod === 'this_month') {
                return 'Este mês';
            } else if (this.currentPeriod === 'last_month') {
                return 'Mês passado';
            } else {
                if (this.customStartDate && this.customEndDate) {
                    if (this.customStartDate === this.customEndDate) {
                        return this.formatDateBR(this.customStartDate);
                    }
                    return `${this.formatDateBR(this.customStartDate)} até ${this.formatDateBR(this.customEndDate)}`;
                }
                return 'Personalizado';
            }
        },

        getCalendarMonthName() {
            const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            return `${months[this.calMonth]} ${this.calYear}`;
        },

        prevCalMonth() {
            if (this.calMonth === 0) {
                this.calMonth = 11;
                this.calYear -= 1;
            } else {
                this.calMonth -= 1;
            }
        },

        nextCalMonth() {
            if (this.calMonth === 11) {
                this.calMonth = 0;
                this.calYear += 1;
            } else {
                this.calMonth += 1;
            }
        },

        getCalendarDays() {
            const year = this.calYear;
            const month = this.calMonth;
            
            const firstDay = new Date(year, month, 1);
            let startDayOfWeek = firstDay.getDay(); // 0 is Sun
            // Seg = 0, Dom = 6
            startDayOfWeek = (startDayOfWeek + 6) % 7;

            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const daysInPrevMonth = new Date(year, month, 0).getDate();
            
            const days = [];
            const todayStr = this.formatDateISO(new Date());

            // Dias do mês anterior
            for (let i = startDayOfWeek - 1; i >= 0; i--) {
                const dayNum = daysInPrevMonth - i;
                const d = new Date(year, month - 1, dayNum);
                const dateStr = this.formatDateISO(d);
                days.push({
                    dayNum,
                    dateStr,
                    isCurrentMonth: false,
                    isToday: dateStr === todayStr
                });
            }

            // Dias do mês atual
            for (let i = 1; i <= daysInMonth; i++) {
                const d = new Date(year, month, i);
                const dateStr = this.formatDateISO(d);
                days.push({
                    dayNum: i,
                    dateStr,
                    isCurrentMonth: true,
                    isToday: dateStr === todayStr
                });
            }

            // Preenchimento de semanas completas (múltiplo de 7)
            const totalCells = Math.ceil(days.length / 7) * 7;
            let nextDay = 1;
            while (days.length < totalCells) {
                const d = new Date(year, month + 1, nextDay);
                const dateStr = this.formatDateISO(d);
                days.push({
                    dayNum: nextDay,
                    dateStr,
                    isCurrentMonth: false,
                    isToday: dateStr === todayStr
                });
                nextDay++;
            }

            return days;
        },

        isDateSelectedStart(dateStr) {
            return this.tempStartDate === dateStr;
        },

        isDateSelectedEnd(dateStr) {
            return this.tempEndDate === dateStr;
        },

        isDateInRange(dateStr) {
            if (!this.tempStartDate) return false;
            const end = this.tempEndDate || this.hoverDate;
            if (!end) return false;
            const s = this.tempStartDate < end ? this.tempStartDate : end;
            const e = this.tempStartDate < end ? end : this.tempStartDate;
            return dateStr > s && dateStr < e;
        },

        onDayHover(dateStr) {
            if (this.tempStartDate && !this.tempEndDate) {
                this.hoverDate = dateStr;
            }
        },

        selectCalendarDay(dateStr) {
            this.selectedPreset = 'custom';
            if (!this.tempStartDate || (this.tempStartDate && this.tempEndDate)) {
                this.tempStartDate = dateStr;
                this.tempEndDate = '';
                this.hoverDate = '';
            } else if (this.tempStartDate && !this.tempEndDate) {
                if (dateStr < this.tempStartDate) {
                    this.tempEndDate = this.tempStartDate;
                    this.tempStartDate = dateStr;
                } else {
                    this.tempEndDate = dateStr;
                }
                this.hoverDate = '';
            }
        },

        selectPreset(preset) {
            this.selectedPreset = preset;
            const now = new Date();
            const todayStr = this.formatDateISO(now);

            if (preset === 'today') {
                this.tempStartDate = todayStr;
                this.tempEndDate = todayStr;
            } else if (preset === 'yesterday') {
                const y = new Date(now.getTime() - 86400000);
                const yStr = this.formatDateISO(y);
                this.tempStartDate = yStr;
                this.tempEndDate = yStr;
            } else if (preset === '7days') {
                const d7 = new Date(now.getTime() - 6 * 86400000);
                this.tempStartDate = this.formatDateISO(d7);
                this.tempEndDate = todayStr;
            } else if (preset === '30days') {
                const d30 = new Date(now.getTime() - 29 * 86400000);
                this.tempStartDate = this.formatDateISO(d30);
                this.tempEndDate = todayStr;
            } else if (preset === 'this_month') {
                const first = new Date(now.getFullYear(), now.getMonth(), 1);
                this.tempStartDate = this.formatDateISO(first);
                this.tempEndDate = todayStr;
            } else if (preset === 'last_month') {
                const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const last = new Date(now.getFullYear(), now.getMonth(), 0);
                this.tempStartDate = this.formatDateISO(first);
                this.tempEndDate = this.formatDateISO(last);
            } else if (preset === 'custom') {
                return;
            }

            if (this.tempStartDate) {
                const d = new Date(this.tempStartDate + 'T00:00:00');
                this.calYear = d.getFullYear();
                this.calMonth = d.getMonth();
            }

            this.applyPicker();
        },

        applyPicker() {
            if (!this.tempStartDate) return;
            this.customStartDate = this.tempStartDate;
            this.customEndDate = this.tempEndDate || this.tempStartDate;
            this.currentPeriod = this.selectedPreset;
            this.isDatepickerOpen = false;
            this.loadStats();
        },

        cancelPicker() {
            this.isDatepickerOpen = false;
        },

        async loadStats(showLoading = true) {
            try {
                let url = `${REPIX_CONFIG.apiBaseUrl}/stats?period=${this.currentPeriod}`;
                if (this.currentPeriod === 'custom') {
                    url += `&start_date=${this.customStartDate}&end_date=${this.customEndDate}`;
                }

                const res = await fetch(url, { headers: REPIX_CONFIG.getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    this.cards = data.cards;
                    this.hourlyConversion = data.hourly_conversion;
                    this.nominalPerformance = data.nominal_performance;
                    this.renderHourlyChart();
                }
            } catch (err) {
                console.error("Erro ao carregar estatísticas:", err);
            }
        },

        async loadLatestTransactions() {
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/transactions/latest`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    this.latestTransactions = await res.json();
                }
            } catch (err) {
                console.error("Erro ao carregar top 10 transações:", err);
            }
        },

        async loadTransactions(page = 1) {
            this.tableLoading = true;
            this.currentPage = page;
            try {
                let url = `${REPIX_CONFIG.apiBaseUrl}/transactions?page=${this.currentPage}&page_size=${this.pageSize}&status=${this.statusFilter}`;
                if (this.searchQuery) {
                    url += `&search=${encodeURIComponent(this.searchQuery)}`;
                }
                if (this.divergentOnly) {
                    url += `&divergent_only=true`;
                }

                const res = await fetch(url, { headers: REPIX_CONFIG.getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    this.transactions = data.items;
                    this.totalTransactions = data.total;
                    this.totalPages = data.pages;
                }
            } catch (err) {
                console.error("Erro ao buscar transações:", err);
            } finally {
                this.tableLoading = false;
            }
        },

        toggleDivergentFilter() {
            this.divergentOnly = !this.divergentOnly;
            this.loadTransactions(1);
        },

        openProofModal(tx) {
            if (tx.is_divergent || (tx.has_proof && tx.gateway_status !== 'paid')) {
                if (!tx.can_access) {
                    if (tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') {
                        this.openRechargeModal(`Esta venda está aguardando o prazo de 30 minutos (restam ${tx.delay_remaining_minutes || 1} min). O comprovante será liberado automaticamente após a cobrança de 1 RePix do saldo.`);
                    } else {
                        this.openRechargeModal('Para visualizar o comprovante, recarregue seu saldo de RePix (cobrança automática de 1 RePix por venda divergente com mais de 30 minutos).');
                    }
                    return;
                }
            }
            this.selectedTx = tx;
            this.proofModalUrl = `${REPIX_CONFIG.apiBaseUrl}/transactions/${tx.id}/proof`;
            this.proofModalIsPdf = tx.proof_file_name ? tx.proof_file_name.toLowerCase().endsWith('.pdf') : false;
            this.proofModalOpen = true;
        },

        closeProofModal() {
            this.proofModalOpen = false;
            this.selectedTx = null;
            this.proofModalUrl = null;
        },

        // ==========================================
        // MÉTODOS DE CONTROLE DO WHATSAPP
        // ==========================================
        openWhatsAppModal() {
            this.whatsappActiveTab = 'template';
            this.whatsappModalOpen = true;
            this.loadWhatsAppConfig();
        },

        closeWhatsAppModal() {
            this.whatsappModalOpen = false;
            if (this.whatsappQrPollingTimer) {
                clearInterval(this.whatsappQrPollingTimer);
                this.whatsappQrPollingTimer = null;
            }
        },

        async loadWhatsAppConfig() {
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/config`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    this.whatsappConfig = await res.json();
                    if (!this.whatsappConfig.message_template) this.whatsappConfig.message_template = DEFAULT_REPIX_WHATSAPP_TEMPLATE;
                }
            } catch (e) {
                console.error("Erro ao carregar config WhatsApp:", e);
            }
        },

        async saveWhatsAppConfig() {
            this.whatsappLoading = true;
            this.whatsappSaveSuccess = false;
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/config`, {
                    method: 'PUT',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify(this.whatsappConfig)
                });
                if (res.ok) {
                    this.whatsappConfig = await res.json();
                    this.whatsappSaveSuccess = true;
                    setTimeout(() => this.whatsappSaveSuccess = false, 3500);
                }
            } catch (e) {
                alert("Erro ao salvar configurações: " + e.message);
            } finally {
                this.whatsappLoading = false;
            }
        },

        async openQrCodeModal() {
            this.whatsappQrModalOpen = true;
            this.whatsappLoading = true;
            this.whatsappQrData = null;

            try {
                // 1. Cria ou prepara a instância
                await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/instance/create`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        instance_name: this.whatsappConfig.instance_name,
                        api_url: this.whatsappConfig.api_url,
                        api_key: this.whatsappConfig.api_key
                    })
                });

                // 2. Busca o QR Code
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/instance/qrcode`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    this.whatsappQrData = await res.json();
                }

                // 3. Inicia Polling de status a cada 3s até conectar
                if (this.whatsappQrPollingTimer) clearInterval(this.whatsappQrPollingTimer);
                this.whatsappQrPollingTimer = setInterval(async () => {
                    await this.checkWhatsAppStatus();
                    if (this.whatsappConfig.instance_status === 'connected') {
                        clearInterval(this.whatsappQrPollingTimer);
                        this.whatsappQrPollingTimer = null;
                        this.whatsappQrModalOpen = false;
                        alert("WhatsApp conectado com sucesso!");
                    }
                }, 3000);

            } catch (e) {
                console.error("Erro ao gerar QR Code:", e);
            } finally {
                this.whatsappLoading = false;
            }
        },

        closeQrCodeModal() {
            this.whatsappQrModalOpen = false;
            if (this.whatsappQrPollingTimer) {
                clearInterval(this.whatsappQrPollingTimer);
                this.whatsappQrPollingTimer = null;
            }
        },

        async checkWhatsAppStatus() {
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/instance/status`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this.whatsappConfig.instance_status = data.instance_status;
                }
            } catch (e) {
                console.error("Erro ao verificar status WhatsApp:", e);
            }
        },

        async disconnectWhatsApp() {
            if (!confirm("Tem certeza que deseja desconectar este número de WhatsApp?")) return;
            this.whatsappLoading = true;
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/instance/logout`, {
                    method: 'DELETE',
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    this.whatsappConfig.instance_status = 'disconnected';
                    alert("Instância desconectada com sucesso.");
                }
            } catch (e) {
                alert("Erro ao desconectar: " + e.message);
            } finally {
                this.whatsappLoading = false;
            }
        },

        insertTemplateTag(tag) {
            this.whatsappConfig.message_template = (this.whatsappConfig.message_template || '') + ` ${tag}`;
        },

        getRenderedTemplatePreview() {
            const tmpl = this.whatsappConfig.message_template || '';
            const sampleName = 'Carlos';
            const sampleValue = 'R$ 97,00';
            const samplePix = '00020126580014br.gov.bcb.pix0136...';
            const sampleLink = `${window.location.origin}/checkout?sale_id=MGF-10492`;

            let preview = tmpl
                .replace(/\{nome\}/g, sampleName)
                .replace(/\{valor\}/g, sampleValue)
                .replace(/\{codigo_pix\}/g, samplePix)
                .replace(/\{link_comprovante\}/g, sampleLink)
                .replace(/\{sale_id\}/g, 'MGF-10492');

            // Processa Spintax para o preview (primeira opção)
            preview = preview.replace(/\{([^{}]+)\}/g, (match, choices) => choices.split('|')[0]);
            return preview;
        },

        sendTestMessage() {
            if (!this.whatsappTestPhone) {
                alert("Informe o número de telefone para o teste.");
                return;
            }

            // Normaliza o telefone garantindo DDI 55
            let rawPhone = this.whatsappTestPhone.replace(/\D/g, '');
            if (!rawPhone) {
                alert("Informe um número de telefone válido.");
                return;
            }

            let fullPhone = rawPhone;
            if (fullPhone.length === 10 || fullPhone.length === 11) {
                fullPhone = '55' + fullPhone;
            } else if (!fullPhone.startsWith('55') && fullPhone.length > 8) {
                fullPhone = '55' + fullPhone;
            }

            // Renderiza mensagem de teste usando o template configurado
            let message = this.getRenderedTemplatePreview();
            message = message.replace(/👋/g, '').replace(/👉/g, '').replace(/[\uFFFD]/g, '').trim();
            const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

            // Abre diretamente a conversa no WhatsApp
            window.open(waUrl, '_blank');

            this.whatsappTestResult = {
                success: true,
                detail: `Abrindo WhatsApp oficial (https://wa.me/${fullPhone}) com a mensagem pré-preenchida!`
            };

            // Notifica o backend em background
            try {
                fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/send-test`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        phone: fullPhone,
                        message: this.whatsappConfig?.message_template
                    })
                }).catch(() => {});
            } catch (e) {}
        },

        // ==========================================
        // REDIRECIONAMENTO OFICIAL WHATSAPP (wa.me)
        // ==========================================
        openDirectWhatsApp(tx) {
            if (tx && (tx.is_divergent || (tx.has_proof && tx.gateway_status !== 'paid')) && ((tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') || !tx.can_access)) {
                if (tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') {
                    alert('Esta venda divergente está no período de tolerância de 30 minutos (Aguardando). O WhatsApp e o comprovante serão liberados após o prazo e cobrança de 1 RePix.');
                } else {
                    this.openRechargeModal('Recarregue moedas RePix para liberar o envio de WhatsApp e o comprovante desta divergência.');
                }
                return;
            }
            REPIX_CONFIG.openDirectWhatsApp(tx, this.whatsappConfig?.message_template);
        },

        // ==========================================
        // DISPARO MANUAL PARA TRANSAÇÃO ESPECÍFICA
        // ==========================================
        openManualWhatsAppModal(tx) {
            this.manualTx = tx;
            this.manualPhone = tx.customer_phone || '';
            this.manualCustomMessage = this.whatsappConfig.message_template || '';
            this.manualResult = null;
            this.manualWhatsAppModalOpen = true;
        },

        closeManualWhatsAppModal() {
            this.manualWhatsAppModalOpen = false;
            this.manualTx = null;
            this.manualResult = null;
        },

        async sendManualRecovery() {
            if (!this.manualPhone) {
                alert("Informe o número do WhatsApp do cliente.");
                return;
            }
            this.manualSending = true;
            this.manualResult = null;
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/send-manual`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        sale_id: this.manualTx.id,
                        phone: this.manualPhone,
                        custom_message: this.manualCustomMessage
                    })
                });
                const data = await res.json();
                this.manualResult = data;
                if (res.ok) {
                    this.manualTx.recovery_message_sent = true;
                    this.manualTx.recovery_message_sent_at = new Date().toISOString();
                    this.manualTx.customer_phone = this.manualPhone;
                    await this.loadTransactions(this.currentPage);
                    await this.loadLatestTransactions();
                }
            } catch (e) {
                this.manualResult = { success: false, message: e.message };
            } finally {
                this.manualSending = false;
            }
        },

        renderHourlyChart() {
            const ctx = document.getElementById('hourlyConversionChart');
            if (!ctx) return;

            const isDark = REPIX_CONFIG.isDark();
            const textColor = isDark ? '#94A3B8' : '#64748B';
            const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';

            const labels = this.hourlyConversion.map(i => i.hour_label);
            const generatedData = this.hourlyConversion.map(i => i.generated_count);
            const paidData = this.hourlyConversion.map(i => i.paid_count);

            if (this.hourlyChart) {
                this.hourlyChart.destroy();
            }

            this.hourlyChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Pix Pagos',
                            data: paidData,
                            backgroundColor: '#0066FF',
                            borderRadius: 4,
                            barPercentage: 0.6
                        },
                        {
                            label: 'Pix Gerados',
                            data: generatedData,
                            backgroundColor: isDark ? '#334155' : '#E2E8F0',
                            borderRadius: 4,
                            barPercentage: 0.6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'end',
                            labels: {
                                boxWidth: 12,
                                font: { family: 'Inter', size: 11, weight: '600' },
                                color: textColor
                            }
                        },
                        tooltip: {
                            backgroundColor: isDark ? '#0F172A' : '#1E293B',
                            titleFont: { family: 'Outfit', size: 12, weight: '700' },
                            bodyFont: { family: 'Inter', size: 11 },
                            padding: 10,
                            cornerRadius: 6
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { font: { family: 'Inter', size: 10 }, color: textColor }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: {
                                stepSize: 1,
                                font: { family: 'Inter', size: 10 },
                                color: textColor
                            },
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }));
});
