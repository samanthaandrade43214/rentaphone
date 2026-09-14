/**
 * Lógica de Divergências e Recuperação Pix (RePix)
 * Gerenciamento de comprovantes pendentes, exportação zip oficial e disparos WhatsApp.
 */

document.addEventListener('alpine:init', () => {
    Alpine.data('disputesApp', () => ({
        currentUser: null,
        // Alteração de Senha do Lojista
        changePasswordModalOpen: false,
        changePasswordCurrent: '',
        changePasswordNew: '',
        changePasswordConfirm: '',
        changePasswordLoading: false,
        changePasswordMsg: '',
        changePasswordError: '',
        sidebarOpen: false,
        isDarkTheme: false,

        divergentTransactions: [],
        selectedIds: [],
        selectAll: false,
        loading: false,
        exportingZip: false,

        // Paginação & Filtros
        currentPage: 1,
        pageSize: 10,
        totalPages: 1,
        totalItems: 0,
        searchQuery: '',
        exportedFilter: 'all',
        // Filtro de Tipo (Divergências vs Recuperadas)
        typeFilter: 'all', // 'all', 'divergent', 'recovered'
        activeDivergentCount: 0,
        recoveredCount: 0,
        recoveredAmountCents: 0,
        recoverySuccessMsg: '',

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

        orderBy: 'date_desc',  // 'date_desc', 'date_asc', 'not_exported_first', 'exported_first', 'amount_desc'

        // Filtros e Períodos (Single-Calendar DatePicker idêntico ao Painel Geral)
        isDatepickerOpen: false,
        currentPeriod: 'all',
        selectedPreset: 'all',
        customStartDate: '',
        customEndDate: '',
        tempStartDate: '',
        tempEndDate: '',
        hoverDate: '',
        calYear: new Date().getFullYear(),
        calMonth: new Date().getMonth(),

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
            this.rechargePixData = null; // Só gera a cobrança ao clicar em "Gerar Cobrança Pix"
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
            await this.loadIntegrationStatus();
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
            if (!this.rechargeCardData.number || this.rechargeCardData.number.length < 13) {
                this.rechargeErrorMessage = 'Informe um número de cartão de crédito válido.';
                return;
            }
            this.rechargeLoading = true;
            this.rechargeErrorMessage = '';
            try {
                const amount = this.getFinalRechargeAmount();
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/credits/recharge`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        amount_reais: amount,
                        payment_method: 'credit_card',
                        card_number: this.rechargeCardData.number,
                        card_holder: this.rechargeCardData.holder,
                        card_exp_month: parseInt(this.rechargeCardData.expMonth, 10),
                        card_exp_year: parseInt(this.rechargeCardData.expYear, 10),
                        card_cvv: this.rechargeCardData.cvv
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    this.balanceReais = data.new_balance_reais;
                    this.balanceCents = data.new_balance_cents;
                    this.rechargeSuccessMessage = data.message;
                    await this.loadBalance();
                    await this.loadDivergent(this.currentPage);
                } else {
                    this.rechargeErrorMessage = data.detail || 'Falha ao processar cartão de crédito.';
                }
            } catch (err) {
                this.rechargeErrorMessage = err.message;
            } finally {
                this.rechargeLoading = false;
            }
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
                alert('Erro ao exportar arquivo de extrato: ' + err.message);
            }
        },

        // Modal de Disparo Manual de WhatsApp
        // ==========================================
        // MÓDULO WHATSAPP (EVOLUTION API)
        // ==========================================
        whatsappModalOpen: false,
        whatsappQrModalOpen: false,
        whatsappActiveTab: 'template',
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
            message_template: '{Olá|Oi|Tudo bem}, {nome}!\n\nNotamos que seu pedido no valor de *{valor}* via Pix ainda está pendente de confirmação.\n\nCaso já tenha realizado a transferência, envie o seu comprovante pelo link abaixo para agilizar a liberação:\n{link_comprovante}\n\nSe ainda não realizou, você pode utilizar o Pix Copia e Cola:\n`{codigo_pix}`\n\nSe precisar de qualquer ajuda, estamos à disposição!'
        },

        manualWhatsAppModalOpen: false,
        manualTx: null,
        manualPhone: '',
        manualCustomMessage: '',
        manualSending: false,
        manualResult: null,

        get selectedCount() {
            return this.selectedIds.length;
        },

        get totalDivergentAmountCents() {
            return this.divergentTransactions
                .filter(tx => this.selectedIds.includes(tx.id))
                .reduce((acc, tx) => acc + (tx.amount_cents || 0), 0);
        },

        toggleSelectAll() {
            const selectable = this.divergentTransactions.filter(t => t.can_access);
            if (this.selectAll) {
                this.selectedIds = [];
                this.selectAll = false;
            } else {
                this.selectedIds = selectable.map(tx => tx.id);
                this.selectAll = selectable.length > 0;
            }
        },

        toggleSelect(id) {
            const tx = this.divergentTransactions.find(t => t.id === id);
            if (tx && !tx.can_access) {
                if (tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') {
                    this.openRechargeModal(`Esta transação está aguardando o prazo de 30 minutos (restam cerca de ${tx.delay_remaining_minutes || 1} min). Ela será liberada após a cobrança automática de 1 RePix do saldo.`);
                } else {
                    this.openRechargeModal('Esta transação está bloqueada por falta de saldo. Recarregue seus créditos (1 RePix por venda divergente) para liberá-la.');
                }
                return;
            }
            const idx = this.selectedIds.indexOf(id);
            if (idx > -1) {
                this.selectedIds.splice(idx, 1);
            } else {
                this.selectedIds.push(id);
            }
            const selectable = this.divergentTransactions.filter(t => t.can_access);
            this.selectAll = selectable.length > 0 && this.selectedIds.length === selectable.length;
        },

        isSelected(id) {
            return this.selectedIds.includes(id);
        },

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

        async recoverTransaction(tx) {
            if (!tx.can_access) {
                if (tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') {
                    this.openRechargeModal(`Esta venda está aguardando o prazo de 30 minutos (restam ${tx.delay_remaining_minutes || 1} min). A liberação e conciliação ocorrem após a cobrança de 1 RePix.`);
                } else {
                    this.openRechargeModal('Saldo insuficiente. Recarregue suas moedas RePix (1 RePix por venda) para conciliar e liberar.');
                }
                return;
            }

            if (!confirm(`Deseja conciliar e recuperar a venda #${tx.id} no valor de ${REPIX_CONFIG.formatBRL(tx.amount_cents)} junto ao gateway MangoFy?`)) {
                return;
            }

            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/transactions/${tx.id}/recover`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                const data = await res.json();
                if (res.ok) {
                    tx.is_recovered = true;
                    tx.gateway_status = 'paid';
                    tx.recovered_at = new Date().toISOString();
                    this.recoverySuccessMsg = `Venda #${tx.id} recuperada e conciliada com sucesso no gateway!`;
                    setTimeout(() => this.recoverySuccessMsg = '', 4500);
                    await this.loadBalance();
                    await this.loadNotifications();
                    await this.loadDivergent(this.currentPage);
                } else {
                    if (res.status === 402) {
                        this.openRechargeModal(data.detail || 'Saldo de RePix insuficiente.');
                    } else {
                        alert(data.detail || 'Falha ao recuperar venda.');
                    }
                }
            } catch (err) {
                alert('Erro ao processar recuperação: ' + err.message);
            }
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
                    const data = await res.json();
                    this.whatsappConfig = data;
                    if (!this.whatsappConfig.message_template) {
                        this.whatsappConfig.message_template = '{Olá|Oi|Tudo bem}, {nome}!\n\nNotamos que seu pedido no valor de *{valor}* via Pix ainda está pendente de confirmação.\n\nCaso já tenha realizado a transferência, envie o seu comprovante pelo link abaixo para agilizar a liberação:\n{link_comprovante}\n\nSe ainda não realizou, você pode utilizar o Pix Copia e Cola:\n`{codigo_pix}`\n\nSe precisar de qualquer ajuda, estamos à disposição!';
                    }
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
                await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/instance/create`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        instance_name: this.whatsappConfig.instance_name,
                        api_url: this.whatsappConfig.api_url,
                        api_key: this.whatsappConfig.api_key
                    })
                });

                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/instance/qrcode`, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    this.whatsappQrData = await res.json();
                }

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
                console.error("Erro ao checar status WhatsApp:", e);
            }
        },

        insertTemplateTag(tag) {
            this.whatsappConfig.message_template = (this.whatsappConfig.message_template || '') + ' ' + tag;
        },

        getRenderedTemplatePreview() {
            let tpl = this.whatsappConfig?.message_template || '';
            tpl = tpl.replace(/\{([^{}]+)\}/g, (match, choices) => {
                if (choices.includes('|')) {
                    const parts = choices.split('|');
                    return parts[0];
                }
                return match;
            });
            tpl = tpl.replace(/{nome}/g, 'João Silva');
            tpl = tpl.replace(/{valor}/g, 'R$ 149,90');
            tpl = tpl.replace(/{codigo_pix}/g, '00020126580014br.gov.bcb.pix...');
            tpl = tpl.replace(/{link_comprovante}/g, window.location.origin + '/upload-proof?id=MGF-DEMO');
            return tpl;
        },

        async sendTestMessage() {
            if (!this.whatsappTestPhone || this.whatsappTestPhone.length < 10) {
                alert("Por favor, digite um número de WhatsApp válido com DDD.");
                return;
            }
            this.whatsappTestLoading = true;
            this.whatsappTestResult = null;
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/whatsapp/test-message`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders(),
                    body: JSON.stringify({
                        phone: this.whatsappTestPhone,
                        message: this.getRenderedTemplatePreview()
                    })
                });
                const data = await res.json();
                this.whatsappTestResult = {
                    success: res.ok,
                    detail: res.ok ? 'Mensagem de teste enviada com sucesso!' : (data.detail || 'Falha ao enviar.')
                };
            } catch (e) {
                this.whatsappTestResult = { success: false, detail: e.message };
            } finally {
                this.whatsappTestLoading = false;
            }
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

            await this.loadBalance();
            await this.loadDivergent(1);
            await this.loadNotifications();
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
            if (this.currentPeriod === 'all' || (!this.customStartDate && !this.customEndDate && this.currentPeriod !== 'today')) {
                return 'Todas as datas';
            } else if (this.currentPeriod === 'today') {
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
            startDayOfWeek = (startDayOfWeek + 6) % 7; // Seg = 0, Dom = 6

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

            if (preset === 'all') {
                this.tempStartDate = '';
                this.tempEndDate = '';
                this.applyPicker();
                return;
            } else if (preset === 'today') {
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
            if (this.selectedPreset === 'all') {
                this.customStartDate = '';
                this.customEndDate = '';
                this.currentPeriod = 'all';
            } else {
                if (!this.tempStartDate) return;
                this.customStartDate = this.tempStartDate;
                this.customEndDate = this.tempEndDate || this.tempStartDate;
                this.currentPeriod = this.selectedPreset;
            }
            this.isDatepickerOpen = false;
            this.loadDivergent(1);
        },

        cancelPicker() {
            this.isDatepickerOpen = false;
        },

        clearDateFilter() {
            this.selectPreset('all');
        },

        async loadDivergent(page = 1) {
            this.loading = true;
            this.currentPage = page;
            try {
                let url = `${REPIX_CONFIG.apiBaseUrl}/transactions/divergent?page=${this.currentPage}&page_size=${this.pageSize}&exported_filter=${this.exportedFilter}&order_by=${this.orderBy}&type_filter=${this.typeFilter}`;
                if (this.searchQuery.trim()) {
                    url += `&search=${encodeURIComponent(this.searchQuery.trim())}`;
                }
                if (this.customStartDate && this.customEndDate) {
                    url += `&start_date=${encodeURIComponent(this.customStartDate)}&end_date=${encodeURIComponent(this.customEndDate)}`;
                } else if (this.customStartDate) {
                    url += `&date=${encodeURIComponent(this.customStartDate)}`;
                }
                if (this.currentPeriod && this.currentPeriod !== 'all' && this.currentPeriod !== 'custom') {
                    url += `&period=${encodeURIComponent(this.currentPeriod)}`;
                }

                const res = await fetch(url, {
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this.divergentTransactions = data.items;
                    if (data.active_divergent_count !== undefined) {
                        this.activeDivergentCount = data.active_divergent_count;
                    }
                    if (data.recovered_count !== undefined) {
                        this.recoveredCount = data.recovered_count;
                    }
                    if (data.recovered_amount_cents !== undefined) {
                        this.recoveredAmountCents = data.recovered_amount_cents;
                    }

                    this.totalItems = data.total;
                    this.totalPages = data.pages;

                    if (data.balance_reais !== undefined) {
                        this.balanceReais = data.balance_reais;
                    }
                    if (data.balance_cents !== undefined) {
                        this.balanceCents = data.balance_cents;
                    }
                    if (data.locked_count !== undefined) {
                        this.lockedCount = data.locked_count;
                    }
                    if (data.waiting_delay_count !== undefined) {
                        this.waitingDelayCount = data.waiting_delay_count;
                    }

                    this.selectedIds = this.divergentTransactions.filter(tx => !tx.dispute_exported && tx.can_access).map(tx => tx.id);
                    if (this.selectedIds.length === 0) {
                        this.selectedIds = this.divergentTransactions.filter(tx => tx.can_access).map(tx => tx.id);
                    }
                    const selectable = this.divergentTransactions.filter(tx => tx.can_access);
                    this.selectAll = selectable.length > 0 && this.selectedIds.length === selectable.length;
                }
            } catch (err) {
                console.error("Erro ao carregar divergências:", err);
            } finally {
                this.loading = false;
            }
        },

        async toggleManualExportStatus(tx) {
            if (!tx.can_access) {
                if (tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') {
                    this.openRechargeModal(`Esta venda está aguardando o prazo de 30 minutos. A liberação ocorre após a cobrança automática de 1 RePix do saldo.`);
                } else {
                    this.openRechargeModal('Esta venda está bloqueada por falta de saldo. Recarregue suas moedas RePix para liberá-la.');
                }
                return;
            }
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/transactions/${tx.id}/toggle-dispute-exported`, {
                    method: 'POST',
                    headers: REPIX_CONFIG.getAuthHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    tx.dispute_exported = data.is_dispute_exported;
                }
            } catch (err) {
                alert('Erro ao alterar status de envio: ' + err.message);
            }
        },

        openProofModal(tx) {
            if (!tx.can_access) {
                if (tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') {
                    this.openRechargeModal(`Esta venda está aguardando o prazo de 30 minutos (restam ${tx.delay_remaining_minutes || 1} min). O comprovante e a exportação serão liberados após a cobrança automática de 1 RePix do saldo.`);
                } else {
                    this.openRechargeModal('Para visualizar o comprovante e exportar a venda, recarregue suas moedas (cobrança automática de 1 RePix por venda divergente com mais de 30 minutos).');
                }
                return;
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
        // DISPARO MANUAL DE WHATSAPP PARA DIVERGÊNCIA
        // ==========================================
        openManualWhatsAppModal(tx) {
            this.manualTx = tx;
            this.manualPhone = tx.customer_phone || '';
            const firstName = tx.customer_name ? tx.customer_name.split(' ')[0] : 'Cliente';
            const amountFormatted = REPIX_CONFIG.formatBRL(tx.amount_cents);
            
            this.manualCustomMessage = `Olá, ${firstName}! Recebemos seu comprovante referente à transação ${tx.id} no valor de ${amountFormatted}. Estamos conciliando junto ao banco para liberar seu pedido rapidamente! Caso tenha dúvidas, responda aqui.`;
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
                }
            } catch (e) {
                this.manualResult = { success: false, message: e.message };
            } finally {
                this.manualSending = false;
            }
        },

        async exportSelectedZip() {
            if (this.selectedIds.length === 0) {
                alert('Selecione pelo menos uma divergência para exportar.');
                return;
            }

            const uncharged = this.divergentTransactions.filter(tx => this.selectedIds.includes(tx.id) && !tx.can_access);
            if (uncharged.length > 0) {
                alert('Apenas vendas que já foram cobradas do saldo podem ser exportadas. Vendas aguardando o prazo de 30 minutos ou sem saldo estão bloqueadas.');
                return;
            }

            this.exportingZip = true;
            try {
                const token = REPIX_CONFIG.getToken();
                const headers = { 'Content-Type': 'application/json' };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/transactions/export-disputes-zip`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        transaction_ids: this.selectedIds
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Falha ao gerar arquivo ZIP.');
                }

                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const dateStr = new Date().toISOString().slice(0, 10);
                a.download = `contestacao_divergencias_mangofy_${dateStr}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                await this.loadDivergent(this.currentPage);
            } catch (err) {
                alert('Erro ao exportar pacote ZIP: ' + err.message);
            } finally {
                this.exportingZip = false;
            }
        },

        openDirectWhatsApp(tx) {
            if (tx && ((tx.billing_status === 'waiting_delay_30m' || tx.billing_status === 'waiting_delay_1h') || !tx.can_access)) {
                this.openProofModal(tx);
                return;
            }
            REPIX_CONFIG.openDirectWhatsApp(tx);
        }
    }));
});
