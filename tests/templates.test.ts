import request from 'supertest';
import { app } from '../src/index';

// Mock do Prisma
jest.mock('../src/database', () => ({
  prisma: {
    template: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    usuario: {
      update: jest.fn(),
    },
  },
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

describe('API de Templates', () => {
  const telefoneTeste = 'whatsapp:+5511999999999';
  let authToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock de login para obter token
    const { prisma } = require('../src/database');
    prisma.usuario.findUnique = jest.fn().mockResolvedValue({
      telefone: telefoneTeste,
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

  describe('GET /api/templates', () => {
    it('deve retornar lista de templates', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findMany = jest.fn().mockResolvedValue([
        {
          id: 1,
          nome: 'Dark',
          tipo: 'dark',
          corPrimaria: '#3B82F6',
          corSecundaria: '#8B5CF6',
          corDestaque: '#10B981',
          corFundo: '#1E293B',
          corTexto: '#F1F5F9',
          ativo: 1,
          criadoEm: new Date(),
        },
        {
          id: 2,
          nome: 'Light',
          tipo: 'light',
          corPrimaria: '#3B82F6',
          corSecundaria: '#8B5CF6',
          corDestaque: '#10B981',
          corFundo: '#F9FAFB',
          corTexto: '#111827',
          ativo: 0,
          criadoEm: new Date(),
        },
      ]);

      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.templates).toBeDefined();
      expect(Array.isArray(response.body.templates)).toBe(true);
    });

    // Nota: A rota GET /api/templates requer autenticação, mas o mock permite acesso
    // Este teste verifica que a rota existe e funciona com autenticação
    it('deve retornar lista de templates quando autenticado', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/templates', () => {
    const novoTemplate = {
      nome: 'Template Teste',
      corPrimaria: '#FF0000',
      corSecundaria: '#00FF00',
      corDestaque: '#0000FF',
      corFundo: '#FFFFFF',
      corTexto: '#000000',
    };

    it('deve criar template com sucesso', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findMany = jest.fn().mockResolvedValue([]);
      prisma.template.create = jest.fn().mockResolvedValue({
        id: 3,
        ...novoTemplate,
        tipo: 'custom',
        ativo: 0,
        criadoEm: new Date(),
      });

      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send(novoTemplate);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template).toBeDefined();
      expect(response.body.template.nome).toBe(novoTemplate.nome);
    });

    it('deve retornar erro se nome não for fornecido', async () => {
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          corPrimaria: '#FF0000',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('deve retornar erro se cores não forem fornecidas', async () => {
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          nome: 'Template Teste',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/templates/:id/ativar', () => {
    it('deve ativar template com sucesso', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findFirst = jest.fn().mockResolvedValue({
        id: 1,
        nome: 'Dark',
        tipo: 'dark',
        corPrimaria: '#3B82F6',
        corSecundaria: '#8B5CF6',
        corDestaque: '#10B981',
        corFundo: '#1E293B',
        corTexto: '#F1F5F9',
        ativo: 0,
      });
      prisma.template.updateMany = jest.fn().mockResolvedValue({});
      prisma.template.update = jest.fn().mockResolvedValue({
        id: 1,
        ativo: 1,
      });
      prisma.usuario.update = jest.fn().mockResolvedValue({});

      const response = await request(app)
        .put('/api/templates/1/ativar')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('deve retornar erro se template não existir', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findFirst = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .put('/api/templates/999/ativar')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/templates/:id', () => {
    it('deve atualizar template com sucesso', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findFirst = jest.fn().mockResolvedValue({
        id: 1,
        tipo: 'custom',
      });
      prisma.template.update = jest.fn().mockResolvedValue({
        id: 1,
        nome: 'Template Atualizado',
      });

      const response = await request(app)
        .put('/api/templates/1')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          nome: 'Template Atualizado',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('não deve permitir editar templates padrão', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findFirst = jest.fn().mockResolvedValue({
        id: 1,
        tipo: 'dark',
      });

      const response = await request(app)
        .put('/api/templates/1')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`)
        .send({
          nome: 'Template Atualizado',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('padrão');
    });
  });

  describe('DELETE /api/templates/:id', () => {
    it('deve deletar template customizado com sucesso', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findFirst = jest.fn().mockResolvedValue({
        id: 3,
        tipo: 'custom',
      });
      prisma.template.delete = jest.fn().mockResolvedValue({});

      const response = await request(app)
        .delete('/api/templates/3')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('não deve permitir deletar templates padrão', async () => {
      const { prisma } = require('../src/database');
      prisma.template.findFirst = jest.fn().mockResolvedValue({
        id: 1,
        tipo: 'dark',
      });

      const response = await request(app)
        .delete('/api/templates/1')
        .set('Authorization', `Bearer ${authToken || 'test-token'}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('padrão');
    });
  });
});
