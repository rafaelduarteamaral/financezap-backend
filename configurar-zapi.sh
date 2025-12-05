#!/bin/bash

# Script interativo para configurar Z-API no Cloudflare Workers
# Execute: bash configurar-zapi.sh

echo "🔐 Configuração Automática da Z-API no Cloudflare Workers"
echo "=========================================================="
echo ""

# Verifica se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI não encontrado!"
    echo "   Instale com: npm install -g wrangler"
    exit 1
fi

echo "📋 Você precisa das seguintes informações do painel Z-API:"
echo "   1. Instance ID"
echo "   2. Token"
echo "   3. Client-Token"
echo ""
echo "💡 Encontre essas informações em:"
echo "   https://www.z-api.io → Instâncias → Sua instância"
echo ""
read -p "Pressione ENTER para continuar..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. ZAPI_INSTANCE_ID
echo "1️⃣  Configure ZAPI_INSTANCE_ID"
echo "   Cole o Instance ID da sua instância Z-API:"
read -p "   Instance ID: " instance_id

if [ -z "$instance_id" ]; then
    echo "   ⚠️  Instance ID não pode estar vazio!"
    exit 1
fi

echo "$instance_id" | wrangler secret put ZAPI_INSTANCE_ID
if [ $? -eq 0 ]; then
    echo "   ✅ ZAPI_INSTANCE_ID configurado!"
else
    echo "   ❌ Erro ao configurar ZAPI_INSTANCE_ID"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 2. ZAPI_TOKEN
echo "2️⃣  Configure ZAPI_TOKEN"
echo "   Cole o Token da sua instância Z-API:"
read -p "   Token: " token

if [ -z "$token" ]; then
    echo "   ⚠️  Token não pode estar vazio!"
    exit 1
fi

echo "$token" | wrangler secret put ZAPI_TOKEN
if [ $? -eq 0 ]; then
    echo "   ✅ ZAPI_TOKEN configurado!"
else
    echo "   ❌ Erro ao configurar ZAPI_TOKEN"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 3. ZAPI_CLIENT_TOKEN
echo "3️⃣  Configure ZAPI_CLIENT_TOKEN (OBRIGATÓRIO!)"
echo "   Cole o Client-Token da sua instância Z-API:"
read -p "   Client-Token: " client_token

if [ -z "$client_token" ]; then
    echo "   ⚠️  Client-Token não pode estar vazio!"
    exit 1
fi

echo "$client_token" | wrangler secret put ZAPI_CLIENT_TOKEN
if [ $? -eq 0 ]; then
    echo "   ✅ ZAPI_CLIENT_TOKEN configurado!"
else
    echo "   ❌ Erro ao configurar ZAPI_CLIENT_TOKEN"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 4. ZAPI_BASE_URL (opcional)
echo "4️⃣  Configure ZAPI_BASE_URL (opcional)"
echo "   URL base da API Z-API (pressione ENTER para usar padrão: https://api.z-api.io):"
read -p "   Base URL: " base_url

if [ -z "$base_url" ]; then
    echo "   ℹ️  Usando URL padrão: https://api.z-api.io"
else
    echo "$base_url" | wrangler secret put ZAPI_BASE_URL
    if [ $? -eq 0 ]; then
        echo "   ✅ ZAPI_BASE_URL configurado!"
    else
        echo "   ❌ Erro ao configurar ZAPI_BASE_URL"
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verificar configuração
echo "🔍 Verificando secrets configurados..."
echo ""
wrangler secret list | grep -E "ZAPI_|Name"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Perguntar se quer fazer deploy
echo "🚀 Deseja fazer deploy agora? (s/n)"
read -p "   Resposta: " fazer_deploy

if [ "$fazer_deploy" = "s" ] || [ "$fazer_deploy" = "S" ] || [ "$fazer_deploy" = "sim" ] || [ "$fazer_deploy" = "Sim" ]; then
    echo ""
    echo "📦 Fazendo deploy do Worker..."
    npm run deploy:worker
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Deploy concluído com sucesso!"
        echo ""
        echo "🌐 Worker disponível em:"
        echo "   https://financezap.rafael-damaral.workers.dev"
        echo ""
        echo "🔗 Configure o webhook no painel Z-API:"
        echo "   https://financezap.rafael-damaral.workers.dev/webhook/zapi"
    else
        echo ""
        echo "❌ Erro ao fazer deploy"
        exit 1
    fi
else
    echo ""
    echo "ℹ️  Para fazer deploy manualmente, execute:"
    echo "   npm run deploy:worker"
fi

echo ""
echo "✅ Configuração concluída!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Configure o webhook no painel Z-API:"
echo "      https://financezap.rafael-damaral.workers.dev/webhook/zapi"
echo "   2. Teste enviando uma mensagem via WhatsApp"
echo "   3. Verifique os logs: wrangler tail"

