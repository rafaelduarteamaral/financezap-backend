import request from 'supertest';
import { app } from '../src/index';

// Mock completo do sistema para testes de integração
jest.mock('../src/database');
jest.mock('../src/auth');
jest.mock('../src/zapi');
jest.mock('../src/codigoVerificacao');
jest.mock('../src/categorias');
jest.mock('../src/agendamentos');

describe('Testes de Integração', () => {
  describe('Health Check', () => {
    it('deve retornar status ok', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('Rotas Públicas', () => {
    it('GET / deve retornar página inicial', async () => {
      const response = await request(app)
        .get('/');

      expect(response.status).toBe(200);
    });

    it('GET /app deve retornar página do app', async () => {
      const response = await request(app)
        .get('/app');

      expect(response.status).toBe(200);
    });
  });
});
