# 📱 Exemplos de Uso - FinanceZap

## 🚀 Enviar Mensagem Simples

### Usando o SDK do Twilio (Node.js) - Exemplo Original:
```javascript
const accountSid = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const authToken = 'seu_auth_token_aqui';
const client = require('twilio')(accountSid, authToken);

client.messages
    .create({
        body: 'Your appointment is coming up on July 21 at 3PM',
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+556181474690'
    })
    .then(message => console.log(message.sid))
    .done();
```

### Usando a API REST do projeto (cURL):
```bash
curl -X POST http://localhost:3000/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Your appointment is coming up on July 21 at 3PM",
    "to": "whatsapp:+556181474690"
  }'
```

### Usando a API REST do projeto (Node.js/Fetch):
```javascript
const response = await fetch('http://localhost:3000/send-message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Your appointment is coming up on July 21 at 3PM',
    to: 'whatsapp:+556181474690'
  })
});

const data = await response.json();
console.log('Mensagem enviada:', data.messageSid);
```

## 📋 Enviar Template (ContentSid)

### Usando cURL:
```bash
curl -X POST http://localhost:3000/send-template \
  -H "Content-Type: application/json" \
  -d '{
    "contentSid": "HXb5b62575e6e4ff6129ad7c8efe1f983e",
    "contentVariables": {
      "1": "12/1",
      "2": "3pm"
    },
    "to": "whatsapp:+5561981474690"
  }'
```

### Usando a API diretamente (Node.js):
```javascript
const response = await fetch('http://localhost:3000/send-template', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contentSid: 'HXb5b62575e6e4ff6129ad7c8efe1f983e',
    contentVariables: {
      "1": "12/1",
      "2": "3pm"
    },
    to: 'whatsapp:+5561981474690'
  })
});
```

## 🔗 Enviar Diretamente via API do Twilio

### Exemplo do cURL original:
```bash
curl 'https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Messages.json' \
  -X POST \
  --data-urlencode 'To=whatsapp:+5561981474690' \
  --data-urlencode 'From=whatsapp:+14155238886' \
  --data-urlencode 'ContentSid=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' \
  --data-urlencode 'ContentVariables={"1":"12/1","2":"3pm"}' \
  -u ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:seu_auth_token_aqui
```

## 📸 Enviar Mensagem com Mídia

### Usando a API REST do projeto:
```bash
curl -X POST http://localhost:3000/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Here'\''s that picture of an owl you requested.",
    "mediaUrl": ["https://demo.twilio.com/owl.png"],
    "to": "whatsapp:+556181474690"
  }'
```

### Múltiplas mídias:
```bash
curl -X POST http://localhost:3000/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Aqui estão as imagens",
    "mediaUrl": [
      "https://demo.twilio.com/owl.png",
      "https://demo.twilio.com/logo.png"
    ],
    "to": "whatsapp:+556181474690"
  }'
```

## 📊 Status Callback

Para monitorar o status das mensagens enviadas:

```bash
curl -X POST http://localhost:3000/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hey, I just met you, and this is crazy...",
    "to": "whatsapp:+556181474690",
    "statusCallback": "https://seu-dominio.com/webhook/status"
  }'
```

O Twilio enviará atualizações de status para a URL fornecida quando a mensagem mudar de status (queued → sent → delivered, etc.).

## 📝 Parâmetros

### `/send-message`
- `message` (string, opcional): Texto da mensagem (padrão: "oi")
- `to` (string, opcional): Número de destino (padrão: seu número configurado)
- `mediaUrl` (string ou array, opcional): URL(s) da(s) mídia(s) a enviar
- `statusCallback` (string, opcional): URL para receber atualizações de status

### `/send-template`
- `contentSid` (string, obrigatório): ID do template aprovado no WhatsApp
- `contentVariables` (object/string, opcional): Variáveis do template
- `to` (string, opcional): Número de destino (padrão: seu número configurado)

## 🔍 Verificar Status

Acesse `http://localhost:3000/` para ver todas as rotas disponíveis e exemplos.

## 📚 Referência

Baseado na [documentação oficial do Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp/api).

