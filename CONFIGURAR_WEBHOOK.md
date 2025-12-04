# 🔧 Como Configurar o Webhook para Receber Mensagens

## ⚠️ Problema: Mensagens não aparecem no console

Se a mensagem chegou no celular mas não aparece no console quando você responde, significa que o **webhook não está configurado** ou não está acessível.

## 🚀 Solução Passo a Passo

### 1. Instalar e Executar o ngrok

O ngrok expõe seu servidor local para a internet:

```bash
# Instalar (macOS)
brew install ngrok

# Ou baixar em: https://ngrok.com/download

# Executar (em um terminal separado)
ngrok http 3000
```

Você verá algo assim:
```
Forwarding  https://abc123-def456.ngrok.io -> http://localhost:3000
```

**Copie a URL HTTPS** (ex: `https://abc123-def456.ngrok.io`)

### 2. Configurar o Webhook no Twilio

1. Acesse: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Procure pela seção **"When a message comes in"**
3. Cole a URL do ngrok + `/webhook/whatsapp`:
   ```
   https://abc123-def456.ngrok.io/webhook/whatsapp
   ```
   (Substitua pela sua URL do ngrok)
4. Clique em **"Save"**

### 3. Testar o Webhook

1. Abra no navegador: `https://SUA_URL_NGROK.ngrok.io/webhook/whatsapp`
2. Deve aparecer: `{"status":"ok","message":"Webhook está funcionando"}`

### 4. Testar Enviando uma Mensagem

1. Envie uma mensagem para o número do Twilio (`+1 415 523 8886`)
2. Verifique o console do servidor - deve aparecer:
   ```
   🔔 Webhook recebido do Twilio!
   📱 Nova mensagem recebida!
   ```

## ✅ Checklist

- [ ] ngrok está rodando (`ngrok http 3000`)
- [ ] URL do ngrok foi copiada (ex: `https://abc123.ngrok.io`)
- [ ] Webhook configurado no Twilio com a URL completa
- [ ] Webhook testado no navegador (deve retornar JSON)
- [ ] Servidor Node.js está rodando (`npm run dev`)

## 🔍 Debug

Se ainda não funcionar:

1. **Verifique os logs do servidor** - você verá todas as requisições
2. **Verifique o console do ngrok** - mostra todas as requisições recebidas
3. **Verifique o Twilio Console** - vá em Monitor > Logs > Messaging para ver se há erros

## 📝 Nota Importante

- O ngrok gera uma URL diferente a cada vez (na versão gratuita)
- Se você reiniciar o ngrok, precisa atualizar a URL no Twilio
- Para produção, use um servidor com URL fixa

