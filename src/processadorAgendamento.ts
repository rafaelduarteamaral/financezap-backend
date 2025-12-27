// Processador de mensagens para detectar agendamentos de pagamentos/recebimentos

import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

const groq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '' 
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const geminiApiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';
const gemini = geminiApiKey 
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  : null;

export interface AgendamentoExtraido {
  descricao: string;
  valor: number;
  dataAgendamento: string; // YYYY-MM-DD
  tipo: 'pagamento' | 'recebimento';
  categoria?: string;
  recorrente?: boolean;
  totalParcelas?: number;
  sucesso: boolean;
}

/**
 * Processa mensagem para detectar agendamentos de pagamentos/recebimentos
 * Exemplos:
 * - "agendar pagamento de boleto de 500 reais para dia 15/12"
 * - "lembrar de pagar conta de luz de 200 reais no dia 20"
 * - "agendar recebimento de 1000 reais para 25/12"
 */
export async function processarAgendamentoComIA(mensagem: string): Promise<AgendamentoExtraido | null> {
  const temGroq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '';
  const temGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';

  if (!temGroq && !temGemini) {
    return null;
  }

  // Verifica se a mensagem parece ser sobre agendamento
  const palavrasAgendamento = [
    'agendar', 'agende', 'agendamento', 'agendado', 'agenda',
    'lembrar', 'lembre-me', 'lembre me', 'lembrete',
    'boleto', 'conta', 'pagamento', 'recebimento', 
    'para dia', 'no dia', 'dia ', 'data ', 
    'vencimento', 'vencer', 'vencerá', 'vence',
    'marcar', 'marcado', 'programar', 'programado'
  ];

  const mensagemLower = mensagem.toLowerCase();
  const temPalavraAgendamento = palavrasAgendamento.some(palavra => 
    mensagemLower.includes(palavra)
  );

  console.log(`   🔍 Verificando se é agendamento: "${mensagem}"`);
  console.log(`      Palavras-chave encontradas: ${temPalavraAgendamento ? 'SIM' : 'NÃO'}`);

  if (!temPalavraAgendamento) {
    console.log('   ❌ Não detectado como agendamento (sem palavras-chave)');
    return null;
  }

  try {
    if (temGroq && groq) {
      return await processarAgendamentoComGroq(mensagem);
    } else if (temGemini && gemini) {
      return await processarAgendamentoComGemini(mensagem);
    }
  } catch (error: any) {
    console.error('❌ Erro ao processar agendamento com IA:', error.message);
    return null;
  }

  return null;
}

async function processarAgendamentoComGroq(mensagem: string): Promise<AgendamentoExtraido | null> {
  if (!groq) return null;

  try {
    const prompt = `Analise a seguinte mensagem e extraia informações sobre um agendamento de pagamento ou recebimento.

Mensagem: "${mensagem}"

Retorne APENAS um JSON válido com o seguinte formato:
{
  "descricao": "descrição do agendamento (ex: boleto, conta de luz, recebimento de salário)",
  "valor": 500.00,
  "dataAgendamento": "2025-12-15",
  "tipo": "pagamento",
  "categoria": "contas",
  "recorrente": false,
  "totalParcelas": null
}

Regras:
- Se a mensagem menciona "agendar pagamento", "pagar", "boleto", "conta" = tipo "pagamento"
- Se a mensagem menciona "agendar recebimento", "receber", "salário", "pagamento recebido" = tipo "recebimento"
- A data deve ser no formato YYYY-MM-DD
- Se a data mencionada é apenas dia/mês (ex: "15/12"), assuma o ano atual
- Se não mencionar data específica, retorne null
- O valor deve ser um número (sem R$ ou "reais")
- A descrição deve ser clara e objetiva
- Categorias comuns: contas, boleto, salário, serviços, outros
- IMPORTANTE: Se a mensagem menciona "parcelas", "parcela", "vezes", "x" (ex: "8 parcelas", "em 8x", "8 vezes"):
  - "recorrente" deve ser true
  - "totalParcelas" deve ser o número de parcelas mencionado
  - Exemplo: "boleto em 8 parcelas" -> {"recorrente": true, "totalParcelas": 8}

Se não houver informações suficientes para criar um agendamento, retorne null.
Retorne APENAS o JSON, sem texto adicional.`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente especializado em extrair informações de agendamentos financeiros. Sempre retorne JSON válido ou null.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
    });

    const resposta = completion.choices[0]?.message?.content || '';
    
    // Função auxiliar para extrair JSON válido
    function extrairJSON(texto: string): any {
      let limpo = texto.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

      // Remove texto antes do primeiro {
      const primeiroBrace = limpo.indexOf('{');
      if (primeiroBrace > 0) {
        limpo = limpo.substring(primeiroBrace);
      }
      
      // Remove texto depois do último }
      const ultimoBrace = limpo.lastIndexOf('}');
      if (ultimoBrace >= 0 && ultimoBrace < limpo.length - 1) {
        limpo = limpo.substring(0, ultimoBrace + 1);
      }
      
      if (limpo.toLowerCase() === 'null' || limpo.trim() === '') {
        return null;
      }
      
      const jsonMatch = limpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          const jsonProfundo = limpo.match(/\{[\s\S]*?\}/);
          if (jsonProfundo) {
            try {
              return JSON.parse(jsonProfundo[0]);
            } catch (e2) {
              return null;
            }
          }
        }
      }
      
      try {
        return JSON.parse(limpo);
      } catch (e) {
        return null;
      }
    }

    const resultado = extrairJSON(resposta);
    
    if (!resultado) {
      return null;
    }

    if (!resultado.descricao || !resultado.valor || !resultado.dataAgendamento) {
      return null;
    }

    // Normaliza a data
    let dataNormalizada = resultado.dataAgendamento;
    if (dataNormalizada.includes('/')) {
      const partes = dataNormalizada.split('/');
      if (partes.length === 2) {
        // Dia/mês - adiciona ano atual
        const hoje = new Date();
        dataNormalizada = `${hoje.getFullYear()}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
      } else if (partes.length === 3) {
        // Dia/mês/ano
        dataNormalizada = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
      }
    }

    return {
      descricao: resultado.descricao,
      valor: parseFloat(resultado.valor) || 0,
      dataAgendamento: dataNormalizada,
      tipo: (resultado.tipo === 'recebimento' ? 'recebimento' : 'pagamento') as 'pagamento' | 'recebimento',
      categoria: resultado.categoria || 'outros',
      recorrente: resultado.recorrente === true || (resultado.totalParcelas && resultado.totalParcelas > 1),
      totalParcelas: resultado.totalParcelas && resultado.totalParcelas > 1 ? Number(resultado.totalParcelas) : undefined,
      sucesso: true,
    };
  } catch (error: any) {
    console.error('❌ Erro ao processar agendamento com Groq:', error.message);
    return null;
  }
}

async function processarAgendamentoComGemini(mensagem: string): Promise<AgendamentoExtraido | null> {
  if (!gemini) return null;

  try {
    const prompt = `Analise a seguinte mensagem e extraia informações sobre um agendamento de pagamento ou recebimento.

Mensagem: "${mensagem}"

Retorne APENAS um JSON válido com o seguinte formato:
{
  "descricao": "descrição do agendamento",
  "valor": 500.00,
  "dataAgendamento": "2025-12-15",
  "tipo": "pagamento",
  "categoria": "contas"
}

Regras IMPORTANTES:
- Se menciona "agendar pagamento", "pagar", "boleto", "conta", "luz", "água", "energia" = tipo "pagamento"
- Se menciona "agendar recebimento", "receber", "salário", "pagamento recebido" = tipo "recebimento"
- A data deve ser no formato YYYY-MM-DD
- Se a data mencionada é apenas dia (ex: "dia 25"), assuma o mês atual e ano atual
- Se a data mencionada é dia/mês (ex: "25/12"), assuma o ano atual
- O valor DEVE ser extraído da mensagem. Se não houver valor explícito, tente inferir ou use 0
- Se não houver informações suficientes (especialmente data), retorne null
- IMPORTANTE: Se não houver valor na mensagem, você DEVE tentar inferir ou perguntar, mas se não conseguir, use 0

Exemplos:
- "agende um boleto de luz pro dia 25" -> {"descricao": "Conta de luz", "valor": 0, "dataAgendamento": "2025-12-25", "tipo": "pagamento", "categoria": "contas"}
- "agendar pagamento de 500 reais para dia 15/12" -> {"descricao": "Pagamento", "valor": 500, "dataAgendamento": "2025-12-15", "tipo": "pagamento", "categoria": "outros"}`;

    console.log('   🤖 Processando agendamento com Gemini...');
    
    // Usa a mesma abordagem do processadorIA.ts
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const texto = response.text || '';
    console.log(`   📝 Resposta do Gemini: ${texto.substring(0, 200)}...`);

    let jsonStr = texto.trim();

    // Remove markdown code blocks
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    if (jsonStr.toLowerCase() === 'null' || jsonStr.trim() === '') {
      return null;
    }

    const resultado = JSON.parse(jsonStr);

    if (!resultado.descricao || !resultado.valor || !resultado.dataAgendamento) {
      return null;
    }

    // Normaliza a data
    let dataNormalizada = resultado.dataAgendamento;
    if (dataNormalizada.includes('/')) {
      const partes = dataNormalizada.split('/');
      if (partes.length === 2) {
        const hoje = new Date();
        dataNormalizada = `${hoje.getFullYear()}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
      } else if (partes.length === 3) {
        dataNormalizada = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
      }
    }

    return {
      descricao: resultado.descricao,
      valor: parseFloat(resultado.valor) || 0,
      dataAgendamento: dataNormalizada,
      tipo: (resultado.tipo === 'recebimento' ? 'recebimento' : 'pagamento') as 'pagamento' | 'recebimento',
      categoria: resultado.categoria || 'outros',
      recorrente: resultado.recorrente === true || (resultado.totalParcelas && resultado.totalParcelas > 1),
      totalParcelas: resultado.totalParcelas && resultado.totalParcelas > 1 ? Number(resultado.totalParcelas) : undefined,
      sucesso: true,
    };
  } catch (error: any) {
    console.error('❌ Erro ao processar agendamento com Gemini:', error.message);
    return null;
  }
}

