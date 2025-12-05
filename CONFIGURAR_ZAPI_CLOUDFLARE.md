# 🔐 Configurar Z-API no Cloudflare Workers

## ⚠️ Erro: "Z-API não configurada"

Este erro ocorre porque as variáveis de ambiente da Z-API não estão configuradas como **secrets** no Cloudflare Workers.

## 📋 Variáveis Necessárias

Você precisa configurar os seguintes secrets no Cloudflare Workers:

1. **ZAPI_INSTANCE_ID** - ID da sua instância Z-API
2. **ZAPI_TOKEN** - Token da sua instância Z-API
3. **ZAPI_CLIENT_TOKEN** - Client-Token da sua instância Z-API (OBRIGATÓRIO!)
4. **ZAPI_BASE_URL** - URL base da API (opcional, padrão: `https://api.z-api.io`)

## 🔧 Como Configurar

### Opção 1: Via Wrangler CLI (Recomendado)

Execute os seguintes comandos no terminal:

```bash
cd backend-financezap

# Configure cada secret (será solicitado que você digite o valor)
wrangler secret put ZAPI_INSTANCE_ID
wrangler secret put ZAPI_TOKEN
wrangler secret put ZAPI_CLIENT_TOKEN
wrangler secret put ZAPI_BASE_URL  # Opcional: https://api.z-api.io
```

### Opção 2: Via Script Automatizado

Se você tem um arquivo `.env` local com as credenciais:

```bash
cd backend-financezap

# Configure manualmente cada secret
echo "SEU_INSTANCE_ID" | wrangler secret put ZAPI_INSTANCE_ID
echo "SEU_TOKEN" | wrangler secret put ZAPI_TOKEN
echo "SEU_CLIENT_TOKEN" | wrangler secret put ZAPI_CLIENT_TOKEN
```

### Opção 3: Via Dashboard do Cloudflare

1. Acesse: https://dash.cloudflare.com
2. Vá em: **Workers & Pages** → **financezap** → **Settings** → **Variables**
3. Clique em **Add variable** → **Secret**
4. Adicione cada variável:
   - `ZAPI_INSTANCE_ID`
   - `ZAPI_TOKEN`
   - `ZAPI_CLIENT_TOKEN`
   - `ZAPI_BASE_URL` (opcional)

## 📍 Onde Encontrar as Credenciais

1. Acesse o painel da Z-API: https://www.z-api.io
2. Faça login na sua conta
3. Vá em: **Instâncias** → Sua instância
4. Você encontrará:
   - **Instance ID** (ID da instância)
   - **Token** (Token da instância)
   - **Client-Token** (Token do cliente - OBRIGATÓRIO!)

## ✅ Verificar se Está Configurado

```bash
cd backend-financezap
wrangler secret list
```

Você deve ver todas as variáveis listadas.

## 🚀 Após Configurar

Após configurar os secrets, faça um novo deploy:

```bash
cd backend-financezap
npm run deploy:worker
```

## 🧪 Testar

Após configurar, teste enviando uma mensagem via WhatsApp. O webhook deve funcionar corretamente.

## ⚠️ Importante

- **NUNCA** commite as credenciais da Z-API no Git
- Use sempre **secrets** do Cloudflare Workers (não variáveis de ambiente normais)
- O **Client-Token** é obrigatório para a Z-API funcionar corretamente

## 🆘 Troubleshooting

### Erro: "Z-API não configurada"
- Verifique se todos os secrets estão configurados: `wrangler secret list`
- Certifique-se de que fez deploy após configurar: `npm run deploy:worker`

### Erro: "your client-token is not configured"
- Verifique se o **ZAPI_CLIENT_TOKEN** está configurado corretamente
- Certifique-se de que a instância Z-API está **conectada** ao WhatsApp
- Verifique se o Client-Token está correto no painel da Z-API

### Mensagens não estão sendo enviadas
- Verifique os logs: `wrangler tail`
- Confirme que a instância Z-API está online e conectada
- Verifique se o webhook está configurado corretamente no painel Z-API

