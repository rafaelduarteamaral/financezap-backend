# ⚡ Guia de Integração Rápida

## 🎯 Integração em 3 Passos

### Passo 1: Adicionar Import no Webhook

No seu `index.ts` ou `worker.ts`, adicione no topo:

```typescript
import { processarMensagemWhatsAppComRoteador } from './integracaoWebhook';
import { chatIA } from './chatIA';
```

### Passo 2: Substituir Processamento

No seu endpoint do webhook, substitua o processamento atual por:

```typescript
app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;

  // ANTES: seu código antigo de processamento
  // const resposta = await processarMensagemAntiga(mensagem, telefone);

  // DEPOIS: usa o roteador
  const resposta = await processarMensagemWhatsAppComRoteador(
    mensagem,
    telefone,
    chatIA
  );

  await enviarMensagemWhatsApp(telefone, resposta);
  res.status(200).send('OK');
});
```

### Passo 3: Testar

Envie uma mensagem via WhatsApp:
```
comprei café por 5 reais
```

Verifique nos logs se apareceu:
```
[Roteador] Serviço identificado: transacao (confiança: 0.95)
```

## ✅ Pronto!

O sistema está funcionando. Os processadores tentam usar suas funções reais automaticamente.

---

**Veja `README_ROTEADOR.md` para mais detalhes!**
