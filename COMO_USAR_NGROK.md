# 🚀 Como Usar o ngrok

## ✅ ngrok Instalado!

O ngrok foi instalado com sucesso na sua máquina.

## 📝 Como Usar

### 1. Inicie o servidor Node.js

Em um terminal:
```bash
npm run dev
```

O servidor vai rodar na porta 3000.

### 2. Inicie o ngrok (em outro terminal)

Abra um **novo terminal** e execute:

```bash
ngrok http 3000
```

Você verá algo assim:
```
ngrok                                                                               

Session Status                online
Account                       (sua conta)
Version                       3.x.x
Region                        United States (us)
Latency                       45ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123-def456.ngrok.io -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

### 3. Copie a URL HTTPS

Copie a URL que aparece em **"Forwarding"**:
```
https://abc123-def456.ngrok.io
```

⚠️ **IMPORTANTE:** Use a URL **HTTPS** (não HTTP)

### 4. Configure no Twilio

1. Acesse: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Procure por **"When a message comes in"**
3. Cole a URL completa:
   ```
   https://abc123-def456.ngrok.io/webhook/whatsapp
   ```
4. Clique em **"Save"**

### 5. Teste

1. Envie uma mensagem do WhatsApp para o número do Twilio
2. Verifique o console do servidor - deve aparecer:
   ```
   🔔 WEBHOOK RECEBIDO DO TWILIO!
   ```

## 🔍 Interface Web do ngrok

O ngrok também fornece uma interface web para ver todas as requisições:

```
http://127.0.0.1:4040
```

Lá você pode ver:
- Todas as requisições recebidas
- Headers e body das requisições
- Respostas enviadas

## ⚠️ Importante

### URL muda a cada vez

Na versão gratuita do ngrok, a URL muda toda vez que você reinicia o ngrok.

**Solução:**
- Sempre atualize a URL no Twilio quando reiniciar o ngrok
- Ou use ngrok com domínio fixo (plano pago)

### Mantenha o ngrok rodando

- O ngrok precisa estar rodando enquanto você desenvolve
- Se fechar o terminal do ngrok, o webhook para de funcionar
- Mantenha ambos os terminais abertos:
  - Terminal 1: `npm run dev` (servidor Node.js)
  - Terminal 2: `ngrok http 3000` (túnel ngrok)

## 🎯 Resumo Rápido

```bash
# Terminal 1: Servidor
npm run dev

# Terminal 2: ngrok
ngrok http 3000

# Copie a URL HTTPS e configure no Twilio
# Exemplo: https://abc123.ngrok.io/webhook/whatsapp
```

## 🔄 Alternativas ao ngrok

Se não quiser usar ngrok, você pode usar:

1. **localtunnel** (gratuito, similar ao ngrok)
   ```bash
   npm install -g localtunnel
   lt --port 3000
   ```

2. **serveo** (gratuito, via SSH)
   ```bash
   ssh -R 80:localhost:3000 serveo.net
   ```

3. **Deploy em servidor** (Heroku, Railway, etc.)
   - Mais complexo, mas URL fixa

## 💡 Dica

Para facilitar, você pode criar um script que inicia ambos:

```bash
# start.sh
#!/bin/bash
# Inicia o servidor em background
npm run dev &
# Aguarda 2 segundos
sleep 2
# Inicia o ngrok
ngrok http 3000
```

Mas o ngrok é a opção mais simples e confiável! 🚀

