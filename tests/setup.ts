// Configuração global para os testes
import dotenv from 'dotenv';
import path from 'path';

// Carrega variáveis de ambiente de teste (se existir)
const envTestPath = path.resolve(__dirname, '../.env.test');
try {
  dotenv.config({ path: envTestPath });
} catch (error) {
  // Ignora se arquivo não existir
}

// Configurações globais de teste
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest-tests-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';

// Desabilita logs de console durante os testes (opcional)
// Descomente as linhas abaixo se quiser silenciar os logs
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Limpa mocks antes de cada teste
beforeEach(() => {
  jest.clearAllMocks();
});

// Limpa dados após cada teste se necessário
afterEach(async () => {
  // Implementar limpeza de dados se necessário
});
