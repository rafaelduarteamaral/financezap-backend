# 🔧 Troubleshooting - Mensagens não aparecem no console

## ❌ Problema: Mensagens não chegam no console

Se você está respondendo mas as mensagens não aparecem, siga estes passos:

## ✅ Checklist de Verificação

### 1. Verificar se o servidor está rodando

```bash
# Verifique se o servidor está ativo
curl http://localhost:3000/health
```

Deve retornar: `{"status":"ok","message":"Servidor rodando"}`

### 2. Verificar se o ngrok está rodando

```bash
# Em outro terminal, execute:
ngrok http 3000
```

Você deve ver algo como:
```
Forwarding  https://abc123-def456.ngrok.io -> http://localhost:3000
```

**⚠️ IMPORTANTE:** Copie a URL HTTPS (não HTTP)

### 3. Testar se o servidor está acessível publicamente

Abra no navegador:
```
https://SUA_URL_NGROK.ngrok.io/test-webhook
```

Deve retornar:
```json
{
  "success": true,
  "message": "Servidor está recebendo requisições!",
  ...
}
```

Se não funcionar, o ngrok não está configurado corretamente.

### 4. Verificar configuração do webhook no Twilio

1. Acesse: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Procure por **"When a message comes in"**
3. Verifique se a URL está configurada como:
   ```
   https://SUA_URL_NGROK.ngrok.io/webhook/whatsapp
   ```
4. **⚠️ IMPORTANTE:** 
   - Use HTTPS (não HTTP)
   - Use a URL do ngrok (não localhost)
   - Termine com `/webhook/whatsapp`

### 5. Verificar logs do servidor

Quando você enviar uma mensagem, você DEVE ver no console do servidor:

```
🌐 POST /webhook/whatsapp
🔔 WEBHOOK RECEBIDO DO TWILIO!
📦 Body completo: {...}
```

**Se não aparecer nada**, significa que o Twilio não está conseguindo acessar seu servidor.

### 6. Verificar se fez JOIN no Sandbox

Antes de receber mensagens, você precisa fazer JOIN:

1. Abra o WhatsApp no seu celular
2. Envie uma mensagem para: `+1 415 523 8886`
3. Envie o código: `join test-sail`
4. Aguarde confirmação

### 7. Testar o webhook manualmente

Você pode simular uma requisição do Twilio:

```bash
curl -X POST https://SUA_URL_NGROK.ngrok.io/webhook/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp:+556181474690" \
  -d "To=whatsapp:+14155238886" \
  -d "Body=Teste de mensagem" \
  -d "MessageSid=SM1234567890"
```

Se funcionar, você verá no console do servidor a mensagem sendo processada.

## 🔍 Problemas Comuns

### Problema 1: ngrok não está rodando
**Sintoma:** Não consegue acessar a URL do ngrok no navegador

**Solução:**
```bash
ngrok http 3000
```

### Problema 2: URL do webhook está errada
**Sintoma:** Webhook configurado mas não recebe requisições

**Solução:**
- Verifique se está usando HTTPS
- Verifique se está usando a URL do ngrok (não localhost)
- Verifique se termina com `/webhook/whatsapp`

### Problema 3: ngrok mudou a URL
**Sintoma:** Funcionava antes mas parou de funcionar

**Solução:**
- O ngrok gratuito gera uma URL diferente a cada vez
- Atualize a URL no Twilio Console
- Ou use ngrok com domínio fixo (pago)

### Problema 4: Não fez JOIN no Sandbox
**Sintoma:** Mensagens não chegam

**Solução:**
- Envie `join test-sail` para `+1 415 523 8886`
- Aguarde confirmação

### Problema 5: Firewall bloqueando
**Sintoma:** Servidor local não acessível

**Solução:**
- Verifique se a porta 3000 está aberta
- Tente usar outra porta

## 📊 Verificar Logs do Twilio

1. Acesse: https://console.twilio.com/us1/monitor/logs/messaging
2. Procure por mensagens enviadas
3. Clique em uma mensagem para ver detalhes
4. Verifique se há erros no webhook

## 🧪 Teste Completo

Execute este teste completo:

```bash
# 1. Inicie o servidor
npm run dev

# 2. Em outro terminal, inicie o ngrok
ngrok http 3000

# 3. Copie a URL HTTPS do ngrok

# 4. Teste se está acessível
curl https://SUA_URL_NGROK.ngrok.io/test-webhook

# 5. Configure no Twilio Console

# 6. Envie uma mensagem do WhatsApp

# 7. Verifique os logs do servidor
```

## 💡 Dica

Mantenha o terminal do servidor visível para ver os logs em tempo real. Qualquer requisição que chegar será exibida lá.

