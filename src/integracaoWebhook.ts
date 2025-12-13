/**
 * 🔗 Integração do Roteador no Webhook
 * 
 * Importe e use esta função no seu webhook (index.ts ou worker.ts)
 */

import { processarMensagemComRoteamento, gerarMensagemResposta } from './roteadorServicos';
import { processarTransacao, processarAgendamento, processarConsulta } from './processadoresServicos';

/**
 * Função principal para processar mensagens do WhatsApp usando o roteador
 * 
 * @param mensagem - Mensagem recebida do usuário
 * @param telefone - Número de telefone do usuário (sem prefixo whatsapp:)
 * @param chatIA - Função de chat com IA (ex: import { chatIA } from './chatIA')
 * @returns Mensagem de resposta formatada para o usuário
 */
export async function processarMensagemWhatsAppComRoteador(
  mensagem: string,
  telefone: string,
  chatIA: (prompt: string) => Promise<string>
): Promise<string> {
  try {
    // Processa a mensagem usando o roteador
    const { servicoUsado, resultado } = await processarMensagemComRoteamento(
      mensagem,
      telefone,
      chatIA,
      {
        transacao: processarTransacao,
        agendamento: processarAgendamento,
        consulta: processarConsulta
      }
    );

    // Gera mensagem de resposta amigável
    const resposta = gerarMensagemResposta(servicoUsado, resultado);

    return resposta;
  } catch (error) {
    console.error('[IntegracaoWebhook] Erro ao processar mensagem:', error);
    return '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
  }
}
