#!/bin/bash

# Script para configurar secrets no Cloudflare Workers
# Execute: bash configurar-secrets.sh

echo "🔐 Configurando secrets no Cloudflare Workers..."
echo ""

# Lê o arquivo .env e configura os secrets
if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado!"
    exit 1
fi

# Lista de secrets a configurar
secrets=(
    "JWT_SECRET"
    "TWILIO_ACCOUNT_SID"
    "TWILIO_AUTH_TOKEN"
    "TWILIO_WHATSAPP_NUMBER"
    "GROQ_API_KEY"
    "GEMINI_API_KEY"
    "ZAPI_INSTANCE_ID"
    "ZAPI_TOKEN"
    "ZAPI_BASE_URL"
    "ZAPI_CLIENT_TOKEN"
    "IA_PROVIDER"
)

# Função para ler valor do .env
get_env_value() {
    grep "^$1=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//'
}

# Configura cada secret
for secret in "${secrets[@]}"; do
    value=$(get_env_value "$secret")
    
    if [ -z "$value" ]; then
        echo "⚠️  $secret não encontrado no .env, pulando..."
        continue
    fi
    
    echo "📝 Configurando $secret..."
    echo "$value" | wrangler secret put "$secret" 2>&1 | grep -v "Enter the secret value"
    echo "✅ $secret configurado!"
    echo ""
done

echo "🎉 Todos os secrets foram configurados!"
echo ""
echo "📋 Para verificar os secrets configurados:"
echo "   wrangler secret list"
echo ""
echo "🚀 Pronto para fazer deploy:"
echo "   npm run deploy:worker"

