import request from 'supertest';
import { app } from '../src/index';

// Mock do Prisma
jest.mock('../src/database', () => ({
  prisma: {
    agendamento: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock das funções de agendamentos
jest.mock('../src/agendamentos', () => ({
  buscarAgendamentosPorTelefone: jest.fn(),
  criarAgendamento: jest.fn(),
  buscarAgendamentoPorId: jest.fn(),
  atualizarStatusAgendamento: jest.fn(),
  removerAgendamento: jest.fn(),
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

describe('API de Agendamentos', () => {
  let authToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const { prisma } = require('../src/database');
    prisma.usuario.findUnique = jest.fn().mockResolvedValue({
      telefone: 'whatsapp:+5511999999999',
      nome: 'Teste',
      status: 'ativo',
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ telefone: '+5511999999999' });

    if (loginResponse.status === 200 && loginResponse.body.token) {
      authToken = loginResponse.body.token;
    }
  });

  describe('GET /api/agendamentos', () => {
    it('deve retornar lista de agendamentos', async () => {
      const { buscarAgendamentosPorTelefone } = require('../src/agendamentos');
      buscarAgendamentosPorTelefone.mockResolvedValue([
        {
          id: 1,
          telefone: 'whatsapp:+5511999999999',
          descricao: 'Agendamento Teste',
          valor: 100.0,
          dataAgendamento: '2024-12-31',
          tipo: 'pagamento',
          status: 'pendente',
          categoria: 'outros',
          notificado: false,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        },
      ]);

      const response = await request(app)
        .get('/api/agendamentos')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.agendamentos).toBeDefined();
      expect(Array.isArray(response.body.agendamentos)).toBe(true);
    });
  });

  describe('POST /api/agendamentos', () => {
    const novoAgendamento = {
      descricao: 'Novo Agendamento',
      valor: 200.0,
      dataAgendamento: '2024-12-31',
      tipo: 'pagamento',
      categoria: 'outros',
    };

    it('deve criar agendamento com sucesso', async () => {
      const { criarAgendamento } = require('../src/agendamentos');
      criarAgendamento.mockResolvedValue(2);

      const response = await request(app)
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send(novoAgendamento);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.agendamento).toBeDefined();
    });

    it('deve retornar erro se descrição não for fornecida', async () => {
      const response = await request(app)
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          valor: 200.0,
          dataAgendamento: '2024-12-31',
          tipo: 'pagamento',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
