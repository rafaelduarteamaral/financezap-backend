// Formatação de mensagens para WhatsApp

/**
 * Divide mensagem longa em múltiplas mensagens menores
 */
export function dividirMensagem(mensagem: string, tamanhoMaximo: number = 1500): string[] {
  if (mensagem.length <= tamanhoMaximo) {
    return [mensagem];
  }

  const mensagens: string[] = [];
  const linhas = mensagem.split('\n');
  let mensagemAtual = '';

  for (const linha of linhas) {
    // Se a linha sozinha é maior que o limite, quebra ela
    if (linha.length > tamanhoMaximo) {
      // Salva mensagem atual se houver
      if (mensagemAtual.trim()) {
        mensagens.push(mensagemAtual.trim());
        mensagemAtual = '';
      }

      // Quebra linha longa em pedaços
      let linhaRestante = linha;
      while (linhaRestante.length > tamanhoMaximo) {
        const pedaco = linhaRestante.substring(0, tamanhoMaximo);
        const ultimoEspaco = pedaco.lastIndexOf(' ');
        const quebra = ultimoEspaco > tamanhoMaximo * 0.8 ? ultimoEspaco : tamanhoMaximo;
        mensagens.push(linhaRestante.substring(0, quebra).trim());
        linhaRestante = linhaRestante.substring(quebra).trim();
      }
      if (linhaRestante) {
        mensagemAtual = linhaRestante;
      }
    } else {
      // Verifica se adicionar esta linha ultrapassa o limite
      const mensagemTeste = mensagemAtual ? `${mensagemAtual}\n${linha}` : linha;
      if (mensagemTeste.length > tamanhoMaximo) {
        // Salva mensagem atual e começa nova
        if (mensagemAtual.trim()) {
          mensagens.push(mensagemAtual.trim());
        }
        mensagemAtual = linha;
      } else {
        mensagemAtual = mensagemTeste;
      }
    }
  }

  // Adiciona última mensagem se houver
  if (mensagemAtual.trim()) {
    mensagens.push(mensagemAtual.trim());
  }

  return mensagens.length > 0 ? mensagens : [mensagem];
}

/**
 * Formata número como moeda brasileira
 */
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/**
 * Formata data para WhatsApp
 */
export function formatarData(data: string | Date): string {
  const dataObj = typeof data === 'string' ? new Date(data) : data;
  return dataObj.toLocaleDateString('pt-BR');
}

/**
 * Cria menu de ajuda formatado
 */
export function criarMenuAjuda(): string {
  return `📱 *Menu do Zela*\n\n` +
    `💸 *Registrar Gastos:*\n` +
    `"comprei café por 5 reais"\n` +
    `"gastei 50 com gasolina"\n\n` +
    `💰 *Registrar Receitas:*\n` +
    `"recebi 500 reais"\n` +
    `"me pagaram 2000 de salário"\n\n` +
    `📅 *Agendar Pagamento:*\n` +
    `"agende boleto de 200 para dia 10"\n` +
    `"tenho que pagar 800 de aluguel no dia 5"\n\n` +
    `📊 *Ver Resumo:*\n` +
    `"resumo financeiro"\n` +
    `"quanto gastei hoje"\n` +
    `"meu saldo"\n\n` +
    `📋 *Agendamentos:*\n` +
    `"meus agendamentos"\n` +
    `"agendamentos pendentes"\n\n` +
    `❓ *Mais ajuda:*\n` +
    `Digite "exemplos" para ver mais exemplos\n` +
    `Digite "/comandos" para ver comandos rápidos`;
}

/**
 * Cria mensagem de exemplos
 */
export function criarMensagemExemplos(): string {
  return `💡 *Exemplos de Mensagens:*\n\n` +
    `*Gastos:*\n` +
    `• "comprei café por 5 reais"\n` +
    `• "gastei 50 com gasolina e 30 com almoço"\n` +
    `• "paguei 150 de conta de luz"\n` +
    `• "comprei pão por 5, leite por 8 e café por 12"\n\n` +
    `*Receitas:*\n` +
    `• "recebi 500 reais do cliente"\n` +
    `• "me pagaram 2000 de salário"\n` +
    `• "ganhei 300 reais"\n\n` +
    `*Agendamentos:*\n` +
    `• "agende boleto de 200 para dia 10"\n` +
    `• "tenho que pagar 800 de aluguel no dia 5"\n` +
    `• "vou receber 1500 de salário no dia 1"\n\n` +
    `*Consultas:*\n` +
    `• "quanto gastei hoje?"\n` +
    `• "resumo financeiro"\n` +
    `• "meu saldo"\n` +
    `• "quanto gastei com comida este mês?"`;
}

/**
 * Cria mensagem de comandos rápidos
 */
export function criarMensagemComandos(): string {
  return `⚡ *Comandos Rápidos:*\n\n` +
    `*/hoje* - Resumo do dia\n` +
    `*/mes* - Resumo do mês\n` +
    `*/top* - Top 5 categorias\n` +
    `*/pendente* - Agendamentos pendentes\n` +
    `*/ajuda* - Menu de ajuda\n` +
    `*/exemplos* - Ver exemplos\n` +
    `*/comandos* - Esta lista`;
}

/**
 * Formata estatísticas para mensagem curta
 */
export function formatarEstatisticasResumo(estatisticas: any): string {
  const saldo = (estatisticas.totalEntradas || 0) - (estatisticas.totalSaidas || 0);
  const emojiSaldo = saldo >= 0 ? '✅' : '⚠️';

  return `📊 *Resumo Financeiro*\n\n` +
    `${emojiSaldo} *Saldo:* ${formatarMoeda(saldo)}\n` +
    `📈 *Entradas:* ${formatarMoeda(estatisticas.totalEntradas || 0)}\n` +
    `📉 *Saídas:* ${formatarMoeda(estatisticas.totalSaidas || 0)}\n\n` +
    `📅 *Hoje:* ${formatarMoeda(estatisticas.gastoHoje || 0)}\n` +
    `📅 *Este Mês:* ${formatarMoeda(estatisticas.gastoMes || 0)}`;
}

/**
 * Cria sugestão proativa baseada em dados
 */
export function criarSugestaoProativa(estatisticas: any, transacoes: any[]): string | null {
  const saldo = (estatisticas.totalEntradas || 0) - (estatisticas.totalSaidas || 0);
  const gastoHoje = estatisticas.gastoHoje || 0;
  const gastoMes = estatisticas.gastoMes || 0;
  const mediaDiaria = gastoMes / new Date().getDate();

  // Sugestão 1: Saldo negativo
  if (saldo < 0) {
    return `⚠️ *Atenção:* Seu saldo está negativo (${formatarMoeda(saldo)}).\n` +
      `💡 Considere reduzir gastos ou registrar receitas.`;
  }

  // Sugestão 2: Gasto alto hoje
  if (gastoHoje > mediaDiaria * 1.5) {
    return `💡 *Dica:* Você gastou ${formatarMoeda(gastoHoje)} hoje.\n` +
      `📊 Isso é ${((gastoHoje / mediaDiaria) * 100).toFixed(0)}% acima da sua média diária.`;
  }

  // Sugestão 3: Categoria dominante
  const categorias = transacoes.reduce((acc: any, t: any) => {
    acc[t.categoria] = (acc[t.categoria] || 0) + t.valor;
    return acc;
  }, {});

  const categoriaTop = Object.entries(categorias)
    .sort((a: any, b: any) => b[1] - a[1])[0];

  if (categoriaTop && (categoriaTop[1] as number) > gastoMes * 0.4) {
    return `📊 *Insight:* Sua maior categoria é "${categoriaTop[0]}" (${formatarMoeda(categoriaTop[1] as number)}).\n` +
      `💡 Isso representa ${((categoriaTop[1] as number / gastoMes) * 100).toFixed(0)}% do seu gasto mensal.`;
  }

  return null;
}
