#!/bin/bash

# Script de deploy que garante que os testes passem antes de fazer deploy

set -e  # Para o script se algum comando falhar

echo "🧪 Executando testes antes do deploy..."
echo ""

# Executa os testes
npm run test:ci

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Testes falharam! Deploy cancelado."
  echo "   Corrija os testes antes de fazer deploy."
  exit 1
fi

echo ""
echo "✅ Todos os testes passaram!"
echo ""
echo "🚀 Iniciando deploy..."

# Executa o deploy
npm run deploy:worker

echo ""
echo "✅ Deploy concluído com sucesso!"
