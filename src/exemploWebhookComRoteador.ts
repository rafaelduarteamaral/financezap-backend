/**
 * 📝 Exemplo de Integração do Roteador no Webhook
 * 
 * Este arquivo mostra como integrar o roteador de serviços
 * no processamento de mensagens do WhatsApp.
 * 
 * PASSO A PASSO:
 * 1. Importe este código no seu index.ts ou worker.ts
 * 2. Substitua as funções de processamento pelas suas implementações reais
 * 3. Adapte para usar suas funções de banco de dados
 */

import { processarMensagemComRoteamento, gerarMensagemResposta } from './roteadorServicos';
import { processarTransacao, processarAgendamento, processarConsulta } from './processadoresServicos';

// Importe sua função de chat IA aqui
// import { chatIA } from './chatIA';

/**
 * Função principal para processar mensagens do WhatsApp
 * 
 * Esta função deve ser chamada quando uma mensagem chegar via webhook
 */
export async function processarMensagemWhatsApp(
  mensagem: string,
  telefone: string,
  chatIA: (prompt: string) => Promise<string> // Sua função de chat com IA
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
    const mensagemResposta = gerarMensagemResposta(servicoUsado, resultado);

    return mensagemResposta;
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    return '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
  }
}

/**
 * EXEMPLO DE USO NO WEBHOOK TWILIO (index.ts)
 * 
 * ```typescript
 * import express from 'express';
 * import { processarMensagemWhatsApp } from './exemploWebhookComRoteador';
 * import { chatIA } from './chatIA';
 * // import suas outras dependências
 * 
 * const app = express();
 * app.use(express.urlencoded({ extended: true }));
 * 
 * app.post('/webhook/whatsapp', async (req, res) => {
 *   try {
 *     const { Body, From } = req.body;
 *     const telefone = From.replace('whatsapp:', '');
 *     const mensagem = Body;
 * 
 *     // Processa usando o roteador
 *     const resposta = await processarMensagemWhatsApp(mensagem, telefone, chatIA);
 * 
 *     // Envia resposta via WhatsApp (Twilio)
 *     // await enviarMensagemWhatsApp(telefone, resposta);
 * 
 *     res.status(200).send('OK');
 *   } catch (error) {
 *     console.error('Erro no webhook:', error);
 *     res.status(500).send('Erro');
 *   }
 * });
 * ```
 */

/**
 * EXEMPLO DE USO NO WEBHOOK Z-API (index.ts)
 * 
 * ```typescript
 * app.post('/webhook/zapi', async (req, res) => {
 *   try {
 *     const { phone, message } = req.body;
 *     const telefone = phone;
 *     const mensagem = message;
 * 
 *     // Processa usando o roteador
 *     const resposta = await processarMensagemWhatsApp(mensagem, telefone, chatIA);
 * 
 *     // Envia resposta via WhatsApp (Z-API)
 *     // await enviarMensagemZAPI(telefone, resposta);
 * 
 *     res.status(200).json({ success: true });
 *   } catch (error) {
 *     console.error('Erro no webhook:', error);
 *     res.status(500).json({ success: false });
 *   }
 * });
 * ```
 */

/**
 * EXEMPLO DE USO NO CLOUDFLARE WORKER (worker.ts)
 * 
 * ```typescript
 * import { processarMensagemWhatsApp } from './exemploWebhookComRoteador';
 * import { chatIA } from './chatIA';
 * 
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     if (request.method === 'POST') {
 *       const url = new URL(request.url);
 * 
 *       if (url.pathname === '/webhook/zapi') {
 *         const body = await request.json();
 *         const { phone, message } = body;
 * 
 *         // Processa usando o roteador
 *         const resposta = await processarMensagemWhatsApp(
 *           message,
 *           phone,
 *           (prompt) => chatIA(prompt, env) // Adapte para seu chatIA
 *         );
 * 
 *         // Envia resposta via WhatsApp
 *         // await enviarMensagemZAPI(phone, resposta, env);
 * 
 *         return new Response(JSON.stringify({ success: true }), {
 *           headers: { 'Content-Type': 'application/json' }
 *         });
 *       }
 *     }
 * 
 *     return new Response('Not Found', { status: 404 });
 *   }
 * };
 * ```
 */
