# 🎯 Sistema de Roteamento de Serviços - Documentação Completa

## 📋 Visão Geral

Sistema inteligente que permite que a IA decida automaticamente qual serviço usar baseado na mensagem do usuário. Todos os serviços estão centralizados em arquivos específicos, facilitando a manutenção e adição de novos serviços.

## ✨ Características

- ✅ **Decisão Automática**: IA identifica qual serviço usar
- ✅ **Centralizado**: Todos os serviços em um único arquivo
- ✅ **Validado**: Validação automática dos dados extraídos
- ✅ **Tipado**: TypeScript garante type safety
- ✅ **Escalável**: Fácil adicionar novos serviços
- ✅ **Documentado**: Cada serviço tem descrição e exemplos

## 📁 Estrutura de Arquivos

```
backend-financezap/src/
├── servicos.ts                      # Catálogo de serviços
├── roteadorServicos.ts              # Sistema de roteamento
├── processadoresServicos.ts         # Funções de processamento (ADAPTE AQUI)
├── exemploWebhookComRoteador.ts     # Exemplo de uso no webhook
├── index.exemplo.ts                 # Exemplo completo de index.ts
└── GUIA_INTEGRACAO.md              # Guia passo a passo
```

## 🚀 Como Funciona

```
┌─────────────────┐
│ Mensagem WhatsApp│
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  IA Analisa Mensagem│
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Identifica Serviço  │
│  (transacao,        │
│   agendamento,      │
│   consulta)         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Valida Dados        │
│ Extraídos           │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Roteia para         │
│ Processador         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Retorna Resposta    │
│ Formatada           │
└─────────────────────┘
```

## 📊 Serviços Disponíveis

### 1. Transação Financeira (`transacao`)
Registra gastos e receitas.

**Exemplos:**
- "comprei um sanduiche por 50 reais"
- "gastei 25,50 no almoço hoje"
- "recebi R$ 500,00 de salário"

### 2. Agendamento Financeiro (`agendamento`)
Cria agendamentos para transações futuras.

**Exemplos:**
- "agendar pagamento de R$ 200 de aluguel para dia 5"
- "marcar conta de luz de R$ 150 para o próximo dia 10"

### 3. Consulta Financeira (`consulta`)
Responde perguntas sobre finanças.

**Exemplos:**
- "quanto gastei este mês?"
- "qual meu saldo atual?"
- "quais são meus agendamentos pendentes?"

## 🔧 Integração Rápida

### 1. Adaptar Processadores

Edite `processadoresServicos.ts` e substitua as implementações de exemplo:

```typescript
import { salvarTransacao } from './database';

export async function processarTransacao(dados: any, telefone: string) {
  return await salvarTransacao({
    descricao: dados.descricao,
    valor: dados.valor,
    // ... outros campos
    telefone
  });
}
```

### 2. Integrar no Webhook

```typescript
import { processarMensagemComRoteamento, gerarMensagemResposta } from './roteadorServicos';
import { processarTransacao, processarAgendamento, processarConsulta } from './processadoresServicos';

app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;

  const { servicoUsado, resultado } = await processarMensagemComRoteamento(
    mensagem,
    telefone,
    chatIA, // sua função de chat IA
    {
      transacao: processarTransacao,
      agendamento: processarAgendamento,
      consulta: processarConsulta
    }
  );

  const resposta = gerarMensagemResposta(servicoUsado, resultado);
  await enviarMensagemWhatsApp(telefone, resposta);

  res.status(200).send('OK');
});
```

## ➕ Adicionar Novo Serviço

### Passo 1: Definir no `servicos.ts`

```typescript
export const SERVICO_NOVO: ServicoConfig = {
  id: 'novo_servico',
  nome: 'Novo Serviço',
  descricao: 'Descrição do serviço',
  palavrasChave: ['palavra1', 'palavra2'],
  exemplos: ['exemplo 1', 'exemplo 2'],
  schemaJson: {
    type: 'object',
    properties: {
      campo1: { type: 'string' }
    },
    required: ['campo1']
  },
  processar: async (dados, telefone) => ({ dados, telefone })
};

// Adicionar na lista
export const SERVICOS_DISPONIVEIS = [
  // ... outros
  SERVICO_NOVO
];
```

### Passo 2: Criar Processador

Em `processadoresServicos.ts`:

```typescript
export async function processarNovoServico(dados: any, telefone: string) {
  // Sua implementação
  return resultado;
}
```

### Passo 3: Adicionar no Roteador

Em `roteadorServicos.ts`, adicione no switch:

```typescript
case 'novo_servico':
  resultado = await processadores.novoServico?.(dados, telefone) 
    || await servico.processar(dados, telefone);
  break;
```

### Passo 4: Adicionar no Webhook

```typescript
{
  // ... outros
  novoServico: processarNovoServico
}
```

## 📝 Exemplos de Uso

### Webhook Twilio

```typescript
app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;

  const { servicoUsado, resultado } = await processarMensagemComRoteamento(
    mensagem, telefone, chatIA, processadores
  );

  const resposta = gerarMensagemResposta(servicoUsado, resultado);
  await enviarMensagemTwilio(telefone, resposta);

  res.status(200).send('OK');
});
```

### Webhook Z-API

```typescript
app.post('/webhook/zapi', async (req, res) => {
  const { phone, message } = req.body;
  
  const { servicoUsado, resultado } = await processarMensagemComRoteamento(
    message, phone, chatIA, processadores
  );

  const resposta = gerarMensagemResposta(servicoUsado, resultado);
  await enviarMensagemZAPI(phone, resposta);

  res.status(200).json({ success: true });
});
```

### Cloudflare Worker

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST' && url.pathname === '/webhook/zapi') {
      const body = await request.json();
      const { phone, message } = body;

      const { servicoUsado, resultado } = await processarMensagemComRoteamento(
        message, phone, 
        (prompt) => chatIA(prompt, env),
        processadores
      );

      const resposta = gerarMensagemResposta(servicoUsado, resultado);
      await enviarMensagemZAPI(phone, resposta, env);

      return new Response(JSON.stringify({ success: true }));
    }
  }
};
```

## 🔍 Debugging

### Ver Logs

O roteador loga informações:

```
[Roteador] Serviço identificado: transacao (confiança: 0.95)
```

### Verificar Validação

Se dados inválidos, verifique:
- Schema JSON do serviço
- Prompt da IA
- Logs de validação

### Testar Serviço Específico

```typescript
const decisao = await identificarServico(mensagem, chatIA);
console.log('Serviço:', decisao.servicoId);
console.log('Dados:', decisao.dadosExtraidos);
console.log('Confiança:', decisao.confianca);
```

## ✅ Checklist de Integração

- [ ] Arquivos criados
- [ ] Processadores adaptados para código real
- [ ] Roteador integrado no webhook
- [ ] Função `chatIA` configurada
- [ ] Testado com transação
- [ ] Testado com agendamento
- [ ] Testado com consulta
- [ ] Logs verificados

## 📚 Documentação Adicional

- **`GUIA_INTEGRACAO.md`** - Guia passo a passo detalhado
- **`exemploWebhookComRoteador.ts`** - Exemplos de código
- **`index.exemplo.ts`** - Exemplo completo de webhook

## 🎯 Vantagens

1. **Facilita Manutenção**: Todos os serviços em um lugar
2. **Escalável**: Fácil adicionar novos serviços
3. **Inteligente**: IA decide automaticamente
4. **Validado**: Dados sempre validados
5. **Tipado**: TypeScript garante segurança
6. **Documentado**: Cada serviço bem documentado

## 🚀 Próximos Passos

1. Adapte as funções de processamento para seu código real
2. Integre o roteador no seu webhook
3. Teste com mensagens reais
4. Adicione novos serviços conforme necessário

---

**Criado em:** 2025-01-15
**Versão:** 1.0.0
