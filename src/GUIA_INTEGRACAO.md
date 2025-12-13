# 🚀 Guia de Integração do Roteador de Serviços

## 📋 Resumo

Este guia mostra como integrar o sistema de roteamento de serviços no seu código existente.

## 📁 Arquivos Criados

1. **`servicos.ts`** - Catálogo centralizado de serviços
2. **`roteadorServicos.ts`** - Sistema de roteamento inteligente
3. **`processadoresServicos.ts`** - Funções de processamento (ADAPTE para seu código)
4. **`exemploWebhookComRoteador.ts`** - Exemplo de uso no webhook
5. **`index.exemplo.ts`** - Exemplo completo de index.ts

## 🔧 Passos para Integração

### Passo 1: Adaptar Funções de Processamento

Edite o arquivo `processadoresServicos.ts` e substitua as implementações de exemplo pelas suas funções reais:

```typescript
// Exemplo de adaptação para processarTransacao
import { salvarTransacao } from './database'; // ou './d1'

export async function processarTransacao(dados: any, telefone: string): Promise<any> {
  const transacao = await salvarTransacao({
    descricao: dados.descricao,
    valor: dados.valor,
    categoria: dados.categoria,
    tipo: dados.tipo,
    metodo: dados.metodo,
    data: dados.data || new Date().toISOString().split('T')[0],
    telefone
  });

  return transacao;
}
```

### Passo 2: Integrar no Webhook

No seu arquivo `index.ts` ou `worker.ts`, importe e use o roteador:

```typescript
import { processarMensagemComRoteamento, gerarMensagemResposta } from './roteadorServicos';
import { processarTransacao, processarAgendamento, processarConsulta } from './processadoresServicos';
import { chatIA } from './chatIA'; // Sua função de chat IA

app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;

  // Processa usando o roteador
  const { servicoUsado, resultado } = await processarMensagemComRoteamento(
    mensagem,
    telefone,
    chatIA,
    {
      transacao: processarTransacao,
      agendamento: processarAgendamento,
      consulta: processarConsulta
    }
  );

  // Gera resposta formatada
  const resposta = gerarMensagemResposta(servicoUsado, resultado);

  // Envia resposta via WhatsApp
  await enviarMensagemWhatsApp(telefone, resposta);

  res.status(200).send('OK');
});
```

### Passo 3: Substituir Processamento Antigo

Se você já tem código que processa mensagens, você pode:

1. **Opção A**: Substituir completamente pelo roteador
2. **Opção B**: Manter o código antigo e usar o roteador apenas para novas mensagens
3. **Opção C**: Usar o roteador como fallback se o processamento antigo falhar

### Passo 4: Testar

1. Envie uma mensagem de teste via WhatsApp
2. Verifique nos logs qual serviço foi identificado
3. Verifique se a resposta está formatada corretamente

## 📝 Exemplo de Mensagens

### Transação
```
"comprei um sanduiche por 50 reais"
→ Serviço: transacao
→ JSON extraído: { descricao: "sanduiche", valor: 50, categoria: "alimentação", ... }
```

### Agendamento
```
"agendar pagamento de R$ 200 de aluguel para dia 5"
→ Serviço: agendamento
→ JSON extraído: { descricao: "aluguel", valor: 200, dataAgendamento: "2025-02-05", ... }
```

### Consulta
```
"quanto gastei este mês?"
→ Serviço: consulta
→ JSON extraído: { tipoConsulta: "resumo", periodo: "mes" }
```

## 🔍 Debugging

### Verificar Logs

O roteador loga informações importantes:

```
[Roteador] Serviço identificado: transacao (confiança: 0.95)
```

### Verificar Decisão da IA

Se a IA não estiver identificando corretamente, você pode:

1. Adicionar mais palavras-chave no serviço em `servicos.ts`
2. Adicionar mais exemplos no serviço
3. Melhorar o prompt em `gerarPromptIdentificacaoServico`

### Validação de Dados

O roteador valida automaticamente os dados extraídos. Se houver erros:

1. Verifique os logs de validação
2. Ajuste o schema JSON do serviço se necessário
3. Melhore o prompt da IA para extrair dados mais precisos

## ➕ Adicionar Novo Serviço

1. Adicione no `servicos.ts`:
```typescript
export const SERVICO_NOVO: ServicoConfig = {
  id: 'novo_servico',
  // ... configuração
};
```

2. Adicione na lista `SERVICOS_DISPONIVEIS`

3. Crie função de processamento em `processadoresServicos.ts`:
```typescript
export async function processarNovoServico(dados: any, telefone: string) {
  // Sua implementação
}
```

4. Adicione no switch do `roteadorServicos.ts`

5. Adicione no webhook:
```typescript
{
  // ... outros serviços
  novoServico: processarNovoServico
}
```

## ✅ Checklist

- [ ] Arquivos criados (`servicos.ts`, `roteadorServicos.ts`, etc.)
- [ ] Funções de processamento adaptadas para usar código real
- [ ] Roteador integrado no webhook
- [ ] Função `chatIA` importada e configurada
- [ ] Testado com mensagens de transação
- [ ] Testado com mensagens de agendamento
- [ ] Testado com mensagens de consulta
- [ ] Logs verificados

## 🐛 Problemas Comuns

### "Serviço não encontrado"
- Verifique se o serviço está na lista `SERVICOS_DISPONIVEIS`
- Verifique se o ID do serviço está correto

### "Dados inválidos"
- Verifique o schema JSON do serviço
- Verifique se a IA está extraindo os dados corretamente
- Adicione validações adicionais se necessário

### "Erro ao processar mensagem"
- Verifique os logs para ver qual serviço foi usado
- Verifique se a função de processamento está correta
- Verifique se as dependências (banco de dados, etc.) estão funcionando

## 📚 Documentação Adicional

- Veja `README_SERVICOS.md` para mais detalhes sobre os serviços
- Veja `exemploWebhookComRoteador.ts` para exemplos de código
- Veja `index.exemplo.ts` para exemplo completo de webhook
