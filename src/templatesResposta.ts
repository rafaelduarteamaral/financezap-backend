// Sistema de Templates de Resposta
// Templates reutilizáveis para respostas consistentes

import { formatarMoeda } from './formatadorMensagens';

export interface TemplateResposta {
  id: string;
  tipo: 'transacao' | 'agendamento' | 'erro' | 'confirmacao' | 'ajuda' | 'listagem';
  template: string;
  variaveis: string[];
}

export const TEMPLATES: TemplateResposta[] = [
  {
    id: 'transacao_sucesso',
    tipo: 'transacao',
    template: `✅ *Transação Registrada Com Sucesso!*

📄 *Descrição:* {{descricao}}
💰 *Valor:* {{valor}}
🔄 *Tipo:* {{tipo}}
🏷️ *Categoria:* {{categoria}}
🏦 *Carteira:* {{carteira}}
📅 *Data:* {{data}}

💡 *Ações Rápidas:*
• Ver Resumo Financeiro Do Mês
• Excluir Esta Transação`,
    variaveis: ['descricao', 'valor', 'tipo', 'categoria', 'carteira', 'data'],
  },
  {
    id: 'transacao_multipla_sucesso',
    tipo: 'transacao',
    template: `✅ *{{quantidade}} Transações Registradas Com Sucesso!*

{{transacoes}}

📊 *Total:* {{total}}

💡 Consulte gráficos e relatórios completos em: usezela.com/painel`,
    variaveis: ['quantidade', 'transacoes', 'total'],
  },
  {
    id: 'agendamento_sucesso',
    tipo: 'agendamento',
    template: `✅ *Agendamento Criado Com Sucesso!*

📅 *{{tipo}}:* {{descricao}}
💰 *Valor:* {{valor}}
📆 *Data:* {{data}}

Você receberá um lembrete no dia {{data}}.

💡 Quando pagar/receber, responda "pago" ou "recebido" para registrar automaticamente.`,
    variaveis: ['tipo', 'descricao', 'valor', 'data'],
  },
  {
    id: 'agendamento_recorrente_sucesso',
    tipo: 'agendamento',
    template: `✅ *Agendamento Recorrente Criado Com Sucesso!*

📅 *{{tipo}}:* {{descricao}}
💰 *Valor:* {{valor}} por parcela
📊 *Total de parcelas:* {{totalParcelas}}
📆 *Primeira parcela:* {{data}}

Você receberá lembretes mensais até a parcela {{totalParcelas}}.

💡 Quando pagar/receber, responda "pago" ou "recebido" para registrar automaticamente.`,
    variaveis: ['tipo', 'descricao', 'valor', 'totalParcelas', 'data'],
  },
  {
    id: 'erro_validacao',
    tipo: 'erro',
    template: `❌ *Erro de Validação*

{{mensagem}}

💡 *Dicas:*
{{dicas}}`,
    variaveis: ['mensagem', 'dicas'],
  },
  {
    id: 'erro_processamento',
    tipo: 'erro',
    template: `❌ *Erro ao Processar*

{{mensagem}}

Por favor, tente novamente ou reformule sua mensagem.`,
    variaveis: ['mensagem'],
  },
  {
    id: 'confirmacao_transacao',
    tipo: 'confirmacao',
    template: `🤔 *Confirme a Transação:*

📄 *Descrição:* {{descricao}}
💰 *Valor:* {{valor}}
🔄 *Tipo:* {{tipo}}
🏷️ *Categoria:* {{categoria}}

Digite:
• *"sim"* ou *"confirmar"* para salvar
• *"editar"* para corrigir
• *"cancelar"* para descartar`,
    variaveis: ['descricao', 'valor', 'tipo', 'categoria'],
  },
  {
    id: 'ajuda_menu',
    tipo: 'ajuda',
    template: `📱 *Menu de Ajuda - Zela*

*Comandos Disponíveis:*
• /ajuda - Mostra este menu
• /hoje - Resumo do dia
• /mes - Resumo do mês
• /saldo - Saldo total

*Como Usar:*
• Envie mensagens como "comprei pizza por 50 reais"
• Agende pagamentos: "agende boleto de 200 reais para dia 15"
• Consulte relatórios: "relatório semanal"

💡 *Dica:* Use frases naturais, eu entendo! 😊`,
    variaveis: [],
  },
  {
    id: 'listagem_transacoes',
    tipo: 'listagem',
    template: `📋 *Suas Transações* ({{total}})

{{transacoes}}

{{paginacao}}`,
    variaveis: ['total', 'transacoes', 'paginacao'],
  },
  {
    id: 'listagem_agendamentos',
    tipo: 'listagem',
    template: `📋 *Seus Agendamentos*

📊 *Resumo:*
⏳ Pendentes: {{pendentes}}
✅ Pagos: {{pagos}}
❌ Cancelados: {{cancelados}}

{{lista}}`,
    variaveis: ['pendentes', 'pagos', 'cancelados', 'lista'],
  },
];

/**
 * Formata uma resposta usando um template
 */
export function formatarResposta(
  templateId: string,
  dados: Record<string, any>
): string {
  const template = TEMPLATES.find((t) => t.id === templateId);

  if (!template) {
    console.warn(`⚠️ Template não encontrado: ${templateId}`);
    return dados.mensagem || 'Resposta não disponível';
  }

  let resposta = template.template;

  // Substitui variáveis do template
  template.variaveis.forEach((variavel) => {
    const valor = dados[variavel];
    let valorFormatado = '';

    // Formatação especial para alguns campos
    if (variavel === 'valor' && typeof valor === 'number') {
      valorFormatado = formatarMoeda(valor);
    } else if (variavel === 'tipo' && valor) {
      valorFormatado =
        valor === 'entrada' || valor === 'recebimento'
          ? '💰 Entrada'
          : '🔴 Saída';
    } else if (variavel === 'data' && valor) {
      try {
        const data = new Date(valor + 'T00:00:00');
        valorFormatado = data.toLocaleDateString('pt-BR');
      } catch {
        valorFormatado = String(valor);
      }
    } else {
      valorFormatado = valor ? String(valor) : '—';
    }

    resposta = resposta.replace(new RegExp(`{{${variavel}}}`, 'g'), valorFormatado);
  });

  return resposta;
}

/**
 * Formata múltiplas transações para template
 */
export function formatarListaTransacoes(
  transacoes: Array<{
    descricao: string;
    valor: number;
    tipo: 'entrada' | 'saida';
    categoria?: string;
    data?: string;
  }>,
  limite: number = 10
): string {
  if (transacoes.length === 0) {
    return 'Nenhuma transação encontrada.';
  }

  const transacoesLimitadas = transacoes.slice(0, limite);
  let lista = '';

  transacoesLimitadas.forEach((t, index) => {
    const emoji = t.tipo === 'entrada' ? '💰' : '🔴';
    const dataFormatada = t.data
      ? new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')
      : '—';

    lista += `${index + 1}. ${emoji} *${t.descricao}*\n`;
    lista += `   ${formatarMoeda(t.valor)} • ${dataFormatada}\n`;
    if (t.categoria) {
      lista += `   ${t.categoria}\n`;
    }
    lista += '\n';
  });

  if (transacoes.length > limite) {
    lista += `\n💡 Mostrando ${limite} de ${transacoes.length} transações.`;
  }

  return lista.trim();
}

/**
 * Obtém template por tipo
 */
export function obterTemplatePorTipo(
  tipo: TemplateResposta['tipo']
): TemplateResposta[] {
  return TEMPLATES.filter((t) => t.tipo === tipo);
}

