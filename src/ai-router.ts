import { formatarMoeda } from './formatadorMensagens';
import { formatarMensagemTransacao } from './formatadorTransacoes';

export interface EndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  exampleMessages: string[];
  requiredParams?: string[];
  optionalParams?: string[];
  responseFormatter: (data: any, request: any) => string | { message: string; buttons?: Array<{ id: string; label: string }> };
}

export const ENDPOINTS_CONFIG: EndpointConfig[] = [
  {
    method: 'GET',
    path: '/api/transacoes',
    description: 'Lista todas as transações do usuário. Pode filtrar por data, tipo, categoria.',
    exampleMessages: [
      'mostre minhas transações',
      'quais são minhas transações',
      'lista de transações',
      'ver transações',
      'transações do mês'
    ],
    optionalParams: ['dataInicio', 'dataFim', 'tipo', 'categoria', 'limit'],
    responseFormatter: (data: any) => {
      if (!data.transacoes || data.transacoes.length === 0) {
        return '📋 Você não possui transações registradas ainda.';
      }
      let resposta = `📋 *Suas Transações* (${data.transacoes.length})\n\n`;
      data.transacoes.slice(0, 10).forEach((t: any, index: number) => {
        const emoji = t.tipo === 'entrada' ? '💰' : '🔴';
        const dataFormatada = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
        resposta += `${index + 1}. ${emoji} ${t.descricao}\n`;
        resposta += `   ${formatarMoeda(t.valor)} • ${dataFormatada}\n`;
        resposta += `   ${t.categoria || 'outros'} • ${t.metodo || 'debito'}\n\n`;
      });
      if (data.transacoes.length > 10) {
        resposta += `\n💡 Mostrando 10 de ${data.transacoes.length} transações.`;
      }
      return resposta;
    }
  },
  {
    method: 'POST',
    path: '/api/transacoes',
    description: 'Cria uma nova transação financeira (entrada ou saída).',
    exampleMessages: [
      'comprei pizza por 50 reais',
      'gastei 100 reais',
      'recebi 500 reais',
      'paguei conta de luz',
      'registrar transação'
    ],
    requiredParams: ['descricao', 'valor', 'tipo'],
    optionalParams: ['categoria', 'metodo', 'data', 'carteiraId'],
    responseFormatter: (data: any) => {
      if (data.success && data.transacao?.id) {
        const transacao = data.transacao;
        
        // Usa o formatador original que já tem o formato completo
        const mensagem = formatarMensagemTransacao({
          descricao: transacao.descricao || 'N/A',
          valor: transacao.valor || 0,
          categoria: transacao.categoria || 'outros',
          tipo: transacao.tipo === 'entrada' ? 'entrada' : 'saida',
          metodo: (transacao.metodo && transacao.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito',
          carteiraNome: transacao.carteira?.nome || transacao.carteiraNome || '—',
          data: transacao.data,
          id: transacao.id
        });
        
        return {
          message: mensagem,
          buttons: [
            { id: `excluir_transacao_${transacao.id}`, label: '🗑️ Excluir Transação' }
          ]
        };
      }
      return `❌ Erro ao registrar transação: ${data.error || 'Erro desconhecido'}`;
    }
  },
  {
    method: 'DELETE',
    path: '/api/transacoes/:id',
    description: 'Remove uma transação específica pelo ID.',
    exampleMessages: [
      'excluir transação 123',
      'remover transação',
      'deletar transação',
      'apagar transação'
    ],
    requiredParams: ['id'],
    responseFormatter: (data: any) => {
      if (data.success) {
        return '✅ Transação excluída com sucesso!';
      }
      return `❌ Erro ao excluir: ${data.error || 'Erro desconhecido'}`;
    }
  },
  {
    method: 'GET',
    path: '/api/estatisticas',
    description: 'Obtém estatísticas financeiras (gastos, receitas, saldo, etc). Pode filtrar por período.',
    exampleMessages: [
      'estatísticas',
      'resumo financeiro',
      'estatisticas do mês',
      'gastos do mês',
      'receitas do mês',
      'saldo',
      'qual meu gasto de hoje',
      'gasto de hoje',
      'quanto gastei hoje',
      'gastos de hoje',
      'resumo de hoje',
      'quanto gastei',
      'meus gastos',
      'minhas despesas',
      'qual meu gasto',
      'meu gasto hoje',
      'gastos hoje',
      'quanto eu gastei hoje',
      'quanto foi meu gasto hoje',
      'resumo financeiro de hoje',
      'estatísticas de hoje',
      'estatisticas hoje'
    ],
    optionalParams: ['dataInicio', 'dataFim'],
    responseFormatter: (data: any) => {
      // O endpoint retorna diretamente as estatísticas, não dentro de um objeto 'estatisticas'
      const stats = data.estatisticas || data;
      
      if (!stats || (stats.totalEntradas === undefined && stats.totalSaidas === undefined)) {
        return '📊 Não há estatísticas disponíveis.';
      }
      
      const saldo = (stats.totalEntradas || 0) - (stats.totalSaidas || 0);
      
      let resposta = `📊 *Resumo Financeiro*\n\n`;
      
      // Se for resumo do dia, mostra gasto de hoje
      if (stats.gastoHoje !== undefined) {
        resposta += `💸 Gasto hoje: ${formatarMoeda(stats.gastoHoje || 0)}\n`;
      }
      
      resposta += `💰 Total de Entradas: ${formatarMoeda(stats.totalEntradas || 0)}\n`;
      resposta += `🔴 Total de Despesas: ${formatarMoeda(stats.totalSaidas || 0)}\n`;
      resposta += `💵 Saldo: ${formatarMoeda(saldo)}\n`;
      resposta += `📝 Total de Transações: ${stats.totalTransacoes || 0}`;
      
      if (stats.periodo) {
        resposta += `\n📅 Período: ${stats.periodo}`;
      }
      
      return resposta;
    }
  },
  {
    method: 'GET',
    path: '/api/gastos-por-dia',
    description: 'Obtém gastos agrupados por dia.',
    exampleMessages: [
      'gastos por dia',
      'gastos diários',
      'gastos do dia'
    ],
    optionalParams: ['dataInicio', 'dataFim'],
    responseFormatter: (data: any) => {
      if (!data.gastos || data.gastos.length === 0) {
        return '📊 Não há gastos registrados no período.';
      }
      let resposta = '📊 *Gastos Por Dia*\n\n';
      data.gastos.slice(0, 7).forEach((g: any) => {
        const dataFormatada = new Date(g.data + 'T00:00:00').toLocaleDateString('pt-BR');
        resposta += `${dataFormatada}: ${formatarMoeda(g.total || 0)}\n`;
      });
      return resposta;
    }
  },
  {
    method: 'GET',
    path: '/api/categorias',
    description: 'Lista todas as categorias de transações.',
    exampleMessages: [
      'mostre minhas categorias',
      'listar categorias',
      'categorias disponíveis'
    ],
    responseFormatter: (data: any) => {
      if (!data.categorias || data.categorias.length === 0) {
        return '🏷️ Você não possui categorias cadastradas.';
      }
      let resposta = '🏷️ *Suas Categorias*\n\n';
      data.categorias.forEach((cat: any, index: number) => {
        resposta += `${index + 1}. ${cat.nome}\n`;
        if (cat.descricao) {
          resposta += `   ${cat.descricao}\n`;
        }
        resposta += '\n';
      });
      return resposta;
    }
  },
  {
    method: 'POST',
    path: '/api/categorias',
    description: 'Cria uma nova categoria.',
    exampleMessages: [
      'criar categoria alimentação',
      'nova categoria',
      'adicionar categoria'
    ],
    requiredParams: ['nome'],
    optionalParams: ['descricao', 'cor'],
    responseFormatter: (data: any) => {
      if (data.success) {
        return `✅ Categoria "${data.categoria?.nome || 'N/A'}" criada com sucesso!`;
      }
      return `❌ Erro ao criar categoria: ${data.error || 'Erro desconhecido'}`;
    }
  },
  {
    method: 'GET',
    path: '/api/carteiras',
    description: 'Lista todas as carteiras do usuário.',
    exampleMessages: [
      'mostre minhas carteiras',
      'listar carteiras',
      'carteiras disponíveis',
      'ver carteiras'
    ],
    responseFormatter: (data: any) => {
      if (!data.carteiras || data.carteiras.length === 0) {
        return '💳 Você não possui carteiras cadastradas.';
      }
      let resposta = '💳 *Suas Carteiras*\n\n';
      data.carteiras.forEach((cart: any, index: number) => {
        const padrao = cart.padrao ? ' ⭐ (Padrão)' : '';
        resposta += `${index + 1}. ${cart.nome}${padrao}\n`;
        if (cart.descricao) {
          resposta += `   ${cart.descricao}\n`;
        }
        resposta += '\n';
      });
      return resposta;
    }
  },
  {
    method: 'POST',
    path: '/api/carteiras',
    description: 'Cria uma nova carteira.',
    exampleMessages: [
      'criar carteira',
      'nova carteira',
      'adicionar carteira'
    ],
    requiredParams: ['nome'],
    optionalParams: ['descricao', 'padrao'],
    responseFormatter: (data: any) => {
      if (data.success) {
        return `✅ Carteira "${data.carteira?.nome || 'N/A'}" criada com sucesso!`;
      }
      return `❌ Erro ao criar carteira: ${data.error || 'Erro desconhecido'}`;
    }
  },
  {
    method: 'GET',
    path: '/api/agendamentos',
    description: 'Lista todos os agendamentos do usuário.',
    exampleMessages: [
      'mostre meus agendamentos',
      'listar agendamentos',
      'agendamentos pendentes',
      'ver agendamentos'
    ],
    optionalParams: ['status', 'dataInicio', 'dataFim'],
    responseFormatter: (data: any) => {
      if (!data.agendamentos || data.agendamentos.length === 0) {
        return '📅 Você não possui agendamentos registrados.';
      }
      let resposta = `📅 *Seus Agendamentos* (${data.agendamentos.length})\n\n`;
      data.agendamentos.slice(0, 10).forEach((a: any, index: number) => {
        const emoji = a.status === 'pago' ? '✅' : a.status === 'cancelado' ? '❌' : '⏳';
        const dataFormatada = new Date(a.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
        resposta += `${index + 1}. ${emoji} ${a.descricao}\n`;
        resposta += `   ${formatarMoeda(a.valor || 0)} • ${dataFormatada}\n`;
        resposta += `   Status: ${a.status || 'pendente'}\n\n`;
      });
      if (data.agendamentos.length > 10) {
        resposta += `\n💡 Mostrando 10 de ${data.agendamentos.length} agendamentos.`;
      }
      return resposta;
    }
  },
  {
    method: 'POST',
    path: '/api/agendamentos',
    description: 'Cria um novo agendamento financeiro.',
    exampleMessages: [
      'agendar pagamento',
      'criar agendamento',
      'agendar transação',
      'lembrar de pagar'
    ],
    requiredParams: ['descricao', 'valor', 'dataAgendamento', 'tipo'],
    optionalParams: ['categoria', 'recorrente', 'totalParcelas'],
    responseFormatter: (data: any) => {
      if (data.success) {
        return `✅ *Agendamento Criado Com Sucesso!*\n\n` +
          `📄 Descrição: ${data.agendamento?.descricao || 'N/A'}\n` +
          `💰 Valor: ${formatarMoeda(data.agendamento?.valor || 0)}\n` +
          `📅 Data: ${data.agendamento?.dataAgendamento ? new Date(data.agendamento.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}\n` +
          `🔄 Tipo: ${data.agendamento?.tipo === 'recebimento' ? '💰 Recebimento' : '🔴 Pagamento'}\n` +
          `⏳ Status: ${data.agendamento?.status || 'pendente'}`;
      }
      return `❌ Erro ao criar agendamento: ${data.error || 'Erro desconhecido'}`;
    }
  },
  {
    method: 'PUT',
    path: '/api/agendamentos/:id',
    description: 'Atualiza um agendamento existente.',
    exampleMessages: [
      'atualizar agendamento',
      'editar agendamento',
      'modificar agendamento'
    ],
    requiredParams: ['id'],
    optionalParams: ['descricao', 'valor', 'dataAgendamento', 'status', 'tipo'],
    responseFormatter: (data: any) => {
      if (data.success) {
        return '✅ Agendamento atualizado com sucesso!';
      }
      return `❌ Erro ao atualizar: ${data.error || 'Erro desconhecido'}`;
    }
  },
  {
    method: 'DELETE',
    path: '/api/agendamentos/:id',
    description: 'Remove um agendamento específico.',
    exampleMessages: [
      'excluir agendamento',
      'remover agendamento',
      'cancelar agendamento'
    ],
    requiredParams: ['id'],
    responseFormatter: (data: any) => {
      if (data.success) {
        return '✅ Agendamento removido com sucesso!';
      }
      return `❌ Erro ao remover: ${data.error || 'Erro desconhecido'}`;
    }
  },
  {
    method: 'GET',
    path: '/api/notificacoes',
    description: 'Lista notificações não lidas do usuário.',
    exampleMessages: [
      'notificações',
      'avisos',
      'alertas',
      'ver notificações'
    ],
    responseFormatter: (data: any) => {
      if (!data.notificacoes || data.notificacoes.length === 0) {
        return '🔔 Você não possui notificações não lidas.';
      }
      let resposta = `🔔 *Suas Notificações* (${data.notificacoes.length})\n\n`;
      data.notificacoes.forEach((notif: any, index: number) => {
        resposta += `${index + 1}. ${notif.titulo || 'Notificação'}\n`;
        if (notif.mensagem) {
          resposta += `   ${notif.mensagem}\n`;
        }
        resposta += '\n';
      });
      return resposta;
    }
  },
  {
    method: 'GET',
    path: '/api/auth/verify',
    description: 'Verifica o status de autenticação e retorna dados do usuário.',
    exampleMessages: [
      'meus dados',
      'perfil',
      'informações do usuário',
      'ver perfil'
    ],
    responseFormatter: (data: any) => {
      if (data.usuario) {
        const usuario = data.usuario;
        return `👤 *Seu Perfil*\n\n` +
          `📱 Telefone: ${usuario.telefone || 'N/A'}\n` +
          `📛 Nome: ${usuario.nome || 'Não informado'}\n` +
          `📧 Email: ${usuario.email || 'Não informado'}\n` +
          `🔄 Status: ${usuario.status || 'N/A'}\n` +
          (usuario.plano ? `📦 Plano: ${usuario.plano}\n` : '');
      }
      return '❌ Erro ao obter dados do usuário.';
    }
  },
  {
    method: 'PUT',
    path: '/api/auth/perfil',
    description: 'Atualiza o perfil do usuário (nome, email, etc).',
    exampleMessages: [
      'atualizar perfil',
      'editar perfil',
      'alterar nome',
      'mudar email'
    ],
    optionalParams: ['nome', 'email'],
    responseFormatter: (data: any) => {
      if (data.success) {
        return '✅ Perfil atualizado com sucesso!';
      }
      return `❌ Erro ao atualizar perfil: ${data.error || 'Erro desconhecido'}`;
    }
  }
];

/**
 * Usa IA para decidir qual endpoint chamar baseado na mensagem do usuário
 */
export async function decidirEndpointComIA(
  mensagem: string,
  contexto: any[],
  env: any
): Promise<{ endpoint: EndpointConfig; params: Record<string, any> } | null> {
  const temGroq = env.GROQ_API_KEY && env.GROQ_API_KEY.trim() !== '';
  const temGemini = env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim() !== '';
  const IA_PROVIDER = (env.IA_PROVIDER || '').toLowerCase().trim();

  if (!temGroq && !temGemini) {
    return null;
  }

  // Prepara descrição dos endpoints para a IA
  const endpointsDescricao = ENDPOINTS_CONFIG.map((ep, index) => {
    return `${index + 1}. ${ep.method} ${ep.path}\n` +
      `   Descrição: ${ep.description}\n` +
      `   Exemplos: ${ep.exampleMessages.slice(0, 3).join(', ')}\n` +
      (ep.requiredParams ? `   Parâmetros obrigatórios: ${ep.requiredParams.join(', ')}\n` : '') +
      (ep.optionalParams ? `   Parâmetros opcionais: ${ep.optionalParams.join(', ')}\n` : '');
  }).join('\n');

  const prompt = `Você é um assistente que decide qual endpoint de API chamar baseado na mensagem do usuário.

ENDPOINTS DISPONÍVEIS:
${endpointsDescricao}

MENSAGEM DO USUÁRIO: "${mensagem}"

CONTEXTO DA CONVERSA:
${contexto.length > 0 ? contexto.slice(-5).map((c: any) => `${c.role}: ${c.content}`).join('\n') : 'Nenhum contexto anterior'}

INSTRUÇÕES:
1. Analise a mensagem do usuário e identifique qual endpoint melhor atende a solicitação
2. Extraia os parâmetros necessários da mensagem
3. Se a mensagem mencionar um ID (número), inclua no parâmetro "id"
4. Se mencionar valores monetários, extraia e converta para número
5. Se mencionar datas, tente extrair e formatar como YYYY-MM-DD
6. Se mencionar tipo (entrada/saída, recebimento/pagamento), mapeie corretamente
7. IMPORTANTE: Mensagens sobre "gasto de hoje", "gastos de hoje", "quanto gastei hoje", "qual meu gasto", "resumo de hoje", "estatísticas de hoje" devem usar o endpoint GET /api/estatisticas
8. Se a mensagem mencionar "hoje", extraia a data de hoje no formato YYYY-MM-DD e inclua em "dataInicio" e "dataFim"
9. Se não conseguir identificar um endpoint adequado, retorne null

IMPORTANTE: Retorne APENAS o JSON, sem nenhum texto adicional antes ou depois. Não inclua explicações, comentários ou texto descritivo.

Retorne APENAS um JSON válido no formato:
{
  "endpointIndex": <número do índice do endpoint (0-based)>,
  "params": {
    "param1": "valor1",
    "param2": 123,
    ...
  }
}

Se não houver endpoint adequado, retorne:
{
  "endpointIndex": null,
  "params": {}
}

NÃO inclua texto como "Aqui está", "Segue", "JSON:", etc. Apenas o JSON puro.`;

  try {
    let resposta: string;

    if (temGroq) {
      try {
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content: 'Você é um assistente especializado em roteamento de APIs. IMPORTANTE: Retorne APENAS JSON válido, sem nenhum texto adicional, explicações ou comentários. Apenas o JSON puro.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.1,
            max_tokens: 500
          }),
        });

        if (!groqResponse.ok) {
          throw new Error(`Groq API error: ${groqResponse.status}`);
        }

        const groqData: any = await groqResponse.json();
        resposta = groqData.choices[0]?.message?.content || '{}';
      } catch (error: any) {
        if (temGemini) {
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: prompt }]
                }]
              }),
            }
          );

          if (!geminiResponse.ok) {
            throw new Error(`Gemini API error: ${geminiResponse.status}`);
          }

          const geminiData: any = await geminiResponse.json();
          resposta = geminiData.candidates[0]?.content?.parts[0]?.text || '{}';
        } else {
          throw error;
        }
      }
    } else if (temGemini) {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }]
          }),
        }
      );

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const geminiData: any = await geminiResponse.json();
      resposta = geminiData.candidates[0]?.content?.parts[0]?.text || '{}';
    } else {
      throw new Error('Nenhuma IA disponível');
    }

    // Função auxiliar para extrair JSON válido da resposta
    function extrairJSON(texto: string): any {
      // Remove markdown code blocks
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
      
      // Tenta encontrar o primeiro objeto JSON válido (greedy match)
      const jsonMatch = limpo.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // Se falhar, tenta encontrar o JSON mais interno (non-greedy)
          const jsonProfundo = limpo.match(/\{[\s\S]*?\}/);
          if (jsonProfundo) {
            try {
              return JSON.parse(jsonProfundo[0]);
            } catch (e2) {
              // Ignora
            }
          }
        }
      }
      
      // Se não encontrou, tenta parse direto
      try {
        return JSON.parse(limpo);
      } catch (e) {
        throw new Error(`Resposta da IA não contém JSON válido: ${texto.substring(0, 200)}...`);
      }
    }

    const decisao = extrairJSON(resposta);

    if (decisao.endpointIndex === null || decisao.endpointIndex === undefined) {
      return null;
    }

    const endpoint = ENDPOINTS_CONFIG[decisao.endpointIndex];
    if (!endpoint) {
      console.error(`❌ Índice de endpoint inválido: ${decisao.endpointIndex}`);
      return null;
    }

    return {
      endpoint,
      params: decisao.params || {}
    };
  } catch (error: any) {
    console.error('❌ Erro ao decidir endpoint com IA:', error.message);
    return null;
  }
}

/**
 * Chama um endpoint interno via HTTP (mesmo worker)
 * Como estamos no mesmo worker, fazemos uma chamada HTTP interna
 */
export async function chamarEndpointInterno(
  endpoint: EndpointConfig,
  params: Record<string, any>,
  telefone: string,
  token: string,
  baseUrl: string,
  env: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Substitui parâmetros na URL
    let url = endpoint.path;
    const urlParams: Record<string, string> = {};
    Object.keys(params).forEach(key => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(params[key]));
        urlParams[key] = String(params[key]);
        delete params[key]; // Remove do body se estava na URL
      }
    });

    // Prepara body para POST/PUT
    let body: any = undefined;
    if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
      body = params;
    }

    // Prepara query params para GET
    let queryParams = '';
    if (endpoint.method === 'GET' && Object.keys(params).length > 0) {
      queryParams = '?' + new URLSearchParams(
        Object.entries(params).reduce((acc, [k, v]) => {
          if (v !== undefined && v !== null) {
            acc[k] = String(v);
          }
          return acc;
        }, {} as Record<string, string>)
      ).toString();
    }

    // Usa a URL base do worker atual
    const workerUrl = baseUrl || 'https://financezap.rafael-damaral.workers.dev';
    const fullUrl = `${workerUrl}${url}${queryParams}`;

    if (body) {
    }

    // Faz a chamada HTTP interna (mesmo worker)
    const response = await fetch(fullUrl, {
      method: endpoint.method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: any;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      // Se não for JSON, trata como erro
      return {
        success: false,
        error: responseText || `Erro HTTP ${response.status}`
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || responseText || `Erro HTTP ${response.status}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (error: any) {
    console.error('❌ Erro ao chamar endpoint interno:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido'
    };
  }
}

