# Backend FinanceZap

API Node.js + TypeScript para receber mensagens do WhatsApp via Twilio e processar transações financeiras com IA.

## 🚀 Instalação

```bash
npm install
```

## ⚙️ Configuração

Configure o arquivo `.env` com suas credenciais do Twilio e Groq.

## 🏃 Executar

```bash
npm run dev
```

## 📡 Endpoints

- `POST /webhook/whatsapp` - Recebe mensagens do Twilio
- `GET /api/transacoes` - Lista transações (com filtros)
- `GET /api/transacoes/:telefone` - Transações por telefone
- `GET /api/estatisticas` - Estatísticas gerais
- `GET /api/gastos-por-dia` - Dados para gráfico
- `GET /api/telefones` - Lista de telefones
- `GET /api/resumo/:telefone` - Resumo por telefone
