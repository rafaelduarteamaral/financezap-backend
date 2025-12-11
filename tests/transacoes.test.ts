import request from 'supertest';
import { app } from '../src/index';

// Mock do Prisma
jest.mock('../src/database', () => ({
  prisma: {
    transacao: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
    },
    numeroRegistrado: {
      findMany: jest.fn(),
    },
  },
  buscarTransacoesComFiltros: jest.fn(),
  buscarTransacaoPorId: jest.fn(),
  removerTransacao: jest.fn(),
  obterEstatisticas: jest.fn(),
  gastosPorDia: jest.fn(),
  salvarTransacao: jest.fn(),
}));

// Mock de carteiras
jest.mock('../src/carteiras', () => ({
  buscarCarteiraPadrao: jest.fn(),
  buscarCarteiraPorId: jest.fn(),
  buscarCarteirasPorTelefone: jest.fn(),
  criarCarteira: jest.fn(),
  buscarOuCriarCarteiraPorTipo: jest.fn(),
}));

// Mock de autenticação
jest.mock('../src/auth', () => ({
  autenticarMiddleware: (req: any, res: any, next: any) => {
    req.telefone = 'whatsapp:+5511999999999';
    next();
  },
  validarPermissaoDados: (req: any, res: any, next: any) => {
    next();
  },
}));

describe('API de Transações', () => {
  let authToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock de login
    const { prisma } = require('../src/database');
    if (prisma && prisma.usuario) {
      prisma.usuario.findUnique = jest.fn().mockResolvedValue({
        telefone: 'whatsapp:+5511999999999',
        nome: 'Teste',
        status: 'ativo',
      });
    }

    // Mock de carteiras
    const { buscarCarteiraPadrao, buscarOuCriarCarteiraPorTipo } = require('../src/carteiras');
    const carteiraPadrao = {
      id: 1,
      telefone: 'whatsapp:+5511999999999',
      nome: 'Carteira Principal',
      tipo: 'debito',
      limiteCredito: null,
      diaPagamento: null,
      padrao: 1,
      ativo: 1,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };
    buscarCarteiraPadrao.mockResolvedValue(carteiraPadrao);
    // Mock da nova função que é usada no código
    buscarOuCriarCarteiraPorTipo.mockImplementation(async (telefone: string, tipo: 'debito' | 'credito') => {
      return {
        ...carteiraPadrao,
        tipo,
        limiteCredito: tipo === 'credito' ? 1000 : null,
        diaPagamento: tipo === 'credito' ? 10 : null,
      };
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ telefone: '+5511999999999' });

    if (loginResponse.status === 200 && loginResponse.body.token) {
      authToken = loginResponse.body.token;
    }
  });

  describe('GET /api/transacoes', () => {
    it('deve retornar lista de transações', async () => {
      const { prisma } = require('../src/database');
      const { buscarTransacoesComFiltros } = require('../src/database');
      
      // Mock das consultas diretas ao Prisma que a rota faz
      prisma.transacao.findMany = jest.fn().mockResolvedValue([
        { telefone: 'whatsapp:+5511999999999' }
      ]);
      prisma.numeroRegistrado.findMany = jest.fn().mockResolvedValue([
        { telefone: 'whatsapp:+5511999999999' }
      ]);
      
      buscarTransacoesComFiltros.mockResolvedValue({
        transacoes: [
          {
            id: 1,
            telefone: 'whatsapp:+5511999999999',
            descricao: 'Teste',
            valor: 100.0,
            tipo: 'saida',
            categoria: 'outros',
            metodo: 'debito',
            dataHora: '2024-01-01 10:00:00',
            data: '2024-01-01',
            carteiraId: 1,
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const response = await request(app)
        .get('/api/transacoes')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transacoes).toBeDefined();
      expect(Array.isArray(response.body.transacoes)).toBe(true);
    });

    it('deve aplicar filtros corretamente', async () => {
      const { prisma } = require('../src/database');
      const { buscarTransacoesComFiltros } = require('../src/database');
      
      // Mock das consultas diretas ao Prisma que a rota faz
      prisma.transacao.findMany = jest.fn().mockResolvedValue([
        { telefone: 'whatsapp:+5511999999999' }
      ]);
      prisma.numeroRegistrado.findMany = jest.fn().mockResolvedValue([
        { telefone: 'whatsapp:+5511999999999' }
      ]);
      
      buscarTransacoesComFiltros.mockResolvedValue({
        transacoes: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      const response = await request(app)
        .get('/api/transacoes')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .query({
          page: 1,
          limit: 10,
          dataInicio: '2024-01-01',
          dataFim: '2024-01-31',
        });

      expect(response.status).toBe(200);
      expect(buscarTransacoesComFiltros).toHaveBeenCalled();
    });
  });

  describe('POST /api/transacoes', () => {
    const novaTransacao = {
      descricao: 'Nova Transação',
      valor: 50.0,
      tipo: 'saida',
      categoria: 'alimentacao',
      metodo: 'debito',
      data: '2024-01-01',
    };

    it('deve criar transação com sucesso', async () => {
      const { prisma } = require('../src/database');
      const { buscarOuCriarCarteiraPorTipo } = require('../src/carteiras');
      const { salvarTransacao } = require('../src/database');
      
      // Mock da função que busca ou cria carteira por tipo
      buscarOuCriarCarteiraPorTipo.mockResolvedValue({
        id: 1,
        telefone: 'whatsapp:+5511999999999',
        nome: 'Carteira Principal',
        tipo: 'debito',
        limiteCredito: null,
        diaPagamento: null,
        padrao: 1,
        ativo: 1,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });
      
      // Mock de salvarTransacao que é usado internamente
      salvarTransacao.mockResolvedValue(2);

      const response = await request(app)
        .post('/api/transacoes')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send(novaTransacao);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transacao).toBeDefined();
    });

    it('deve criar transação com carteira específica', async () => {
      const { prisma } = require('../src/database');
      const { buscarCarteiraPorId, buscarCarteiraPadrao } = require('../src/carteiras');
      const { salvarTransacao } = require('../src/database');
      
      // Mock de carteira específica
      buscarCarteiraPorId.mockResolvedValue({
        id: 2,
        telefone: 'whatsapp:+5511999999999',
        nome: 'Poupança',
        padrao: 0,
        ativo: 1,
      });
      
      // Não deve chamar buscarCarteiraPadrao se carteiraId for fornecido
      buscarCarteiraPadrao.mockResolvedValue(null);
      
      salvarTransacao.mockResolvedValue(3);
      prisma.transacao.findUnique = jest.fn().mockResolvedValue({
        id: 3,
        telefone: 'whatsapp:+5511999999999',
        ...novaTransacao,
        dataHora: '2024-01-01 10:00:00',
        carteiraId: 2,
      });

      const response = await request(app)
        .post('/api/transacoes')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          ...novaTransacao,
          carteiraId: 2,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.transacao.carteiraId).toBe(2);
    });

    it('deve retornar erro se descrição não for fornecida', async () => {
      const response = await request(app)
        .post('/api/transacoes')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          valor: 50.0,
          tipo: 'saida',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('deve retornar erro se valor não for fornecido', async () => {
      const response = await request(app)
        .post('/api/transacoes')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          descricao: 'Teste',
          tipo: 'saida',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/transacoes/:id', () => {
    it('deve deletar transação com sucesso', async () => {
      const { buscarTransacaoPorId, removerTransacao } = require('../src/database');
      buscarTransacaoPorId.mockResolvedValue({
        id: 1,
        telefone: 'whatsapp:+5511999999999',
      });
      removerTransacao.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/transacoes/1')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('deve retornar erro se transação não existir', async () => {
      const { buscarTransacaoPorId } = require('../src/database');
      buscarTransacaoPorId.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/transacoes/999')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/estatisticas', () => {
    it('deve retornar estatísticas', async () => {
      const { obterEstatisticas } = require('../src/database');
      obterEstatisticas.mockResolvedValue({
        totalGasto: 1000.0,
        totalTransacoes: 10,
        gastoHoje: 50.0,
        mediaGasto: 100.0,
      });

      const response = await request(app)
        .get('/api/estatisticas')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.estatisticas).toBeDefined();
      expect(response.body.estatisticas.totalGasto).toBeDefined();
    });
  });

  describe('GET /api/gastos-por-dia', () => {
    it('deve retornar gastos por dia', async () => {
      const { gastosPorDia } = require('../src/database');
      gastosPorDia.mockResolvedValue([
        { data: '2024-01-01', entradas: 100, saidas: 50, saldo: 50 },
        { data: '2024-01-02', entradas: 200, saidas: 100, saldo: 100 },
      ]);

      const response = await request(app)
        .get('/api/gastos-por-dia')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .query({ dias: 30 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.dados).toBeDefined();
      expect(Array.isArray(response.body.dados)).toBe(true);
    });
  });
});
