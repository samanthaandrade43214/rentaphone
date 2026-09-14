/**
 * Lógica de Autenticação RePix (Login, Cadastro e 2FA Superadmin)
 */
document.addEventListener('alpine:init', () => {
    Alpine.data('loginApp', () => ({
        mode: 'login', // 'login' ou 'register'
        loading: false,
        errorMessage: '',
        successMessage: '',
        isDarkTheme: REPIX_CONFIG.isDark(),

        // Formulário de Login
        loginEmail: '',
        loginPassword: '',

        // Formulário de Cadastro (Apenas Nome, E-mail, Senha e Confirmação)
        registerName: '',
        registerEmail: '',
            registerDocument: '',
            registerPhone: '',
        registerPassword: '',
        confirmPassword: '',

        // Estado do 2FA para Superadmin
        twoFactorStep: false,
        twoFactorCode: '',
        tempToken: '',

        init() {
            // Se já tiver query param ?tab=register ou hash #register
            if (window.location.search.includes('register') || window.location.hash.includes('register')) {
                this.mode = 'register';
            }
        },

        toggleTheme() {
            REPIX_CONFIG.toggleTheme();
            this.isDarkTheme = REPIX_CONFIG.isDark();
        },

        setMode(newMode) {
            this.mode = newMode;
            this.errorMessage = '';
            this.successMessage = '';
            this.twoFactorStep = false;
        },

        resetForm() {
            this.errorMessage = '';
            this.successMessage = '';
        },

        setDemo(type) {},

        cancel2FA() {
            this.twoFactorStep = false;
            this.twoFactorCode = '';
            this.tempToken = '';
            this.errorMessage = '';
        },

        
        formatDocument(e) {
            let v = e.target.value.replace(/\D/g, '').slice(0, 14);
            if (v.length <= 11) {
                // CPF: 000.000.000-00
                v = v.replace(/(\d{3})(\d)/, '$1.$2');
                v = v.replace(/(\d{3})(\d)/, '$1.$2');
                v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            } else {
                // CNPJ: 00.000.000/0000-00
                v = v.replace(/^(\d{2})(\d)/, '$1.$2');
                v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
                v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
                v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
            }
            this.registerDocument = v;
            e.target.value = v;
        },

        formatPhone(e) {
            let v = e.target.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 10) {
                // Celular com 9 dígitos: (00) 00000-0000
                v = v.replace(/(\d{2})(\d)/, '($1) $2');
                v = v.replace(/(\d{5})(\d{1,4})$/, '$1-$2');
            } else if (v.length > 5) {
                // Fixo ou digitando: (00) 0000-0000
                v = v.replace(/(\d{2})(\d)/, '($1) $2');
                v = v.replace(/(\d{4})(\d{1,4})$/, '$1-$2');
            } else if (v.length > 2) {
                v = v.replace(/(\d{2})(\d)/, '($1) $2');
            }
            this.registerPhone = v;
            e.target.value = v;
        },

        async handleLogin() {
            this.loading = true;
            this.errorMessage = '';
            this.successMessage = '';

            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: this.loginEmail,
                        password: this.loginPassword
                    })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.detail || 'Falha na autenticação.');
                }

                // Se exigir 2FA (Superadmin de admin.repix.site)
                if (data.requires_2fa) {
                    this.twoFactorStep = true;
                    this.tempToken = data.temp_token;
                    this.twoFactorCode = '';
                    return;
                }

                REPIX_CONFIG.setToken(data.access_token);
                REPIX_CONFIG.setUser(data.user);

                // Redirecionamento por perfil
                if (data.user.role === 'superadmin') {
                    window.location.href = '/admin';
                } else {
                    window.location.href = '/dashboard';
                }
            } catch (e) {
                this.errorMessage = e.message;
            } finally {
                this.loading = false;
            }
        },

        async verify2FA() {
            this.loading = true;
            this.errorMessage = '';

            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/auth/2fa/verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        temp_token: this.tempToken,
                        code: this.twoFactorCode
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || 'Código 2FA incorreto.');
                }

                REPIX_CONFIG.setToken(data.access_token);
                REPIX_CONFIG.setUser(data.user);
                window.location.href = '/admin';
            } catch (e) {
                this.errorMessage = e.message;
            } finally {
                this.loading = false;
            }
        },

        async handleRegister() {
            this.loading = true;
            this.errorMessage = '';
            this.successMessage = '';

            if (this.registerPassword !== this.confirmPassword) {
                this.errorMessage = 'A confirmação de senha não confere com a senha digitada.';
                this.loading = false;
                return;
            }

            if (this.registerPassword.length < 6) {
                this.errorMessage = 'A senha deve conter no mínimo 6 caracteres.';
                this.loading = false;
                return;
            }

            try {
                const res = await fetch(`${REPIX_CONFIG.apiBaseUrl}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: this.registerName,
                        email: this.registerEmail,
                        document: this.registerDocument,
                        phone: this.registerPhone,
                        password: this.registerPassword,
                        confirm_password: this.confirmPassword
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || 'Falha ao realizar cadastro.');
                }

                this.successMessage = 'Conta criada com sucesso! Entrando na dashboard...';

                REPIX_CONFIG.setToken(data.access_token);
                REPIX_CONFIG.setUser(data.user);

                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } catch (e) {
                this.errorMessage = e.message;
            } finally {
                this.loading = false;
            }
        }
    }));
});
