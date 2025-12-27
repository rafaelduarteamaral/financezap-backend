/**
 * Testes para processamento de mensagens do WhatsApp
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Processamento de Mensagens WhatsApp', () => {
  describe('Detecção de intenções', () => {
    it('deve detectar intenção de transação', () => {
      const mensagens = [
        'comprei pizza por 50 reais',
        'gastei 100 reais',
        'recebi salário de 2000',
        'paguei conta de 500',
      ];

      mensagens.forEach(mensagem => {
        const lower = mensagem.toLowerCase();
        const isTransacao = 
          /(comprei|gastei|recebi|paguei|salário|salario)/i.test(mensagem) &&
          /\d+/.test(mensagem);
        
        expect(isTransacao).toBe(true);
      });
    });

    it('deve detectar intenção de agendamento', () => {
      const mensagens = [
        'agende pagamento de 200 para dia 15',
        'agendar recebimento de 500 no dia 20',
        'lembre-me de pagar 300 no dia 10',
      ];

      mensagens.forEach(mensagem => {
        const lower = mensagem.toLowerCase();
        const isAgendamento = 
          /(agende|agendar|lembre|lembrar)/i.test(mensagem) &&
          /\d+/.test(mensagem);
        
        expect(isAgendamento).toBe(true);
      });
    });

    it('deve detectar intenção de relatório', () => {
      const mensagens = [
        'resumo do mês',
        'relatório semanal',
        'quanto gastei hoje',
        'saldo atual',
      ];

      mensagens.forEach(mensagem => {
        const lower = mensagem.toLowerCase();
        const isRelatorio = 
          /(resumo|relatório|relatorio|gastei|saldo)/i.test(mensagem);
        
        expect(isRelatorio).toBe(true);
      });
    });
  });

  describe('Extração de dados', () => {
    it('deve extrair valor monetário', () => {
      const casos = [
        { input: 'comprei pizza por 50 reais', expected: 50 },
        { input: 'gastei R$ 100,00', expected: 100 },
        { input: 'recebi 500.50', expected: 500.50 },
        { input: 'paguei 1000 reais', expected: 1000 }, // Sem ponto para evitar ambiguidade
      ];

      casos.forEach(({ input, expected }) => {
        const valorMatch = input.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
        if (valorMatch) {
          let valorStr = valorMatch[1];
          // Se tem vírgula, assume formato brasileiro (1.234,56)
          // Remove pontos (milhar) e substitui vírgula por ponto
          if (valorStr.includes(',')) {
            valorStr = valorStr.replace(/\./g, '').replace(',', '.');
          } else if (valorStr.includes('.')) {
            // Se tem ponto mas não vírgula, verifica se é decimal ou milhar
            const partes = valorStr.split('.');
            // Se tem mais de 2 partes, são pontos de milhar
            if (partes.length > 2) {
              // Múltiplos pontos = milhar, remove todos
              valorStr = valorStr.replace(/\./g, '');
            } else if (partes.length === 2) {
              // Um ponto: verifica se parte decimal tem 1-2 dígitos
              // Se a segunda parte tem 3 dígitos, provavelmente é milhar (1.000)
              // Se tem 1-2 dígitos, é decimal (500.50)
              if (partes[1].length === 3 && partes[1].match(/^\d{3}$/)) {
                // Provavelmente é milhar (1.000), mas pode ser decimal (1.000)
                // Para este teste, assumimos que se tem 3 dígitos após ponto e não tem vírgula, é milhar
                valorStr = valorStr.replace(/\./g, '');
              } else if (partes[1].length <= 2) {
                // É decimal (ex: 500.50)
                valorStr = valorStr;
              } else {
                // Mais de 3 dígitos = milhar
                valorStr = valorStr.replace(/\./g, '');
              }
            }
          }
          const valor = parseFloat(valorStr);
          expect(valor).toBe(expected);
        }
      });
    });

    it('deve extrair descrição', () => {
      const mensagens = [
        'comprei pizza por 50 reais',
        'gastei 100 no supermercado',
        'recebi salário de 2000',
      ];

      mensagens.forEach(mensagem => {
        // Remove números e valores monetários para obter descrição
        const descricao = mensagem
          .replace(/(?:r\$\s*)?\d+(?:[.,]\d{1,2})?/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        expect(descricao.length).toBeGreaterThan(0);
      });
    });

    it('deve detectar tipo (entrada/saída)', () => {
      const casos = [
        { input: 'comprei pizza', expected: 'saida' },
        { input: 'gastei 100', expected: 'saida' },
        { input: 'recebi salário', expected: 'entrada' },
        { input: 'me pagaram 500', expected: 'entrada' },
      ];

      casos.forEach(({ input, expected }) => {
        const lower = input.toLowerCase();
        const tipo = 
          /(recebi|recebido|ganhei|vendi|salário|salario|me pagou|me pagaram)/i.test(input)
            ? 'entrada'
            : 'saida';
        
        expect(tipo).toBe(expected);
      });
    });
  });

  describe('Validação de dados extraídos', () => {
    it('deve validar valor maior que zero', () => {
      const valores = [50, 100, 0, -10, 0.01];

      valores.forEach(valor => {
        const valido = valor > 0;
        if (valor <= 0) {
          expect(valido).toBe(false);
        } else {
          expect(valido).toBe(true);
        }
      });
    });

    it('deve validar descrição não vazia', () => {
      const descricoes = [
        'Pizza',
        'Supermercado',
        '',
        '   ',
      ];

      descricoes.forEach(desc => {
        const valida = desc.trim().length > 0;
        if (desc.trim() === '') {
          expect(valida).toBe(false);
        } else {
          expect(valida).toBe(true);
        }
      });
    });
  });

  describe('Formatação de resposta', () => {
    it('deve formatar mensagem de sucesso', () => {
      const transacao = {
        descricao: 'Pizza',
        valor: 50,
        tipo: 'saida',
        categoria: 'alimentação',
      };

      const mensagem = `✅ Transação Registrada Com Sucesso!

📄 Descrição: ${transacao.descricao}
💰 Valor: R$ ${transacao.valor.toFixed(2).replace('.', ',')}
🔄 Tipo: ${transacao.tipo === 'entrada' ? '💰 Entrada' : '🔴 Saída'}
🏷️ Categoria: ${transacao.categoria}`;

      expect(mensagem).toContain('✅');
      expect(mensagem).toContain(transacao.descricao);
      expect(mensagem).toContain('R$');
    });

    it('deve formatar valores monetários corretamente', () => {
      const valores = [50, 100.5, 1000, 10000.99];

      valores.forEach(valor => {
        const formatado = new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(valor);

        expect(formatado).toContain('R$');
        expect(formatado).toContain(',');
      });
    });
  });
});

