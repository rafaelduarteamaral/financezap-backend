import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  buscarTransacoes,
  calcularEstatisticas,
  gastosPorDia,
  listarTelefones,
  registrarNumero,
  removerTransacao,
  resumoPorTelefone,
  salvarTransacao,
} from './d1';
import { gerarCodigoVerificacao, salvarCodigoVerificacao, verificarCodigo } from './codigoVerificacao';
import jwt from '@tsndr/cloudflare-worker-jwt';

type Bindings = {
  financezap_db: D1Database;
  ALLOWED_ORIGINS?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_NUMBER?: string;
  ZAPI_INSTANCE_ID?: string;
  ZAPI_TOKEN?: string;
  ZAPI_BASE_URL?: string;
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

function parseAllowedOrigins(raw?: string): string[] {
  return (raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
      if (allowed.includes('*') || !origin) return origin || '*';
      return allowed.includes(origin) ? origin : allowed[0] || '*';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.get('/', (c) =>
  c.json({
    ok: true,
    service: 'financezap-worker',
    now: new Date().toISOString(),
  })
);

function extrairValor(mensagem?: string): number | null {
  if (!mensagem) return null;
  const match = mensagem.match(/-?\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const valorStr = match[0].replace('.', '').replace(',', '.');
  const valor = Number.parseFloat(valorStr);
  return Number.isFinite(valor) ? valor : null;
}

function limparTelefone(telefone?: string): string {
  if (!telefone) return 'desconhecido';
  return telefone.replace('whatsapp:', '').trim();
}

function formatarTelefone(telefone: string): string {
  const telefoneLimpo = telefone.replace(/\D/g, '');
  return telefoneLimpo.startsWith('55') 
    ? `whatsapp:+${telefoneLimpo}` 
    : `whatsapp:+55${telefoneLimpo}`;
}

async function numeroEstaRegistrado(db: D1Database, telefone: string): Promise<boolean> {
  const variacoes = [
    telefone,
    telefone.replace('whatsapp:', ''),
    telefone.replace(/^\+/, ''),
    `+${telefone.replace(/^\+/, '')}`,
    `whatsapp:+${telefone.replace(/^whatsapp:\+?/, '')}`,
  ];
  
  for (const variacao of variacoes) {
    const result = await db
      .prepare('SELECT telefone FROM numeros_registrados WHERE telefone = ?')
      .bind(variacao)
      .first();
    if (result) return true;
  }
  return false;
}

async function enviarMensagemZApi(
  telefone: string,
  mensagem: string,
  env: Bindings
): Promise<{ success: boolean; error?: string }> {
  if (!env.ZAPI_INSTANCE_ID || !env.ZAPI_TOKEN) {
    return { success: false, error: 'Z-API não configurada' };
  }
  
  const baseUrl = env.ZAPI_BASE_URL || 'https://api.z-api.io';
  const url = `${baseUrl}/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}/send-text`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: telefone,
        message: mensagem,
      }),
    });
    
    const data = await response.json();
    return response.ok 
      ? { success: true }
      : { success: false, error: data.message || 'Erro ao enviar mensagem' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

app.post('/webhook/whatsapp', async (c) => {
  const body = await c.req.parseBody();
  const from = typeof body?.From === 'string' ? body.From : '';
  const mensagem = typeof body?.Body === 'string' ? body.Body : '';

  const telefone = limparTelefone(from);
  const dataHora = new Date().toISOString();
  const data = dataHora.slice(0, 10);

  await registrarNumero(c.env.financezap_db, telefone);

  const valor = extrairValor(mensagem) ?? 0;

  await salvarTransacao(c.env.financezap_db, {
    telefone,
    descricao: mensagem || 'Mensagem recebida',
    valor,
    categoria: 'outros',
    tipo: valor >= 0 ? 'saida' : 'entrada',
    metodo: 'debito',
    dataHora,
    data,
    mensagemOriginal: mensagem,
  });

  const twiml = `<Response><Message>Recebido! Registramos sua mensagem.</Message></Response>`;
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
});

app.get('/api/transacoes', async (c) => {
  const query = c.req.query();
  const valorMin = query.valorMin !== undefined ? Number(query.valorMin) : undefined;
  const valorMax = query.valorMax !== undefined ? Number(query.valorMax) : undefined;
  const limit = query.limit !== undefined ? Number(query.limit) : undefined;
  const page = query.page !== undefined ? Number(query.page) : undefined;
  const offset = page && limit ? (page - 1) * limit : undefined;

  const { transacoes, total } = await buscarTransacoes(c.env.financezap_db, {
    telefone: query.telefone,
    dataInicio: query.dataInicio,
    dataFim: query.dataFim,
    valorMin: Number.isFinite(valorMin) ? valorMin : undefined,
    valorMax: Number.isFinite(valorMax) ? valorMax : undefined,
    descricao: query.descricao,
    categoria: query.categoria,
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  });

  return c.json({
    success: true,
    total,
    transacoes,
  });
});

app.delete('/api/transacoes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }
  const removed = await removerTransacao(c.env.financezap_db, id);
  if (!removed) {
    return c.json({ success: false, error: 'Transação não encontrada' }, 404);
  }
  return c.json({ success: true });
});

app.get('/api/estatisticas', async (c) => {
  const query = c.req.query();
  const valorMin = query.valorMin !== undefined ? Number(query.valorMin) : undefined;
  const valorMax = query.valorMax !== undefined ? Number(query.valorMax) : undefined;

  const estatisticas = await calcularEstatisticas(c.env.financezap_db, {
    telefone: query.telefone,
    dataInicio: query.dataInicio,
    dataFim: query.dataFim,
    valorMin: Number.isFinite(valorMin) ? valorMin : undefined,
    valorMax: Number.isFinite(valorMax) ? valorMax : undefined,
    descricao: query.descricao,
    categoria: query.categoria,
  });
  return c.json({ success: true, estatisticas });
});

app.get('/api/gastos-por-dia', async (c) => {
  const query = c.req.query();
  const diasRaw = query.dias !== undefined ? Number(query.dias) : NaN;
  const dias = Number.isFinite(diasRaw) && diasRaw > 0 ? diasRaw : 30;
  const data = await gastosPorDia(c.env.financezap_db, query.telefone, dias);
  return c.json({ success: true, data });
});

app.get('/api/telefones', async (c) => {
  const telefones = await listarTelefones(c.env.financezap_db);
  return c.json({ success: true, telefones });
});

app.get('/api/resumo/:telefone', async (c) => {
  const telefone = c.req.param('telefone');
  const resumo = await resumoPorTelefone(c.env.financezap_db, telefone);
  return c.json({ success: true, resumo });
});

// Rota de autenticação: Solicitar código
app.post('/api/auth/solicitar-codigo', async (c) => {
  try {
    const body = await c.req.json();
    const { telefone } = body;
    
    if (!telefone || !telefone.trim()) {
      return c.json({ success: false, error: 'Telefone é obrigatório' }, 400);
    }
    
    const telefoneFormatado = formatarTelefone(telefone);
    
    // Verifica se o número está registrado
    const estaRegistrado = await numeroEstaRegistrado(c.env.financezap_db, telefoneFormatado);
    
    if (!estaRegistrado) {
      return c.json({
        success: false,
        error: 'Número não encontrado. Você precisa ter enviado pelo menos uma mensagem para este número via WhatsApp primeiro.'
      }, 404);
    }
    
    // Gera código de verificação
    const codigo = gerarCodigoVerificacao();
    salvarCodigoVerificacao(telefoneFormatado, codigo);
    
    console.log(`🔐 Código gerado para ${telefoneFormatado}: ${codigo}`);
    
    // Envia código via WhatsApp
    const mensagem = `🔐 Seu código de verificação FinanceZap é: *${codigo}*\n\nEste código expira em 5 minutos.\n\nSe você não solicitou este código, ignore esta mensagem.`;
    
    const resultado = await enviarMensagemZApi(telefoneFormatado, mensagem, c.env);
    
    if (!resultado.success) {
      // Em desenvolvimento, retorna o código mesmo se falhar o envio
      const isDevelopment = c.env.JWT_SECRET === undefined || c.env.JWT_SECRET.length < 32;
      if (isDevelopment) {
        return c.json({
          success: true,
          message: 'Código de verificação gerado (erro ao enviar via WhatsApp)',
          telefone: telefoneFormatado,
          codigo: codigo,
          warning: 'Erro ao enviar via WhatsApp. Use o código acima para fazer login.'
        });
      }
      return c.json({
        success: false,
        error: resultado.error || 'Erro ao enviar código via WhatsApp'
      }, 500);
    }
    
    return c.json({
      success: true,
      message: 'Código de verificação enviado via WhatsApp',
      telefone: telefoneFormatado
    });
  } catch (error: any) {
    console.error('❌ Erro ao solicitar código:', error);
    return c.json({
      success: false,
      error: error.message || 'Erro ao processar solicitação'
    }, 500);
  }
});

// Rota de autenticação: Verificar código
app.post('/api/auth/verificar-codigo', async (c) => {
  try {
    const body = await c.req.json();
    const { telefone, codigo } = body;
    
    if (!telefone || !telefone.trim()) {
      return c.json({ success: false, error: 'Telefone é obrigatório' }, 400);
    }
    
    if (!codigo || !codigo.trim()) {
      return c.json({ success: false, error: 'Código é obrigatório' }, 400);
    }
    
    const telefoneFormatado = formatarTelefone(telefone);
    
    // Verifica o código
    const codigoValido = verificarCodigo(telefoneFormatado, codigo);
    
    if (!codigoValido) {
      return c.json({
        success: false,
        error: 'Código inválido ou expirado'
      }, 401);
    }
    
    // Gera token JWT usando biblioteca compatível com Workers
    // Nota: Em produção, configure JWT_SECRET no wrangler.toml ou variáveis de ambiente
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    // Calcula expiração (7 dias = 7 * 24 * 60 * 60 segundos)
    const expiresInSeconds = 7 * 24 * 60 * 60; // 7 dias
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    
    const token = await jwt.sign(
      { 
        telefone: telefoneFormatado,
        exp: exp,
        iat: Math.floor(Date.now() / 1000)
      },
      jwtSecret
    );
    
    // Busca informações do usuário no banco (simplificado - você pode expandir isso)
    const usuario = await c.env.financezap_db
      .prepare('SELECT telefone FROM numeros_registrados WHERE telefone = ?')
      .bind(telefoneFormatado)
      .first();
    
    return c.json({
      success: true,
      token,
      telefone: telefoneFormatado,
      usuario: {
        telefone: telefoneFormatado,
        status: 'ativo' // Simplificado - você pode expandir isso
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao verificar código:', error);
    return c.json({
      success: false,
      error: error.message || 'Erro ao processar verificação'
    }, 500);
  }
});

export default app;
