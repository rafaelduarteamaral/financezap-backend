import request from 'supertest';
import { app } from '../src/index';

describe('Health Check', () => {
  describe('GET /health', () => {
    it('deve retornar status 200', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
    });

    it('deve retornar informações de saúde', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });
  });
});
