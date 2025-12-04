# 🔑 Como Obter a Chave do Groq (Passo a Passo)

## ⚡ Passo a Passo Rápido

### 1️⃣ Acesse o Console do Groq
Abra seu navegador e vá para: **https://console.groq.com/**

### 2️⃣ Faça Login ou Crie Conta
- Se já tiver conta: clique em **"Sign In"**
- Se não tiver: clique em **"Sign Up"** (pode usar Google/GitHub)

### 3️⃣ Acesse a Página de API Keys
Após fazer login, vá para: **https://console.groq.com/keys**

Ou:
1. Clique no menu (☰) no canto superior direito
2. Selecione **"API Keys"**

### 4️⃣ Crie uma Nova API Key
1. Clique no botão **"Create API Key"**
2. Dê um nome (ex: "FinanceZap")
3. Clique em **"Submit"** ou **"Create"**

### 5️⃣ Copie a Chave
⚠️ **IMPORTANTE**: A chave será mostrada apenas UMA VEZ!
- Copie a chave completa (começa com `gsk_...`)
- Exemplo: `gsk_abc123def456ghi789...`

### 6️⃣ Adicione no .env
1. Abra o arquivo: `backend-financezap/.env`
2. Encontre a linha: `GROQ_API_KEY=`
3. Cole a chave após o `=`
4. Salve o arquivo

**Exemplo:**
```env
GROQ_API_KEY=gsk_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
```

### 7️⃣ Reinicie o Servidor
```bash
cd backend-financezap
npm run dev
```

## ✅ Pronto!

Agora o servidor deve iniciar sem erros!

## 💡 Dicas

- A chave é **gratuita** e tem limite de 30 requests/minuto
- Guarde a chave em local seguro
- Se perder, crie uma nova no console do Groq

## 🆘 Problemas?

Se ainda tiver erro:
1. Verifique se copiou a chave completa (sem espaços)
2. Verifique se salvou o arquivo `.env`
3. Certifique-se de que não há espaços antes ou depois do `=`

