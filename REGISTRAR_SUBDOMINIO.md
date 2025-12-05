# 🌐 Registrar Subdomínio workers.dev (GRATUITO)

## ✅ Sim! Você pode usar um domínio padrão da Cloudflare!

A Cloudflare oferece **GRATUITAMENTE** um subdomínio `workers.dev` para você usar enquanto não compra um domínio próprio.

## 📝 Como Registrar:

### Opção 1: Via Dashboard (Mais Fácil)

1. **Acesse o dashboard:**
   ```
   https://dash.cloudflare.com/99cfa12eb5d6c24a0aae15fad2c775a8/workers/onboarding
   ```

2. **Ou navegue manualmente:**
   - Acesse: https://dash.cloudflare.com
   - Vá em **Workers & Pages**
   - Clique em **"Get started"** ou procure por **"Your subdomain"**
   - Clique em **"Change"** ou **"Register subdomain"**

3. **Escolha um subdomínio:**
   - Exemplo: `rafaelduarteamaral` 
   - Seu Worker ficará em: `https://financezap.rafaelduarteamaral.workers.dev`
   - ⚠️ O subdomínio deve ser único e pode conter apenas letras, números e hífens

4. **Confirme e salve**

### Opção 2: Durante o Deploy (Automático)

Quando você executar o deploy pela primeira vez, o Wrangler pode perguntar se você quer registrar um subdomínio. Responda **"yes"**:

```bash
cd backend-financezap
npm run deploy:worker
# Quando perguntar sobre subdomínio, digite "yes"
```

## 🚀 Após Registrar:

Depois de registrar o subdomínio, execute:

```bash
cd backend-financezap
npm run deploy:worker
```

Seu Worker estará disponível em:
```
https://financezap.SEU_SUBDOMINIO.workers.dev
```

## 📋 Exemplo Completo:

1. **Registre o subdomínio:** `rafaelduarteamaral`
2. **Faça o deploy:** `npm run deploy:worker`
3. **Sua API estará em:** `https://financezap.rafaelduarteamaral.workers.dev`
4. **Teste:**
   ```bash
   curl https://financezap.rafaelduarteamaral.workers.dev/
   ```

## 💡 Vantagens do workers.dev:

- ✅ **100% GRATUITO**
- ✅ **HTTPS automático** (certificado SSL incluído)
- ✅ **Sem necessidade de domínio próprio**
- ✅ **Perfeito para desenvolvimento e testes**
- ✅ **Pode usar em produção** (até comprar um domínio)

## 🔄 Depois que comprar um domínio:

Quando você comprar um domínio (ex: `financezap.com`), você pode:

1. **Adicionar o domínio no Cloudflare**
2. **Configurar uma rota customizada** no `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "api.financezap.com", custom_domain = true }
   ]
   ```
3. **Ou usar Cloudflare Pages** para o frontend

Mas enquanto isso, o `workers.dev` funciona perfeitamente! 🎉

