#!/bin/bash

# Script pré-deploy que garante qualidade antes do deploy

set -e

echo "🔍 Verificando qualidade do código antes do deploy..."
echo ""

# 1. Verifica se as dependências estão instaladas
if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependências..."
  npm install
fi

# 2. Executa os testes
echo "🧪 Executando testes..."
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
echo "📊 Cobertura de código verificada"
echo ""
echo "✅ Pré-requisitos atendidos. Pronto para deploy!"
