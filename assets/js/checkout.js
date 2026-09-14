/**
 * Lógica do Checkout RePix
 */
document.addEventListener('alpine:init', () => {
    Alpine.data('checkoutApp', () => ({
        // Estado
        loading: false,
        created: false,
        paid: false,
        saleId: '',
        amountCents: 9700,
        amountReais: 97.00,
        nominalName: 'RePix Pagamentos S.A.',
        customerEmail: 'comprador@exemplo.com.br',
        pixCode: '',
        qrCodeBase64: '',
        
        // Upload do comprovante
        proofFile: null,
        proofFileName: '',
        proofUploading: false,
        proofUploaded: false,
        proofPreviewUrl: null,
        isDragOver: false,

        // Polling
        pollingInterval: null,
        pollingStatusText: 'Aguardando confirmação bancária...',

        // Copiar feedback
        copied: false,

        init() {
            // Verificar se veio com ID na URL ou cria um novo
            const urlParams = new URLSearchParams(window.location.search);
            const idParam = urlParams.get('id');
            const amountParam = urlParams.get('amount');

            if (amountParam) {
                this.amountCents = parseInt(amountParam);
                this.amountReais = this.amountCents / 100;
            }

            if (idParam) {
                this.loadExistingSale(idParam);
            } else {
                this.generateCharge();
            }
        },

        async generateCharge() {
            this.loading = true;
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/checkout/create`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Tenant-Key': REPIX_CONFIG.defaultTenantKey
                    },
                    body: JSON.stringify({
                        amount_cents: this.amountCents,
                        nominal_name: this.nominalName,
                        customer_email: this.customerEmail,
                        description: 'Assinatura RePix Pro'
                    })
                });

                if (!res.ok) throw new Error('Erro ao gerar cobrança Pix');
                const data = await res.json();

                this.saleId = data.id;
                this.pixCode = data.pix_code;
                this.qrCodeBase64 = data.qr_code_base64;
                this.created = true;
                this.loading = false;

                // Iniciar polling leve
                this.startPolling();
            } catch (err) {
                console.error(err);
                alert('Falha ao comunicar com o gateway de pagamento. Verifique a conexão.');
                this.loading = false;
            }
        },

        async loadExistingSale(id) {
            this.loading = true;
            this.saleId = id;
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/checkout/status/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    this.created = true;
                    if (data.is_paid) {
                        this.paid = true;
                    } else {
                        this.startPolling();
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                this.loading = false;
            }
        },

        startPolling() {
            if (this.pollingInterval) clearInterval(this.pollingInterval);
            this.pollingInterval = setInterval(async () => {
                if (!this.saleId || this.paid) return;
                try {
                    const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/checkout/status/${this.saleId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.is_paid) {
                            this.paid = true;
                            this.stopPolling();
                        }
                    }
                } catch (e) {
                    console.warn('Polling error:', e);
                }
            }, 3000);
        },

        stopPolling() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
        },

        copyPixCode() {
            if (!this.pixCode) return;
            navigator.clipboard.writeText(this.pixCode).then(() => {
                this.copied = true;
                setTimeout(() => this.copied = false, 3000);
            }).catch(() => {
                // Fallback manual
                const ta = document.createElement('textarea');
                ta.value = this.pixCode;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                this.copied = true;
                setTimeout(() => this.copied = false, 3000);
            });
        },

        handleFileSelect(event) {
            const files = event.target.files || event.dataTransfer.files;
            if (files && files[0]) {
                this.processProofFile(files[0]);
            }
        },

        handleDrop(event) {
            this.isDragOver = false;
            const files = event.dataTransfer.files;
            if (files && files[0]) {
                this.processProofFile(files[0]);
            }
        },

        processProofFile(file) {
            const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
            if (!validTypes.includes(file.type)) {
                alert('Por favor, selecione uma imagem (PNG, JPG, WEBP) ou documento PDF.');
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                alert('O arquivo deve ter no máximo 2MB.');
                return;
            }

            this.proofFile = file;
            this.proofFileName = file.name;

            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.proofPreviewUrl = e.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                this.proofPreviewUrl = null;
            }

            // Envio automático do comprovante
            this.uploadProof();
        },

        async uploadProof() {
            if (!this.proofFile || !this.saleId) return;
            this.proofUploading = true;

            const formData = new FormData();
            formData.append('file', this.proofFile);

            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/transactions/${this.saleId}/proof`, {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) throw new Error('Falha no upload do comprovante');
                const data = await res.json();
                this.proofUploaded = true;
                this.proofUploading = false;
            } catch (err) {
                console.error(err);
                alert('Erro ao enviar o comprovante. Tente novamente.');
                this.proofUploading = false;
            }
        },

        // Simulador de webhook para testes imediatos
        async simulateGatewayPayment() {
            if (!this.saleId) return;
            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/webhooks/simulate?sale_id=${this.saleId}&status_target=paid`, {
                    method: 'POST'
                });
                if (res.ok) {
                    this.paid = true;
                    this.stopPolling();
                }
            } catch (e) {
                console.error(e);
            }
        }
    }));
});
