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

O Pixel `1011678908165044` envia `PageView`, `InitiateCheckout` e `Purchase`. Os mesmos eventos são enviados pela API de Conversões com deduplicação por `event_id`. O token deve existir apenas na variável protegida `META_CONVERSIONS_API_TOKEN`.

O Pixel Taboola `2081268` envia `page_view` em cada carregamento, `start_checkout` ao solicitar a geração do PIX e `make_purchase` somente após a MangoFy confirmar o pagamento. O evento de compra inclui valor, moeda e código do pedido, com proteção contra disparo duplicado na mesma sessão.
