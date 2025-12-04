// Processador de mensagens usando IA (Groq ou Google Gemini - ambos gratuitos)

import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

// Inicializa Groq (se configurado)
const groq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '' 
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Inicializa Google Gemini (se configurado) - usando a biblioteca oficial @google/genai
const geminiApiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';
const gemini = geminiApiKey 
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  : null;

// Log de inicialização (apenas uma vez ao carregar o módulo)
if (groq) {
  console.log('✅ Groq inicializado');
} else {
  console.log('⚠️  Groq não configurado (GROQ_API_KEY não encontrada ou vazia)');
}

if (geminiApiKey) {
  console.log('✅ Google Gemini inicializado (biblioteca @google/genai)');
} else {
  console.log('⚠️  Google Gemini não configurado (GEMINI_API_KEY não encontrada ou vazia)');
}

// Variável para escolher qual IA usar (groq ou gemini)
// Se não especificado, usa a ordem: groq primeiro, depois gemini
const IA_PROVIDER = (process.env.IA_PROVIDER || '').toLowerCase().trim();

export interface TransacaoExtraida {
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'entrada' | 'saida'; // entrada ou saída de dinheiro
  metodo?: 'credito' | 'debito'; // método de pagamento (opcional)
  sucesso: boolean;
}

/**
 * Processa mensagem usando IA para extrair transações financeiras
 * Usa Groq (gratuito) para entender melhor o contexto
 * REQUER: GROQ_API_KEY configurada no .env
 */
export async function processarMensagemComIA(mensagem: string): Promise<TransacaoExtraida[]> {
  // Verifica qual IA está disponível
  const temGroq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '';
  const temGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';

  console.log('🔍 Verificando IAs disponíveis:');
  console.log(`   Groq: ${temGroq ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   Gemini: ${temGemini ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   IA_PROVIDER configurado: ${IA_PROVIDER || 'auto (groq primeiro, depois gemini)'}`);

  if (!temGroq && !temGemini) {
    console.error('❌ Nenhuma API de IA configurada!');
    console.error('   Configure pelo menos uma das opções:');
    console.error('   1. GROQ_API_KEY (https://console.groq.com/keys)');
    console.error('   2. GEMINI_API_KEY (https://makersuite.google.com/app/apikey)');
    throw new Error('Nenhuma API de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY no .env');
  }

  // Se IA_PROVIDER estiver configurado, usa a IA especificada
  if (IA_PROVIDER === 'groq') {
    if (temGroq && groq) {
      try {
        console.log('🤖 Usando Groq (escolhido via IA_PROVIDER)');
        return await processarComGroq(mensagem);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini como fallback...', error.message);
        if (temGemini && gemini) {
          return await processarComGemini(mensagem);
        }
        throw error;
      }
    } else {
      throw new Error('IA_PROVIDER=groq configurado, mas GROQ_API_KEY não está definida');
    }
  } else if (IA_PROVIDER === 'gemini') {
    if (temGemini && gemini) {
      try {
        console.log('🤖 Usando Gemini (escolhido via IA_PROVIDER)');
        return await processarComGemini(mensagem);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Gemini, tentando Groq como fallback...', error.message);
        if (temGroq && groq) {
          return await processarComGroq(mensagem);
        }
        throw error;
      }
    } else {
      throw new Error('IA_PROVIDER=gemini configurado, mas GEMINI_API_KEY não está definida');
    }
  } else {
    // Modo automático: tenta Groq primeiro, depois Gemini
    if (temGroq && groq) {
      try {
        console.log('🤖 Usando Groq (modo automático)');
        return await processarComGroq(mensagem);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini...', error.message);
        if (temGemini && gemini) {
          return await processarComGemini(mensagem);
        }
        throw error;
      }
    } else if (temGemini && gemini) {
      return await processarComGemini(mensagem);
    }
  }

  throw new Error('Nenhuma IA disponível');
}

async function processarComGroq(mensagem: string): Promise<TransacaoExtraida[]> {
  if (!groq) throw new Error('Groq não inicializado');

  try {
    const prompt = `Analise a seguinte mensagem e extraia todas as transações financeiras mencionadas.
    
Mensagem: "${mensagem}"

Retorne APENAS um JSON válido com o seguinte formato:
{
  "transacoes": [
    {
      "descricao": "descrição do item/serviço",
      "valor": 50.00,
      "categoria": "comida",
      "tipo": "saida",
      "metodo": "debito"
    }
  ]
}

Regras:
- Extraia TODAS as transações mencionadas
- O valor deve ser um número (sem R$ ou "reais")
- A descrição deve ser clara e objetiva
- A categoria deve ser uma palavra simples que agrupa o tipo de gasto
- Categorias comuns: comida, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
- Classifique automaticamente: sanduíche, hambúrguer, pizza, almoço, jantar, lanche, café = "comida"

- TIPO (CRÍTICO - leia com atenção):
  * Use "entrada" quando o dinheiro ENTRA na conta (você RECEBE dinheiro):
    - Palavras-chave: "recebido", "recebimento", "recebi", "pagamento recebido", "pagamento do", "pagamento de", "me pagou", "me pagaram", "me pagar", "acabou de me pagar", "pagou para mim", "salário", "venda", "depósito", "entrada", "lucro", "rendimento", "receita", "ganho", "dinheiro recebido", "transferência recebida", "chegou", "entrou"
    - Exemplos: 
      - "pagamento recebido do chefe" = entrada
      - "recebi 500 reais" = entrada
      - "vendi meu carro" = entrada
      - "salário de dezembro" = entrada
      - "meu chefe me pagou 2000 reais" = entrada
      - "acabou de me pagar" = entrada
      - "o chefe acabou de me pagar 2000 reais" = entrada
  * Use "saida" quando o dinheiro SAI da conta (você PAGA ou GASTA):
    - Palavras-chave: "comprei", "paguei", "gastei", "despesa", "saída", "saque", "pagamento feito", "transferência enviada", "paguei por", "comprei um", "gastei com", "paguei para", "fiz pagamento"
    - Exemplos: 
      - "comprei um sanduíche" = saida
      - "paguei a conta de luz" = saida
      - "gastei 50 reais" = saida
  * REGRA DE OURO: Se a mensagem contém "recebido", "recebimento", "recebi", "pagamento recebido", "pagamento do", "pagamento de", "me pagou", "me pagaram", "me pagar", "acabou de me pagar" = SEMPRE é "entrada"
  * REGRA DE OURO: Se a mensagem contém "comprei", "paguei", "gastei" = SEMPRE é "saida"

- MÉTODO: "credito" se mencionar cartão de crédito, crédito, parcelado, ou "debito" se mencionar débito, dinheiro, pix, transferência. Se não mencionar, use "debito"
- Se não houver transações, retorne {"transacoes": []}
- Retorne APENAS o JSON, sem texto adicional`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente especializado em extrair informações financeiras de mensagens de texto. Sempre retorne JSON válido.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.1-8b-instant', // Modelo gratuito e rápido do Groq
      temperature: 0.3,
      max_tokens: 500
    });

    const resposta = completion.choices[0]?.message?.content || '{}';
    
    // Tenta extrair JSON da resposta
    let jsonStr = resposta.trim();
    
    // Remove markdown code blocks se houver
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    // Remove texto antes/depois do JSON
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const resultado = JSON.parse(jsonStr);
    
    if (resultado.transacoes && Array.isArray(resultado.transacoes)) {
      return resultado.transacoes.map((t: any) => {
        // Log para debug
        console.log(`   🔍 Transação extraída pela IA:`, {
          descricao: t.descricao,
          valor: t.valor,
          categoria: t.categoria,
          tipo: t.tipo,
          metodo: t.metodo
        });
        
        // Determina o tipo: verifica se é 'entrada' (case-insensitive)
        // Se não for especificado ou for diferente de 'entrada', usa 'saida'
        let tipoFinal = 'saida';
        if (t.tipo) {
          const tipoLower = String(t.tipo).toLowerCase().trim();
          if (tipoLower === 'entrada') {
            tipoFinal = 'entrada';
          }
        }
        
        console.log(`   🔍 Tipo processado: "${t.tipo}" -> "${tipoFinal}"`);
        
        return {
          descricao: t.descricao || 'Transação',
          valor: parseFloat(t.valor) || 0,
          categoria: t.categoria || 'outros',
          tipo: tipoFinal as 'entrada' | 'saida',
          metodo: (t.metodo && t.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito' as 'credito' | 'debito',
          sucesso: true
        };
      }).filter((t: TransacaoExtraida) => t.valor > 0);
    }

    return [];
  } catch (error: any) {
    console.error('❌ Erro ao processar com Groq:', error.message);
    throw error;
  }
}

async function processarComGemini(mensagem: string): Promise<TransacaoExtraida[]> {
  if (!gemini) {
    console.error('❌ Gemini não inicializado. Verifique se GEMINI_API_KEY está configurada.');
    throw new Error('Gemini não inicializado');
  }

  try {
    console.log('🤖 Usando Google Gemini para processar mensagem...');
    
    // Usa gemini-2.5-flash (modelo gratuito e rápido) conforme documentação oficial
    // Documentação: https://ai.google.dev/gemini-api/docs?hl=pt-br#javascript
    const prompt = `Analise a seguinte mensagem e extraia todas as transações financeiras mencionadas.
    
Mensagem: "${mensagem}"

Retorne APENAS um JSON válido com o seguinte formato:
{
  "transacoes": [
    {
      "descricao": "descrição do item/serviço",
      "valor": 50.00,
      "categoria": "comida",
      "tipo": "saida",
      "metodo": "debito"
    }
  ]
}

Regras:
- Extraia TODAS as transações mencionadas
- O valor deve ser um número (sem R$ ou "reais")
- A descrição deve ser clara e objetiva
- A categoria deve ser uma palavra simples que agrupa o tipo de gasto
- Categorias comuns: comida, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
- Classifique automaticamente: sanduíche, hambúrguer, pizza, almoço, jantar, lanche, café, milkshake = "comida"
- TIPO: 
  * "entrada" para: recebimentos, salário, venda, pagamento recebido, dinheiro recebido, depósito, transferência recebida, rendimento, lucro, receita, entrada de dinheiro, qualquer valor que ENTRA na conta
  * "saida" para: gastos, compras, pagamentos feitos, despesas, saques, transferências enviadas, qualquer valor que SAI da conta
  * IMPORTANTE: Se a mensagem mencionar "recebido", "recebimento", "pagamento recebido", "salário", "venda", "depósito", "entrada", "lucro", "rendimento" = SEMPRE use "entrada"
  * IMPORTANTE: Se a mensagem mencionar "comprei", "paguei", "gastei", "despesa", "saída", "saque" = SEMPRE use "saida"
- MÉTODO: "credito" se mencionar cartão de crédito, crédito, parcelado, ou "debito" se mencionar débito, dinheiro, pix, transferência. Se não mencionar, use "debito"
- Se não houver transações, retorne {"transacoes": []}
- Retorne APENAS o JSON, sem texto adicional`;

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const resposta = response.text || '';

    // Tenta extrair JSON da resposta
    let jsonStr = resposta.trim();
    
    // Remove markdown code blocks se houver
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    // Remove texto antes/depois do JSON
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const resultado = JSON.parse(jsonStr);
    
    if (resultado.transacoes && Array.isArray(resultado.transacoes)) {
      return resultado.transacoes.map((t: any) => {
        // Log para debug
        console.log(`   🔍 Transação extraída pela IA:`, {
          descricao: t.descricao,
          valor: t.valor,
          categoria: t.categoria,
          tipo: t.tipo,
          metodo: t.metodo
        });
        
        // Determina o tipo: verifica se é 'entrada' (case-insensitive)
        // Se não for especificado ou for diferente de 'entrada', usa 'saida'
        let tipoFinal = 'saida';
        if (t.tipo) {
          const tipoLower = String(t.tipo).toLowerCase().trim();
          if (tipoLower === 'entrada') {
            tipoFinal = 'entrada';
          }
        }
        
        console.log(`   🔍 Tipo processado: "${t.tipo}" -> "${tipoFinal}"`);
        
        return {
          descricao: t.descricao || 'Transação',
          valor: parseFloat(t.valor) || 0,
          categoria: t.categoria || 'outros',
          tipo: tipoFinal as 'entrada' | 'saida',
          metodo: (t.metodo && t.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito' as 'credito' | 'debito',
          sucesso: true
        };
      }).filter((t: TransacaoExtraida) => t.valor > 0);
    }

    return [];
  } catch (error: any) {
    console.error('❌ Erro ao processar com Gemini:', error.message);
    throw error;
  }
}

