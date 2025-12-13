/**
 * 📝 Exemplo de Integração do Roteador de Serviços
 * 
 * Este arquivo mostra como integrar o roteador de serviços
 * no processamento de mensagens do WhatsApp.
 * 
 * Para usar, importe e adapte este código no seu arquivo de webhook.
 */

import { processarMensagemComRoteamento, gerarMensagemResposta } from './roteadorServicos';
import { chatIA } from './chatIA'; // Ajuste o import conforme seu arquivo

/**
 * Exemplo de função para processar transação
 */
async function processarTransacao(dados: any, telefone: string) {
  // Aqui você implementaria a lógica de salvar a transação
  // Exemplo:
  // const transacao = await salvarTransacao({
  //   descricao: dados.descricao,
  //   valor: dados.valor,
  //   categoria: dados.categoria,
  //   tipo: dados.tipo,
  //   metodo: dados.metodo,
  //   data: dados.data || new Date().toISOString().split('T')[0],
  //   telefone
  // });
  
  return {
    ...dados,
    id: 'exemplo-id',
    salvo: true
  };
}

/**
 * Exemplo de função para processar agendamento
 */
async function processarAgendamento(dados: any, telefone: string) {
  // Aqui você implementaria a lógica de criar o agendamento
  // Exemplo:
  // const agendamento = await criarAgendamento({
  //   descricao: dados.descricao,
  //   valor: dados.valor,
  //   categoria: dados.categoria,
  //   tipo: dados.tipo,
  //   metodo: dados.metodo,
  //   dataAgendamento: dados.dataAgendamento,
  //   recorrente: dados.recorrente || false,
  //   totalParcelas: dados.totalParcelas,
  //   frequencia: dados.frequencia || 'mensal',
  //   telefone
  // });
  
  return {
    ...dados,
    id: 'exemplo-id',
    criado: true
  };
}

/**
 * Exemplo de função para processar consulta
 */
async function processarConsulta(dados: any, telefone: string) {
  // Aqui você implementaria a lógica de buscar os dados
  // Exemplo:
  // let resultado;
  // switch (dados.tipoConsulta) {
  //   case 'saldo':
  //     resultado = await calcularSaldo(telefone);
  //     break;
  //   case 'resumo':
  //     resultado = await buscarResumo(telefone, dados.periodo);
  //     break;
  //   case 'agendamentos':
  //     resultado = await buscarAgendamentosPendentes(telefone);
  //     break;
  //   // ... outros casos
  // }
  
  return {
    mensagem: `📊 Resumo do período selecionado\n\n` +
              `💵 Saldo: R$ 1.500,00\n` +
              `📈 Entradas: R$ 3.000,00\n` +
              `📉 Saídas: R$ 1.500,00`,
    dados: {}
  };
}

/**
 * Exemplo de como usar no webhook do WhatsApp
 * 
 * Substitua esta função no seu arquivo index.ts ou worker.ts
 */
export async function exemploProcessarMensagemWhatsApp(
  mensagem: string,
  telefone: string
): Promise<string> {
  try {
    // Processa a mensagem usando o roteador
    const { servicoUsado, resultado } = await processarMensagemComRoteamento(
      mensagem,
      telefone,
      chatIA, // Sua função de chat com IA
      {
        transacao: processarTransacao,
        agendamento: processarAgendamento,
        consulta: processarConsulta
      }
    );

    // Gera mensagem de resposta amigável
    const mensagemResposta = gerarMensagemResposta(servicoUsado, resultado);

    return mensagemResposta;
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    return '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
  }
}

/**
 * Exemplo de uso no webhook (adaptar conforme seu código)
 */
/*
// No seu arquivo index.ts ou worker.ts:

import { exemploProcessarMensagemWhatsApp } from './exemploIntegracaoRoteador';

// No endpoint do webhook:
app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;

  // Processa usando o roteador
  const resposta = await exemploProcessarMensagemWhatsApp(mensagem, telefone);

  // Envia resposta via WhatsApp
  await enviarMensagemWhatsApp(telefone, resposta);

  res.status(200).send('OK');
});
*/
