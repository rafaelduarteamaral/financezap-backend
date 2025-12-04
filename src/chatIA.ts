// Chat de IA para consultas financeiras

import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

// Inicializa Groq (se configurado)
const groq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '' 
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Inicializa Google Gemini (se configurado)
const geminiApiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';
const gemini = geminiApiKey 
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  : null;

// Variável para escolher qual IA usar (groq ou gemini)
// Se não especificado, usa a ordem: groq primeiro, depois gemini
const IA_PROVIDER = (process.env.IA_PROVIDER || '').toLowerCase().trim();

// Prompt pré-montado para consultas financeiras e sobre a plataforma
const PROMPT_FINANCEIRO = `Você é um assistente inteligente do FinanceZap, uma plataforma completa de gestão financeira pessoal via WhatsApp e portal web.

SUAS FUNÇÕES PRINCIPAIS:
1. Consultor financeiro pessoal - Analisar finanças e dar conselhos práticos
2. Suporte da plataforma - Responder dúvidas sobre como usar o FinanceZap
3. Instrutor - Ensinar formas legais e eficientes de usar a plataforma

═══════════════════════════════════════════════════════════
📱 SOBRE O FINANCEZAP - CONHECIMENTO DA PLATAFORMA
═══════════════════════════════════════════════════════════

O FinanceZap é uma plataforma que permite gerenciar suas finanças pessoais através de:
- WhatsApp: Envie mensagens de texto ou áudio com suas transações
- Portal Web: Visualize gráficos, relatórios e estatísticas detalhadas

FUNCIONALIDADES PRINCIPAIS:

1. 📝 REGISTRO DE TRANSAÇÕES
   - Via WhatsApp: Envie mensagens como "comprei um sanduíche por 20 reais" ou "recebi 500 reais do cliente"
   - A IA extrai automaticamente: descrição, valor, categoria, tipo (entrada/saída) e método de pagamento
   - Suporta múltiplas transações em uma única mensagem
   - Aceita mensagens de texto ou áudio (transcrição automática)

2. 📊 VISUALIZAÇÃO E ANÁLISE
   - Dashboard com estatísticas em tempo real
   - Gráficos de gastos por dia, mês e categoria
   - Métricas: Total gasto, média por transação, maior/menor gasto
   - Filtros por data, categoria, tipo e método de pagamento

3. 📅 AGENDAMENTOS
   - Agende pagamentos e recebimentos futuros
   - Exemplo: "Tenho que pagar 300 reais de aluguel no dia 5"
   - Receba notificações quando chegar a data
   - Visualize agendamentos pendentes, pagos e cancelados

4. 💬 CHAT DE IA FINANCEIRA
   - Faça perguntas sobre suas finanças
   - Receba conselhos personalizados baseados nos seus dados
   - Sugestões de economia e planejamento financeiro

5. 🏷️ CATEGORIZAÇÃO AUTOMÁTICA
   - Categorias comuns: comida, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
   - A IA categoriza automaticamente baseado na descrição

6. 👤 PERFIL E CONFIGURAÇÕES
   - Edite seus dados pessoais (nome, email)
   - Visualize status da conta (trial, ativo, expirado)
   - Gerencie planos de assinatura
   - Opção para receber instruções de como salvar o contato do WhatsApp

═══════════════════════════════════════════════════════════
💡 FORMAS LEGAIS E EFICIENTES DE USAR A PLATAFORMA
═══════════════════════════════════════════════════════════

DICAS DE USO:

1. REGISTRE TUDO RAPIDAMENTE
   - Envie mensagens logo após fazer uma compra ou receber um pagamento
   - Use frases naturais: "comprei café por 5 reais" funciona perfeitamente
   - Não precisa ser formal, a IA entende linguagem natural

2. USE ÁUDIO PARA SER MAIS RÁPIDO
   - Grave um áudio enquanto está na fila ou no trânsito
   - Exemplo: "Gastei 50 reais com gasolina e 30 com estacionamento"
   - A transcrição automática converte para texto

3. REGISTRE MÚLTIPLAS TRANSAÇÕES DE UMA VEZ
   - "Comprei pão por 5 reais, leite por 8 e café por 12"
   - A IA extrai todas as transações automaticamente

4. USE AGENDAMENTOS PARA PLANEJAR
   - Agende contas fixas no início do mês
   - Exemplo: "Tenho que pagar 800 de aluguel no dia 5 e 200 de internet no dia 10"
   - Receba lembretes automáticos

5. CONSULTE SEUS DADOS REGULARMENTE
   - Use o chat de IA para perguntar: "Quanto gastei com comida este mês?"
   - Visualize gráficos para identificar padrões de gasto
   - Use filtros para análises específicas

6. CATEGORIZE CORRETAMENTE
   - A IA tenta categorizar automaticamente, mas você pode ser específico
   - Exemplo: "comprei remédio por 50 reais" será categorizado como "saúde"

7. DIFERENCIE ENTRADAS E SAÍDAS
   - Entrada: "recebi", "me pagaram", "salário", "venda"
   - Saída: "comprei", "paguei", "gastei"
   - A IA detecta automaticamente, mas seja claro quando necessário

8. USE O PORTAL PARA ANÁLISES DETALHADAS
   - O WhatsApp é ótimo para registro rápido
   - O portal web é ideal para visualizar gráficos e fazer análises profundas

═══════════════════════════════════════════════════════════
📋 EXEMPLOS DE PERGUNTAS QUE VOCÊ PODE RESPONDER
═══════════════════════════════════════════════════════════

SOBRE FINANÇAS:
- "Como posso economizar mais dinheiro?"
- "Quanto estou gastando por mês?"
- "Qual minha maior categoria de gastos?"
- "Como criar um orçamento?"

SOBRE A PLATAFORMA:
- "Como registro uma transação?"
- "Como funciona o agendamento?"
- "Como usar o chat de IA?"
- "Quais categorias existem?"
- "Como editar meu perfil?"
- "Como salvar o contato do WhatsApp?"
- "Como visualizar meus gastos?"

═══════════════════════════════════════════════════════════
🎯 INSTRUÇÕES DE RESPOSTA
═══════════════════════════════════════════════════════════

Quando o usuário perguntar sobre:
- FINANÇAS: Use os dados financeiros fornecidos e dê conselhos práticos
- PLATAFORMA: Explique como usar as funcionalidades do FinanceZap de forma clara e passo a passo
- COMO FAZER ALGO: Dê instruções detalhadas e exemplos práticos

Sempre seja:
- Empático e encorajador
- Prático e objetivo
- Focado em soluções
- Claro nas explicações
- Use emojis quando apropriado para tornar a resposta mais amigável

Dados financeiros do usuário:
{ESTATISTICAS}

Histórico de transações recentes:
{TRANSACOES}

Responda à pergunta do usuário de forma clara, prática e útil. Se for sobre finanças, use os dados fornecidos. Se for sobre a plataforma, use o conhecimento acima.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function processarChatFinanceiro(
  mensagem: string,
  estatisticas: any,
  transacoes: any[]
): Promise<string> {
  const temGroq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '';
  const temGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';

  if (!temGroq && !temGemini) {
    throw new Error('Nenhuma API de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY no .env');
  }

  // Prepara o contexto financeiro
  const estatisticasTexto = `
- Total gasto: R$ ${estatisticas.totalGasto?.toFixed(2) || '0.00'}
- Total de transações: ${estatisticas.totalTransacoes || 0}
- Média por transação: R$ ${estatisticas.mediaGasto?.toFixed(2) || '0.00'}
- Maior gasto: R$ ${estatisticas.maiorGasto?.toFixed(2) || '0.00'}
- Menor gasto: R$ ${estatisticas.menorGasto?.toFixed(2) || '0.00'}
- Gasto hoje: R$ ${estatisticas.gastoHoje?.toFixed(2) || '0.00'}
- Gasto do mês: R$ ${estatisticas.gastoMes?.toFixed(2) || '0.00'}
  `.trim();

  const transacoesTexto = transacoes.slice(0, 10).map((t: any) => 
    `- ${t.descricao}: R$ ${t.valor.toFixed(2)} (${t.categoria})`
  ).join('\n');

  const promptCompleto = PROMPT_FINANCEIRO
    .replace('{ESTATISTICAS}', estatisticasTexto)
    .replace('{TRANSACOES}', transacoesTexto || 'Nenhuma transação recente');

  console.log('🔍 Chat IA - Verificando IAs disponíveis:');
  console.log(`   Groq: ${temGroq ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   Gemini: ${temGemini ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`   IA_PROVIDER configurado: ${IA_PROVIDER || 'auto (groq primeiro, depois gemini)'}`);

  // Se IA_PROVIDER estiver configurado, usa a IA especificada
  if (IA_PROVIDER === 'groq') {
    if (temGroq && groq) {
      try {
        console.log('🤖 Chat IA - Usando Groq (escolhido via IA_PROVIDER)');
        return await processarComGroq(mensagem, promptCompleto);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini como fallback...', error.message);
        if (temGemini && gemini) {
          return await processarComGemini(mensagem, promptCompleto);
        }
        throw error;
      }
    } else {
      throw new Error('IA_PROVIDER=groq configurado, mas GROQ_API_KEY não está definida');
    }
  } else if (IA_PROVIDER === 'gemini') {
    if (temGemini && gemini) {
      try {
        console.log('🤖 Chat IA - Usando Gemini (escolhido via IA_PROVIDER)');
        return await processarComGemini(mensagem, promptCompleto);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Gemini, tentando Groq como fallback...', error.message);
        if (temGroq && groq) {
          return await processarComGroq(mensagem, promptCompleto);
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
        console.log('🤖 Chat IA - Usando Groq (modo automático)');
        return await processarComGroq(mensagem, promptCompleto);
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini...', error.message);
        if (temGemini && gemini) {
          return await processarComGemini(mensagem, promptCompleto);
        }
        throw error;
      }
    } else if (temGemini && gemini) {
      console.log('🤖 Chat IA - Usando Gemini (modo automático)');
      return await processarComGemini(mensagem, promptCompleto);
    }
  }

  throw new Error('Nenhuma IA disponível');
}

async function processarComGroq(mensagem: string, contexto: string): Promise<string> {
  if (!groq) throw new Error('Groq não inicializado');

  try {
    console.log('🤖 Processando chat com Groq...');
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: contexto
        },
        {
          role: 'user',
          content: mensagem
        }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 1000
    });

    return completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';
  } catch (error: any) {
    console.error('❌ Erro ao processar com Groq:', error.message);
    throw error;
  }
}

async function processarComGemini(mensagem: string, contexto: string): Promise<string> {
  if (!gemini) throw new Error('Gemini não inicializado');

  try {
    console.log('🤖 Processando chat com Gemini...');
    const promptCompleto = `${contexto}\n\nPergunta do usuário: ${mensagem}`;
    
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptCompleto,
    });
    
    return response.text || 'Desculpe, não consegui processar sua mensagem.';
  } catch (error: any) {
    console.error('❌ Erro ao processar com Gemini:', error.message);
    throw error;
  }
}

