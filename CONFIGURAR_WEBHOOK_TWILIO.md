# 🔧 Como Configurar o Webhook no Twilio Console

Baseado na [documentação oficial do Twilio](https://www.twilio.com/docs/messaging/twiml#twilios-request-to-your-application).

## 📋 Pré-requisitos

- ✅ ngrok rodando (você já tem!)
- ✅ Servidor Node.js rodando (`npm run dev`)
- ✅ URL do ngrok copiada

## 🚀 Passo a Passo Completo

### 1. Obter a URL do ngrok

No terminal onde o ngrok está rodando, você vê:
```
Forwarding    https://overgentle-exp-XXXX.ngrok.io -> http://localhost:3000
```

**Copie a URL completa:** `https://overgentle-exp-XXXX.ngrok.io`

### 2. Acessar o Console do Twilio

1. Acesse: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Faça login na sua conta Twilio

### 3. Configurar o Webhook

1. Na página do WhatsApp Sandbox, procure pela seção **"When a message comes in"**
   
2. Você verá um campo de texto onde pode inserir a URL do webhook

3. Cole a URL completa do webhook:
   ```
   https://SUA_URL_NGROK.ngrok.io/webhook/whatsapp
   ```
   
   **Exemplo:**
   ```
   https://overgentle-exp-abc123.ngrok.io/webhook/whatsapp
   ```

4. ⚠️ **IMPORTANTE:**
   - Use **HTTPS** (não HTTP)
   - Use a URL do **ngrok** (não localhost)
   - Termine com **`/webhook/whatsapp`**

5. Clique em **"Save"** ou **"Salvar"**

### 4. Verificar a Configuração

Após salvar, você deve ver a URL configurada na seção "When a message comes in".

## 🧪 Testar a Configuração

### Teste 1: Verificar se o servidor está acessível

Abra no navegador:
```
https://SUA_URL_NGROK.ngrok.io/test-webhook
```

Deve retornar:
```json
{
  "success": true,
  "message": "Servidor está recebendo requisições!"
}
```

### Teste 2: Verificar o webhook diretamente

Abra no navegador:
```
https://SUA_URL_NGROK.ngrok.io/webhook/whatsapp
```

Deve retornar:
```json
{
  "status": "ok",
  "message": "Webhook está funcionando"
}
```

### Teste 3: Enviar mensagem real

1. Abra o WhatsApp no seu celular
2. Envie uma mensagem para: `+1 415 523 8886`
3. **Observe o console do servidor Node.js**

Você DEVE ver:
```
🌐 POST /webhook/whatsapp
🔔 WEBHOOK RECEBIDO DO TWILIO!
📦 Body completo: {...}
📱 Nova mensagem recebida!
💬 Mensagem: [sua mensagem]
```

## 📊 Monitorar Requisições

### Interface do ngrok

Acesse: `http://127.0.0.1:4040`

Você verá:
- Todas as requisições recebidas
- Headers e body das requisições
- Respostas enviadas
- Status HTTP

### Logs do Servidor

No terminal onde o servidor está rodando, você verá logs detalhados de cada requisição.

## 🔄 Como o Twilio Envia Requisições

Baseado na [documentação do Twilio](https://www.twilio.com/docs/messaging/twiml#twilios-request-to-your-application):

### Formato da Requisição

Quando uma mensagem chega, o Twilio envia um **POST** para sua URL com:

- **Content-Type:** `application/x-www-form-urlencoded`
- **Método:** `POST`
- **Parâmetros no body:**
  - `From`: Número que enviou (ex: `whatsapp:+556181474690`)
  - `To`: Seu número Twilio (ex: `whatsapp:+14155238886`)
  - `Body`: Texto da mensagem
  - `MessageSid`: ID único da mensagem
  - `NumMedia`: Número de mídias (se houver)
  - `MediaUrl0`, `MediaUrl1`, etc.: URLs das mídias (se houver)

### Resposta Esperada

Seu servidor deve responder com:

1. **Status HTTP:** `200 OK`
2. **Content-Type:** `text/xml`
3. **Body:** TwiML XML (mesmo que vazio)

Exemplo de resposta (atual no código):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response/>
```

## ⚠️ Problemas Comuns

### Problema 1: Webhook não recebe requisições

**Sintoma:** Mensagens não aparecem no console

**Soluções:**
1. Verifique se o ngrok está rodando
2. Verifique se a URL no Twilio está correta (HTTPS + /webhook/whatsapp)
3. Verifique a interface do ngrok (http://127.0.0.1:4040) para ver se a requisição chegou
4. Verifique os logs do servidor

### Problema 2: URL mudou após reiniciar ngrok

**Sintoma:** Funcionava antes mas parou

**Solução:**
- O ngrok gratuito gera URL diferente a cada vez
- Atualize a URL no Twilio Console
- Ou use ngrok com domínio fixo (plano pago)

### Problema 3: Erro 404 no ngrok

**Sintoma:** ngrok mostra 404 quando Twilio tenta acessar

**Solução:**
- Verifique se o servidor Node.js está rodando
- Verifique se a rota está correta: `/webhook/whatsapp`
- Teste manualmente no navegador

## 📝 Exemplo de Requisição do Twilio

Quando você recebe uma mensagem, o Twilio envia algo assim:

```
POST /webhook/whatsapp HTTP/1.1
Host: sua-url.ngrok.io
Content-Type: application/x-www-form-urlencoded

From=whatsapp%3A%2B556181474690&To=whatsapp%3A%2B14155238886&Body=Ol%C3%A1&MessageSid=SM1234567890
```

Seu servidor processa e responde com TwiML.

## ✅ Checklist Final

- [ ] ngrok rodando e URL copiada
- [ ] Servidor Node.js rodando
- [ ] URL configurada no Twilio Console
- [ ] URL termina com `/webhook/whatsapp`
- [ ] Teste no navegador funcionando
- [ ] Mensagem de teste enviada
- [ ] Mensagem aparecendo no console
- [ ] Mensagem aparecendo na interface web (`/app`)

## 🎯 Próximos Passos

Após configurar:

1. **Teste enviando uma mensagem** do WhatsApp
2. **Verifique o console** do servidor
3. **Veja na interface web:** `http://localhost:3000/app`
4. **Monitore no ngrok:** `http://127.0.0.1:4040`

Tudo funcionando? 🎉 Agora você está recebendo mensagens do WhatsApp em tempo real!

