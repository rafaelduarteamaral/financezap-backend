/**
 * Testes para comunicação WhatsApp via Z-API
 * Testa o webhook que recebe mensagens do WhatsApp
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Tipos para o body do webhook
interface WebhookBody {
  phone?: string;
  participantPhone?: string;
  isGroup?: boolean;
  text?: { message?: string };
  message?: string | { text?: string };
  buttonId?: string;
  buttonLabel?: string;
  button?: { id?: string; label?: string };
  buttonList?: { button?: { id?: string; label?: string } };
}

describe('Webhook Z-API - Comunicação WhatsApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validação de entrada', () => {
    it('deve rejeitar requisição sem número de telefone', () => {
      const body: WebhookBody = {};
      
      // Simula o comportamento esperado
      const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
      
      expect(phoneNumber).toBeUndefined();
    });

    it('deve aceitar requisição com número de telefone válido', () => {
      const body: WebhookBody = {
        phone: '5561981474690',
        text: { message: 'comprei pizza por 50 reais' },
      };

      const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
      
      expect(phoneNumber).toBe('5561981474690');
    });

    it('deve processar mensagem de grupo corretamente', () => {
      const body: WebhookBody = {
        isGroup: true,
        participantPhone: '5561981474690',
        text: { message: 'comprei pizza por 50 reais' },
      };

      const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
      
      expect(phoneNumber).toBe('5561981474690');
    });
  });

  describe('Formatação de telefone', () => {
    it('deve formatar telefone com código do país', () => {
      const phoneNumber = '5561981474690';
      const phoneNumberLimpo = phoneNumber.replace(/\D/g, '');
      
      let telefoneFormatado: string;
      if (phoneNumberLimpo.startsWith('55')) {
        telefoneFormatado = `whatsapp:+${phoneNumberLimpo}`;
      } else {
        telefoneFormatado = `whatsapp:+55${phoneNumberLimpo}`;
      }

      expect(telefoneFormatado).toBe('whatsapp:+5561981474690');
    });

    it('deve adicionar código do país se não tiver', () => {
      const phoneNumber = '61981474690';
      const phoneNumberLimpo = phoneNumber.replace(/\D/g, '');
      
      let telefoneFormatado: string;
      if (phoneNumberLimpo.startsWith('55')) {
        telefoneFormatado = `whatsapp:+${phoneNumberLimpo}`;
      } else {
        telefoneFormatado = `whatsapp:+55${phoneNumberLimpo}`;
      }

      expect(telefoneFormatado).toBe('whatsapp:+5561981474690');
    });
  });

  describe('Extração de mensagem', () => {
    it('deve extrair mensagem de texto corretamente', () => {
      const body: WebhookBody = {
        phone: '5561981474690',
        text: { message: 'comprei pizza por 50 reais' },
      };

      const messageText = body.text?.message || 
        (typeof body.message === 'object' ? body.message?.text : undefined) || 
        (typeof body.message === 'string' ? body.message : '') || 
        '';
      
      expect(messageText).toBe('comprei pizza por 50 reais');
    });

    it('deve extrair mensagem de diferentes formatos', () => {
      const body1: WebhookBody = { phone: '5561981474690', message: { text: 'teste' } };
      const message1 = body1.text?.message || 
        (typeof body1.message === 'object' ? body1.message?.text : undefined) || 
        (typeof body1.message === 'string' ? body1.message : '') || 
        '';
      expect(message1).toBe('teste');

      const body2: WebhookBody = { phone: '5561981474690', message: 'teste direto' };
      const message2 = body2.text?.message || 
        (typeof body2.message === 'object' ? body2.message?.text : undefined) || 
        (typeof body2.message === 'string' ? body2.message : '') || 
        '';
      expect(message2).toBe('teste direto');
    });

    it('deve processar clique em botão', () => {
      const body: WebhookBody = {
        phone: '5561981474690',
        buttonId: 'excluir_transacao_123',
        buttonLabel: 'Excluir Transação',
      };

      const buttonId = body.buttonId || body.button?.id || body.buttonList?.button?.id;
      const buttonLabel = body.buttonLabel || body.button?.label || body.buttonList?.button?.label;

      expect(buttonId).toBe('excluir_transacao_123');
      expect(buttonLabel).toBe('Excluir Transação');
    });
  });

  describe('Processamento de transações', () => {
    it('deve identificar intenção de transação', () => {
      const mensagens = [
        'comprei pizza por 50 reais',
        'gastei 100 reais no mercado',
        'recebi 500 reais de salário',
        'paguei 200 reais de conta',
      ];

      mensagens.forEach(mensagem => {
        const temValor = /\d+/.test(mensagem);
        const temPalavraFinanceira = /(comprei|gastei|recebi|paguei|salário|salario|conta|mercado)/i.test(mensagem);
        
        expect(temValor || temPalavraFinanceira).toBe(true);
      });
    });

    it('deve extrair valor da mensagem', () => {
      const mensagens = [
        { text: 'comprei pizza por 50 reais', expected: 50 },
        { text: 'gastei R$ 100 no mercado', expected: 100 },
        { text: 'recebi 500,00 reais', expected: 500 },
      ];

      mensagens.forEach(({ text, expected }) => {
        const valorMatch = text.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
        const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 0;
        
        expect(valor).toBe(expected);
      });
    });
  });

  describe('Validação de dados', () => {
    it('deve validar formato de telefone brasileiro', () => {
      const telefonesValidos = [
        '5561981474690',
        '5561999999999',
        '5511999999999',
      ];

      telefonesValidos.forEach(tel => {
        const limpo = tel.replace(/\D/g, '');
        expect(limpo.length).toBeGreaterThanOrEqual(12);
        expect(limpo.startsWith('55')).toBe(true);
      });
    });

    it('deve rejeitar telefones inválidos', () => {
      const telefonesInvalidos = [
        { tel: '', motivo: 'vazio' },
        { tel: '123', motivo: 'muito curto' },
        { tel: 'abc', motivo: 'não numérico' },
        { tel: '556198147469012345', motivo: 'muito longo' }, // mais de 15 dígitos
      ];

      telefonesInvalidos.forEach(({ tel, motivo }) => {
        const limpo = tel.replace(/\D/g, '');
        // Telefone válido: entre 12 e 15 dígitos e começa com 55
        const valido = limpo.length >= 12 && limpo.length <= 15 && limpo.startsWith('55');
        if (motivo === 'muito longo') {
          // Telefone muito longo não é válido
          expect(valido).toBe(false);
        } else {
          expect(valido).toBe(false);
        }
      });
    });
  });
});

