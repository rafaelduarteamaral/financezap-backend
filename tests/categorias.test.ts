import request from 'supertest';
import { app } from '../src/index';

// Mock do Prisma
jest.mock('../src/database', () => ({
  prisma: {
    categoria: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock das funções de categorias
jest.mock('../src/categorias', () => ({
  buscarCategorias: jest.fn(),
  criarCategoria: jest.fn(),
  atualizarCategoria: jest.fn(),
  removerCategoria: jest.fn(),
  inicializarCategoriasPadrao: jest.fn(),
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

describe('API de Categorias', () => {
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

  describe('GET /api/categorias', () => {
    it('deve retornar lista de categorias', async () => {
      const { buscarCategorias } = require('../src/categorias');
      buscarCategorias.mockResolvedValue([
        { id: 1, nome: 'alimentacao', cor: '#FF0000', padrao: true, tipo: 'saida' },
        { id: 2, nome: 'transporte', cor: '#00FF00', padrao: true, tipo: 'saida' },
      ]);

      const response = await request(app)
        .get('/api/categorias')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.categorias).toBeDefined();
      expect(Array.isArray(response.body.categorias)).toBe(true);
    });
  });

  describe('POST /api/categorias', () => {
    const novaCategoria = {
      nome: 'Categoria Teste',
      cor: '#FF0000',
      tipo: 'saida',
    };

    it('deve criar categoria com sucesso', async () => {
      const { criarCategoria } = require('../src/categorias');
      criarCategoria.mockResolvedValue({
        id: 3,
        telefone: 'whatsapp:+5511999999999',
        ...novaCategoria,
        padrao: false,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      const response = await request(app)
        .post('/api/categorias')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send(novaCategoria);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.categoria).toBeDefined();
    });

    it('deve retornar erro se nome não for fornecido', async () => {
      const response = await request(app)
        .post('/api/categorias')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          cor: '#FF0000',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
