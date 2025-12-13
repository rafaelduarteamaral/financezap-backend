# 📋 Sistema de Serviços Centralizado

## 🎯 Visão Geral

Este sistema permite que a IA decida automaticamente qual serviço usar baseado na mensagem do usuário. Todos os serviços estão centralizados em um único arquivo, facilitando a adição de novos serviços no futuro.

## 📁 Arquivos

- **`src/servicos.ts`** - Catálogo centralizado de todos os serviços disponíveis
- **`src/roteadorServicos.ts`** - Sistema de roteamento que usa a IA para decidir qual serviço chamar
- **`src/exemploIntegracaoRoteador.ts`** - Exemplo de como integrar no webhook do WhatsApp

## 🚀 Como Funciona

1. **Usuário envia mensagem** via WhatsApp
2. **IA analisa a mensagem** e identifica qual serviço usar
3. **Sistema roteia** para o serviço correto
4. **Serviço processa** e retorna resultado
5. **Resposta formatada** é enviada ao usuário

## 📊 Serviços Disponíveis

### 1. Transação Financeira (`transacao`)
Registra uma transação financeira (gasto ou receita).

**Exemplos de mensagens:**
- "comprei um sanduiche por 50 reais"
- "gastei 25,50 no almoço hoje"
- "recebi R$ 500,00 de salário"

**JSON esperado:**
```json
{
  "descricao": "Almoço",
  "valor": 25.50,
  "categoria": "alimentação",
  "tipo": "saída",
  "metodo": "débito",
  "data": "2025-01-15"
}
```

### 2. Agendamento Financeiro (`agendamento`)
Cria um agendamento para uma transação futura.

**Exemplos de mensagens:**
- "agendar pagamento de R$ 200 de aluguel para dia 5"
- "marcar conta de luz de R$ 150 para o próximo dia 10"
- "criar agendamento recorrente de R$ 500 de salário todo dia 1"

**JSON esperado:**
```json
{
  "descricao": "Aluguel",
  "valor": 200.00,
  "categoria": "contas",
  "tipo": "saída",
  "metodo": "débito",
  "dataAgendamento": "2025-02-05",
  "recorrente": true,
  "totalParcelas": 12,
  "frequencia": "mensal"
}
```

### 3. Consulta Financeira (`consulta`)
Responde perguntas sobre o estado financeiro.

**Exemplos de mensagens:**
- "quanto gastei este mês?"
- "qual meu saldo atual?"
- "quais são meus agendamentos pendentes?"

**JSON esperado:**
```json
{
  "tipoConsulta": "resumo",
  "periodo": "mes",
  "categoria": "alimentação"
}
```

## ➕ Como Adicionar um Novo Serviço

### Passo 1: Adicionar no `servicos.ts`

```typescript
export const SERVICO_NOVO: ServicoConfig = {
  id: 'novo_servico',
  nome: 'Novo Serviço',
  descricao: 'Descrição do que o serviço faz',
  palavrasChave: ['palavra1', 'palavra2'],
  exemplos: ['exemplo 1', 'exemplo 2'],
  schemaJson: {
    type: 'object',
    properties: {
      campo1: {
        type: 'string',
        description: 'Descrição do campo'
      }
    },
    required: ['campo1']
  },
  processar: async (dados: any, telefone: string) => {
    return {
      servico: 'novo_servico',
      dados,
      telefone
    };
  }
};

// Adicionar na lista de serviços disponíveis
export const SERVICOS_DISPONIVEIS: ServicoConfig[] = [
  SERVICO_TRANSACAO,
  SERVICO_AGENDAMENTO,
  SERVICO_CONSULTA,
  SERVICO_NOVO // ← Adicionar aqui
];
```

### Passo 2: Adicionar processador no roteador

No arquivo `roteadorServicos.ts`, adicione o caso no switch:

```typescript
case 'novo_servico':
  if (processadores.novoServico) {
    resultado = await processadores.novoServico(decisao.dadosExtraidos, telefone);
  } else {
    resultado = await servico.processar(decisao.dadosExtraidos, telefone);
  }
  break;
```

### Passo 3: Implementar função de processamento

No seu arquivo de webhook, implemente a função:

```typescript
async function processarNovoServico(dados: any, telefone: string) {
  // Sua lógica aqui
  return resultado;
}
```

### Passo 4: Adicionar no roteador

```typescript
const { servicoUsado, resultado } = await processarMensagemComRoteamento(
  mensagem,
  telefone,
  chatIA,
  {
    transacao: processarTransacao,
    agendamento: processarAgendamento,
    consulta: processarConsulta,
    novoServico: processarNovoServico // ← Adicionar aqui
  }
);
```

### Passo 5: Adicionar mensagem de resposta (opcional)

No arquivo `roteadorServicos.ts`, adicione no switch de `gerarMensagemResposta`:

```typescript
case 'novo_servico':
  return `✅ Novo serviço processado!\n\n` +
         `📋 ${resultado.descricao || 'Resultado'}`;
```

## 🔧 Integração no Webhook

Veja o arquivo `exemploIntegracaoRoteador.ts` para um exemplo completo de como integrar no webhook do WhatsApp.

## 📝 Vantagens

✅ **Centralizado** - Todos os serviços em um único lugar
✅ **Escalável** - Fácil adicionar novos serviços
✅ **Tipado** - TypeScript garante type safety
✅ **Validado** - Validação automática dos dados
✅ **Documentado** - Cada serviço tem descrição e exemplos
✅ **IA-Driven** - IA decide automaticamente qual serviço usar

## 🎨 Estrutura de um Serviço

```typescript
{
  id: 'identificador_unico',
  nome: 'Nome Amigável',
  descricao: 'O que o serviço faz',
  palavrasChave: ['palavras', 'que', 'ajudam', 'a', 'identificar'],
  exemplos: ['exemplo 1', 'exemplo 2'],
  schemaJson: {
    // Schema JSON que define os dados esperados
  },
  processar: async (dados, telefone) => {
    // Função que processa os dados
  }
}
```

## 🐛 Troubleshooting

### A IA não está identificando o serviço correto

1. Adicione mais palavras-chave no serviço
2. Adicione mais exemplos
3. Verifique se a descrição está clara

### Dados inválidos sendo retornados

1. Verifique o schema JSON do serviço
2. Ajuste o prompt da IA se necessário
3. Adicione validações adicionais no processador

### Serviço não está sendo chamado

1. Verifique se o serviço está na lista `SERVICOS_DISPONIVEIS`
2. Verifique se o processador está sendo passado para o roteador
3. Verifique os logs para ver qual serviço foi identificado
