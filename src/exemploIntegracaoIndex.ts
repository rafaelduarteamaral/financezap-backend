/**
 * 📝 Exemplo de Como Integrar o Roteador no index.ts
 * 
 * Este arquivo mostra como integrar o roteador no seu webhook existente.
 * Copie e adapte o código relevante para o seu index.ts ou worker.ts.
 */

/* 
 * EXEMPLO 1: INTEGRAÇÃO NO WEBHOOK TWILIO (index.ts)
 * 
 * No seu arquivo index.ts, importe e use assim:
 */

/*
import express from 'express';
import { processarMensagemWhatsAppComRoteador } from './integracaoWebhook';
import { chatIA } from './chatIA'; // Sua função de chat IA
import { enviarMensagemWhatsApp } from './whatsapp'; // Função para enviar mensagem (Twilio)

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { Body, From } = req.body;
    const telefone = From.replace('whatsapp:', '');
    const mensagem = Body;

    console.log(`[Webhook] Mensagem de ${telefone}: ${mensagem}`);

    // Processa usando o roteador
    const resposta = await processarMensagemWhatsAppComRoteador(
      mensagem,
      telefone,
      chatIA
    );

    // Envia resposta via WhatsApp (Twilio)
    await enviarMensagemWhatsApp(telefone, resposta);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).send('Erro');
  }
});
*/

/* 
 * EXEMPLO 2: INTEGRAÇÃO NO WEBHOOK Z-API (index.ts)
 */

/*
app.post('/webhook/zapi', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const telefone = phone;
    const mensagem = message;

    console.log(`[Webhook Z-API] Mensagem de ${telefone}: ${mensagem}`);

    // Processa usando o roteador
    const resposta = await processarMensagemWhatsAppComRoteador(
      mensagem,
      telefone,
      chatIA
    );

    // Envia resposta via WhatsApp (Z-API)
    await enviarMensagemZAPI(telefone, resposta);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro no webhook Z-API:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
*/

/* 
 * EXEMPLO 3: INTEGRAÇÃO NO CLOUDFLARE WORKER (worker.ts)
 */

/*
import { processarMensagemWhatsAppComRoteador } from './integracaoWebhook';
import { chatIA } from './chatIA';
import { enviarMensagemZAPI } from './zapi';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST') {
      const url = new URL(request.url);

      if (url.pathname === '/webhook/zapi') {
        const body = await request.json();
        const { phone, message } = body;

        // Processa usando o roteador
        const resposta = await processarMensagemWhatsAppComRoteador(
          message,
          phone,
          (prompt) => chatIA(prompt, env) // Adapte para seu chatIA
        );

        // Envia resposta via WhatsApp
        await enviarMensagemZAPI(phone, resposta, env);

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
*/

/* 
 * EXEMPLO 4: SUBSTITUIR PROCESSAMENTO EXISTENTE
 * 
 * Se você já tem código que processa mensagens, pode substituir por:
 */

/*
// ANTES:
app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;
  
  // Seu código antigo de processamento aqui...
  const resposta = await processarMensagemAntiga(mensagem, telefone);
  
  await enviarMensagemWhatsApp(telefone, resposta);
  res.status(200).send('OK');
});

// DEPOIS:
app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const telefone = From.replace('whatsapp:', '');
  const mensagem = Body;
  
  // Usa o roteador
  const resposta = await processarMensagemWhatsAppComRoteador(
    mensagem,
    telefone,
    chatIA
  );
  
  await enviarMensagemWhatsApp(telefone, resposta);
  res.status(200).send('OK');
});
*/
