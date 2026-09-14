# Facilita iPhone

Funil responsivo para aluguel de iPhones, pronto para GitHub e Cloudflare Pages.

## Rotas

- `/` - verificação "Eu não sou um robô"
- `/facilita/` - análise, escolha, entrega, contato, resumo e PIX
- `/termos/` - termos de uso em HTML e PDF
- `/sucesso/` - confirmação após pagamento
- `/api/mangofy/pix` - geração do PIX
- `/api/mangofy/status` - consulta do pagamento
- `/api/mangofy/postback` - recepção de notificações da MangoFy
- `/api/v1/widget/upload-proof` - proxy/recepção de comprovante do widget RePix

## Widget RePix White-Label

O checkout possui integração nativa com o **RePix** para captura e conciliação de comprovantes Pix:
- Carregamento do script `https://app.repix.site/assets/js/repix-widget.js` no final do checkout (`/facilita/`).
- Sincronização automática do `data-sale-id` e `amount_cents` com o código gerado pela MangoFy (`payment_code`).
- Ação dedicada "Já realizou o Pix? Enviar comprovante" no modal de pagamento.
- Redirecionamento configurado para `/sucesso/` após envio do comprovante.

## Ambiente de Teste Real (Ticket R$ 5,00)

Para testes reais de ponta a ponta sem altos custos de aluguel:
- Está disponível no seletor de modelos o item **"Produto Teste Real (RePix)"** no valor exato de **R$ 5,00**.
- Atende ao valor mínimo aceito pela API da MangoFy (500 centavos).
- Permite validar a geração do QR Code Pix, conciliação e upload de comprovante em ambiente real.

## Publicação no Cloudflare Pages

### 1. Enviar ao GitHub

Crie um repositório vazio no GitHub, sem adicionar README ou `.gitignore`, e execute dentro desta pasta:

```bash
git init
git add .
git commit -m "Publica o funil Facilita iPhone"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

### 2. Conectar ao Cloudflare Pages

No Cloudflare, acesse **Workers & Pages**, importe o repositório e use:

```txt
Framework preset: None
Production branch: main
Build command: exit 0
Build output directory: .
Root directory: deixe vazio
```

O diretório `functions/` precisa permanecer na raiz do repositório para que as rotas da MangoFy e da API de Conversões sejam publicadas.

### 3. Configurar variáveis

Cadastre estas variáveis em **Settings > Variables and Secrets** nos ambientes de produção e preview:

```txt
MANGOFY_API_KEY=sua_api_key
MANGOFY_STORE_CODE=seu_store_code
MANGOFY_API_URL=https://checkout.mangofy.com.br/api/v1
MANGOFY_PREVIEW_MODE=false
MANGOFY_POSTBACK_URL=https://seu-dominio.com/api/mangofy/postback
META_CONVERSIONS_API_TOKEN=seu_token_da_api_de_conversoes
```

Não coloque credenciais reais em arquivos enviados ao GitHub.

Em produção, mantenha `MANGOFY_PREVIEW_MODE=false`. Para homologação, altere apenas no ambiente de preview para `true`; nesse modo, a API cria um PIX simulado e a consulta de status retorna aprovação.

Depois do primeiro deploy, substitua `https://seu-dominio.com` em `MANGOFY_POSTBACK_URL` pelo domínio definitivo do projeto.

## Meta Pixel

O Pixel `2163835031230117` envia `PageView`, `InitiateCheckout` e `Purchase`. Os mesmos eventos são enviados pela API de Conversões com deduplicação por `event_id`. O token deve existir apenas na variável protegida `META_CONVERSIONS_API_TOKEN`.
