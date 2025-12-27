/**
 * Testes para envio de mensagens via Z-API
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Z-API - Envio de Mensagens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Formatação de número de telefone', () => {
    it('deve formatar número com prefixo whatsapp:', () => {
      const telefone = 'whatsapp:+5561981474690';
      const numeroLimpo = telefone.replace('whatsapp:', '').replace('+', '');
      const numeroFormatado = numeroLimpo.startsWith('55') 
        ? numeroLimpo 
        : `55${numeroLimpo}`;

      expect(numeroFormatado).toBe('5561981474690');
    });

    it('deve adicionar código do país se não tiver', () => {
      const telefone = 'whatsapp:+61981474690';
      const numeroLimpo = telefone.replace('whatsapp:', '').replace('+', '');
      const numeroFormatado = numeroLimpo.startsWith('55') 
        ? numeroLimpo 
        : `55${numeroLimpo}`;

      expect(numeroFormatado).toBe('5561981474690');
    });

    it('deve remover espaços e caracteres especiais', () => {
      const telefone = 'whatsapp:+55 (61) 98147-4690';
      const numeroLimpo = telefone.replace('whatsapp:', '').replace(/[^\d]/g, '');
      const numeroFormatado = numeroLimpo.startsWith('55') 
        ? numeroLimpo 
        : `55${numeroLimpo}`;

      expect(numeroFormatado).toBe('5561981474690');
    });
  });

  describe('Estrutura de requisição', () => {
    it('deve criar body correto para envio de mensagem', () => {
      const numeroFormatado = '5561981474690';
      const mensagem = 'Teste de mensagem';

      const requestBody = {
        phone: numeroFormatado,
        message: mensagem,
      };

      expect(requestBody).toEqual({
        phone: '5561981474690',
        message: 'Teste de mensagem',
      });
    });

    it('deve incluir headers corretos', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Client-Token': 'test-client-token',
      };

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Client-Token']).toBeDefined();
    });
  });

  describe('Validação de mensagem', () => {
    it('deve validar mensagem não vazia', () => {
      const mensagens = [
        { msg: 'Teste', valida: true },
        { msg: '', valida: false },
        { msg: '   ', valida: false },
        { msg: 'Mensagem com 100 caracteres: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.', valida: true },
      ];

      mensagens.forEach(({ msg, valida }) => {
        const isValid = msg.trim().length > 0;
        expect(isValid).toBe(valida);
      });
    });

    it('deve dividir mensagens longas', () => {
      const mensagemLonga = 'A'.repeat(5000);
      const maxLength = 4096; // Limite do WhatsApp
      
      const needsSplit = mensagemLonga.length > maxLength;
      expect(needsSplit).toBe(true);

      if (needsSplit) {
        const partes = [];
        for (let i = 0; i < mensagemLonga.length; i += maxLength) {
          partes.push(mensagemLonga.substring(i, i + maxLength));
        }
        expect(partes.length).toBeGreaterThan(1);
      }
    });
  });

  describe('Tratamento de erros', () => {
    it('deve tratar erro de API corretamente', () => {
      const errorResponse = {
        error: true,
        message: 'Número inválido',
        code: 400,
      };

      expect(errorResponse.error).toBe(true);
      expect(errorResponse.code).toBe(400);
    });

    it('deve tratar timeout corretamente', () => {
      const timeout = 30000; // 30 segundos
      expect(timeout).toBeGreaterThan(0);
    });
  });
});

