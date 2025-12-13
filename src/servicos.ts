/**
 * 📋 Catálogo Centralizado de Serviços
 */

export interface ServicoConfig {
  id: string;
  nome: string;
  descricao: string;
  palavrasChave: string[];
  exemplos: string[];
  schemaJson: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  processar: (dados: any, telefone: string) => Promise<any>;
}

export const SERVICO_TRANSACAO: ServicoConfig = {
  id: 'transacao',
  nome: 'Transação Financeira',
  descricao: 'Registra uma transação financeira (gasto ou receita) no sistema.',
  palavrasChave: [
    'comprei', 'gastei', 'paguei', 'recebi', 'ganhei', 'despesa', 'receita',
    'transação', 'gasto', 'entrada', 'saída', 'crédito', 'débito',
    'almoço', 'jantar', 'combustível', 'conta', 'salário', 'venda'
  ],
  exemplos: [
    'comprei um sanduiche por 50 reais',
    'gastei 25,50 no almoço hoje',
    'paguei R$ 100,00 de conta de luz',
    'recebi R$ 500,00 de salário'
  ],
  schemaJson: {
    type: 'object',
    properties: {
      descricao: { type: 'string', description: 'Descrição da transação' },
      valor: { type: 'number', description: 'Valor em reais' },
      categoria: {
        type: 'string',
        enum: ['alimentação', 'transporte', 'contas', 'saúde', 'educação', 'lazer', 'salário', 'outros']
      },
      tipo: { type: 'string', enum: ['entrada', 'saída'] },
      metodo: { type: 'string', enum: ['crédito', 'débito', 'dinheiro', 'pix'] },
      data: { type: 'string', format: 'date', description: 'Data no formato YYYY-MM-DD' }
    },
    required: ['descricao', 'valor', 'categoria', 'tipo', 'metodo']
  },
  processar: async (dados: any, telefone: string) => ({ servico: 'transacao', dados, telefone })
};

export const SERVICO_AGENDAMENTO: ServicoConfig = {
  id: 'agendamento',
  nome: 'Agendamento Financeiro',
  descricao: 'Cria um agendamento para uma transação financeira futura.',
  palavrasChave: [
    'agendar', 'agendamento', 'marcar', 'programar', 'futuro', 'próximo',
    'mensal', 'semanal', 'recorrente', 'parcela', 'todo mês', 'dia 5', 'dia 10'
  ],
  exemplos: [
    'agendar pagamento de R$ 200 de aluguel para dia 5',
    'marcar conta de luz de R$ 150 para o próximo dia 10',
    'criar agendamento recorrente de R$ 500 de salário todo dia 1'
  ],
  schemaJson: {
    type: 'object',
    properties: {
      descricao: { type: 'string' },
      valor: { type: 'number' },
      categoria: {
        type: 'string',
        enum: ['alimentação', 'transporte', 'contas', 'saúde', 'educação', 'lazer', 'salário', 'outros']
      },
      tipo: { type: 'string', enum: ['entrada', 'saída'] },
      metodo: { type: 'string', enum: ['crédito', 'débito', 'dinheiro', 'pix'] },
      dataAgendamento: { type: 'string', format: 'date' },
      recorrente: { type: 'boolean', default: false },
      totalParcelas: { type: 'number', minimum: 1 },
      frequencia: { type: 'string', enum: ['mensal', 'semanal', 'anual'], default: 'mensal' }
    },
    required: ['descricao', 'valor', 'categoria', 'tipo', 'metodo', 'dataAgendamento']
  },
  processar: async (dados: any, telefone: string) => ({ servico: 'agendamento', dados, telefone })
};

export const SERVICO_CONSULTA: ServicoConfig = {
  id: 'consulta',
  nome: 'Consulta Financeira',
  descricao: 'Responde perguntas sobre o estado financeiro, histórico de transações, saldo, etc.',
  palavrasChave: [
    'quanto', 'quando', 'quais', 'onde', 'como',
    'saldo', 'gasto', 'gastei', 'recebi', 'resumo', 'estatística',
    'histórico', 'extrato', 'categoria', 'mês', 'semana', 'hoje',
    'pendente', 'agendamento', 'próximo'
  ],
  exemplos: [
    'quanto gastei este mês?',
    'qual meu saldo atual?',
    'quais são meus agendamentos pendentes?',
    'quanto gastei com alimentação?'
  ],
  schemaJson: {
    type: 'object',
    properties: {
      tipoConsulta: {
        type: 'string',
        enum: ['saldo', 'resumo', 'gastos_categoria', 'agendamentos', 'transacoes_periodo', 'estatisticas']
      },
      periodo: {
        type: 'string',
        enum: ['hoje', 'semana', 'mes', 'ano', 'todos'],
        default: 'mes'
      },
      categoria: {
        type: 'string',
        enum: ['alimentação', 'transporte', 'contas', 'saúde', 'educação', 'lazer', 'outros']
      }
    },
    required: ['tipoConsulta']
  },
  processar: async (dados: any, telefone: string) => ({ servico: 'consulta', dados, telefone })
};

export const SERVICOS_DISPONIVEIS: ServicoConfig[] = [
  SERVICO_TRANSACAO,
  SERVICO_AGENDAMENTO,
  SERVICO_CONSULTA
];

export function buscarServicoPorId(id: string): ServicoConfig | undefined {
  return SERVICOS_DISPONIVEIS.find(servico => servico.id === id);
}

export function gerarPromptIdentificacaoServico(mensagem: string): string {
  const servicosDescricao = SERVICOS_DISPONIVEIS.map(servico => {
    return `
**${servico.nome}** (ID: ${servico.id})
- Descrição: ${servico.descricao}
- Palavras-chave: ${servico.palavrasChave.join(', ')}
- Exemplos: ${servico.exemplos.join('; ')}
- JSON esperado:
${JSON.stringify(servico.schemaJson, null, 2)}
`;
  }).join('\n---\n');

  return `Você é um assistente que identifica qual serviço financeiro o usuário precisa usar baseado na mensagem dele.

SERVIÇOS DISPONÍVEIS:
${servicosDescricao}

MENSAGEM DO USUÁRIO: "${mensagem}"

Analise a mensagem e responda APENAS com um JSON no seguinte formato:
{
  "servicoId": "id_do_servico",
  "confianca": 0.0-1.0,
  "dadosExtraidos": { ... dados no formato do schema do serviço ... }
}

Se não conseguir identificar claramente, use "consulta" como padrão.`;
}

export function validarDadosServico(servicoId: string, dados: any): { valido: boolean; erros: string[] } {
  const servico = buscarServicoPorId(servicoId);
  if (!servico) {
    return { valido: false, erros: [`Serviço "${servicoId}" não encontrado`] };
  }

  const erros: string[] = [];
  const schema = servico.schemaJson;

  for (const campo of schema.required) {
    if (!(campo in dados) || dados[campo] === null || dados[campo] === undefined) {
      erros.push(`Campo obrigatório "${campo}" não encontrado`);
    }
  }

  for (const [campo, propriedade] of Object.entries(schema.properties)) {
    if (campo in dados) {
      const valor = dados[campo];
      if (propriedade.type === 'string' && typeof valor !== 'string') {
        erros.push(`Campo "${campo}" deve ser string`);
      } else if (propriedade.type === 'number' && typeof valor !== 'number') {
        erros.push(`Campo "${campo}" deve ser número`);
      } else if (propriedade.type === 'boolean' && typeof valor !== 'boolean') {
        erros.push(`Campo "${campo}" deve ser booleano`);
      }
      if (propriedade.enum && !propriedade.enum.includes(valor)) {
        erros.push(`Campo "${campo}" deve ser um dos valores: ${propriedade.enum.join(', ')}`);
      }
    }
  }

  return { valido: erros.length === 0, erros };
}
