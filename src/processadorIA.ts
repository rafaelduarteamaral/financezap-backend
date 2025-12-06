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
  carteiraNome?: string; // Nome da carteira mencionada (opcional)
  sucesso: boolean;
}

/**
 * Processa mensagem usando IA para extrair transações financeiras
 * Usa Groq (gratuito) para entender melhor o contexto
 * REQUER: GROQ_API_KEY configurada no .env
 */
/**
 * Pipeline em 2 etapas para melhorar a precisão:
 * 1. Normaliza e melhora o texto
 * 2. Extrai informações financeiras
 */
async function normalizarTextoComIA(mensagem: string, usarGroq: boolean): Promise<string> {
  const promptNormalizacao = `Você é um assistente especializado em normalizar e melhorar mensagens de texto sobre transações financeiras.

Mensagem original: "${mensagem}"

Sua tarefa é normalizar o texto mantendo TODAS as informações originais:

1. CORRIGIR erros de digitação comuns (ex: "almocie" → "almocei", "gaste" → "gastei")
2. EXPANDIR abreviações quando necessário (ex: "p/ " → "para", mas mantenha "R$" como está)
3. PADRONIZAR verbos de ação financeira:
   - "almocie", "almociei", "almoco" → "almocei"
   - "jantei", "jantou" → mantenha como está
   - "comprei", "comprar" → "comprei" (se for passado)
   - "gastei", "gastar" → "gastei" (se for passado)
4. IDENTIFICAR e CLARIFICAR contexto de refeições:
   - Se mencionar "almoço", "almocei", "almocar" → deixe claro que é sobre alimentação
   - Se mencionar "café", identifique se é bebida ou refeição
5. MANTER todos os valores monetários EXATAMENTE como estão
6. MANTER todas as informações originais

REGRAS CRÍTICAS:
- NÃO invente informações que não estão na mensagem
- NÃO adicione valores que não foram mencionados
- NÃO remova informações importantes
- Se a mensagem já estiver clara e correta, retorne ela SEM alterações
- Retorne APENAS o texto normalizado, sem explicações ou comentários

Exemplos:
- "almocie hoje por 59 reais" → "almocei hoje por 59 reais"
- "gaste com comida 50" → "gastei com comida 50 reais"
- "almoço no restaurante 80" → "almocei no restaurante 80 reais"

Texto normalizado:`;

  try {
    if (usarGroq && groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em normalizar mensagens de texto sobre finanças. Retorne apenas o texto normalizado, sem explicações.'
          },
          {
            role: 'user',
            content: promptNormalizacao
          }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.1, // Baixa temperatura para manter fidelidade
        max_tokens: 200
      });
      
      const textoNormalizado = completion.choices[0]?.message?.content?.trim() || mensagem;
      console.log(`   📝 Texto normalizado: "${textoNormalizado}"`);
      return textoNormalizado;
    } else if (gemini) {
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptNormalizacao,
      });
      
      const textoNormalizado = (response.text || mensagem).trim();
      console.log(`   📝 Texto normalizado: "${textoNormalizado}"`);
      return textoNormalizado;
    }
  } catch (error: any) {
    console.warn('⚠️  Erro ao normalizar texto, usando mensagem original:', error.message);
  }
  
  return mensagem; // Fallback: retorna mensagem original
}

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

  // Pipeline em 2 etapas: primeiro normaliza, depois extrai
  let mensagemProcessada = mensagem;
  
  // Etapa 1: Normalização do texto
  // Usa normalização quando:
  // - Mensagem tem mais de 15 caracteres (pode ter contexto)
  // - Ou contém possíveis erros de digitação
  // - Ou não começa com verbos financeiros conhecidos
  const verbosFinanceirosConhecidos = /^(almocei|jantei|comprei|gastei|paguei|recebi|ganhei|vendi|almoco|jantar|comprar|gastar|pagar)/i;
  const temPossivelErro = /almoc|gast|compr|pag|receb/i.test(mensagem) && !verbosFinanceirosConhecidos.test(mensagem);
  const precisaNormalizacao = mensagem.length > 15 && (temPossivelErro || !verbosFinanceirosConhecidos.test(mensagem));
  
  if (precisaNormalizacao) {
    console.log('🔄 Etapa 1: Normalizando e melhorando texto...');
    console.log(`   Mensagem original: "${mensagem}"`);
    try {
      const usarGroq = Boolean(IA_PROVIDER === 'groq' || (IA_PROVIDER !== 'gemini' && temGroq));
      mensagemProcessada = await normalizarTextoComIA(mensagem, usarGroq);
      
      // Se a normalização não melhorou nada, usa a original
      if (mensagemProcessada === mensagem || mensagemProcessada.length < 5) {
        console.log('   ℹ️  Texto já estava claro, mantendo original');
        mensagemProcessada = mensagem;
      }
    } catch (error: any) {
      console.warn('⚠️  Erro na normalização, continuando com texto original:', error.message);
      mensagemProcessada = mensagem;
    }
  } else {
    console.log('ℹ️  Mensagem simples detectada, pulando normalização');
  }

  // Etapa 2: Extração de informações financeiras
  console.log('🔄 Etapa 2: Extraindo informações financeiras...');

  // Se IA_PROVIDER estiver configurado, usa a IA especificada
  if (IA_PROVIDER === 'groq') {
    if (temGroq && groq) {
      try {
        console.log('🤖 Usando Groq (escolhido via IA_PROVIDER)');
        return await processarComGroq(mensagemProcessada, mensagem);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini como fallback...', error.message);
        if (temGemini && gemini) {
          return await processarComGemini(mensagemProcessada, mensagem);
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
        return await processarComGemini(mensagemProcessada, mensagem);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Gemini, tentando Groq como fallback...', error.message);
        if (temGroq && groq) {
          return await processarComGroq(mensagemProcessada, mensagem);
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
        return await processarComGroq(mensagemProcessada, mensagem);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini...', error.message);
        if (temGemini && gemini) {
          return await processarComGemini(mensagemProcessada, mensagem);
        }
        throw error;
      }
    } else if (temGemini && gemini) {
      return await processarComGemini(mensagemProcessada, mensagem);
    }
  }

  throw new Error('Nenhuma IA disponível');
}

async function processarComGroq(mensagem: string, mensagemOriginal?: string): Promise<TransacaoExtraida[]> {
  const mensagemParaValidacao = mensagemOriginal || mensagem;
  if (!groq) throw new Error('Groq não inicializado');

  try {
    const prompt = `Analise a seguinte mensagem e extraia TODAS as transações financeiras mencionadas.

Mensagem: "${mensagem}"

⚠️ IMPORTANTE: A mensagem pode conter MÚLTIPLAS transações em linhas separadas ou na mesma linha.
Cada linha ou item mencionado com um valor deve ser extraído como uma transação separada.

EXEMPLOS DE MENSAGENS COM MÚLTIPLAS TRANSAÇÕES:
- "corte de cabelo 25 reais\nsalao de beleza 25 reais\nbarbearia 25 reais" = 3 transações
- "comprei pão por 5 reais, leite por 8 e café por 12" = 3 transações
- "gastei 50 com gasolina\n30 com almoço\n20 com estacionamento" = 3 transações
- "corte de cabelo 25 reais\nsalao de beleza 25 reais" = 2 transações

Retorne APENAS um JSON válido com o seguinte formato:
{
  "transacoes": [
    {
      "descricao": "descrição do item/serviço",
      "valor": 50.00,
      "categoria": "comida",
      "tipo": "saida",
      "metodo": "debito",
      "carteiraNome": "nome da carteira mencionada (opcional, apenas se mencionado na mensagem)"
    }
  ]
}

IMPORTANTE SOBRE CARTEIRAS:
- Se a mensagem mencionar uma carteira específica (ex: "na carteira principal", "da poupança", "no cartão"), extraia o nome da carteira no campo "carteiraNome"
- Se não mencionar carteira, deixe "carteiraNome" como null ou não inclua o campo
- Exemplos de menções de carteira:
  - "gastei 50 reais na carteira principal" → carteiraNome: "principal"
  - "comprei algo por 100 na poupança" → carteiraNome: "poupança"
  - "paguei 30 do cartão" → carteiraNome: "cartão"
  - "recebi 500 na conta corrente" → carteiraNome: "conta corrente"

Regras:
- Extraia TODAS as transações mencionadas, mesmo que estejam em linhas separadas
- Se a mensagem tiver múltiplas linhas, cada linha com um valor deve ser uma transação separada
- Se a mensagem tiver múltiplos itens na mesma linha (separados por vírgula, "e", ou quebra de linha), extraia cada um separadamente
- O valor deve ser um número (sem R$ ou "reais")
- A descrição deve ser clara e objetiva (ex: "corte de cabelo", "salao de beleza", "barbearia")
- A categoria deve ser uma palavra simples que agrupa o tipo de gasto
- Categorias comuns: alimentação, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
- ⚠️⚠️⚠️ CATEGORIA ALIMENTAÇÃO (CRÍTICO - LEIA COM MUITA ATENÇÃO) ⚠️⚠️⚠️:
  
  REGRA ABSOLUTA: Qualquer mensagem que contenha palavras relacionadas a COMIDA, BEBIDA ou REFEIÇÕES deve SEMPRE usar a categoria "alimentação".
  
  VERBOS que SEMPRE indicam "alimentação":
  - "almocei", "almoço", "almocar", "almocou" = SEMPRE alimentação
  - "jantei", "jantar", "jantou" = SEMPRE alimentação
  - "lanchei", "lanche", "lanchou" = SEMPRE alimentação
  - "tomei café", "café", "café da manhã", "café da tarde" = SEMPRE alimentação
  - "comi", "comeu", "comida" = SEMPRE alimentação
  - "bebi", "bebida", "bebeu" = SEMPRE alimentação
  
  PALAVRAS-CHAVE que SEMPRE indicam "alimentação":
  - Refeições: almoço, jantar, lanche, café, café da manhã, café da tarde, desjejum, merenda, ceia
  - Locais: restaurante, padaria, lanchonete, fast food, pizzaria, hamburgueria, açougue, peixaria, sorveteria, confeitaria, cafeteria
  - Comidas: sanduíche, hambúrguer, pizza, comida, prato, refeição, marmita, delivery, ifood, uber eats, rappi
  - Bebidas: suco, refrigerante, água, cerveja, vinho, café, chá, leite, iogurte
  - Itens: pão, bolo, doce, sorvete, frutas, verduras, legumes, carne, peixe, frango
  
  EXEMPLOS OBRIGATÓRIOS (SEMPRE são "alimentação"):
    ✅ "almocei hoje por 59 reais" = alimentação
    ✅ "almoço no restaurante" = alimentação
    ✅ "jantei fora" = alimentação
    ✅ "tomei café da manhã" = alimentação
    ✅ "comprei pão na padaria" = alimentação
    ✅ "gastei com comida" = alimentação
    ✅ "delivery de pizza" = alimentação
    ✅ "ifood" = alimentação
    ✅ "supermercado" (quando mencionar comida) = alimentação
  
  ⚠️ ATENÇÃO: Se a mensagem contém QUALQUER palavra relacionada a comida/bebida/refeição, use "alimentação", NUNCA "outros"!

- Para serviços de beleza/cabelo: use categoria "serviços" ou "lazer"
- Para transporte: use "transporte" (uber, táxi, gasolina, ônibus, metrô)
- Para saúde: use "saúde" (médico, remédio, farmácia, plano de saúde)
- Para educação: use "educação" (curso, livro, mensalidade escolar)
- Para moradia: use "moradia" (aluguel, condomínio, água, luz, internet)
- Use "outros" APENAS quando não se encaixar em nenhuma categoria acima

- TIPO (CRÍTICO - leia com MUITA atenção, esta é a parte mais importante):
  
  ⚠️ REGRA PRIMEIRA: Analise o CONTEXTO e o VERBO da mensagem para determinar se o dinheiro ENTRA ou SAI.
  
  ✅ Use "entrada" quando o dinheiro ENTRA na sua conta (você RECEBE dinheiro):
    - VERBOS DE ENTRADA: "recebi", "recebido", "recebimento", "ganhei", "ganho", "vendi", "venda", "depositei", "depósito", "entrou", "chegou", "lucro", "rendimento", "dividendos", "juros"
    - PALAVRAS-CHAVE DE ENTRADA: "salário", "pagamento recebido", "me pagou", "me pagaram", "pagou para mim", "acabou de me pagar", "transferência recebida", "dinheiro recebido", "receita", "entrada de dinheiro", "renda"
    - EXEMPLOS OBRIGATÓRIOS (SEMPRE são "entrada"):
      ✅ "recebi um salário de 100 reais" = ENTRADA
      ✅ "recebi 500 reais" = ENTRADA
      ✅ "recebi salário" = ENTRADA
      ✅ "me pagaram 2000 reais" = ENTRADA
      ✅ "vendi meu carro por 15000" = ENTRADA
      ✅ "ganhei 300 reais" = ENTRADA
      ✅ "depositei 500 reais" = ENTRADA
      ✅ "recebi pagamento do cliente" = ENTRADA
      ✅ "o chefe me pagou 1500" = ENTRADA
      ✅ "recebi 100 de salário" = ENTRADA
      ✅ "salário de 2000 reais" = ENTRADA
  
  ❌ Use "saida" quando o dinheiro SAI da sua conta (você PAGA ou GASTA):
    - VERBOS DE SAÍDA: "comprei", "paguei", "gastei", "despensei", "saquei", "transferi", "enviei", "paguei por", "gastei com"
    - PALAVRAS-CHAVE DE SAÍDA: "despesa", "saída", "saque", "pagamento feito", "transferência enviada", "compras", "gastos"
    - EXEMPLOS OBRIGATÓRIOS (SEMPRE são "saida"):
      ❌ "comprei um sanduíche por 20 reais" = SAIDA
      ❌ "paguei 150 reais de conta de luz" = SAIDA
      ❌ "gastei 50 reais" = SAIDA
      ❌ "comprei café por 5 reais" = SAIDA
  
  🔍 ANÁLISE DE CONTEXTO:
    - Se a mensagem começa com "recebi", "ganhei", "vendi", "me pagaram" = SEMPRE "entrada"
    - Se a mensagem começa com "comprei", "paguei", "gastei" = SEMPRE "saida"
    - Se mencionar "salário" = SEMPRE "entrada" (salário é sempre dinheiro que você recebe)
    - Se mencionar "venda" = SEMPRE "entrada" (venda é dinheiro que você recebe)
    - Se mencionar "compra" = SEMPRE "saida" (compra é dinheiro que você gasta)
  
  ⚠️ ATENÇÃO ESPECIAL: 
    - "recebi salário" = ENTRADA (não importa o valor, salário é sempre entrada)
    - "recebi um salário de X reais" = ENTRADA
    - "recebi X reais" = ENTRADA
    - Qualquer frase com "recebi" + valor = ENTRADA

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
      // Palavras-chave que indicam ENTRADA (dinheiro recebido)
      const palavrasEntrada = [
        'recebi', 'recebido', 'recebimento', 'ganhei', 'ganho', 'vendi', 'venda',
        'salário', 'salario', 'me pagou', 'me pagaram', 'pagou para mim',
        'acabou de me pagar', 'depositei', 'depósito', 'deposito',
        'transferência recebida', 'transferencia recebida', 'dinheiro recebido',
        'lucro', 'rendimento', 'dividendos', 'juros', 'receita', 'renda'
      ];
      
      // Palavras-chave que indicam SAÍDA (dinheiro gasto)
      const palavrasSaida = [
        'comprei', 'paguei', 'gastei', 'despensei', 'saquei', 'transferi',
        'enviei', 'despesa', 'saída', 'saida', 'saque', 'pagamento feito',
        'compras', 'gastos'
      ];
      
      const mensagemLower = mensagem.toLowerCase();
      
      return resultado.transacoes.map((t: any) => {
        // Log para debug
        console.log(`   🔍 Transação extraída pela IA:`, {
          descricao: t.descricao,
          valor: t.valor,
          categoria: t.categoria,
          tipo: t.tipo,
          metodo: t.metodo
        });
        
        // Validação dupla: primeiro verifica a resposta da IA, depois valida pela mensagem original
        let tipoFinal = 'saida';
        
        // 1. Verifica o tipo retornado pela IA
        if (t.tipo) {
          const tipoLower = String(t.tipo).toLowerCase().trim();
          if (tipoLower === 'entrada') {
            tipoFinal = 'entrada';
          }
        }
        
        // 2. Validação adicional: verifica palavras-chave na mensagem original
        // Se encontrar palavras de entrada, força como entrada (corrige erros da IA)
        const temPalavraEntrada = palavrasEntrada.some(palavra => 
          mensagemLower.includes(palavra)
        );
        const temPalavraSaida = palavrasSaida.some(palavra => 
          mensagemLower.includes(palavra)
        );
        
        // Se tem palavra de entrada e não tem palavra de saída, força entrada
        if (temPalavraEntrada && !temPalavraSaida) {
          tipoFinal = 'entrada';
          console.log(`   ✅ CORREÇÃO: Tipo corrigido para "entrada" baseado em palavras-chave da mensagem`);
        }
        // Se tem palavra de saída e não tem palavra de entrada, força saída
        else if (temPalavraSaida && !temPalavraEntrada) {
          tipoFinal = 'saida';
          console.log(`   ✅ CORREÇÃO: Tipo corrigido para "saida" baseado em palavras-chave da mensagem`);
        }
        
        console.log(`   🔍 Tipo processado: "${t.tipo}" -> "${tipoFinal}" (mensagem: "${mensagem.substring(0, 50)}...")`);
        
        // Normaliza categoria: mapeia variações para categorias padrão
        let categoriaFinal = (t.categoria || 'outros').toLowerCase().trim();
        
        // Mapeia variações de alimentação
        const categoriasAlimentacao = ['comida', 'alimentação', 'alimentacao', 'restaurante', 'padaria', 'lanchonete', 'fast food'];
        if (categoriasAlimentacao.includes(categoriaFinal)) {
          categoriaFinal = 'alimentação';
        }
        
        // Verifica palavras-chave na descrição E na mensagem original para corrigir categoria
        const descricaoLower = (t.descricao || '').toLowerCase();
        const mensagemLower = mensagem.toLowerCase();
        
        // Lista expandida de palavras-chave de alimentação
        const palavrasAlimentacao = [
          // Verbos
          'almocei', 'almoço', 'almocar', 'almocou', 'almocamos',
          'jantei', 'jantar', 'jantou', 'jantamos',
          'lanchei', 'lanche', 'lanchou',
          'tomei café', 'café', 'cafe', 'café da manhã', 'cafe da manha', 'café da tarde',
          'comi', 'comeu', 'comemos', 'comida',
          'bebi', 'bebida', 'bebeu',
          // Refeições
          'desjejum', 'merenda', 'ceia',
          // Locais
          'padaria', 'restaurante', 'lanchonete', 'fast food', 'pizzaria', 'hamburgueria',
          'açougue', 'acougue', 'peixaria', 'sorveteria', 'confeitaria', 'cafeteria',
          // Comidas
          'sanduíche', 'sanduiche', 'hambúrguer', 'hamburguer', 'pizza', 'prato', 'refeição', 'refeicao',
          'marmita', 'delivery', 'ifood', 'uber eats', 'rappi',
          // Bebidas
          'suco', 'refrigerante', 'água', 'agua', 'cerveja', 'vinho', 'chá', 'cha', 'leite', 'iogurte',
          // Itens
          'pão', 'pao', 'bolo', 'doce', 'sorvete', 'frutas', 'verduras', 'legumes', 'carne', 'peixe', 'frango',
          // Outros
          'supermercado', 'mercado', 'gastronomia'
        ];
        
        // Verifica na descrição
        const temPalavraAlimentacaoDescricao = palavrasAlimentacao.some(palavra => descricaoLower.includes(palavra));
        // Verifica na mensagem original também
        const temPalavraAlimentacaoMensagem = palavrasAlimentacao.some(palavra => mensagemLower.includes(palavra));
        
        if (temPalavraAlimentacaoDescricao || temPalavraAlimentacaoMensagem) {
          categoriaFinal = 'alimentação';
          console.log(`   ✅ CORREÇÃO: Categoria corrigida para "alimentação" baseado em palavras-chave (descrição: ${temPalavraAlimentacaoDescricao}, mensagem: ${temPalavraAlimentacaoMensagem})`);
        }
        
        return {
          descricao: t.descricao || 'Transação',
          valor: parseFloat(t.valor) || 0,
          categoria: categoriaFinal,
          tipo: tipoFinal as 'entrada' | 'saida',
          metodo: (t.metodo && t.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito' as 'credito' | 'debito',
          carteiraNome: t.carteiraNome || undefined,
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

async function processarComGemini(mensagem: string, mensagemOriginal?: string): Promise<TransacaoExtraida[]> {
  const mensagemParaValidacao = mensagemOriginal || mensagem;
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
      "metodo": "debito",
      "carteiraNome": "nome da carteira mencionada (opcional, apenas se mencionado na mensagem)"
    }
  ]
}

IMPORTANTE SOBRE CARTEIRAS:
- Se a mensagem mencionar uma carteira específica (ex: "na carteira principal", "da poupança", "no cartão"), extraia o nome da carteira no campo "carteiraNome"
- Se não mencionar carteira, deixe "carteiraNome" como null ou não inclua o campo
- Exemplos de menções de carteira:
  - "gastei 50 reais na carteira principal" → carteiraNome: "principal"
  - "comprei algo por 100 na poupança" → carteiraNome: "poupança"
  - "paguei 30 do cartão" → carteiraNome: "cartão"
  - "recebi 500 na conta corrente" → carteiraNome: "conta corrente"

Regras:
- Extraia TODAS as transações mencionadas
- O valor deve ser um número (sem R$ ou "reais")
- A descrição deve ser clara e objetiva
- A categoria deve ser uma palavra simples que agrupa o tipo de gasto
- Categorias comuns: alimentação, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
- ⚠️⚠️⚠️ CATEGORIA ALIMENTAÇÃO (CRÍTICO - LEIA COM MUITA ATENÇÃO) ⚠️⚠️⚠️:
  
  REGRA ABSOLUTA: Qualquer mensagem que contenha palavras relacionadas a COMIDA, BEBIDA ou REFEIÇÕES deve SEMPRE usar a categoria "alimentação".
  
  VERBOS que SEMPRE indicam "alimentação":
  - "almocei", "almoço", "almocar", "almocou" = SEMPRE alimentação
  - "jantei", "jantar", "jantou" = SEMPRE alimentação
  - "lanchei", "lanche", "lanchou" = SEMPRE alimentação
  - "tomei café", "café", "café da manhã", "café da tarde" = SEMPRE alimentação
  - "comi", "comeu", "comida" = SEMPRE alimentação
  - "bebi", "bebida", "bebeu" = SEMPRE alimentação
  
  PALAVRAS-CHAVE que SEMPRE indicam "alimentação":
  - Refeições: almoço, jantar, lanche, café, café da manhã, café da tarde, desjejum, merenda, ceia
  - Locais: restaurante, padaria, lanchonete, fast food, pizzaria, hamburgueria, açougue, peixaria, sorveteria, confeitaria, cafeteria
  - Comidas: sanduíche, hambúrguer, pizza, comida, prato, refeição, marmita, delivery, ifood, uber eats, rappi
  - Bebidas: suco, refrigerante, água, cerveja, vinho, café, chá, leite, iogurte
  - Itens: pão, bolo, doce, sorvete, frutas, verduras, legumes, carne, peixe, frango
  
  EXEMPLOS OBRIGATÓRIOS (SEMPRE são "alimentação"):
    ✅ "almocei hoje por 59 reais" = alimentação
    ✅ "almoço no restaurante" = alimentação
    ✅ "jantei fora" = alimentação
    ✅ "tomei café da manhã" = alimentação
    ✅ "comprei pão na padaria" = alimentação
    ✅ "gastei com comida" = alimentação
    ✅ "delivery de pizza" = alimentação
    ✅ "ifood" = alimentação
    ✅ "supermercado" (quando mencionar comida) = alimentação
  
  ⚠️ ATENÇÃO: Se a mensagem contém QUALQUER palavra relacionada a comida/bebida/refeição, use "alimentação", NUNCA "outros"!

- Para serviços de beleza/cabelo: use categoria "serviços" ou "lazer"
- Para transporte: use "transporte" (uber, táxi, gasolina, ônibus, metrô)
- Para saúde: use "saúde" (médico, remédio, farmácia, plano de saúde)
- Para educação: use "educação" (curso, livro, mensalidade escolar)
- Para moradia: use "moradia" (aluguel, condomínio, água, luz, internet)
- Use "outros" APENAS quando não se encaixar em nenhuma categoria acima
- TIPO (CRÍTICO - leia com MUITA atenção):
  
  ⚠️ REGRA PRIMEIRA: Analise o CONTEXTO e o VERBO da mensagem para determinar se o dinheiro ENTRA ou SAI.
  
  ✅ Use "entrada" quando o dinheiro ENTRA na sua conta (você RECEBE dinheiro):
    - VERBOS DE ENTRADA: "recebi", "recebido", "recebimento", "ganhei", "ganho", "vendi", "venda", "depositei", "depósito", "entrou", "chegou", "lucro", "rendimento", "dividendos", "juros"
    - PALAVRAS-CHAVE DE ENTRADA: "salário", "pagamento recebido", "me pagou", "me pagaram", "pagou para mim", "acabou de me pagar", "transferência recebida", "dinheiro recebido", "receita", "entrada de dinheiro", "renda"
    - EXEMPLOS OBRIGATÓRIOS (SEMPRE são "entrada"):
      ✅ "recebi um salário de 100 reais" = ENTRADA
      ✅ "recebi 500 reais" = ENTRADA
      ✅ "recebi salário" = ENTRADA
      ✅ "me pagaram 2000 reais" = ENTRADA
      ✅ "vendi meu carro por 15000" = ENTRADA
      ✅ "ganhei 300 reais" = ENTRADA
      ✅ "depositei 500 reais" = ENTRADA
      ✅ "recebi pagamento do cliente" = ENTRADA
      ✅ "o chefe me pagou 1500" = ENTRADA
      ✅ "recebi 100 de salário" = ENTRADA
      ✅ "salário de 2000 reais" = ENTRADA
  
  ❌ Use "saida" quando o dinheiro SAI da sua conta (você PAGA ou GASTA):
    - VERBOS DE SAÍDA: "comprei", "paguei", "gastei", "despensei", "saquei", "transferi", "enviei", "paguei por", "gastei com"
    - PALAVRAS-CHAVE DE SAÍDA: "despesa", "saída", "saque", "pagamento feito", "transferência enviada", "compras", "gastos"
    - EXEMPLOS OBRIGATÓRIOS (SEMPRE são "saida"):
      ❌ "comprei um sanduíche por 20 reais" = SAIDA
      ❌ "paguei 150 reais de conta de luz" = SAIDA
      ❌ "gastei 50 reais" = SAIDA
      ❌ "comprei café por 5 reais" = SAIDA
  
  🔍 ANÁLISE DE CONTEXTO:
    - Se a mensagem começa com "recebi", "ganhei", "vendi", "me pagaram" = SEMPRE "entrada"
    - Se a mensagem começa com "comprei", "paguei", "gastei" = SEMPRE "saida"
    - Se mencionar "salário" = SEMPRE "entrada" (salário é sempre dinheiro que você recebe)
    - Se mencionar "venda" = SEMPRE "entrada" (venda é dinheiro que você recebe)
    - Se mencionar "compra" = SEMPRE "saida" (compra é dinheiro que você gasta)
  
  ⚠️ ATENÇÃO ESPECIAL: 
    - "recebi salário" = ENTRADA (não importa o valor, salário é sempre entrada)
    - "recebi um salário de X reais" = ENTRADA
    - "recebi X reais" = ENTRADA
    - Qualquer frase com "recebi" + valor = ENTRADA
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
      // Palavras-chave que indicam ENTRADA (dinheiro recebido)
      const palavrasEntrada = [
        'recebi', 'recebido', 'recebimento', 'ganhei', 'ganho', 'vendi', 'venda',
        'salário', 'salario', 'me pagou', 'me pagaram', 'pagou para mim',
        'acabou de me pagar', 'depositei', 'depósito', 'deposito',
        'transferência recebida', 'transferencia recebida', 'dinheiro recebido',
        'lucro', 'rendimento', 'dividendos', 'juros', 'receita', 'renda'
      ];
      
      // Palavras-chave que indicam SAÍDA (dinheiro gasto)
      const palavrasSaida = [
        'comprei', 'paguei', 'gastei', 'despensei', 'saquei', 'transferi',
        'enviei', 'despesa', 'saída', 'saida', 'saque', 'pagamento feito',
        'compras', 'gastos'
      ];
      
      const mensagemLower = mensagem.toLowerCase();
      
      return resultado.transacoes.map((t: any) => {
        // Log para debug
        console.log(`   🔍 Transação extraída pela IA:`, {
          descricao: t.descricao,
          valor: t.valor,
          categoria: t.categoria,
          tipo: t.tipo,
          metodo: t.metodo
        });
        
        // Validação dupla: primeiro verifica a resposta da IA, depois valida pela mensagem original
        let tipoFinal = 'saida';
        
        // 1. Verifica o tipo retornado pela IA
        if (t.tipo) {
          const tipoLower = String(t.tipo).toLowerCase().trim();
          if (tipoLower === 'entrada') {
            tipoFinal = 'entrada';
          }
        }
        
        // 2. Validação adicional: verifica palavras-chave na mensagem original
        // Se encontrar palavras de entrada, força como entrada (corrige erros da IA)
        const temPalavraEntrada = palavrasEntrada.some(palavra => 
          mensagemLower.includes(palavra)
        );
        const temPalavraSaida = palavrasSaida.some(palavra => 
          mensagemLower.includes(palavra)
        );
        
        // Se tem palavra de entrada e não tem palavra de saída, força entrada
        if (temPalavraEntrada && !temPalavraSaida) {
          tipoFinal = 'entrada';
          console.log(`   ✅ CORREÇÃO: Tipo corrigido para "entrada" baseado em palavras-chave da mensagem`);
        }
        // Se tem palavra de saída e não tem palavra de entrada, força saída
        else if (temPalavraSaida && !temPalavraEntrada) {
          tipoFinal = 'saida';
          console.log(`   ✅ CORREÇÃO: Tipo corrigido para "saida" baseado em palavras-chave da mensagem`);
        }
        
        console.log(`   🔍 Tipo processado: "${t.tipo}" -> "${tipoFinal}" (mensagem: "${mensagem.substring(0, 50)}...")`);
        
        // Normaliza categoria: mapeia variações para categorias padrão
        let categoriaFinal = (t.categoria || 'outros').toLowerCase().trim();
        
        // Mapeia variações de alimentação
        const categoriasAlimentacao = ['comida', 'alimentação', 'alimentacao', 'restaurante', 'padaria', 'lanchonete', 'fast food'];
        if (categoriasAlimentacao.includes(categoriaFinal)) {
          categoriaFinal = 'alimentação';
        }
        
        // Verifica palavras-chave na descrição E na mensagem original para corrigir categoria
        const descricaoLower = (t.descricao || '').toLowerCase();
        const mensagemLower = mensagem.toLowerCase();
        
        // Lista expandida de palavras-chave de alimentação
        const palavrasAlimentacao = [
          // Verbos
          'almocei', 'almoço', 'almocar', 'almocou', 'almocamos',
          'jantei', 'jantar', 'jantou', 'jantamos',
          'lanchei', 'lanche', 'lanchou',
          'tomei café', 'café', 'cafe', 'café da manhã', 'cafe da manha', 'café da tarde',
          'comi', 'comeu', 'comemos', 'comida',
          'bebi', 'bebida', 'bebeu',
          // Refeições
          'desjejum', 'merenda', 'ceia',
          // Locais
          'padaria', 'restaurante', 'lanchonete', 'fast food', 'pizzaria', 'hamburgueria',
          'açougue', 'acougue', 'peixaria', 'sorveteria', 'confeitaria', 'cafeteria',
          // Comidas
          'sanduíche', 'sanduiche', 'hambúrguer', 'hamburguer', 'pizza', 'prato', 'refeição', 'refeicao',
          'marmita', 'delivery', 'ifood', 'uber eats', 'rappi',
          // Bebidas
          'suco', 'refrigerante', 'água', 'agua', 'cerveja', 'vinho', 'chá', 'cha', 'leite', 'iogurte',
          // Itens
          'pão', 'pao', 'bolo', 'doce', 'sorvete', 'frutas', 'verduras', 'legumes', 'carne', 'peixe', 'frango',
          // Outros
          'supermercado', 'mercado', 'gastronomia'
        ];
        
        // Verifica na descrição
        const temPalavraAlimentacaoDescricao = palavrasAlimentacao.some(palavra => descricaoLower.includes(palavra));
        // Verifica na mensagem original também
        const temPalavraAlimentacaoMensagem = palavrasAlimentacao.some(palavra => mensagemLower.includes(palavra));
        
        if (temPalavraAlimentacaoDescricao || temPalavraAlimentacaoMensagem) {
          categoriaFinal = 'alimentação';
          console.log(`   ✅ CORREÇÃO: Categoria corrigida para "alimentação" baseado em palavras-chave (descrição: ${temPalavraAlimentacaoDescricao}, mensagem: ${temPalavraAlimentacaoMensagem})`);
        }
        
        return {
          descricao: t.descricao || 'Transação',
          valor: parseFloat(t.valor) || 0,
          categoria: categoriaFinal,
          tipo: tipoFinal as 'entrada' | 'saida',
          metodo: (t.metodo && t.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito' as 'credito' | 'debito',
          carteiraNome: t.carteiraNome || undefined,
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

