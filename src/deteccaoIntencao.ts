// Detecção de intenção do usuário

export type IntencaoUsuario =
  | 'transacao'
  | 'agendamento'
  | 'pergunta'
  | 'comando'
  | 'correcao'
  | 'confirmacao'
  | 'cancelamento'
  | 'edicao'
  | 'ajuda'
  | 'resumo'
  | 'saldo'
  | 'listagem'
  | 'exclusao'
  | 'desconhecida';

export interface ResultadoDeteccao {
  intencao: IntencaoUsuario;
  confianca: number; // 0-1
  detalhes?: {
    tipoTransacao?: 'entrada' | 'saida';
    tipoAgendamento?: 'pagamento' | 'recebimento';
    comando?: string;
  };
}

/**
 * Detecta intenção do usuário baseado na mensagem
 */
export function detectarIntencao(mensagem: string, contexto?: any): ResultadoDeteccao {
  const mensagemLower = mensagem.toLowerCase().trim();

  // 1. Verifica se é confirmação/cancelamento/edição (prioridade alta)
  if (isConfirmacao(mensagemLower)) {
    return { intencao: 'confirmacao', confianca: 0.95 };
  }

  if (isCancelamento(mensagemLower)) {
    return { intencao: 'cancelamento', confianca: 0.95 };
  }

  if (isEdicao(mensagemLower)) {
    return { intencao: 'edicao', confianca: 0.9 };
  }

  // 2. Verifica se é comando rápido
  if (mensagemLower.startsWith('/')) {
    const comando = mensagemLower.substring(1).split(' ')[0];
    return {
      intencao: 'comando',
      confianca: 0.9,
      detalhes: { comando },
    };
  }

  // 3. Verifica se é pedido de ajuda
  const palavrasAjuda = ['ajuda', 'help', 'como usar', 'o que posso fazer', 'menu', 'comandos'];
  if (palavrasAjuda.some(palavra => mensagemLower.includes(palavra))) {
    return { intencao: 'ajuda', confianca: 0.85 };
  }

  // 4. Verifica se é pedido de saldo específico
  const palavrasSaldo = [
    'meu saldo',
    'saldo total',
    'saldo atual',
    'quanto tenho',
    'quanto eu tenho',
    'meu dinheiro',
    'saldo das carteiras',
    'saldo de todas as carteiras',
    'saldo de todas carteiras',
  ];
  if (palavrasSaldo.some(palavra => mensagemLower.includes(palavra))) {
    return { intencao: 'saldo', confianca: 0.9 };
  }

  // 5. Verifica se é pedido de resumo/estatísticas
  const palavrasResumo = [
    'resumo',
    'estatísticas',
    'estatisticas',
    'saldo',
    'quanto gastei',
    'situação financeira',
    'dashboard',
    'relatório',
    'relatorio',
  ];
  if (palavrasResumo.some(palavra => mensagemLower.includes(palavra))) {
    return { intencao: 'resumo', confianca: 0.85 };
  }

  // 6. Verifica se é listagem de agendamentos
  const palavrasListagem = [
    'listar agendamentos',
    'meus agendamentos',
    'agendamentos pendentes',
    'agendamentos',
    'agendamento',
    'listar',
    'lista',
    'quais agendamentos',
    'mostrar agendamentos',
  ];
  if (palavrasListagem.some(palavra => mensagemLower.includes(palavra))) {
    return { intencao: 'listagem', confianca: 0.85 };
  }

  // 7. Verifica se é agendamento
  const palavrasAgendamento = [
    'agende',
    'agendar',
    'agendamento',
    'tenho que pagar',
    'vou receber',
    'preciso pagar',
    'para o dia',
    'no dia',
  ];
  const temPalavraAgendamento = palavrasAgendamento.some(palavra => mensagemLower.includes(palavra));
  const temData = /\d{1,2}\/\d{1,2}|\d{1,2} de \w+|dia \d{1,2}/.test(mensagemLower);

  if (temPalavraAgendamento && temData) {
    const tipoAgendamento = mensagemLower.includes('receber') || mensagemLower.includes('recebimento')
      ? 'recebimento'
      : 'pagamento';
    return {
      intencao: 'agendamento',
      confianca: 0.8,
      detalhes: { tipoAgendamento },
    };
  }

  // 7. Verifica se é edição de agendamento
  const palavrasEdicaoAgendamento = [
    'editar agendamento',
    'alterar agendamento',
    'corrigir agendamento',
    'mudar agendamento',
    'atualizar agendamento',
    'editar agendamentos',
    'alterar agendamentos',
  ];
  if (palavrasEdicaoAgendamento.some(palavra => mensagemLower.includes(palavra))) {
    return { intencao: 'edicao', confianca: 0.9, detalhes: { tipoAgendamento: 'pagamento' } };
  }

  // 8. Verifica se é exclusão
  const palavrasExclusao = [
    'excluir',
    'deletar',
    'remover',
    'apagar',
    'excluir transação',
    'deletar transação',
    'remover transação',
    'apagar transação',
  ];
  if (palavrasExclusao.some(palavra => mensagemLower.includes(palavra))) {
    return { intencao: 'exclusao', confianca: 0.85 };
  }

  // 9. Verifica se é correção
  const palavrasCorrecao = ['corrigir', 'correção', 'correcao', 'alterar', 'mudar', 'editar'];
  if (palavrasCorrecao.some(palavra => mensagemLower.includes(palavra))) {
    return { intencao: 'correcao', confianca: 0.75 };
  }

  // 9. Verifica se é transação (entrada ou saída)
  const palavrasEntrada = [
    'recebi',
    'recebido',
    'recebimento',
    'ganhei',
    'ganho',
    'vendi',
    'venda',
    'salário',
    'salario',
    'me pagou',
    'me pagaram',
    'depositei',
    'depósito',
    'deposito',
  ];

  const palavrasSaida = [
    'comprei',
    'paguei',
    'gastei',
    'despensei',
    'saquei',
    'transferi',
    'enviei',
    'despesa',
    'saída',
    'saida',
    'saque',
    'compras',
    'gastos',
  ];

  const temPalavraEntrada = palavrasEntrada.some(palavra => mensagemLower.includes(palavra));
  const temPalavraSaida = palavrasSaida.some(palavra => mensagemLower.includes(palavra));
  const temValor = /\d+[.,]?\d*\s*(reais?|rs?|r\$)?/i.test(mensagemLower);

  if (temValor && (temPalavraEntrada || temPalavraSaida)) {
    const tipoTransacao = temPalavraEntrada && !temPalavraSaida ? 'entrada' : 'saida';
    return {
      intencao: 'transacao',
      confianca: 0.8,
      detalhes: { tipoTransacao },
    };
  }

  // 10. Verifica se é pergunta (contém interrogação ou palavras de pergunta)
  const palavrasPergunta = [
    'quanto',
    'qual',
    'quais',
    'como',
    'quando',
    'onde',
    'por que',
    'porque',
    'o que',
    'qual é',
    'quem',
  ];
  const temInterrogacao = mensagemLower.includes('?');
  const temPalavraPergunta = palavrasPergunta.some(palavra => mensagemLower.includes(palavra));

  if (temInterrogacao || temPalavraPergunta) {
    return { intencao: 'pergunta', confianca: 0.7 };
  }

  // 12. Se tem valor mas não tem contexto claro, pode ser transação
  if (temValor) {
    return {
      intencao: 'transacao',
      confianca: 0.6,
      detalhes: { tipoTransacao: 'saida' }, // Assume saída por padrão
    };
  }

  // 13. Desconhecida
  return { intencao: 'desconhecida', confianca: 0.3 };
}

/**
 * Verifica se mensagem é confirmação
 */
function isConfirmacao(mensagem: string): boolean {
  return (
    mensagem === 'confirmar' ||
    mensagem === 'confirmar todas' ||
    mensagem === 'sim' ||
    mensagem === 'ok' ||
    mensagem === '✅' ||
    mensagem.startsWith('confirmar')
  );
}

/**
 * Verifica se mensagem é cancelamento
 */
function isCancelamento(mensagem: string): boolean {
  return (
    mensagem === 'cancelar' ||
    mensagem === 'não' ||
    mensagem === 'nao' ||
    mensagem === 'n' ||
    mensagem === '❌' ||
    mensagem.startsWith('cancelar')
  );
}

/**
 * Verifica se mensagem é edição
 */
function isEdicao(mensagem: string): boolean {
  return (
    mensagem === 'editar' ||
    mensagem === '✏️' ||
    mensagem.startsWith('editar') ||
    mensagem.startsWith('corrigir') ||
    mensagem.startsWith('alterar')
  );
}
