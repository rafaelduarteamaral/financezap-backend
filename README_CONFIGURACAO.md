# 🚀 Configuração Automática - FinanceZap

## ⚡ Configuração Rápida (Recomendado)

Execute o script interativo que faz TUDO automaticamente:

```bash
cd backend-financezap
bash configurar-zapi.sh
```

O script vai:
1. ✅ Pedir suas credenciais da Z-API
2. ✅ Configurar todos os secrets automaticamente
3. ✅ Fazer deploy do Worker
4. ✅ Mostrar as URLs finais

## 🔧 Configuração Completa

Para configurar TODOS os secrets (JWT, Z-API, IA, etc):

```bash
cd backend-financezap
bash configurar-tudo.sh
```

## 📋 O que você precisa

### Z-API (Obrigatório)
- Instance ID
- Token
- Client-Token

Encontre em: https://www.z-api.io → Instâncias → Sua instância

### IA Provider (Opcional)
- GROQ_API_KEY ou GEMINI_API_KEY
- IA_PROVIDER (groq ou gemini)

## ✅ Após Configurar

1. Configure o webhook no painel Z-API:
   ```
   https://financezap.rafael-damaral.workers.dev/webhook/zapi
   ```

2. Teste enviando uma mensagem via WhatsApp

3. Verifique os logs:
   ```bash
   wrangler tail
   ```

## 🆘 Problemas?

- Verifique os secrets: `wrangler secret list`
- Veja os logs: `wrangler tail`
- Consulte: `CONFIGURAR_ZAPI_CLOUDFLARE.md`
