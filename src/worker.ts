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
  buscarUsuarioPorTelefone,
  criarUsuario,
  atualizarUsuarioPerfil,
  buscarCategoriasD1,
  criarCategoriaD1,
  atualizarCategoriaD1,
  removerCategoriaD1,
  buscarAgendamentosD1,
  buscarAgendamentoPorIdD1,
  atualizarStatusAgendamentoD1,
  removerAgendamentoD1,
  criarAgendamentoD1,
} from './d1';
import { gerarCodigoVerificacao, salvarCodigoVerificacao, verificarCodigo } from './codigoVerificacao';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Tipos para Cloudflare Workers
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { last_row_id: number; changes: number } }>;
}

type Bindings = {
  financezap_db: D1Database;
  ALLOWED_ORIGINS?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_NUMBER?: string;
  ZAPI_INSTANCE_ID?: string;
  ZAPI_TOKEN?: string;
  ZAPI_CLIENT_TOKEN?: string;
  ZAPI_BASE_URL?: string;
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  IA_PROVIDER?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

function parseAllowedOrigins(raw?: string): string[] {
  return (raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;
  
  // Verifica correspondência exata
  if (allowedOrigins.includes(origin)) return true;
  
  // Verifica padrões com wildcard (ex: *.pages.dev)
  for (const pattern of allowedOrigins) {
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(origin)) return true;
    }
  }
  
  return false;
}

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS);
      
      // Permite webhooks do Z-API (sem origem ou de api.z-api.io)
      if (!origin || origin.includes('z-api.io')) {
        return origin || '*';
      }
      
      // Se não há origem (ex: requisição do mesmo domínio), permite
      if (!origin) {
        return allowed[0] || '*';
      }
      
      // Verifica se a origem está permitida
      if (isOriginAllowed(origin, allowed)) {
        return origin;
      }
      
      // Fallback: permite a primeira origem da lista ou todas
      console.warn(`⚠️ Origem não permitida: ${origin}. Permitidas: ${allowed.join(', ')}`);
      return allowed[0] || '*';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
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

// Função auxiliar para criar variações com/sem dígito 9
function criarVariacoesDigito9(telefone: string): string[] {
  const variacoes: string[] = [];
  
  // Remove prefixos
  let limpo = telefone.replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
  
  // Se é número brasileiro (começa com 55 e tem pelo menos 12 dígitos)
  if (limpo.startsWith('55') && limpo.length >= 12) {
    const ddd = limpo.substring(2, 4);
    const resto = limpo.substring(4);
    
    // Tenta adicionar/remover o 9 após o DDD
    if (resto.startsWith('9') && resto.length === 10) {
      // Tem 9, cria variação sem 9
      const sem9 = `55${ddd}${resto.substring(1)}`;
      variacoes.push(sem9, `+${sem9}`, `whatsapp:+${sem9}`);
    } else if (!resto.startsWith('9') && resto.length === 9) {
      // Não tem 9, cria variação com 9
      const com9 = `55${ddd}9${resto}`;
      variacoes.push(com9, `+${com9}`, `whatsapp:+${com9}`);
    }
  }
  
  return variacoes;
}

function telefoneVariacoes(telefone: string): string[] {
  // Remove prefixos e normaliza
  let limpo = telefone.replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
  
  // Gera variações básicas
  const variacoes: string[] = [
    limpo,
    `+${limpo}`,
    `whatsapp:+${limpo}`,
  ];
  
  // Adiciona variações com/sem o dígito 9 (para números brasileiros)
  const variacoesDigito9 = criarVariacoesDigito9(telefone);
  variacoes.push(...variacoesDigito9);
  
  return [...new Set(variacoes)].filter(Boolean);
}

// Função auxiliar para comparar telefones (considera todas as variações)
function telefonesCorrespondem(telefone1: string, telefone2: string): boolean {
  // Normaliza ambos para comparação direta
  const normalizar = (tel: string) => tel.replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
  const tel1Norm = normalizar(telefone1);
  const tel2Norm = normalizar(telefone2);
  
  // Comparação direta
  if (tel1Norm === tel2Norm) {
    return true;
  }
  
  // Compara todas as variações
  const variacoes1 = telefoneVariacoes(telefone1);
  const variacoes2 = telefoneVariacoes(telefone2);
  
  // Normaliza todas as variações para comparação
  const variacoes1Norm = variacoes1.map(normalizar);
  const variacoes2Norm = variacoes2.map(normalizar);
  
  // Verifica se há alguma correspondência
  return variacoes1Norm.some(v1 => variacoes2Norm.includes(v1));
}

// Função para processar agendamento usando IA (compatível com Workers)
async function processarAgendamentoComIA(
  mensagem: string,
  env: Bindings
): Promise<{
  descricao: string;
  valor: number;
  dataAgendamento: string;
  tipo: 'pagamento' | 'recebimento';
  categoria?: string;
  sucesso: boolean;
} | null> {
  const groqApiKey = env.GROQ_API_KEY;
  const geminiApiKey = env.GEMINI_API_KEY;
  const iaProvider = env.IA_PROVIDER || 'groq';
  
  if (!groqApiKey && !geminiApiKey) {
    console.log('⚠️ Nenhuma IA configurada para processar agendamentos');
    return null;
  }
  
  const prompt = `Analise a seguinte mensagem e extraia informações sobre um agendamento de pagamento ou recebimento.

Mensagem: "${mensagem}"

Retorne APENAS um JSON válido com o seguinte formato:
{
  "descricao": "descrição do agendamento (ex: boleto, conta de luz, recebimento de salário)",
  "valor": 500.00,
  "dataAgendamento": "2025-12-15",
  "tipo": "pagamento",
  "categoria": "contas"
}

Regras:
- Se a mensagem menciona "agendar pagamento", "pagar", "boleto", "conta" = tipo "pagamento"
- Se a mensagem menciona "agendar recebimento", "receber", "salário", "pagamento recebido" = tipo "recebimento"
- A data deve ser no formato YYYY-MM-DD
- Se a data mencionada é apenas dia/mês (ex: "15/12" ou "dia 10"), assuma o ano atual
- Se não mencionar data específica, retorne null
- O valor deve ser um número (sem R$ ou "reais")
- A descrição deve ser clara e objetiva
- Categorias comuns: contas, boleto, salário, serviços, outros

Se não houver informações suficientes para criar um agendamento, retorne null.
Retorne APENAS o JSON, sem texto adicional.`;
  
  try {
    // Tenta Groq primeiro se disponível
    if ((iaProvider === 'groq' || !geminiApiKey) && groqApiKey) {
      console.log('🤖 Processando agendamento com Groq...');
      
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'Você é um assistente especializado em extrair informações de agendamentos financeiros. Sempre retorne JSON válido ou null.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.3,
        }),
      });
      
      if (groqResponse.ok) {
        const groqData = await groqResponse.json();
        const resposta = groqData.choices?.[0]?.message?.content || '';
        
        let jsonStr = resposta.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        }
        
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
        
        if (jsonStr.toLowerCase() === 'null' || jsonStr.trim() === '') {
          return null;
        }
        
        const resultado = JSON.parse(jsonStr);
        
        if (!resultado.descricao || !resultado.valor || !resultado.dataAgendamento) {
          return null;
        }
        
        // Normaliza a data
        let dataNormalizada = resultado.dataAgendamento;
        if (dataNormalizada.includes('/')) {
          const partes = dataNormalizada.split('/');
          if (partes.length === 2) {
            const hoje = new Date();
            dataNormalizada = `${hoje.getFullYear()}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
          } else if (partes.length === 3) {
            dataNormalizada = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
          }
        } else if (dataNormalizada.match(/^\d{1,2}$/)) {
          // Apenas o dia (ex: "10")
          const hoje = new Date();
          const mes = (hoje.getMonth() + 1).toString().padStart(2, '0');
          dataNormalizada = `${hoje.getFullYear()}-${mes}-${dataNormalizada.padStart(2, '0')}`;
        }
        
        return {
          descricao: resultado.descricao,
          valor: parseFloat(resultado.valor) || 0,
          dataAgendamento: dataNormalizada,
          tipo: (resultado.tipo === 'recebimento' ? 'recebimento' : 'pagamento') as 'pagamento' | 'recebimento',
          categoria: resultado.categoria || 'outros',
          sucesso: true,
        };
      }
    }
    
    // Tenta Gemini se Groq não funcionou ou não está disponível
    if (geminiApiKey) {
      console.log('🤖 Processando agendamento com Gemini...');
      
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
          }),
        }
      );
      
      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const resposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        
        let jsonStr = resposta.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        }
        
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
        
        if (jsonStr.toLowerCase() === 'null' || jsonStr.trim() === '') {
          return null;
        }
        
        const resultado = JSON.parse(jsonStr);
        
        if (!resultado.descricao || !resultado.valor || !resultado.dataAgendamento) {
          return null;
        }
        
        // Normaliza a data (mesma lógica do Groq)
        let dataNormalizada = resultado.dataAgendamento;
        if (dataNormalizada.includes('/')) {
          const partes = dataNormalizada.split('/');
          if (partes.length === 2) {
            const hoje = new Date();
            dataNormalizada = `${hoje.getFullYear()}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
          } else if (partes.length === 3) {
            dataNormalizada = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
          }
        } else if (dataNormalizada.match(/^\d{1,2}$/)) {
          const hoje = new Date();
          const mes = (hoje.getMonth() + 1).toString().padStart(2, '0');
          dataNormalizada = `${hoje.getFullYear()}-${mes}-${dataNormalizada.padStart(2, '0')}`;
        }
        
        return {
          descricao: resultado.descricao,
          valor: parseFloat(resultado.valor) || 0,
          dataAgendamento: dataNormalizada,
          tipo: (resultado.tipo === 'recebimento' ? 'recebimento' : 'pagamento') as 'pagamento' | 'recebimento',
          categoria: resultado.categoria || 'outros',
          sucesso: true,
        };
      }
    }
    
    return null;
  } catch (error: any) {
    console.error('❌ Erro ao processar agendamento com IA:', error);
    return null;
  }
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

// Função auxiliar para extrair telefone do token JWT
// A biblioteca @tsndr/cloudflare-worker-jwt retorna { header, payload }
async function extrairTelefoneDoToken(token: string, jwtSecret: string): Promise<string> {
  const verified = await jwt.verify(token, jwtSecret);
  
  // A biblioteca retorna { header: {...}, payload: {...} }
  let payload: any;
  if (verified && typeof verified === 'object') {
    if ('payload' in verified && verified.payload) {
      payload = verified.payload;
    } else if ('telefone' in verified) {
      payload = verified;
    } else {
      throw new Error('Token inválido: estrutura desconhecida');
    }
  } else {
    throw new Error('Token inválido: resultado não é um objeto');
  }
  
  if (!payload.telefone) {
    throw new Error('Token inválido: campo telefone não encontrado');
  }
  
  return payload.telefone;
}

// Middleware de autenticação para Worker
async function autenticarMiddleware(c: any, next: () => Promise<void>): Promise<Response | void> {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      c.set('telefone', telefone);
      await next();
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido' }, 401);
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message || 'Erro de autenticação' }, 401);
  }
}

async function enviarMensagemZApi(
  telefone: string,
  mensagem: string,
  env: Bindings
): Promise<{ success: boolean; error?: string }> {
  if (!env.ZAPI_INSTANCE_ID || !env.ZAPI_TOKEN || !env.ZAPI_CLIENT_TOKEN) {
    return { success: false, error: 'Z-API não configurada. Configure ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN no Cloudflare Workers.' };
  }
  
  const baseUrl = env.ZAPI_BASE_URL || 'https://api.z-api.io';
  const url = `${baseUrl}/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}/send-text`;
  
  // Remove prefixo whatsapp: se existir e formata o número
  const numeroLimpo = telefone.replace('whatsapp:', '').replace('+', '');
  const numeroFormatado = numeroLimpo.startsWith('55') 
    ? numeroLimpo 
    : `55${numeroLimpo}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Client-Token': env.ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone: numeroFormatado,
        message: mensagem,
      }),
    });
    
    const data = await response.json();
    return response.ok 
      ? { success: true }
      : { success: false, error: data.message || data.error || 'Erro ao enviar mensagem' };
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
  try {
    // AUTENTICAÇÃO OBRIGATÓRIA - Extrai telefone do token JWT
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Token não fornecido no header Authorization');
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    console.log('🔐 Verificando token:', {
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...',
      hasJWTSecret: !!c.env.JWT_SECRET,
      jwtSecretLength: jwtSecret.length
    });
    
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      console.error('❌ Erro ao extrair telefone do token:', error);
      return c.json({ 
        success: false, 
        error: error.message || 'Token inválido ou expirado. Faça login novamente.' 
      }, 401);
    }
    
    const query = c.req.query();
    const valorMin = query.valorMin !== undefined ? Number(query.valorMin) : undefined;
    const valorMax = query.valorMax !== undefined ? Number(query.valorMax) : undefined;
    const limit = query.limit !== undefined ? Number(query.limit) : undefined;
    const page = query.page !== undefined ? Number(query.page) : undefined;
    const offset = page && limit ? (page - 1) * limit : undefined;

    const { transacoes, total } = await buscarTransacoes(c.env.financezap_db, {
      telefone: telefoneFormatado, // SEMPRE usa o telefone do token, nunca da query string
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
  } catch (error: any) {
    console.error('Erro em GET /api/transacoes:', error);
    return c.json({ success: false, error: error.message || 'Erro ao buscar transações' }, 500);
  }
});

app.delete('/api/transacoes/:id', async (c) => {
  try {
    // AUTENTICAÇÃO OBRIGATÓRIA - Extrai telefone do token JWT
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    const id = Number(c.req.param('id'));
    
    if (!Number.isFinite(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }
    
    // Verifica se a transação pertence ao usuário antes de deletar
    const transacao = await c.env.financezap_db
      .prepare('SELECT telefone FROM transacoes WHERE id = ?')
      .bind(id)
      .first();
    
    if (!transacao) {
      return c.json({ success: false, error: 'Transação não encontrada' }, 404);
    }
    
    // Verifica se a transação pertence ao usuário autenticado (usando função auxiliar)
    if (!telefonesCorrespondem(transacao.telefone, telefoneFormatado)) {
      console.log('⚠️ Telefones não correspondem ao deletar transação:');
      console.log(`   Transação: ${transacao.telefone}`);
      console.log(`   Usuário: ${telefoneFormatado}`);
      return c.json({ success: false, error: 'Você não tem permissão para deletar esta transação' }, 403);
    }
    
    const removed = await removerTransacao(c.env.financezap_db, id);
    if (!removed) {
      return c.json({ success: false, error: 'Erro ao remover transação' }, 500);
    }
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Erro em DELETE /api/transacoes/:id:', error);
    return c.json({ success: false, error: error.message || 'Erro ao deletar transação' }, 500);
  }
});

app.get('/api/estatisticas', async (c) => {
  try {
    // AUTENTICAÇÃO OBRIGATÓRIA - Extrai telefone do token JWT
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      console.error('Erro ao extrair telefone do token:', error);
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const query = c.req.query();
    const valorMin = query.valorMin !== undefined ? Number(query.valorMin) : undefined;
    const valorMax = query.valorMax !== undefined ? Number(query.valorMax) : undefined;

    const estatisticas = await calcularEstatisticas(c.env.financezap_db, {
      telefone: telefoneFormatado, // SEMPRE usa o telefone do token, nunca da query string
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      valorMin: Number.isFinite(valorMin) ? valorMin : undefined,
      valorMax: Number.isFinite(valorMax) ? valorMax : undefined,
      descricao: query.descricao,
      categoria: query.categoria,
    });
    
    // Garante que os valores numéricos não sejam null/undefined (converte para 0)
    const estatisticasFormatadas = {
      ...estatisticas,
      totalGasto: Number(estatisticas.totalSaidas) || 0, // Frontend espera totalGasto
      totalSaidas: Number(estatisticas.totalSaidas) || 0,
      totalEntradas: Number(estatisticas.totalEntradas) || 0,
      saldo: Number(estatisticas.saldo) || 0,
      totalTransacoes: Number(estatisticas.totalTransacoes) || 0,
      mediaGasto: Number(estatisticas.mediaGasto) || 0,
      maiorGasto: Number(estatisticas.maiorGasto) || 0,
      menorGasto: Number(estatisticas.menorGasto) || 0,
      gastoHoje: Number(estatisticas.gastoHoje) || 0,
      gastoMes: Number(estatisticas.gastoMes) || 0,
    };
    
    return c.json({ success: true, estatisticas: estatisticasFormatadas });
  } catch (error: any) {
    console.error('Erro em GET /api/estatisticas:', error);
    return c.json({ success: false, error: error.message || 'Erro ao calcular estatísticas' }, 500);
  }
});

app.get('/api/gastos-por-dia', async (c) => {
  try {
    // AUTENTICAÇÃO OBRIGATÓRIA - Extrai telefone do token JWT
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      console.error('Erro ao extrair telefone do token:', error);
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const query = c.req.query();
    const diasRaw = query.dias !== undefined ? Number(query.dias) : NaN;
    const dias = Number.isFinite(diasRaw) && diasRaw > 0 ? diasRaw : 30;
    const data = await gastosPorDia(c.env.financezap_db, telefoneFormatado, dias); // SEMPRE usa o telefone do token
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('Erro em GET /api/gastos-por-dia:', error);
    return c.json({ success: false, error: error.message || 'Erro ao buscar gastos por dia' }, 500);
  }
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
    const mensagem = `🔐 Seu código de verificação Zela é: *${codigo}*\n\nEste código expira em 5 minutos.\n\nSe você não solicitou este código, ignore esta mensagem.`;
    
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
    
    console.log('🔐 Gerando token JWT:', {
      telefone: telefoneFormatado,
      hasJWTSecret: !!c.env.JWT_SECRET,
      jwtSecretLength: jwtSecret.length,
      jwtSecretPreview: jwtSecret.substring(0, 10) + '...'
    });
    
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
    
    // Decodifica o token para verificar se está correto (sem verificar assinatura)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadPart = parts[1];
        const paddedPayload = payloadPart + '='.repeat((4 - payloadPart.length % 4) % 4);
        const decodedWithoutVerify = JSON.parse(
          atob(paddedPayload)
        );
        console.log('✅ Token gerado com sucesso. Payload decodificado:', JSON.stringify(decodedWithoutVerify, null, 2));
        console.log('🔍 Campo telefone no token gerado:', decodedWithoutVerify.telefone);
      }
    } catch (e) {
      console.log('⚠️ Não foi possível decodificar token para verificação:', e);
    }
    
    console.log('✅ Token gerado com sucesso:', {
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...',
      expiraEm: new Date(exp * 1000).toISOString(),
      telefoneNoPayload: telefoneFormatado
    });
    
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

// Rota de cadastro de novo usuário
app.post('/api/auth/cadastro', async (c) => {
  try {
    const body = await c.req.json();
    const { telefone, nome, email } = body;
    
    if (!telefone || !telefone.trim()) {
      return c.json({ success: false, error: 'Telefone é obrigatório' }, 400);
    }
    
    if (!nome || !nome.trim()) {
      return c.json({ success: false, error: 'Nome é obrigatório' }, 400);
    }
    
    // Limpa o telefone
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneFormatado = telefoneLimpo.startsWith('55') 
      ? `whatsapp:+${telefoneLimpo}` 
      : `whatsapp:+55${telefoneLimpo}`;
    
    console.log('📝 Cadastro de novo usuário:', telefoneFormatado);
    
    // Verifica se o usuário já existe
    const usuarioExistente = await buscarUsuarioPorTelefone(c.env.financezap_db, telefoneFormatado);
    
    if (usuarioExistente) {
      return c.json({
        success: false,
        error: 'Usuário já cadastrado. Faça login ou recupere sua senha.'
      }, 400);
    }
    
    // Calcula data de expiração do trial (7 dias a partir de agora)
    const trialExpiraEm = new Date();
    trialExpiraEm.setDate(trialExpiraEm.getDate() + 7);
    
    // Cria o usuário
    const novoUsuarioId = await criarUsuario(c.env.financezap_db, {
      telefone: telefoneFormatado,
      nome: nome.trim(),
      email: email?.trim() || null,
      trialExpiraEm: trialExpiraEm,
    });
    
    // Registra o número se ainda não estiver registrado
    if (!(await numeroEstaRegistrado(c.env.financezap_db, telefoneFormatado))) {
      await registrarNumero(c.env.financezap_db, telefoneFormatado);
    }
    
    console.log(`✅ Usuário cadastrado: ${nome.trim()} (${telefoneFormatado})`);
    console.log(`   Trial expira em: ${trialExpiraEm.toLocaleString('pt-BR')}`);
    
    return c.json({
      success: true,
      message: 'Cadastro realizado com sucesso! Seu trial de 7 dias foi ativado.',
      usuario: {
        telefone: telefoneFormatado,
        nome: nome.trim(),
        trialExpiraEm: trialExpiraEm.toISOString(),
        status: 'trial'
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao cadastrar usuário:', error);
    return c.json({
      success: false,
      error: error.message || 'Erro ao processar cadastro'
    }, 500);
  }
});

// ========== ENDPOINTS DE AUTENTICAÇÃO ==========

// Verificar token e obter dados do usuário
app.get('/api/auth/verify', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    // Verifica o token
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      console.error('Erro ao verificar token:', error.message);
      if (error.message?.includes('expired')) {
        return c.json({ success: false, error: 'Token expirado' }, 401);
      }
      return c.json({ success: false, error: error.message || 'Token inválido' }, 401);
    }
    
    const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, telefoneFormatado);
    
    if (!usuario) {
      return c.json({ success: false, error: 'Usuário não encontrado' }, 401);
    }
    
    const stats = await calcularEstatisticas(c.env.financezap_db, { telefone: telefoneFormatado });
    const agora = new Date();
    const trialExpiraEm = new Date(usuario.trialExpiraEm);
    const diasRestantes = usuario.status === 'trial' 
      ? Math.ceil((trialExpiraEm.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    return c.json({
      success: true,
      telefone: telefoneFormatado,
      usuario: {
        telefone: usuario.telefone,
        nome: usuario.nome,
        email: usuario.email,
        status: usuario.status,
        trialExpiraEm: usuario.trialExpiraEm,
        diasRestantesTrial: diasRestantes,
        totalTransacoes: stats.totalTransacoes,
      }
    });
  } catch (error: any) {
    console.error('Erro em GET /api/auth/verify:', error);
    return c.json({ success: false, error: error.message || 'Erro ao verificar token' }, 401);
  }
});

// Atualizar perfil do usuário
app.put('/api/auth/perfil', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const body = await c.req.json();
    const { nome, email } = body;
    
    if (!nome || !nome.trim()) {
      return c.json({ success: false, error: 'Nome é obrigatório' }, 400);
    }
    
    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return c.json({ success: false, error: 'Formato de email inválido' }, 400);
      }
    }
    
    const atualizado = await atualizarUsuarioPerfil(c.env.financezap_db, telefoneFormatado, {
      nome: nome.trim(),
      email: email?.trim() || null,
    });
    
    if (!atualizado) {
      return c.json({ success: false, error: 'Usuário não encontrado' }, 404);
    }
    
    const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, telefoneFormatado);
    
    return c.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      usuario: {
        nome: usuario?.nome,
        email: usuario?.email,
        telefone: usuario?.telefone,
        status: usuario?.status
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message || 'Erro ao atualizar perfil' }, 500);
  }
});

// Enviar mensagem para salvar contato
app.post('/api/auth/enviar-contato', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, telefoneFormatado);
    if (!usuario) {
      return c.json({ success: false, error: 'Usuário não encontrado' }, 404);
    }
    
    // Obtém número do agente (simplificado - você pode melhorar isso)
    const numeroAgente = '5561981474690'; // Ajuste conforme necessário
    const ddd = numeroAgente.substring(2, 4);
    const parte1 = numeroAgente.substring(4, 9);
    const parte2 = numeroAgente.substring(9);
    const numeroFormatado = `(${ddd}) ${parte1}-${parte2}`;
    
    const mensagem = `📱 *Salvar Contato do Zela*\n\n` +
      `Olá ${usuario.nome || 'usuário'}! 👋\n\n` +
      `Para não perder nossas mensagens importantes, salve nosso contato:\n\n` +
      `📝 *Nome:* Zela\n` +
      `📞 *Número:* ${numeroFormatado}\n\n` +
      `*Como salvar:*\n` +
      `1️⃣ Abra o WhatsApp\n` +
      `2️⃣ Toque em "Novo contato"\n` +
      `3️⃣ Digite: Zela\n` +
      `4️⃣ Digite o número: ${numeroAgente}\n` +
      `5️⃣ Toque em "Salvar"`;
    
    const resultado = await enviarMensagemZApi(telefoneFormatado, mensagem, c.env);
    
    if (!resultado.success) {
      return c.json({ success: false, error: resultado.error || 'Erro ao enviar mensagem' }, 500);
    }
    
    return c.json({
      success: true,
      message: 'Mensagem enviada com sucesso! Verifique seu WhatsApp.',
      numeroAgente: numeroFormatado
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message || 'Erro ao enviar mensagem' }, 500);
  }
});

// ========== ENDPOINTS DE CATEGORIAS ==========

app.get('/api/categorias', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const categorias = await buscarCategoriasD1(c.env.financezap_db, telefoneFormatado);
    
    return c.json({
      success: true,
      categorias: categorias.map(cat => ({
        id: cat.id,
        telefone: cat.telefone,
        nome: cat.nome,
        descricao: cat.descricao,
        cor: cat.cor,
        padrao: cat.padrao === 1,
        tipo: cat.tipo,
        criadoEm: cat.criadoEm,
        atualizadoEm: cat.atualizadoEm,
      }))
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/categorias', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const body = await c.req.json();
    const { nome, descricao, cor, tipo } = body;
    
    if (!nome || !nome.trim()) {
      return c.json({ success: false, error: 'Nome da categoria é obrigatório' }, 400);
    }
    
    const id = await criarCategoriaD1(c.env.financezap_db, telefoneFormatado, {
      nome: nome.trim(),
      descricao: descricao?.trim(),
      cor: cor?.trim(),
      tipo: tipo || 'saida',
    });
    
    const categorias = await buscarCategoriasD1(c.env.financezap_db, telefoneFormatado);
    const categoria = categorias.find(c => c.id === id);
    
    return c.json({
      success: true,
      categoria: categoria ? {
        id: categoria.id,
        telefone: categoria.telefone,
        nome: categoria.nome,
        descricao: categoria.descricao,
        cor: categoria.cor,
        padrao: categoria.padrao === 1,
        tipo: categoria.tipo,
      } : null,
      message: 'Categoria criada com sucesso'
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.put('/api/categorias/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const { nome, descricao, cor, tipo } = body;
    
    await atualizarCategoriaD1(c.env.financezap_db, id, telefoneFormatado, {
      nome: nome?.trim(),
      descricao: descricao?.trim(),
      cor: cor?.trim(),
      tipo: tipo,
    });
    
    const categorias = await buscarCategoriasD1(c.env.financezap_db, telefoneFormatado);
    const categoria = categorias.find(c => c.id === id);
    
    return c.json({
      success: true,
      categoria: categoria ? {
        id: categoria.id,
        telefone: categoria.telefone,
        nome: categoria.nome,
        descricao: categoria.descricao,
        cor: categoria.cor,
        padrao: categoria.padrao === 1,
        tipo: categoria.tipo,
      } : null,
      message: 'Categoria atualizada com sucesso'
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.delete('/api/categorias/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const id = Number(c.req.param('id'));
    await removerCategoriaD1(c.env.financezap_db, id, telefoneFormatado);
    
    return c.json({ success: true, message: 'Categoria removida com sucesso' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== ENDPOINTS DE AGENDAMENTOS ==========

app.get('/api/agendamentos', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const query = c.req.query();
    const agendamentos = await buscarAgendamentosD1(c.env.financezap_db, telefoneFormatado, {
      status: query.status,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
    });
    
    return c.json({
      success: true,
      agendamentos: agendamentos.map(ag => ({
        id: ag.id,
        telefone: ag.telefone,
        descricao: ag.descricao,
        valor: ag.valor,
        dataAgendamento: ag.dataAgendamento,
        tipo: ag.tipo,
        status: ag.status,
        categoria: ag.categoria,
        notificado: ag.notificado === 1,
        criadoEm: ag.criadoEm,
        atualizadoEm: ag.atualizadoEm,
      }))
    });
  } catch (error: any) {
    console.error('Erro em GET /api/agendamentos:', error);
    return c.json({ success: false, error: error.message || 'Erro ao buscar agendamentos' }, 500);
  }
});

app.put('/api/agendamentos/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const { status } = body;
    
    if (!['pendente', 'pago', 'cancelado'].includes(status)) {
      return c.json({ success: false, error: 'Status inválido' }, 400);
    }
    
    const agendamento = await buscarAgendamentoPorIdD1(c.env.financezap_db, id);
    if (!agendamento) {
      return c.json({ success: false, error: 'Agendamento não encontrado' }, 404);
    }
    
    // Verifica se o telefone corresponde (usando função auxiliar)
    if (!telefonesCorrespondem(agendamento.telefone, telefoneFormatado)) {
      console.log('⚠️ Telefones não correspondem ao atualizar agendamento:');
      console.log(`   Agendamento: ${agendamento.telefone}`);
      console.log(`   Usuário: ${telefoneFormatado}`);
      return c.json({ success: false, error: 'Você não tem permissão para atualizar este agendamento' }, 403);
    }
    
    await atualizarStatusAgendamentoD1(c.env.financezap_db, id, status);
    
    // Se marcou como pago, cria transação automaticamente
    if (status === 'pago') {
      const dataAtual = new Date().toISOString().split('T')[0];
      await salvarTransacao(c.env.financezap_db, {
        telefone: telefoneFormatado,
        descricao: agendamento.descricao,
        valor: agendamento.valor,
        categoria: agendamento.categoria || 'outros',
        tipo: agendamento.tipo === 'recebimento' ? 'entrada' : 'saida',
        metodo: 'debito',
        dataHora: new Date().toISOString(),
        data: dataAtual,
        mensagemOriginal: `Agendamento ${agendamento.id} - ${agendamento.descricao}`
      });
    }
    
    return c.json({ success: true, message: 'Agendamento atualizado com sucesso' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.delete('/api/agendamentos/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    let telefoneFormatado: string;
    try {
      const telefone = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefone);
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Token inválido ou expirado' }, 401);
    }
    
    const id = Number(c.req.param('id'));
    
    const agendamento = await buscarAgendamentoPorIdD1(c.env.financezap_db, id);
    if (!agendamento) {
      return c.json({ success: false, error: 'Agendamento não encontrado' }, 404);
    }
    
    // Verifica se o telefone corresponde (usando função auxiliar)
    if (!telefonesCorrespondem(agendamento.telefone, telefoneFormatado)) {
      console.log('⚠️ Telefones não correspondem ao deletar agendamento:');
      console.log(`   Agendamento: ${agendamento.telefone}`);
      console.log(`   Usuário: ${telefoneFormatado}`);
      return c.json({ success: false, error: 'Você não tem permissão para remover este agendamento' }, 403);
    }
    
    await removerAgendamentoD1(c.env.financezap_db, id);
    
    return c.json({ success: true, message: 'Agendamento removido com sucesso' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Webhook Z-API (versão simplificada para Worker)
app.post('/webhook/zapi', async (c) => {
  try {
    const body = await c.req.json();
    console.log('🔔 Webhook Z-API recebido:', JSON.stringify(body, null, 2));
    
    // Extrai dados da mensagem
    const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
    if (!phoneNumber) {
      return c.json({ success: false, error: 'phone é obrigatório' }, 400);
    }
    
    console.log('📱 Número recebido do Z-API:', phoneNumber);
    
    // Remove caracteres não numéricos do número recebido
    const phoneNumberLimpo = phoneNumber.replace(/\D/g, '');
    console.log('📱 Número limpo:', phoneNumberLimpo);
    
    // Formata o número - garante que tenha código do país (55 para Brasil)
    let telefoneFormatado: string;
    if (phoneNumberLimpo.startsWith('55')) {
      telefoneFormatado = formatarTelefone(`whatsapp:+${phoneNumberLimpo}`);
    } else {
      telefoneFormatado = formatarTelefone(`whatsapp:+55${phoneNumberLimpo}`);
    }
    
    console.log('📱 Telefone formatado:', telefoneFormatado);
    
    // Extrai texto da mensagem
    let messageText = body.text?.message || body.message?.text || body.message || '';
    
    // Processa áudio se houver
    const audioUrl = body.audio?.audioUrl || body.audio?.url || body.mediaUrl;
    const audioType = body.audio?.mimeType || body.audio?.type || body.mediaType || '';
    
    if (audioUrl && (audioType.startsWith('audio/') || audioUrl.includes('audio'))) {
      console.log('🎤 Áudio detectado:', audioUrl);
      console.log('🎵 Tipo de áudio:', audioType);
      
      try {
        // Baixa o áudio
        console.log('📥 Baixando áudio de:', audioUrl);
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
          throw new Error(`Erro ao baixar áudio: ${audioResponse.status}`);
        }
        
        const audioBuffer = await audioResponse.arrayBuffer();
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
        
        console.log('✅ Áudio baixado, tamanho:', audioBuffer.byteLength, 'bytes');
        
        // Transcreve usando Gemini ou Groq (se configurado)
        const geminiApiKey = c.env.GEMINI_API_KEY;
        const groqApiKey = c.env.GROQ_API_KEY;
        const iaProvider = c.env.IA_PROVIDER || 'gemini';
        
        if (geminiApiKey && (iaProvider === 'gemini' || !groqApiKey)) {
          try {
            console.log('🤖 Transcrevendo com Gemini...');
            
            const mimeType = audioType || 'audio/ogg';
            const prompt = 'Transcreva este áudio para texto em português brasileiro. Retorne apenas o texto transcrito, sem explicações adicionais.';
            
            // Usa modelo compatível com tier gratuito
            const geminiModel = 'gemini-1.5-flash'; // Modelo que funciona no tier gratuito
            
            const geminiResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: prompt },
                      {
                        inlineData: {
                          data: audioBase64,
                          mimeType: mimeType,
                        },
                      },
                    ],
                  }],
                }),
              }
            );
            
            if (!geminiResponse.ok) {
              const errorData = await geminiResponse.json().catch(() => ({}));
              const errorCode = errorData.error?.code;
              
              // Se for erro de quota, tenta Groq se disponível
              if (errorCode === 429 && groqApiKey) {
                console.log('⚠️ Gemini com quota excedida, tentando Groq...');
                throw new Error('GEMINI_QUOTA_EXCEEDED');
              }
              
              const errorText = JSON.stringify(errorData);
              console.error('❌ Erro na API do Gemini:', errorText);
              throw new Error(`Erro ao transcrever: ${geminiResponse.status}`);
            }
            
            const geminiData = await geminiResponse.json();
            const transcription = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            
            if (transcription && transcription.length > 0) {
              console.log(`✅ Transcrição (Gemini): "${transcription}"`);
              messageText = transcription;
            } else {
              console.log('⚠️ Transcrição vazia do Gemini');
              throw new Error('TRANSCRIPTION_EMPTY');
            }
          } catch (error: any) {
            // Se Gemini falhou e temos Groq, tenta Groq
            if (error.message === 'GEMINI_QUOTA_EXCEEDED' && groqApiKey) {
              console.log('🔄 Tentando transcrição com Groq...');
              // Groq não suporta áudio diretamente, então retorna erro
              return c.json({ 
                success: false, 
                error: 'Quota do Gemini excedida. Groq não suporta transcrição de áudio. Por favor, envie uma mensagem de texto ou aguarde alguns minutos.' 
              }, 400);
            }
            
            // Se não for erro de quota, propaga o erro
            if (error.message !== 'TRANSCRIPTION_EMPTY') {
              throw error;
            }
            
            return c.json({ 
              success: false, 
              error: 'Não consegui entender o áudio. Por favor, envie uma mensagem de texto.' 
            }, 400);
          }
        } else if (!geminiApiKey && !groqApiKey) {
          console.log('⚠️ Nenhuma IA configurada para transcrição de áudio');
          return c.json({ 
            success: false, 
            error: 'Transcrição de áudio não configurada. Por favor, envie uma mensagem de texto.' 
          }, 400);
        } else {
          // Groq não suporta áudio diretamente
          return c.json({ 
            success: false, 
            error: 'Groq não suporta transcrição de áudio. Por favor, envie uma mensagem de texto ou configure o Gemini.' 
          }, 400);
        }
      } catch (error: any) {
        console.error('❌ Erro ao processar áudio:', error);
        return c.json({ 
          success: false, 
          error: `Erro ao processar áudio: ${error.message}. Por favor, envie uma mensagem de texto.` 
        }, 400);
      }
    }
    
    if (!messageText || messageText.trim().length === 0) {
      return c.json({ success: false, error: 'message é obrigatório' }, 400);
    }
    
    // Ignora mensagens de grupos
    if (body.isGroup) {
      return c.json({ success: true, message: 'Mensagem de grupo ignorada' });
    }
    
    // Registra o número (usa o formato normalizado)
    const cleanFromNumber = telefoneFormatado.replace('whatsapp:', '');
    await registrarNumero(c.env.financezap_db, cleanFromNumber);
    
    // PRIMEIRO: Verifica se é um agendamento antes de processar como transação
    console.log('🔍 Verificando se é agendamento...');
    const palavrasAgendamento = [
      'agendar', 'agende', 'agendamento', 'agendado', 'agenda',
      'lembrar', 'lembre-me', 'lembre me', 'lembrete',
      'boleto', 'conta', 'pagamento', 'recebimento', 
      'para dia', 'no dia', 'dia ', 'data ', 
      'vencimento', 'vencer', 'vencerá', 'vence',
      'marcar', 'marcado', 'programar', 'programado'
    ];
    
    const mensagemLower = messageText.toLowerCase();
    const temPalavraAgendamento = palavrasAgendamento.some(palavra => 
      mensagemLower.includes(palavra)
    );
    
    if (temPalavraAgendamento) {
      console.log('📅 Palavras de agendamento detectadas, processando como agendamento...');
      
      try {
        // Processa agendamento usando IA
        const agendamentoExtraido = await processarAgendamentoComIA(messageText, c.env);
        
        if (agendamentoExtraido && agendamentoExtraido.sucesso) {
          console.log('✅ Agendamento detectado:', JSON.stringify(agendamentoExtraido, null, 2));
          
          // Cria o agendamento
          const agendamentoId = await criarAgendamentoD1(c.env.financezap_db, {
            telefone: cleanFromNumber,
            descricao: agendamentoExtraido.descricao,
            valor: agendamentoExtraido.valor,
            dataAgendamento: agendamentoExtraido.dataAgendamento,
            tipo: agendamentoExtraido.tipo,
            categoria: agendamentoExtraido.categoria || 'outros',
          });
          
          console.log('✅ Agendamento criado com ID:', agendamentoId);
          
          // Formata a resposta
          const tipoTexto = agendamentoExtraido.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento';
          const dataFormatada = new Date(agendamentoExtraido.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
          
          const respostaAgendamento = `✅ Agendamento criado com sucesso!\n\n` +
            `📅 ${tipoTexto}: ${agendamentoExtraido.descricao}\n` +
            `💰 Valor: R$ ${agendamentoExtraido.valor.toFixed(2)}\n` +
            `📆 Data: ${dataFormatada}\n\n` +
            `Você receberá um lembrete no dia ${dataFormatada}.\n\n` +
            `💡 Quando pagar/receber, responda "pago" ou "recebido" para registrar automaticamente.`;
          
          await enviarMensagemZApi(telefoneFormatado, respostaAgendamento, c.env);
          
          return c.json({ success: true, message: 'Agendamento processado com sucesso' });
        } else {
          console.log('⚠️ Não foi possível extrair agendamento da mensagem');
        }
      } catch (error: any) {
        console.error('❌ Erro ao processar agendamento:', error);
        // Continua o processamento se houver erro ao criar agendamento
      }
    }
    
    // Se não foi agendamento, processa como transação
    console.log('💰 Processando como transação...');
    
    // Extrai valor simples da mensagem (versão básica)
    const valorMatch = messageText.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
    const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 0;
    
    // Salva transação básica - usa telefoneFormatado para garantir consistência
    if (valor > 0) {
      const dataHora = new Date().toISOString();
      const data = dataHora.slice(0, 10);
      
      console.log('💾 Salvando transação:', {
        telefone: telefoneFormatado,
        valor,
        descricao: messageText.substring(0, 50)
      });
      
      try {
        const transacaoId = await salvarTransacao(c.env.financezap_db, {
          telefone: telefoneFormatado,
          descricao: messageText.substring(0, 200),
          valor,
          categoria: 'outros',
          tipo: 'saida',
          metodo: 'debito',
          dataHora,
          data,
          mensagemOriginal: messageText,
        });
        
        console.log('✅ Transação salva com sucesso! ID:', transacaoId);
        
        // Envia confirmação
        const resposta = `✅ Transação registrada!\n\n📝 ${messageText.substring(0, 50)}\n💰 R$ ${valor.toFixed(2)}`;
        await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
        console.log('✅ Confirmação enviada para:', telefoneFormatado);
      } catch (error: any) {
        console.error('❌ Erro ao salvar transação:', error);
        throw error;
      }
    } else {
      console.log('⚠️ Valor não encontrado na mensagem ou valor é 0');
    }
    
    return c.json({ success: true, message: 'Mensagem processada' });
  } catch (error: any) {
    console.error('❌ Erro ao processar webhook Z-API:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
