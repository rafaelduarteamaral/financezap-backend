# 🚀 Deploy Seguro - Guia Completo

Este documento explica como fazer deploy de forma segura, garantindo que todos os testes passem antes de enviar para produção.

## ⚠️ Importante

**O sistema está configurado para NUNCA fazer deploy sem que todos os testes passem!**

## 📋 Como Funciona

### 1. Build
```bash
npm run build
```
- ✅ Executa todos os testes primeiro (`npm run test:ci`)
- ✅ Só compila o TypeScript se os testes passarem
- ❌ Falha se qualquer teste falhar

### 2. Deploy
```bash
npm run deploy:worker
```
- ✅ Executa todos os testes primeiro (`npm run test:ci`)
- ✅ Só faz deploy se os testes passarem
- ❌ Falha se qualquer teste falhar

### 3. Deploy Seguro (Recomendado)
```bash
npm run deploy:safe
```
- ✅ Usa script bash que verifica tudo
- ✅ Mais seguro e com melhor feedback
- ✅ Para o processo se algo falhar

## 🧪 Comandos de Teste

### Executar testes
```bash
npm test
```

### Testes em modo watch
```bash
npm run test:watch
```

### Testes com cobertura
```bash
npm run test:coverage
```

### Testes para CI/CD
```bash
npm run test:ci
```
- Executa em modo CI
- Gera cobertura
- Para na primeira falha (`--bail`)

## 📊 Cobertura Mínima

O sistema exige pelo menos **60% de cobertura** em:
- Branches (ramificações)
- Functions (funções)
- Lines (linhas)
- Statements (declarações)

## 🔧 Solução de Problemas

### "Testes falharam! Deploy cancelado."

1. Execute `npm test` para ver quais testes falharam
2. Corrija os problemas nos testes
3. Execute `npm run test:ci` para verificar
4. Tente fazer deploy novamente

### "Build falhando"

O build falha se:
- Testes não passarem
- Cobertura estiver abaixo de 60%
- Erros de compilação TypeScript

**Solução:** Corrija os problemas antes de tentar build novamente.

### Pular testes (NÃO RECOMENDADO)

```bash
npm run build:skip-tests
```

⚠️ **Use apenas em desenvolvimento local!** Nunca use em produção.

## ✅ Checklist Antes do Deploy

- [ ] Todos os testes passam (`npm test`)
- [ ] Cobertura acima de 60% (`npm run test:coverage`)
- [ ] Sem erros de lint
- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados migrado (se necessário)

## 🎯 Boas Práticas

1. **Sempre execute testes antes de commitar**
   ```bash
   npm test
   ```

2. **Verifique cobertura regularmente**
   ```bash
   npm run test:coverage
   ```

3. **Use deploy seguro**
   ```bash
   npm run deploy:safe
   ```

4. **Nunca pule testes em produção**
   - Não use `build:skip-tests` em produção
   - Não modifique scripts para pular testes

## 📝 Notas

- Os testes usam mocks para não depender de serviços externos
- O banco de dados de teste é separado do de produção
- Todos os testes devem passar antes de qualquer deploy
