/**
 * 📝 Exemplo Completo de index.ts com Integração do Roteador
 * 
 * Este é um exemplo de como integrar o roteador no seu webhook.
 * Copie o código relevante para o seu index.ts existente.
 */

/*
import express from 'express';
import dotenv from 'dotenv';
import { processarMensagemWhatsAppComRoteador } from './integracaoWebhook';
import { chatIA } from './chatIA'; // Sua função de chat IA
// import { enviarMensagemWhatsApp } from './whatsapp'; // Twilio
// import { enviarMensagemZAPI } from './zapi'; // Z-API

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webhook do Twilio (WhatsApp)
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

    // Envia resposta via WhatsApp (adapte conforme seu código)
    // await enviarMensagemWhatsApp(telefone, resposta);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).send('Erro');
  }
});

// Webhook da Z-API (WhatsApp)
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

    // Envia resposta via WhatsApp (adapte conforme seu código)
    // await enviarMensagemZAPI(telefone, resposta);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro no webhook Z-API:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de teste
app.get('/test-webhook', (req, res) => {
  res.json({ status: 'ok', message: 'Webhook está funcionando' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
*/
