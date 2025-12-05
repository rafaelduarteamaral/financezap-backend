#!/bin/bash

# Script completo para configurar TODOS os secrets necessários
# Execute: bash configurar-tudo.sh

echo "🚀 Configuração Completa do FinanceZap no Cloudflare"
echo "===================================================="
echo ""

# Verifica se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI não encontrado!"
    echo "   Instale com: npm install -g wrangler"
    exit 1
fi

# Verifica se está no diretório correto
if [ ! -f "wrangler.toml" ]; then
    echo "❌ Execute este script no diretório backend-financezap"
    exit 1
fi

echo "📋 Este script vai configurar TODOS os secrets necessários:"
echo ""
echo "   🔐 Autenticação:"
echo "      - JWT_SECRET"
echo ""
echo "   📱 WhatsApp (Z-API):"
echo "      - ZAPI_INSTANCE_ID"
echo "      - ZAPI_TOKEN"
echo "      - ZAPI_CLIENT_TOKEN"
echo "      - ZAPI_BASE_URL (opcional)"
echo ""
echo "   🤖 IA (Groq ou Gemini):"
echo "      - GROQ_API_KEY (opcional)"
echo "      - GEMINI_API_KEY (opcional)"
echo "      - IA_PROVIDER (groq ou gemini)"
echo ""
echo "   📞 Twilio (opcional, se usar):"
echo "      - TWILIO_ACCOUNT_SID"
echo "      - TWILIO_AUTH_TOKEN"
echo "      - TWILIO_WHATSAPP_NUMBER"
echo ""
read -p "Pressione ENTER para continuar..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# JWT_SECRET
echo "🔐 1. Configure JWT_SECRET (para autenticação)"
echo "   Gere uma chave secreta forte (mínimo 32 caracteres)"
echo "   Ou pressione ENTER para gerar automaticamente:"
read -p "   JWT_SECRET: " jwt_secret

if [ -z "$jwt_secret" ]; then
    # Gera uma chave aleatória de 64 caracteres
    jwt_secret=$(openssl rand -hex 32)
    echo "   ✅ Chave gerada automaticamente"
fi

echo "$jwt_secret" | wrangler secret put JWT_SECRET
if [ $? -eq 0 ]; then
    echo "   ✅ JWT_SECRET configurado!"
else
    echo "   ❌ Erro ao configurar JWT_SECRET"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Z-API
echo "📱 2. Configure Z-API (WhatsApp)"
echo "   Encontre essas informações em: https://www.z-api.io → Instâncias → Sua instância"
echo ""

read -p "   Instance ID: " instance_id
if [ ! -z "$instance_id" ]; then
    echo "$instance_id" | wrangler secret put ZAPI_INSTANCE_ID && echo "   ✅ ZAPI_INSTANCE_ID configurado!"
fi

read -p "   Token: " token
if [ ! -z "$token" ]; then
    echo "$token" | wrangler secret put ZAPI_TOKEN && echo "   ✅ ZAPI_TOKEN configurado!"
fi

read -p "   Client-Token (OBRIGATÓRIO): " client_token
if [ ! -z "$client_token" ]; then
    echo "$client_token" | wrangler secret put ZAPI_CLIENT_TOKEN && echo "   ✅ ZAPI_CLIENT_TOKEN configurado!"
fi

read -p "   Base URL (ENTER para padrão): " base_url
if [ ! -z "$base_url" ]; then
    echo "$base_url" | wrangler secret put ZAPI_BASE_URL && echo "   ✅ ZAPI_BASE_URL configurado!"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# IA Provider
echo "🤖 3. Configure IA Provider"
echo "   Escolha: groq ou gemini (pressione ENTER para pular)"
read -p "   IA Provider: " ia_provider

if [ ! -z "$ia_provider" ]; then
    echo "$ia_provider" | wrangler secret put IA_PROVIDER && echo "   ✅ IA_PROVIDER configurado!"
    
    if [ "$ia_provider" = "groq" ]; then
        read -p "   GROQ_API_KEY: " groq_key
        if [ ! -z "$groq_key" ]; then
            echo "$groq_key" | wrangler secret put GROQ_API_KEY && echo "   ✅ GROQ_API_KEY configurado!"
        fi
    elif [ "$ia_provider" = "gemini" ]; then
        read -p "   GEMINI_API_KEY: " gemini_key
        if [ ! -z "$gemini_key" ]; then
            echo "$gemini_key" | wrangler secret put GEMINI_API_KEY && echo "   ✅ GEMINI_API_KEY configurado!"
        fi
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Resumo
echo "📋 Resumo dos secrets configurados:"
echo ""
wrangler secret list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Deploy
echo "🚀 Deseja fazer deploy agora? (s/n)"
read -p "   Resposta: " fazer_deploy

if [ "$fazer_deploy" = "s" ] || [ "$fazer_deploy" = "S" ]; then
    echo ""
    echo "📦 Fazendo deploy..."
    npm run deploy:worker
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Deploy concluído!"
        echo ""
        echo "🌐 URLs:"
        echo "   Worker: https://financezap.rafael-damaral.workers.dev"
        echo "   Webhook: https://financezap.rafael-damaral.workers.dev/webhook/zapi"
    fi
fi

echo ""
echo "✅ Configuração concluída!"

