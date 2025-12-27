// Chat de IA para consultas financeiras

import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { formatarMoeda } from './formatadorMensagens';

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
const PROMPT_FINANCEIRO = `Você é um assistente inteligente do Zela, uma plataforma completa de gestão financeira pessoal via WhatsApp e portal web.

SUAS FUNÇÕES PRINCIPAIS:
1. Consultor financeiro pessoal - Analisar finanças e dar conselhos práticos
2. Suporte da plataforma - Responder dúvidas sobre como usar o Zela
3. Instrutor - Ensinar formas legais e eficientes de usar a plataforma

═══════════════════════════════════════════════════════════
📱 SOBRE O ZELA - CONHECIMENTO DA PLATAFORMA
═══════════════════════════════════════════════════════════

O Zela é uma plataforma que permite gerenciar suas finanças pessoais através de:
- WhatsApp: Envie mensagens de texto ou áudio com suas transações diretamente no WhatsApp
- Portal Web: Visualize gráficos, relatórios e estatísticas detalhadas

⚠️ IMPORTANTE: O Zela funciona principalmente via WhatsApp! Todas as transações e agendamentos devem ser enviados como mensagens no WhatsApp.

FUNCIONALIDADES PRINCIPAIS:

1. 📝 REGISTRO DE TRANSAÇÕES VIA WHATSAPP
   ⚠️ IMPORTANTE: Você DEVE enviar mensagens diretamente no WhatsApp do Zela!
   - A IA extrai automaticamente: descrição, valor, categoria, tipo (entrada/saída) e método de pagamento
   - Suporta múltiplas transações em uma única mensagem
   - Aceita mensagens de texto ou áudio (transcrição automática)
   
   📱 EXEMPLOS DE MENSAGENS QUE VOCÊ PODE ENVIAR NO WHATSAPP:
   
   💸 GASTOS (SAÍDAS):
   - "comprei um sanduíche por 20 reais"
   - "gastei 50 reais com gasolina"
   - "paguei 150 reais de conta de luz"
   - "comprei café por 5 reais e pão por 8 reais"
   - "gastei 30 reais no almoço e 15 no estacionamento"
   - "paguei 200 reais de internet no cartão de crédito"
   - "comprei remédio por 45 reais na farmácia"
   - "gastei 80 reais com uber hoje"
   
   💰 RECEITAS (ENTRADAS):
   - "recebi 500 reais do cliente"
   - "me pagaram 2000 reais de salário"
   - "recebi 300 reais de venda"
   - "o chefe acabou de me pagar 1500 reais"
   - "recebi pagamento de 800 reais"
   - "depositei 500 reais na conta"
   
   🎯 MÚLTIPLAS TRANSAÇÕES:
   - "comprei pão por 5 reais, leite por 8 e café por 12"
   - "gastei 50 com gasolina, 30 com almoço e 20 com estacionamento"
   - "recebi 1000 do cliente e paguei 200 de conta"
   
   💬 MENSAGENS DE ÁUDIO:
   - Você pode enviar áudios descrevendo suas transações
   - Exemplo: gravar "gastei 50 reais com gasolina e 30 com almoço"
   - A transcrição automática converte para texto

2. 📊 VISUALIZAÇÃO E ANÁLISE
   - Dashboard com estatísticas em tempo real
   - Gráficos de gastos por dia, mês e categoria
   - Métricas: Total gasto, média por transação, maior/menor gasto
   - Filtros por data, categoria, tipo e método de pagamento

3. 📅 AGENDAMENTOS VIA WHATSAPP
   ⚠️ IMPORTANTE: Você DEVE enviar mensagens diretamente no WhatsApp do Zela!
   - Agende pagamentos e recebimentos futuros enviando mensagens no WhatsApp
   - Receba notificações quando chegar a data
   - Visualize agendamentos pendentes, pagos e cancelados no portal web
   
   📱 EXEMPLOS DE MENSAGENS PARA AGENDAR (ENVIE NO WHATSAPP):
   - "tenho que pagar 300 reais de aluguel no dia 5"
   - "preciso pagar 200 de internet no dia 10"
   - "vou receber 1500 de salário no dia 1"
   - "tenho que pagar 500 de faculdade no dia 15"
   - "agende pagamento de 800 reais de aluguel para o dia 5"
   - "vou receber 2000 reais no dia 20"

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

1. REGISTRE TUDO RAPIDAMENTE VIA WHATSAPP
   ⚠️ IMPORTANTE: Envie as mensagens diretamente no WhatsApp do Zela!
   - Envie mensagens no WhatsApp logo após fazer uma compra ou receber um pagamento
   - Use frases naturais e simples - a IA entende perfeitamente
   - Exemplos que funcionam (ENVIE NO WHATSAPP):
     ✅ "comprei café por 5 reais"
     ✅ "gastei 50 conto com gasolina"
     ✅ "recebi 500 pila do cliente"
     ✅ "paguei 150 de luz"
   - Não precisa ser formal, escreva como você fala!

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
- "Como registro uma transação?" → ⚠️ Envie mensagens diretamente no WhatsApp do Zela! Exemplo: "comprei X por Y reais"
- "Como funciona o agendamento?" → ⚠️ Envie mensagens diretamente no WhatsApp do Zela! Exemplo: "tenho que pagar X no dia Y"
- "Como usar o chat de IA?" → Você está usando agora! Faça perguntas sobre suas finanças
- "Quais categorias existem?" → comida, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
- "Como editar meu perfil?" → Acesse Configurações no portal web
- "Como salvar o contato do WhatsApp?" → Vá em Configurações > Salvar Contato no portal web
- "Como visualizar meus gastos?" → Acesse o Dashboard no portal web para ver gráficos e relatórios

⚠️ LEMBRE-SE: Para registrar transações e agendamentos, você DEVE enviar mensagens diretamente no WhatsApp do Zela, não no portal web!

═══════════════════════════════════════════════════════════
🎯 INSTRUÇÕES DE RESPOSTA
═══════════════════════════════════════════════════════════

Quando o usuário perguntar sobre:
- FINANÇAS: Use os dados financeiros fornecidos e dê conselhos práticos
- PLATAFORMA: Explique como usar as funcionalidades do Zela de forma clara e passo a passo
- COMO FAZER ALGO: Dê instruções detalhadas e exemplos práticos

Sempre seja:
- Empático e encorajador
- Prático e objetivo
- Focado em soluções
- Claro nas explicações
- Use emojis quando apropriado para tornar a resposta mais amigável

⚠️ IMPORTANTE - QUANDO NÃO ENTENDER:
Se você não entender a pergunta do usuário, não tente inventar uma resposta. Em vez disso, responda EXATAMENTE com esta mensagem amigável:
"Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!"

Dados financeiros do usuário:
{ESTATISTICAS}

Histórico de transações recentes:
{TRANSACOES}

Responda à pergunta do usuário de forma clara, prática e útil. Se for sobre finanças, use os dados fornecidos. Se for sobre a plataforma, use o conhecimento acima. Se não entender, use a mensagem amigável especificada acima.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function processarChatFinanceiro(
  mensagem: string,
  estatisticas: any,
  transacoes: any[],
  historico?: string
): Promise<string> {
  const temGroq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '';
  const temGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';

  if (!temGroq && !temGemini) {
    throw new Error('Nenhuma API de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY no .env');
  }

  // Prepara o contexto financeiro
  const estatisticasTexto = `
- Total gasto: ${formatarMoeda(estatisticas.totalGasto || 0)}
- Total de transações: ${estatisticas.totalTransacoes || 0}
- Média por transação: ${formatarMoeda(estatisticas.mediaGasto || 0)}
- Maior gasto: ${formatarMoeda(estatisticas.maiorGasto || 0)}
- Menor gasto: ${formatarMoeda(estatisticas.menorGasto || 0)}
- Gasto hoje: ${formatarMoeda(estatisticas.gastoHoje || 0)}
- Gasto do mês: ${formatarMoeda(estatisticas.gastoMes || 0)}
  `.trim();

  const transacoesTexto = transacoes.slice(0, 10).map((t: any) => 
    `- ${t.descricao}: ${formatarMoeda(t.valor)} (${t.categoria})`
  ).join('\n');

  // MELHORIA: Adiciona histórico de conversação ao prompt
  const historicoTexto = historico ? `\n\nHistórico da conversa:\n${historico}` : '';
  
  const promptCompleto = PROMPT_FINANCEIRO
    .replace('{ESTATISTICAS}', estatisticasTexto)
    .replace('{TRANSACOES}', transacoesTexto || 'Nenhuma transação recente')
    + historicoTexto;

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

// Função auxiliar para verificar se a resposta indica que não entendeu
function verificarSeNaoEntendeu(resposta: string): boolean {
  const respostaLower = resposta.toLowerCase();
  const indicadoresNaoEntendeu = [
    'não entendi',
    'não compreendi',
    'não consegui entender',
    'não sei',
    'não tenho certeza',
    'não tenho informações',
    'não posso ajudar',
    'não consigo',
    'desculpe, mas',
    'lamento, mas',
    'não tenho dados',
    'não tenho acesso',
    'não posso responder',
    'não faço ideia',
    'não tenho conhecimento'
  ];
  
  // Verifica se a resposta contém algum indicador de não entendimento
  const temIndicador = indicadoresNaoEntendeu.some(indicador => 
    respostaLower.includes(indicador)
  );
  
  // Também verifica se a resposta é muito curta ou genérica
  const respostaMuitoCurta = resposta.trim().length < 30;
  const respostaGenerica = respostaLower.includes('desculpe') && 
                          (respostaLower.includes('não consegui') || 
                           respostaLower.includes('não posso'));
  
  return temIndicador || (respostaMuitoCurta && respostaGenerica);
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

    const resposta = completion.choices[0]?.message?.content || '';
    
    // Verifica se a IA não entendeu e substitui por mensagem amigável
    if (!resposta || verificarSeNaoEntendeu(resposta)) {
      console.log('⚠️  IA não entendeu a mensagem, retornando resposta amigável');
      return 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
    }
    
    return resposta;
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
    
    const resposta = response.text || '';
    
    // Verifica se a IA não entendeu e substitui por mensagem amigável
    if (!resposta || verificarSeNaoEntendeu(resposta)) {
      console.log('⚠️  IA não entendeu a mensagem, retornando resposta amigável');
      return 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
    }
    
    return resposta;
  } catch (error: any) {
    console.error('❌ Erro ao processar com Gemini:', error.message);
    throw error;
  }
}

