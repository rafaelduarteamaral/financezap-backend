# 🧪 Guia de Teste do Sistema de Roteamento

## 📋 Testes Recomendados

### 1. Teste de Transação

**Mensagem:**
```
comprei café por 5 reais
```

**Resultado Esperado:**
- Serviço identificado: `transacao`
- Confiança: > 0.8
- Dados extraídos: `{ descricao: "café", valor: 5, categoria: "alimentação", tipo: "saída", metodo: "débito" }`
- Resposta: "✅ Transação registrada! ..."

**Outras mensagens para testar:**
- "gastei 25,50 no almoço hoje"
- "paguei R$ 100,00 de conta de luz"
- "recebi R$ 500,00 de salário"

### 2. Teste de Agendamento

**Mensagem:**
```
agendar pagamento de R$ 200 de aluguel para dia 5
```

**Resultado Esperado:**
- Serviço identificado: `agendamento`
- Confiança: > 0.8
- Dados extraídos: `{ descricao: "aluguel", valor: 200, dataAgendamento: "2025-02-05", ... }`
- Resposta: "📅 Agendamento criado! ..."

**Outras mensagens para testar:**
- "marcar conta de luz de R$ 150 para o próximo dia 10"
- "criar agendamento recorrente de R$ 500 de salário todo dia 1"

### 3. Teste de Consulta

**Mensagem:**
```
quanto gastei este mês?
```

**Resultado Esperado:**
- Serviço identificado: `consulta`
- Confiança: > 0.7
- Dados extraídos: `{ tipoConsulta: "resumo", periodo: "mes" }`
- Resposta: "📊 Resumo do mês: ..."

**Outras mensagens para testar:**
- "qual meu saldo atual?"
- "quais são meus agendamentos pendentes?"
- "quanto gastei com alimentação?"

### 4. Teste de Fallback

**Mensagem:**
```
olá
```

**Resultado Esperado:**
- Serviço identificado: `consulta` (fallback)
- Confiança: baixa (< 0.5)
- Resposta: Mensagem de consulta padrão

## 🔍 Como Verificar

### 1. Verificar Logs

Procure por:
```
[Roteador] Serviço: [nome] (confiança: [valor])
```

### 2. Verificar Processamento

Se os processadores estão usando funções reais:
```
[Processadores] Usando implementação temporária de processarTransacao
```
Se aparecer esse aviso, os processadores não encontraram suas funções reais.

### 3. Verificar Erros

Procure por:
```
[IntegracaoWebhook] Erro ao processar mensagem
[Processadores] Erro ao processar consulta
```

## ✅ Checklist de Teste

- [ ] Teste de transação básica passou
- [ ] Teste de agendamento passou
- [ ] Teste de consulta passou
- [ ] Logs mostram serviço correto
- [ ] Confiança > 0.7 para mensagens claras
- [ ] Respostas formatadas corretamente
- [ ] Processadores usando funções reais (sem avisos)
- [ ] Sem erros no console

## 🐛 Problemas Comuns

### Serviço não identificado corretamente
- Adicione mais palavras-chave no serviço
- Adicione mais exemplos
- Verifique o prompt da IA

### Dados inválidos
- Verifique o schema JSON do serviço
- Verifique se a IA está extraindo corretamente
- Veja logs de validação

### Processadores usando implementação temporária
- Verifique se suas funções existem
- Verifique os imports em `processadoresServicos.ts`
- Ajuste os caminhos se necessário

## 📊 Métricas de Sucesso

- ✅ Taxa de identificação correta: > 90%
- ✅ Confiança média: > 0.8
- ✅ Tempo de processamento: < 2 segundos
- ✅ Sem erros: 0 erros em 100 mensagens

---

**Teste bem e garanta qualidade!** 🎯
