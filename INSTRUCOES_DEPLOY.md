# ✅ Deploy no Cloudflare - Status e Próximos Passos

## ✅ O que já foi feito:

1. ✅ **Banco D1 criado**: `financezap-db` (ID: ebba7132-e0c2-448a-a553-2540fb8356a5)
2. ✅ **Migrations aplicadas**: Todas as migrations foram aplicadas no banco remoto
3. ✅ **Secrets configurados**: Todos os secrets foram configurados no Cloudflare:
   - JWT_SECRET
   - TWILIO_ACCOUNT_SID
   - TWILIO_AUTH_TOKEN
   - TWILIO_WHATSAPP_NUMBER
   - GROQ_API_KEY
   - GEMINI_API_KEY
   - (Z-API configurados se estiverem no .env)
4. ✅ **Código corrigido**: Removido `setInterval` que não funciona no Workers

## 🔧 Próximo passo necessário:

### Registrar Subdomínio workers.dev

Você precisa registrar um subdomínio `workers.dev` para fazer o deploy. Há duas opções:

#### Opção 1: Via Dashboard (Recomendado)

1. Acesse: https://dash.cloudflare.com/99cfa12eb5d6c24a0aae15fad2c775a8/workers/onboarding
2. Clique em "Get started" ou "Register subdomain"
3. Escolha um subdomínio (ex: `rafaelduarteamaral`)
4. Seu Worker ficará disponível em: `https://financezap.rafaelduarteamaral.workers.dev`

#### Opção 2: Adicionar rota customizada no wrangler.toml

Se você tem um domínio no Cloudflare, pode adicionar uma rota:

```toml
routes = [
  { pattern = "api.seudominio.com", custom_domain = true }
]
```

## 🚀 Após registrar o subdomínio:

```bash
cd backend-financezap
npm run deploy:worker
```

## 📊 Verificar Deploy:

```bash
# Ver logs em tempo real
wrangler tail

# Ver deployments
wrangler deployments list

# Testar a API
curl https://financezap.SEU_SUBDOMINIO.workers.dev/
```

## 💰 Custos do Cloudflare

### Plano Gratuito (Free) - **SUFICIENTE PARA COMEÇAR!**

**Workers:**
- ✅ 100.000 requisições/dia
- ✅ CPU Time: 50ms por requisição
- ✅ 128MB de memória

**D1 Database:**
- ✅ 5GB de armazenamento
- ✅ 5 milhões de reads/mês
- ✅ 100.000 writes/mês
- ✅ 2.000 queries/dia (gratuito)

**Bandwidth:**
- ✅ Ilimitado

### Plano Pago ($5/mês por Worker)

- Requisições ilimitadas
- CPU Time: 30 segundos por requisição
- Mais recursos de D1 disponíveis

**💡 Para começar, o plano gratuito é mais que suficiente!**

## 🔗 URLs após deploy:

- **API**: `https://financezap.SEU_SUBDOMINIO.workers.dev`
- **Health Check**: `https://financezap.SEU_SUBDOMINIO.workers.dev/`
- **API Auth**: `https://financezap.SEU_SUBDOMINIO.workers.dev/api/auth/solicitar-codigo`

## 📝 Configurar Frontend:

Após o deploy, atualize o `.env` do frontend:

```env
VITE_API_URL=https://financezap.SEU_SUBDOMINIO.workers.dev
```

E atualize o `ALLOWED_ORIGINS` no `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://seu-frontend.com,http://localhost:5173"
```

## 🆘 Troubleshooting:

### Erro: "Subdomain not registered"
- Acesse o link do dashboard e registre o subdomínio

### Erro: "Secret not found"
```bash
wrangler secret list  # Verificar secrets
wrangler secret put NOME_DO_SECRET  # Configurar faltante
```

### Erro: "Database not found"
```bash
wrangler d1 list  # Verificar bancos
wrangler d1 migrations apply financezap-db --remote  # Aplicar migrations
```

## 📚 Documentação:

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

