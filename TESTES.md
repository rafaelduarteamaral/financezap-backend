# 🧪 Testes do Backend

Este documento descreve como executar e manter os testes do backend.

## 📋 Pré-requisitos

Antes de executar os testes, instale as dependências:

```bash
npm install
```

## 🚀 Executando Testes

### Executar todos os testes
```bash
npm test
```

### Modo watch (desenvolvimento)
```bash
npm run test:watch
```
Executa os testes em modo watch, reexecutando quando arquivos são alterados.

### Com cobertura de código
```bash
npm run test:coverage
```
Gera relatório de cobertura em `coverage/`.

### Para CI/CD
```bash
npm run test:ci
```
Executa testes em modo CI com cobertura e para na primeira falha.

## 🏗️ Build e Deploy

### Build (com testes)
```bash
npm run build
```
**Importante:** O build só será executado se todos os testes passarem.

### Build sem testes (não recomendado)
```bash
npm run build:skip-tests
```
Use apenas em emergências ou desenvolvimento local.

### Deploy para produção
```bash
npm run deploy:worker
```
**Importante:** O deploy só será executado se todos os testes passarem.

### Deploy seguro (com script)
```bash
npm run deploy:safe
```
Usa script bash que garante testes antes do deploy.

## 📁 Estrutura de Testes

```
tests/
├── setup.ts              # Configuração global
├── auth.test.ts          # Testes de autenticação
├── templates.test.ts     # Testes de templates
├── transacoes.test.ts   # Testes de transações
├── categorias.test.ts   # Testes de categorias
├── agendamentos.test.ts # Testes de agendamentos
├── health.test.ts        # Testes de health check
└── integration.test.ts  # Testes de integração
```

## 🎯 Cobertura de Testes

Os testes cobrem:

- ✅ Autenticação e autorização
- ✅ CRUD de templates
- ✅ CRUD de transações
- ✅ CRUD de categorias
- ✅ CRUD de agendamentos
- ✅ Health checks
- ✅ Validações de entrada
- ✅ Tratamento de erros

## ⚠️ Importante

**NUNCA faça deploy sem que todos os testes passem!**

O sistema está configurado para:
1. Executar todos os testes antes do build
2. Executar todos os testes antes do deploy
3. Falhar se qualquer teste falhar

Isso garante que apenas código testado e funcional seja enviado para produção.

## 🔧 Solução de Problemas

### Testes falhando
1. Verifique se todas as dependências estão instaladas
2. Verifique se o banco de dados de teste está configurado
3. Execute `npm run test:watch` para ver erros em tempo real

### Build falhando por testes
1. Corrija os testes que estão falhando
2. Execute `npm test` para ver detalhes dos erros
3. Use `npm run build:skip-tests` apenas em desenvolvimento local

### Deploy bloqueado
Se o deploy está sendo bloqueado pelos testes:
1. **NÃO** use workarounds para pular os testes
2. Corrija os testes que estão falhando
3. Garanta que todos os testes passem antes de fazer deploy
