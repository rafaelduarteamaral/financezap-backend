# Migração D1 - Agendamentos Recorrentes

Este documento descreve como aplicar a migração para adicionar suporte a agendamentos recorrentes no banco de dados D1 do Cloudflare Workers.

## Campos Adicionados

- `recorrente` (INTEGER, DEFAULT 0): Indica se o agendamento é recorrente
- `totalParcelas` (INTEGER, NULL): Total de parcelas do agendamento recorrente
- `parcelaAtual` (INTEGER, NULL): Parcela atual (1, 2, 3...)
- `agendamentoPaiId` (INTEGER, NULL): ID do agendamento original (para rastrear a série)

## Como Aplicar

### Opção 1: Via Wrangler CLI

```bash
cd backend-financezap
npx wrangler d1 execute financezap_db --file=./migrations/d1_add_agendamentos_recorrentes.sql
```

### Opção 2: Via Cloudflare Dashboard

1. Acesse o Cloudflare Dashboard
2. Vá em Workers & Pages > D1 > financezap_db
3. Clique em "Execute SQL"
4. Cole o conteúdo do arquivo `migrations/d1_add_agendamentos_recorrentes.sql`
5. Execute

### Opção 3: Via API do Cloudflare

Use a API do Cloudflare para executar o SQL remotamente.

## Verificação

Após aplicar a migração, verifique se as colunas foram criadas:

```sql
PRAGMA table_info(agendamentos);
```

Você deve ver as novas colunas:
- recorrente
- totalParcelas
- parcelaAtual
- agendamentoPaiId

## Notas

- A migração é segura e não remove dados existentes
- Agendamentos existentes terão `recorrente = 0` por padrão
- Os índices são criados automaticamente para melhor performance
