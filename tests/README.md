# Testes do Backend

Este diretório contém os testes automatizados para o backend do FinanceZap.

## Estrutura de Testes

- `setup.ts` - Configuração global dos testes
- `auth.test.ts` - Testes de autenticação e login
- `templates.test.ts` - Testes de templates de cores
- `transacoes.test.ts` - Testes de transações financeiras
- `categorias.test.ts` - Testes de categorias
- `agendamentos.test.ts` - Testes de agendamentos
- `health.test.ts` - Testes de health check

## Executando os Testes

### Todos os testes
```bash
npm test
```

### Modo watch (desenvolvimento)
```bash
npm run test:watch
```

### Com cobertura de código
```bash
npm run test:coverage
```

### Para CI/CD
```bash
npm run test:ci
```

## Requisitos

Os testes usam mocks para não depender de serviços externos (Twilio, Z-API, etc.) e banco de dados real.

## Build e Deploy

O build só será executado se todos os testes passarem:

```bash
npm run build  # Roda testes antes de compilar
```

Para deploy no Cloudflare Workers:

```bash
npm run deploy:worker  # Roda testes antes de fazer deploy
```

Para pular os testes (não recomendado):

```bash
npm run build:skip-tests
```
