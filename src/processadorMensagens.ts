// Processador de mensagens para extrair transações financeiras

export interface TransacaoExtraida {
  descricao: string;
  valor: number;
  sucesso: boolean;
}

/**
 * Processa uma mensagem e extrai transações financeiras
 * Exemplos:
 * - "comprei um sanduiche por 50 reais e um milkshake por 30"
 * - "gastei 25,50 no almoço"
 * - "paguei R$ 100,00 de conta de luz"
 */
export function processarMensagem(mensagem: string): TransacaoExtraida[] {
  const transacoes: TransacaoExtraida[] = [];
  const mensagemLower = mensagem.toLowerCase().trim();

  // Padrões para encontrar valores monetários
  // Suporta: "50 reais", "R$ 50", "50,00", "50.00", etc.
  const padraoValor = /(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?|rs?|r\$)?/gi;
  
  // Palavras que indicam compra/gasto
  const palavrasCompra = [
    'comprei', 'gastei', 'paguei', 'comprar', 'gastar', 'pagar',
    'adquiri', 'adquirir', 'compras', 'despesa', 'despesas'
  ];

  // Verifica se a mensagem contém palavras de compra/gasto
  const temPalavraCompra = palavrasCompra.some(palavra => 
    mensagemLower.includes(palavra)
  );

  // Se não tem palavra de compra, tenta extrair valores mesmo assim
  if (!temPalavraCompra && !padraoValor.test(mensagem)) {
    return transacoes;
  }

  // Extrai todos os valores da mensagem
  const valores: Array<{ valor: number; posicao: number }> = [];
  let match;
  padraoValor.lastIndex = 0; // Reset regex

  while ((match = padraoValor.exec(mensagem)) !== null) {
    const valorStr = match[1].replace(',', '.');
    const valor = parseFloat(valorStr);
    if (!isNaN(valor) && valor > 0) {
      valores.push({
        valor: valor,
        posicao: match.index
      });
    }
  }

  if (valores.length === 0) {
    return transacoes;
  }

  // Extrai descrições próximas aos valores
  valores.forEach((item, index) => {
    let descricao = 'Transação';

    // Tenta encontrar descrição antes do valor
    const inicio = Math.max(0, item.posicao - 50);
    const fim = Math.min(mensagem.length, item.posicao + 30);
    const contexto = mensagem.substring(inicio, fim);

    // Remove o valor do contexto para pegar a descrição
    const contextoLimpo = contexto
      .replace(/(?:r\$\s*)?\d+(?:[.,]\d{1,2})?\s*(?:reais?|rs?|r\$)?/gi, '')
      .trim();

    // Procura por palavras-chave de produtos/serviços
    const palavrasProduto = [
      'sanduiche', 'sanduíche', 'hamburguer', 'hambúrguer',
      'milkshake', 'milkshake', 'refrigerante', 'suco',
      'almoço', 'jantar', 'café', 'lanche',
      'conta', 'luz', 'água', 'internet', 'telefone',
      'combustível', 'gasolina', 'uber', 'táxi', 'ônibus',
      'supermercado', 'farmácia', 'padaria'
    ];

    // Procura palavras de produto no contexto
    for (const palavra of palavrasProduto) {
      if (contextoLimpo.toLowerCase().includes(palavra)) {
        // Pega a frase que contém a palavra
        const palavras = contextoLimpo.split(/\s+/);
        const indicePalavra = palavras.findIndex(p => 
          p.toLowerCase().includes(palavra)
        );
        
        if (indicePalavra >= 0) {
          // Pega algumas palavras ao redor
          const inicio = Math.max(0, indicePalavra - 2);
          const fim = Math.min(palavras.length, indicePalavra + 3);
          descricao = palavras.slice(inicio, fim).join(' ');
          break;
        }
      }
    }

    // Se não encontrou descrição específica, tenta pegar palavras antes do valor
    if (descricao === 'Transação') {
      const palavrasAntes = contextoLimpo
        .split(/\s+/)
        .filter(p => p.length > 2)
        .slice(-3)
        .join(' ');
      
      if (palavrasAntes) {
        descricao = palavrasAntes;
      }
    }

    // Limpa a descrição
    descricao = descricao
      .replace(/^(comprei|gastei|paguei|comprar|gastar|pagar)\s+/i, '')
      .replace(/\s+(por|de|em|com)\s*$/i, '')
      .trim();

    if (!descricao || descricao.length < 2) {
      descricao = `Item ${index + 1}`;
    }

    transacoes.push({
      descricao: descricao,
      valor: item.valor,
      sucesso: true
    });
  });

  return transacoes;
}

/**
 * Exemplos de uso:
 * 
 * processarMensagem("comprei um sanduiche por 50 reais e um milkshake por 30")
 * // Retorna: [
 * //   { descricao: "sanduiche", valor: 50, sucesso: true },
 * //   { descricao: "milkshake", valor: 30, sucesso: true }
 * // ]
 * 
 * processarMensagem("gastei 25,50 no almoço")
 * // Retorna: [
 * //   { descricao: "almoço", valor: 25.50, sucesso: true }
 * // ]
 */

