# 🔐 Configurar Autenticação do ngrok

## ⚠️ Erro: ngrok precisa de autenticação

O ngrok agora requer uma conta gratuita para funcionar.

## 🚀 Solução Rápida (2 minutos)

### Passo 1: Criar conta no ngrok

1. Acesse: https://dashboard.ngrok.com/signup
2. Crie uma conta gratuita (pode usar email ou GitHub)
3. É totalmente gratuito!

### Passo 2: Obter seu authtoken

1. Após criar a conta, acesse: https://dashboard.ngrok.com/get-started/your-authtoken
2. Você verá seu authtoken (algo como: `2abc123def456ghi789jkl012mno345pq`)
3. Copie esse token

### Passo 3: Configurar o authtoken

No terminal, execute:

```bash
ngrok config add-authtoken SEU_AUTHTOKEN_AQUI
```

Substitua `SEU_AUTHTOKEN_AQUI` pelo token que você copiou.

### Passo 4: Testar

```bash
ngrok http 3000
```

Agora deve funcionar! 🎉

## 🔄 Alternativa: localtunnel (sem conta)

Se não quiser criar conta no ngrok, você pode usar **localtunnel**:

### Instalar localtunnel:

```bash
npm install -g localtunnel
```

### Usar:

```bash
lt --port 3000
```

Você receberá uma URL como: `https://abc123.loca.lt`

Configure essa URL no Twilio:
```
https://abc123.loca.lt/webhook/whatsapp
```

**Vantagens:**
- ✅ Não precisa criar conta
- ✅ Gratuito
- ✅ Funciona igual ao ngrok

**Desvantagens:**
- ⚠️ URL muda a cada vez
- ⚠️ Pode ser um pouco mais lento

## 🎯 Recomendação

Recomendo usar o **ngrok** porque:
- Mais estável
- Interface web para ver requisições
- Melhor documentação
- Conta gratuita é rápida de criar

Mas se preferir não criar conta, o **localtunnel** funciona bem também!

