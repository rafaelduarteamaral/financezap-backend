# 🎯 Sistema de Roteamento de Serviços

## 📋 Visão Geral

Sistema inteligente que permite que a IA decida automaticamente qual serviço usar baseado na mensagem do usuário.

## 🚀 Integração Rápida

No seu `index.ts`, adicione:

```typescript
import { processarMensagemWhatsAppComRoteador } from './integracaoWebhook';
import { chatIA } from './chatIA';

app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;

  const resposta = await processarMensagemWhatsAppComRoteador(
    mensagem,
    telefone,
    chatIA
  );

  await enviarMensagemWhatsApp(telefone, resposta);
  res.status(200).send('OK');
});
```

## 📊 Serviços Disponíveis

1. **Transação** - Registra gastos/receitas
2. **Agendamento** - Cria agendamentos futuros
3. **Consulta** - Responde perguntas sobre finanças

## ✅ Pronto para produção!
