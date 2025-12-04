# 🔒 Guia de Segurança - FinanceZap

Este documento descreve as medidas de segurança implementadas no sistema FinanceZap.

## 🛡️ Medidas de Segurança Implementadas

### 1. Autenticação e Autorização

#### JWT (JSON Web Tokens)
- ✅ Todos os endpoints de dados requerem autenticação via JWT
- ✅ Tokens expiram após 7 dias (configurável via `JWT_EXPIRES_IN`)
- ✅ Validação obrigatória de `JWT_SECRET` em produção (mínimo 32 caracteres)
- ✅ Middleware `autenticarMiddleware` protege todos os endpoints sensíveis

#### Validação de Permissões
- ✅ Middleware `validarPermissaoDados` garante que usuários só acessam seus próprios dados
- ✅ Comparação flexível de telefones para evitar problemas de formatação
- ✅ Validação em todos os endpoints: transações, agendamentos, categorias, estatísticas

### 2. Endpoints Protegidos

#### ✅ Endpoints que REQUEREM autenticação:
- `GET /api/transacoes` - Lista transações do usuário autenticado
- `GET /api/estatisticas` - Estatísticas do usuário autenticado
- `GET /api/gastos-por-dia` - Gráficos do usuário autenticado
- `GET /api/agendamentos` - Agendamentos do usuário autenticado
- `PUT /api/agendamentos/:id` - Atualizar agendamento (apenas próprio)
- `DELETE /api/agendamentos/:id` - Remover agendamento (apenas próprio)
- `GET /api/categorias` - Categorias do usuário
- `POST /api/categorias` - Criar categoria
- `PUT /api/categorias/:id` - Atualizar categoria (apenas própria)
- `DELETE /api/categorias/:id` - Remover categoria (apenas própria)
- `POST /api/chat` - Chat de IA

#### ❌ Endpoints REMOVIDOS por segurança:
- `GET /api/transacoes/:telefone` - **REMOVIDO** (permitia acesso a qualquer telefone)
- `GET /api/resumo/:telefone` - **REMOVIDO** (permitia acesso a qualquer telefone)
- `GET /api/telefones` - **REMOVIDO** (expunha lista de todos os telefones)
- `GET /api/mensagens` - **REMOVIDO** (expunha todas as mensagens)

### 3. Sanitização e Validação

#### Sanitização de Entrada
- ✅ Middleware `sanitizarEntrada` remove caracteres perigosos
- ✅ Remove tags HTML, scripts JavaScript, event handlers
- ✅ Limita tamanho de strings (máximo 500 caracteres)
- ✅ Sanitiza query params, body e params

#### Validação de Dados
- ✅ `validarTelefone()` - Valida formato e tamanho de telefones
- ✅ `validarValor()` - Valida valores monetários (0 a 999.999.999)
- ✅ `validarData()` - Valida formato de data (YYYY-MM-DD)
- ✅ `validarEmail()` - Valida formato de email

### 4. CORS (Cross-Origin Resource Sharing)

- ✅ CORS configurado com whitelist de origens permitidas
- ✅ Configurável via variável `ALLOWED_ORIGINS` no `.env`
- ✅ Headers de segurança configurados
- ✅ Credenciais permitidas apenas para origens confiáveis

### 5. Rate Limiting

- ✅ Rate limiting implementado para mensagens WhatsApp
- ✅ Proteção contra spam e ataques de força bruta
- ✅ Limites configuráveis por minuto/hora

### 6. Logs de Segurança

- ✅ Função `sanitizarParaLog()` remove dados sensíveis dos logs
- ✅ Senhas, tokens e chaves são mascarados nos logs
- ✅ Logs de tentativas de acesso não autorizado

### 7. Banco de Dados

#### Proteção contra SQL Injection
- ✅ Uso do Prisma ORM (proteção automática contra SQL injection)
- ✅ Queries parametrizadas
- ✅ Validação de tipos

#### Preparação para Banco na Nuvem
- ✅ Conexões via variáveis de ambiente
- ✅ Suporte a SSL/TLS
- ✅ Configuração segura de credenciais

## 📋 Configuração de Segurança

### Variáveis de Ambiente Obrigatórias

```env
# JWT - OBRIGATÓRIO em produção
JWT_SECRET=sua-chave-secreta-forte-minimo-32-caracteres-aleatorios
JWT_EXPIRES_IN=7d

# CORS - Configure as origens permitidas
ALLOWED_ORIGINS=http://localhost:5173,https://seu-dominio.com

# Banco de Dados (quando usar na nuvem)
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

### Gerando uma Chave JWT Segura

```bash
# Gere uma chave forte de 64 caracteres
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🚨 Checklist de Segurança para Produção

Antes de colocar em produção, verifique:

- [ ] `JWT_SECRET` configurado com chave forte (mínimo 32 caracteres)
- [ ] `ALLOWED_ORIGINS` configurado com domínios corretos
- [ ] Banco de dados usando SSL/TLS
- [ ] HTTPS habilitado no servidor
- [ ] Variáveis de ambiente não expostas no código
- [ ] Logs não expõem dados sensíveis
- [ ] Rate limiting configurado adequadamente
- [ ] Backup do banco de dados configurado
- [ ] Firewall configurado
- [ ] Monitoramento de segurança ativo

## 🔐 Boas Práticas Implementadas

1. **Princípio do Menor Privilégio**: Usuários só acessam seus próprios dados
2. **Defesa em Profundidade**: Múltiplas camadas de validação
3. **Sanitização**: Todos os dados de entrada são sanitizados
4. **Validação**: Dados validados antes de processamento
5. **Logs Seguros**: Dados sensíveis não aparecem em logs
6. **CORS Restritivo**: Apenas origens permitidas podem acessar

## ⚠️ Avisos Importantes

1. **NUNCA** exponha `JWT_SECRET` no código ou repositório
2. **SEMPRE** use HTTPS em produção
3. **SEMPRE** valide dados de entrada
4. **NUNCA** confie em dados do cliente sem validação
5. **SEMPRE** use variáveis de ambiente para credenciais

## 📞 Suporte

Em caso de vulnerabilidades de segurança, entre em contato imediatamente.

