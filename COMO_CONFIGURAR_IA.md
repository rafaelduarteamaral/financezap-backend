# 🤖 Como Configurar IA Gratuita para Processar Mensagens

## 🎯 Opções de IA Gratuita

### 1. Groq (Recomendado) ⭐
- ✅ **Totalmente gratuito**
- ✅ **Muito rápido** (inferência rápida)
- ✅ **Fácil de configurar**
- ✅ **30 requests/minuto** no tier gratuito
- ✅ **Modelos open source** (Llama, Mixtral)

### 2. Google Gemini
- ✅ Gratuito (com limites)
- ✅ Boa qualidade
- ⚠️ Requer conta Google

### 3. OpenAI (limitado)
- ⚠️ Tier gratuito muito limitado
- 💰 Pago após limites

## 🚀 Configurar Groq (Recomendado)

### Passo 1: Criar conta no Groq

1. Acesse: https://console.groq.com/
2. Clique em "Sign Up" (pode usar Google/GitHub)
3. É totalmente gratuito!

### Passo 2: Obter API Key

1. Após fazer login, vá em: https://console.groq.com/keys
2. Clique em "Create API Key"
3. Copie a chave gerada (algo como: `gsk_abc123...`)

### Passo 3: Adicionar no .env

Abra o arquivo `.env` e adicione:

```env
GROQ_API_KEY=gsk_sua_chave_aqui
```

### Passo 4: Reiniciar o servidor

```bash
npm run dev
```

## 🎯 Como Funciona

A IA vai entender mensagens como:

- ✅ "comprei um sanduiche por 50 reais e um milkshake por 30"
- ✅ "gastei 25,50 no almoço hoje"
- ✅ "paguei R$ 100,00 de conta de luz"
- ✅ "fiz uma compra de 45 reais na padaria"
- ✅ "despesa: 80 reais de combustível"

A IA extrai automaticamente:
- Descrição do item/serviço
- Valor da transação
- Múltiplas transações em uma mensagem

## 🔄 Fallback Automático

Se a API key não estiver configurada, o sistema usa processamento básico (regex) automaticamente.

## 📊 Limites do Groq (Gratuito)

- **30 requests por minuto**
- **14,400 requests por dia**
- Mais que suficiente para uso pessoal!

## 🔍 Testar

Envie uma mensagem como:
```
comprei um sanduiche por 50 reais e um milkshake por 30
```

A IA vai extrair ambas as transações automaticamente!

## 💡 Alternativa: Google Gemini

Se preferir usar Google Gemini:

1. Instale: `npm install @google/generative-ai`
2. Obtenha API key em: https://makersuite.google.com/app/apikey
3. Configure: `GEMINI_API_KEY=sua_chave`

Mas o Groq é mais rápido e fácil! 🚀

