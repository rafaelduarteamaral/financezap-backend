# Desenvolvimento Local

Este guia explica como rodar o backend localmente. O projeto tem duas opções:

1. **Cloudflare Worker** (recomendado) - Conectado ao D1 da Cloudflare
2. **Servidor Express** (legado) - Usa Prisma com SQLite local

## Opção 1: Cloudflare Worker (Recomendado)

### Pré-requisitos

1. Ter o Wrangler CLI instalado: `npm install -g wrangler`
2. Estar autenticado na Cloudflare: `wrangler login`
3. Ter acesso ao banco D1 `financezap-db` na Cloudflare

### Configuração

1. **Criar arquivo `.dev.vars`**:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. **Preencher as variáveis no `.dev.vars`**:
   - `JWT_SECRET`: Uma string aleatória de pelo menos 32 caracteres
   - `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`: Se usar Z-API
   - `GROQ_API_KEY` ou `GEMINI_API_KEY`: Se usar processamento de IA
   - Outras variáveis conforme necessário

### Executar

```bash
npm run dev:worker
```

Este comando irá:
- Iniciar o servidor local na porta `8787` (padrão do Wrangler)
- Conectar ao banco D1 remoto da Cloudflare (não usa banco local)
- Carregar as variáveis do arquivo `.dev.vars`

O backend estará disponível em: `http://localhost:8787`

## Opção 2: Servidor Express com Prisma Local

### Configuração

1. **Criar arquivo `.env`** (já criado automaticamente):
   ```bash
   # O arquivo .env já foi criado com DATABASE_URL="file:./database.sqlite"
   ```

2. **Gerar o cliente Prisma** (já executado):
   ```bash
   npx prisma generate
   ```
   ✅ **Já executado!** O Prisma Client foi gerado com sucesso.

3. **Criar/atualizar o banco de dados** (se necessário):
   ```bash
   npx prisma db push
   ```

### Executar

```bash
npm run dev
```

Este comando irá:
- Iniciar o servidor Express local (porta padrão: 3000)
- Usar SQLite local (`database.sqlite`)
- Carregar as variáveis do arquivo `.env`

**Nota**: 
- O servidor Express usa Prisma com SQLite local
- Para desenvolvimento com D1 da Cloudflare, use `npm run dev:worker`
- O arquivo `.env` já está configurado com `DATABASE_URL="file:./database.sqlite"`

## Executar o Frontend Localmente

1. **Criar arquivo `.env.local`** no diretório `financezap-frontend`:
   ```bash
   VITE_API_URL=http://localhost:8787
   ```

2. **Executar o frontend**:
   ```bash
   cd ../financezap-frontend
   npm run dev
   ```

O frontend estará disponível em: `http://localhost:5173`

## Notas Importantes

- O banco D1 é **remoto** (na Cloudflare), então todas as operações de banco de dados serão executadas na nuvem
- As variáveis de ambiente do `.dev.vars` são carregadas apenas em desenvolvimento local
- Em produção, as variáveis são configuradas via `wrangler secret put` ou no dashboard da Cloudflare
- O CORS já está configurado para permitir `http://localhost:5173` e `http://localhost:3000`

## Troubleshooting

### Erro de autenticação
```bash
wrangler login
```

### Erro de conexão com D1
Verifique se o `database_id` no `wrangler.toml` está correto e se você tem acesso ao banco.

### Variáveis não carregadas
Certifique-se de que o arquivo `.dev.vars` está na raiz do projeto `financezap-backend` e não está no `.gitignore`.

