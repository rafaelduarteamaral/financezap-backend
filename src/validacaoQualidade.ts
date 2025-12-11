// Validação de qualidade da extração da IA

export interface ScoreExtracao {
  valor: number; // 0-1
  motivo: string;
  problemas: string[];
  sugestoes: string[];
}

/**
 * Calcula score de qualidade de uma transação extraída
 */
export function calcularScoreExtracao(transacao: {
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'entrada' | 'saida';
  metodo?: 'credito' | 'debito';
}): ScoreExtracao {
  const problemas: string[] = [];
  const sugestoes: string[] = [];
  let score = 1.0;

  // 1. Validação de descrição
  if (!transacao.descricao || transacao.descricao.trim().length === 0) {
    score -= 0.3;
    problemas.push('Descrição vazia');
    sugestoes.push('Perguntar descrição ao usuário');
  } else if (transacao.descricao.length < 3) {
    score -= 0.2;
    problemas.push('Descrição muito curta');
    sugestoes.push('Confirmar descrição com usuário');
  } else if (transacao.descricao.length > 100) {
    score -= 0.1;
    problemas.push('Descrição muito longa');
    sugestoes.push('Sugerir resumir descrição');
  }

  // 2. Validação de valor
  if (transacao.valor <= 0) {
    score -= 0.4;
    problemas.push('Valor inválido (zero ou negativo)');
    sugestoes.push('Perguntar valor correto');
  } else if (transacao.valor < 0.01) {
    score -= 0.2;
    problemas.push('Valor muito baixo');
    sugestoes.push('Confirmar valor (pode ser centavos)');
  } else if (transacao.valor > 10000000) {
    score -= 0.3;
    problemas.push('Valor muito alto');
    sugestoes.push('Confirmar valor (pode ser erro de digitação)');
  }

  // 3. Validação de categoria
  const categoriasValidas = [
    'alimentação',
    'transporte',
    'lazer',
    'saúde',
    'educação',
    'moradia',
    'roupas',
    'tecnologia',
    'serviços',
    'outros',
  ];

  if (!transacao.categoria || !categoriasValidas.includes(transacao.categoria.toLowerCase())) {
    score -= 0.15;
    problemas.push('Categoria inválida ou não reconhecida');
    sugestoes.push('Sugerir categoria correta');
  }

  // 4. Validação de tipo
  if (!transacao.tipo || !['entrada', 'saida'].includes(transacao.tipo)) {
    score -= 0.2;
    problemas.push('Tipo inválido');
    sugestoes.push('Confirmar se é entrada ou saída');
  }

  // 5. Validação de método (opcional, mas se presente deve ser válido)
  if (transacao.metodo && !['credito', 'debito'].includes(transacao.metodo)) {
    score -= 0.1;
    problemas.push('Método inválido');
    sugestoes.push('Confirmar método de pagamento');
  }

  // Garante que score não seja negativo
  score = Math.max(0, score);

  // Determina motivo baseado no score
  let motivo = '';
  if (score >= 0.9) {
    motivo = 'Alta qualidade - Pronta para salvar';
  } else if (score >= 0.7) {
    motivo = 'Boa qualidade - Pode precisar de confirmação';
  } else if (score >= 0.5) {
    motivo = 'Qualidade média - Requer confirmação';
  } else {
    motivo = 'Baixa qualidade - Requer mais informações';
  }

  return {
    valor: score,
    motivo,
    problemas,
    sugestoes,
  };
}

/**
 * Calcula score médio de múltiplas transações
 */
export function calcularScoreMedio(transacoes: Array<{ descricao: string; valor: number; categoria: string; tipo: 'entrada' | 'saida'; metodo?: 'credito' | 'debito' }>): ScoreExtracao {
  if (transacoes.length === 0) {
    return {
      valor: 0,
      motivo: 'Nenhuma transação para avaliar',
      problemas: ['Nenhuma transação extraída'],
      sugestoes: ['Verificar se mensagem contém transações'],
    };
  }

  const scores = transacoes.map(t => calcularScoreExtracao(t));
  const scoreMedio = scores.reduce((sum, s) => sum + s.valor, 0) / scores.length;

  const todosProblemas = scores.flatMap(s => s.problemas);
  const todosSugestoes = scores.flatMap(s => s.sugestoes);

  let motivo = '';
  if (scoreMedio >= 0.9) {
    motivo = 'Alta qualidade - Todas as transações estão boas';
  } else if (scoreMedio >= 0.7) {
    motivo = 'Boa qualidade - Algumas podem precisar de confirmação';
  } else if (scoreMedio >= 0.5) {
    motivo = 'Qualidade média - Requer confirmação';
  } else {
    motivo = 'Baixa qualidade - Requer mais informações';
  }

  return {
    valor: scoreMedio,
    motivo,
    problemas: [...new Set(todosProblemas)], // Remove duplicatas
    sugestoes: [...new Set(todosSugestoes)],
  };
}

/**
 * Decide se deve pedir confirmação baseado no score
 */
export function devePedirConfirmacao(score: ScoreExtracao): boolean {
  return score.valor < 0.9;
}

/**
 * Decide se deve pedir mais informações baseado no score
 */
export function devePedirMaisInformacoes(score: ScoreExtracao): boolean {
  return score.valor < 0.5;
}
