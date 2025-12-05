# 🚀 Deploy no Cloudflare - Guia Completo

## 📋 Pré-requisitos

- ✅ Wrangler CLI instalado
- ✅ Conta Cloudflare autenticada
- ✅ Banco D1 criado

## 💰 Custos do Cloudflare Workers + D1

### Plano Gratuito (Free)
- **Workers**: 100.000 requisições/dia
- **D1 Database**: 5GB de armazenamento, 5 milhões de reads/mês, 100.000 writes/mês
- **Bandwidth**: Ilimitado

### Plano Pago ($5/mês por Worker)
- **Workers**: Requisições ilimitadas
- **CPU Time**: 50ms por requisição (gratuito), 30s (pago)
- **D1 Database**: Mesmo do gratuito + opções pagas disponíveis

**💡 Para começar, o plano gratuito é suficiente!**

## 🔧 Configuração de Secrets

Os secrets são variáveis de ambiente sensíveis que não devem estar no código. Configure usando:

```bash
# Configurar secrets individuais
wrangler secret put JWT_SECRET
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put TWILIO_WHATSAPP_NUMBER
wrangler secret put GROQ_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put ZAPI_INSTANCE_ID
wrangler secret put ZAPI_TOKEN
wrangler secret put ZAPI_BASE_URL
wrangler secret put ZAPI_CLIENT_TOKEN
wrangler secret put IA_PROVIDER
```

**Ou configure tudo de uma vez:**

```bash
# Criar arquivo .secrets (não commitar no git!)
cat > .secrets << EOF
JWT_SECRET=sua_chave_jwt_aqui
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
GROQ_API_KEY=sua_chave_groq
GEMINI_API_KEY=sua_chave_gemini
ZAPI_INSTANCE_ID=seu_instance_id
ZAPI_TOKEN=seu_token
ZAPI_BASE_URL=https://api.z-api.io
ZAPI_CLIENT_TOKEN=seu_client_token
IA_PROVIDER=groq
EOF

# Configurar todos os secrets
while IFS='=' read -r key value; do
  [[ $key =~ ^#.*$ ]] && continue
  [[ -z $key ]] && continue
  echo "$value" | wrangler secret put "$key"
done < .secrets
```

## 🌐 Variáveis de Ambiente (vars)

Variáveis não sensíveis podem ser configuradas no `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://seu-dominio-frontend.com"
```

## 📦 Deploy

### 1. Aplicar Migrations no Banco Remoto

```bash
wrangler d1 migrations apply financezap-db --remote
```

### 2. Fazer Deploy do Worker

```bash
npm run deploy:worker
# ou
wrangler deploy
```

### 3. Verificar Deploy

```bash
# Ver logs em tempo real
wrangler tail

# Ver informações do Worker
wrangler deployments list
```

## 🔗 URLs Após Deploy

Após o deploy, seu Worker estará disponível em:
- **URL**: `https://financezap.SEU_SUBDOMINIO.workers.dev`

Para usar um domínio customizado, configure no dashboard do Cloudflare.

## 📊 Monitoramento

- **Dashboard**: https://dash.cloudflare.com
- **Logs**: `wrangler tail`
- **Métricas**: Dashboard do Cloudflare

## 🔄 Atualizações

Para atualizar o código:

```bash
# 1. Fazer alterações no código
# 2. Commit no git
# 3. Deploy novamente
npm run deploy:worker
```

## 🗄️ Gerenciar Banco D1

```bash
# Listar bancos
wrangler d1 list

# Executar query SQL
wrangler d1 execute financezap-db --remote --command="SELECT COUNT(*) FROM transacoes;"

# Backup do banco
wrangler d1 export financezap-db --remote --output=backup.sql
```

## ⚠️ Importante

1. **Secrets**: Nunca commite secrets no git
2. **.env**: O arquivo `.env` não funciona em produção, use `wrangler secret put`
3. **Migrations**: Sempre aplique migrations no banco remoto antes do deploy
4. **CORS**: Configure `ALLOWED_ORIGINS` com o domínio do seu frontend

## 🆘 Troubleshooting

### Erro: "Database not found"
```bash
# Verificar se o banco existe
wrangler d1 list

# Criar banco se não existir
wrangler d1 create financezap-db
```

### Erro: "Secret not found"
```bash
# Listar secrets configurados
wrangler secret list

# Configurar secret faltante
wrangler secret put NOME_DO_SECRET
```

### Erro: "Migration failed"
```bash
# Verificar estado das migrations
wrangler d1 migrations list financezap-db --remote

# Aplicar migrations manualmente se necessário
wrangler d1 execute financezap-db --remote --file=prisma/migrations/XXXX/migration.sql
```

