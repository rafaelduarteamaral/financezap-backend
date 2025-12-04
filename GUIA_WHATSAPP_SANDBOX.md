# 📱 Guia: Como Configurar o WhatsApp Sandbox no Twilio

## ⚠️ Importante

O número que você viu (+1 706 420 6885) é um **número regular do Twilio** (para Voice/SMS), **NÃO** é o número do WhatsApp Sandbox.

Para usar WhatsApp, você precisa configurar o **WhatsApp Sandbox**, que é diferente e gratuito para testes.

## 🚀 Passo a Passo

### 1. Acessar o WhatsApp Sandbox

1. Acesse: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Ou navegue: **Messaging** > **Try it out** > **Send a WhatsApp message**

### 2. Ativar o WhatsApp Sandbox

1. Na página, você verá uma seção chamada **"WhatsApp Sandbox"**
2. Aceite os termos de serviço
3. Você verá:
   - **Sandbox number**: Um número como `+14155238886` ou similar
   - **Join code**: Um código como `join exemplo-abc` ou similar

### 3. Fazer Join no Sandbox

1. **Abra o WhatsApp** no seu celular
2. **Envie uma mensagem** para o número do Sandbox (ex: `+14155238886`)
3. **Envie o código de join**: `join exemplo-abc` (substitua pelo código que aparecer)
4. Você receberá uma confirmação de que está conectado

### 4. Copiar o Número do Sandbox

1. Copie o número do Sandbox (ex: `+14155238886`)
2. Adicione o prefixo `whatsapp:` na frente
3. Formato final: `whatsapp:+14155238886`

### 5. Atualizar o arquivo .env

Abra o arquivo `.env` e atualize:

```env
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

(Substitua pelo número que você encontrou no Sandbox)

### 6. Configurar o Webhook

1. Na mesma página do WhatsApp Sandbox, procure por **"When a message comes in"**
2. Para desenvolvimento local:
   - Instale o ngrok: https://ngrok.com/
   - Execute: `ngrok http 3000`
   - Copie a URL HTTPS (ex: `https://abc123.ngrok.io`)
3. Configure no Twilio: `https://abc123.ngrok.io/webhook/whatsapp`
4. Salve as configurações

## ✅ Pronto!

Agora você pode:
- Enviar mensagens do seu app para o WhatsApp
- Receber mensagens e ver no console

## 🔍 Diferença entre Número Regular e WhatsApp Sandbox

| Tipo | Número Regular | WhatsApp Sandbox |
|------|---------------|------------------|
| **Onde encontrar** | Phone Numbers > Manage > Active numbers | Messaging > Try it out > WhatsApp |
| **Uso** | Voice, SMS, MMS | Apenas WhatsApp |
| **Custo** | Pago | Gratuito para testes |
| **Formato** | `+17064206885` | `whatsapp:+14155238886` |
| **Configuração** | Comprado/Provisionado | Ativado no Sandbox |

## 📞 Seu Número Atual

O número `+1 706 420 6885` que você tem é um número regular e **não funciona para WhatsApp**.

Para WhatsApp, você **deve usar** o número do WhatsApp Sandbox que aparece na página de configuração.

