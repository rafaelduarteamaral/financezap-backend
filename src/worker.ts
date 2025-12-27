import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Tipos para Scheduled Events
interface ScheduledEvent {
  type: 'scheduled';
  scheduledTime: number;
  cron: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}
import {
  buscarTransacoes,
  calcularEstatisticas,
  gastosPorDia,
  listarTelefones,
  registrarNumero,
  removerTransacao,
  resumoPorTelefone,
  salvarTransacao,
  atualizarTransacao,
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
  atualizarAgendamentoD1,
  removerAgendamentoD1,
  criarAgendamentoD1,
  AgendamentoRecord,
  salvarNotificacaoD1,
  buscarNotificacoesNaoLidasD1,
  marcarNotificacoesComoLidasD1,
  excluirTodosDadosUsuario,
  buscarTemplatesD1,
  criarTemplateD1,
  atualizarTemplateD1,
  removerTemplateD1,
  ativarTemplateD1,
  buscarCarteirasD1,
  buscarCarteiraPorIdD1,
  buscarCarteiraPadraoD1,
  criarCarteiraD1,
  atualizarCarteiraD1,
  removerCarteiraD1,
  definirCarteiraPadraoD1,
  resolverCarteiraPorTextoD1,
  registrarAliasCarteiraD1,
  registrarUltimaCarteiraUsadaD1,
} from './d1';
import { gerarCodigoVerificacao, salvarCodigoVerificacao, verificarCodigo } from './codigoVerificacao';
import { gerarDadosRelatorio, calcularPeriodo, formatarRelatorioWhatsApp, formatarRelatorioMensalCompleto } from './relatorios';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { 
  detectarIntencao,
  type IntencaoUsuario 
} from './deteccaoIntencao';
import {
  obterContextoConversacaoD1,
  adicionarMensagemContextoD1,
  formatarHistoricoParaPrompt,
  limparContextoConversacaoD1
} from './contextoConversacao';
import {
  dividirMensagem,
  criarMenuAjuda,
  criarMensagemExemplos,
  criarMensagemComandos,
  formatarEstatisticasResumo,
  criarSugestaoProativa,
  formatarMoeda
} from './formatadorMensagens';
import {
  calcularSaldoPorCarteiraD1,
  formatarMensagemSaldo
} from './saldos';
import {
  formatarMensagemTransacao,
  formatarMensagemMultiplasTransacoes
} from './formatadorTransacoes';
import {
  calcularScoreMedio,
  devePedirConfirmacao,
  devePedirMaisInformacoes
} from './validacaoQualidade';
import {
  decidirEndpointComIA,
  chamarEndpointInterno,
  ENDPOINTS_CONFIG
} from './ai-router';
import {
  EstadoConversacao,
  obterEstadoUsuario,
  definirEstadoUsuario,
  limparEstadoUsuario,
  obterDadosTemporarios,
  atualizarDadosTemporarios,
} from './estadosConversacao';
import {
  processarComRetry,
  chamarAPIComRetry,
  executarDBComRetry,
} from './retryResiliencia';
import {
  formatarResposta,
  formatarListaTransacoes,
} from './templatesResposta';
import {
  processarComCache,
  limparCacheExpirado,
} from './cacheIA';
import {
  medirTempoExecucao,
  registrarMetrica,
  obterEstatisticasProcessamento,
} from './metricas';
import {
  adicionarMensagemQueue,
  obterProximaMensagemQueue,
  marcarMensagemProcessando,
  marcarMensagemConcluida,
  marcarMensagemErro,
} from './queueProcessamento';

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

// Armazena clientes SSE conectados (por telefone)
const clientesSSE = new Map<string, ReadableStreamDefaultController[]>();

// Função para notificar clientes SSE sobre novas transações
// Se db for fornecido e não encontrar clientes SSE, salva notificação no D1 para polling
function notificarClientesSSE(telefone: string, evento: string, dados: any, db?: D1Database) {
  let telefoneNormalizado = telefone.replace('whatsapp:', '').trim();
  if (!telefoneNormalizado.startsWith('+')) {
    telefoneNormalizado = '+' + telefoneNormalizado;
  }
  const telefoneSemMais = telefoneNormalizado.replace(/^\+/, '');
  const telefonesParaNotificar = [
    telefoneNormalizado,
    telefoneSemMais,
    `whatsapp:${telefoneNormalizado}`,
    `whatsapp:${telefoneSemMais}`,
    ...(telefoneSemMais.startsWith('55') && telefoneSemMais.length === 13 ? [
      telefoneSemMais.substring(0, 4) + telefoneSemMais.substring(5),
      `+${telefoneSemMais.substring(0, 4)}${telefoneSemMais.substring(5)}`,
    ] : []),
    ...(telefoneSemMais.startsWith('55') && telefoneSemMais.length === 12 ? [
      telefoneSemMais.substring(0, 4) + '9' + telefoneSemMais.substring(4),
      `+${telefoneSemMais.substring(0, 4)}9${telefoneSemMais.substring(4)}`,
    ] : []),
  ];
  
  let notificados = 0;
  telefonesParaNotificar.forEach(tel => {
    const clientes = clientesSSE.get(tel);
    if (clientes && clientes.length > 0) {
      const mensagem = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
      clientes.forEach(controller => {
        try {
          controller.enqueue(new TextEncoder().encode(mensagem));
          notificados++;
        } catch (error) {
          console.error('Erro ao enviar mensagem SSE:', error);
        }
      });
    }
  });
  
  if (notificados === 0) {
    let fallbackNotificados = 0;
    clientesSSE.forEach((clientes) => {
      if (clientes.length > 0) {
        const mensagem = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
        clientes.forEach(controller => {
          try {
            controller.enqueue(new TextEncoder().encode(mensagem));
            fallbackNotificados++;
          } catch (error) {
            console.error('Erro ao enviar mensagem SSE (fallback):', error);
          }
        });
      }
    });
    
    if (fallbackNotificados === 0 && db) {
        salvarNotificacaoFallback(db, telefoneNormalizado, evento, dados).catch(err => {
        console.error('Erro ao salvar notificação no D1:', err);
        });
    }
  }
}

async function salvarNotificacaoFallback(db: D1Database, telefone: string, evento: string, dados: any) {
  try {
    const telefoneNormalizado = telefone.replace('whatsapp:', '').replace(/^\+/, '').trim();
    const usuario = await buscarUsuarioPorTelefone(db, telefoneNormalizado);
    if (usuario && usuario.telefone) {
      const telefoneParaNotificar = usuario.telefone.replace('whatsapp:', '').replace(/^\+/, '').trim();
      await salvarNotificacaoD1(db, telefoneParaNotificar, evento, dados);
    } else {
      await salvarNotificacaoD1(db, telefoneNormalizado, evento, dados);
    }
  } catch (error) {
    console.error('Erro ao salvar notificação no D1:', error);
  }
}

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
      return allowed[0] || '*';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cache-Control'],
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
  let telefoneLimpo = telefone.replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
  telefoneLimpo = telefoneLimpo.replace(/\D/g, '');
  return telefoneLimpo.startsWith('55') 
    ? `+${telefoneLimpo}` 
    : `+55${telefoneLimpo}`;
}

function criarVariacoesDigito9(telefone: string): string[] {
  const variacoes: string[] = [];
  let limpo = telefone.replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
  
  if (limpo.startsWith('55') && limpo.length >= 12) {
    const ddd = limpo.substring(2, 4);
    const resto = limpo.substring(4);
    
    if (resto.startsWith('9') && resto.length === 10) {
      const sem9 = `55${ddd}${resto.substring(1)}`;
      variacoes.push(sem9, `+${sem9}`, `whatsapp:+${sem9}`);
    } else if (!resto.startsWith('9') && resto.length === 9) {
      const com9 = `55${ddd}9${resto}`;
      variacoes.push(com9, `+${com9}`, `whatsapp:+${com9}`);
    }
  }
  
  return variacoes;
}

function telefoneVariacoes(telefone: string): string[] {
  let limpo = telefone.replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
  const variacoes: string[] = [
    limpo,
    `+${limpo}`,
    `whatsapp:+${limpo}`,
  ];
  const variacoesDigito9 = criarVariacoesDigito9(telefone);
  variacoes.push(...variacoesDigito9);
  return [...new Set(variacoes)].filter(Boolean);
}

function normalizarTelefoneParaComparacao(telefone: string): string {
  return telefone.replace(/^whatsapp:/i, '').trim();
}

function criarVariacoesComSem9(telefone: string): string[] {
  const apenasNumeros = telefone.replace(/\D/g, '');
  const variacoes: string[] = [apenasNumeros];
  
  if (apenasNumeros.startsWith('55') && apenasNumeros.length >= 12) {
    const ddd = apenasNumeros.substring(2, 4);
    const resto = apenasNumeros.substring(4);
    
    if (resto.length === 9 && resto.startsWith('9')) {
      variacoes.push(`55${ddd}${resto.substring(1)}`);
    } else if (resto.length === 8 && !resto.startsWith('9')) {
      variacoes.push(`55${ddd}9${resto}`);
    } else if (resto.length === 10 && resto.startsWith('9')) {
      variacoes.push(`55${ddd}${resto.substring(1)}`);
    }
  }
  
  return variacoes;
}

function telefonesCorrespondem(telefone1: string, telefone2: string): boolean {
  const tel1Norm = normalizarTelefoneParaComparacao(telefone1);
  const tel2Norm = normalizarTelefoneParaComparacao(telefone2);
  const tel1SemMais = tel1Norm.replace(/^\+/, '');
  const tel2SemMais = tel2Norm.replace(/^\+/, '');
  
  if (tel1SemMais === tel2SemMais) {
    return true;
  }
  
  const variacoes1 = criarVariacoesComSem9(tel1SemMais);
  const variacoes2 = criarVariacoesComSem9(tel2SemMais);
  const corresponde = variacoes1.some(v1 => variacoes2.includes(v1));
  
  if (corresponde) {
    return true;
  }
  
    const variacoesCompletas1 = telefoneVariacoes(telefone1);
    const variacoesCompletas2 = telefoneVariacoes(telefone2);
    const variacoesCompletas1Norm = variacoesCompletas1.map(v => v.replace(/^whatsapp:/i, '').replace(/^\+/, ''));
    const variacoesCompletas2Norm = variacoesCompletas2.map(v => v.replace(/^whatsapp:/i, '').replace(/^\+/, ''));
    
  return variacoesCompletas1Norm.some(v1 => variacoesCompletas2Norm.includes(v1));
}

// Interface para transação extraída pela IA
interface TransacaoExtraidaIA {
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'entrada' | 'saida';
  metodo?: 'credito' | 'debito';
  sucesso: boolean;
}

// Função para processar mensagem com IA (compatível com Workers)
async function processarMensagemComIAWorker(
  mensagem: string,
  env: Bindings
): Promise<TransacaoExtraidaIA[]> {
  const temGroq = env.GROQ_API_KEY && env.GROQ_API_KEY.trim() !== '';
  const temGemini = env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim() !== '';
  const IA_PROVIDER = (env.IA_PROVIDER || '').toLowerCase().trim();

  if (!temGroq && !temGemini) {
    throw new Error('Nenhuma API de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY no Cloudflare Workers.');
  }

  const prompt = `Analise a seguinte mensagem e extraia TODAS as transações financeiras mencionadas.

Mensagem: "${mensagem}"

⚠️ IMPORTANTE: A mensagem pode conter MÚLTIPLAS transações em linhas separadas ou na mesma linha.
Cada linha ou item mencionado com um valor deve ser extraído como uma transação separada.

EXEMPLOS DE MENSAGENS COM MÚLTIPLAS TRANSAÇÕES:
- "corte de cabelo 25 reais\nsalao de beleza 25 reais\nbarbearia 25 reais" = 3 transações
- "comprei pão por 5 reais, leite por 8 e café por 12" = 3 transações
- "gastei 50 com gasolina\n30 com almoço\n20 com estacionamento" = 3 transações
- "corte de cabelo 25 reais\nsalao de beleza 25 reais" = 2 transações

Retorne APENAS um JSON válido com o seguinte formato:
{
  "transacoes": [
    {
      "descricao": "descrição do item/serviço",
      "valor": 50.00,
      "categoria": "comida",
      "tipo": "saida",
      "metodo": "debito",
      "carteira": "nome da carteira se mencionada (ex: nubank, itau, inter)"
    }
  ]
}

Regras:
- Extraia TODAS as transações mencionadas, mesmo que estejam em linhas separadas
- Se a mensagem tiver múltiplas linhas, cada linha com um valor deve ser uma transação separada
- Se a mensagem tiver múltiplos itens na mesma linha (separados por vírgula, "e", ou quebra de linha), extraia cada um separadamente
- O valor deve ser um número (sem R$ ou "reais")
- A descrição deve ser clara e objetiva (ex: "corte de cabelo", "salao de beleza", "barbearia")
- A categoria deve ser uma palavra simples que agrupa o tipo de gasto
- Categorias comuns: comida, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
- Para serviços de beleza/cabelo: use categoria "serviços" ou "lazer"

- TIPO (CRÍTICO - leia com MUITA atenção):
  
  ⚠️ REGRA PRIMEIRA: Analise o CONTEXTO e o VERBO da mensagem para determinar se o dinheiro ENTRA ou SAI.
  
  ✅ Use "entrada" quando o dinheiro ENTRA na sua conta (você RECEBE dinheiro):
    - VERBOS DE ENTRADA: "recebi", "recebido", "recebimento", "ganhei", "ganho", "vendi", "venda", "depositei", "depósito", "entrou", "chegou", "lucro", "rendimento", "dividendos", "juros"
    - PALAVRAS-CHAVE DE ENTRADA: "salário", "pagamento recebido", "me pagou", "me pagaram", "pagou para mim", "acabou de me pagar", "transferência recebida", "dinheiro recebido", "receita", "entrada de dinheiro", "renda"
    - EXEMPLOS OBRIGATÓRIOS (SEMPRE são "entrada"):
      ✅ "recebi um salário de 100 reais" = ENTRADA
      ✅ "recebi 500 reais" = ENTRADA
      ✅ "recebi salário" = ENTRADA
      ✅ "me pagaram 2000 reais" = ENTRADA
      ✅ "vendi meu carro por 15000" = ENTRADA
      ✅ "ganhei 300 reais" = ENTRADA
      ✅ "depositei 500 reais" = ENTRADA
      ✅ "recebi pagamento do cliente" = ENTRADA
      ✅ "o chefe me pagou 1500" = ENTRADA
      ✅ "recebi 100 de salário" = ENTRADA
      ✅ "salário de 2000 reais" = ENTRADA
  
  ❌ Use "saida" quando o dinheiro SAI da sua conta (você PAGA ou GASTA):
    - VERBOS DE SAÍDA: "comprei", "paguei", "gastei", "despensei", "saquei", "transferi", "enviei", "paguei por", "gastei com"
    - PALAVRAS-CHAVE DE SAÍDA: "despesa", "saída", "saque", "pagamento feito", "transferência enviada", "compras", "gastos"
    - EXEMPLOS OBRIGATÓRIOS (SEMPRE são "saida"):
      ❌ "comprei um sanduíche por 20 reais" = SAIDA
      ❌ "paguei 150 reais de conta de luz" = SAIDA
      ❌ "gastei 50 reais" = SAIDA
      ❌ "comprei café por 5 reais" = SAIDA
  
  🔍 ANÁLISE DE CONTEXTO:
    - Se a mensagem começa com "recebi", "ganhei", "vendi", "me pagaram" = SEMPRE "entrada"
    - Se a mensagem começa com "comprei", "paguei", "gastei" = SEMPRE "saida"
    - Se mencionar "salário" = SEMPRE "entrada" (salário é sempre dinheiro que você recebe)
    - Se mencionar "venda" = SEMPRE "entrada" (venda é dinheiro que você recebe)
    - Se mencionar "compra" = SEMPRE "saida" (compra é dinheiro que você gasta)
  
  ⚠️ ATENÇÃO ESPECIAL: 
    - "recebi salário" = ENTRADA (não importa o valor, salário é sempre entrada)
    - "recebi um salário de X reais" = ENTRADA
    - "recebi X reais" = ENTRADA
    - Qualquer frase com "recebi" + valor = ENTRADA

- MÉTODO: "credito" se mencionar cartão de crédito, crédito, parcelado, ou "debito" se mencionar débito, dinheiro, pix, transferência. Se não mencionar, use "debito"
- CARTEIRA: Se a mensagem mencionar o nome de uma carteira, banco ou método de pagamento (ex: "nubank", "itau", "inter", "banco do brasil", "bradesco", "caixa", "santander", "picpay", "mercado pago", "pix", "cartão", "débito", "crédito"), extraia o nome da carteira no campo "carteira". Se não mencionar, deixe o campo vazio ou null.
- Se não houver transações, retorne {"transacoes": []}
- Retorne APENAS o JSON, sem texto adicional`;

  // Palavras-chave para validação adicional
  const palavrasEntrada = [
    'recebi', 'recebido', 'recebimento', 'ganhei', 'ganho', 'vendi', 'venda',
    'salário', 'salario', 'me pagou', 'me pagaram', 'pagou para mim',
    'acabou de me pagar', 'depositei', 'depósito', 'deposito',
    'transferência recebida', 'transferencia recebida', 'dinheiro recebido',
    'lucro', 'rendimento', 'dividendos', 'juros', 'receita', 'renda'
  ];
  
  const palavrasSaida = [
    'comprei', 'paguei', 'gastei', 'despensei', 'saquei', 'transferi',
    'enviei', 'despesa', 'saída', 'saida', 'saque', 'pagamento feito',
    'compras', 'gastos'
  ];
  
  const mensagemLower = mensagem.toLowerCase();

  try {
    let resposta: string;

    if (temGroq) {
      try {
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content: 'Você é um assistente especializado em extrair informações financeiras de mensagens de texto. IMPORTANTE: Retorne APENAS JSON válido, sem nenhum texto adicional, explicações ou comentários. Apenas o JSON puro.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 500
          }),
        });

        if (!groqResponse.ok) {
          throw new Error(`Groq API error: ${groqResponse.status}`);
        }

        const groqData = await groqResponse.json();
        resposta = groqData.choices[0]?.message?.content || '{}';
      } catch (error: any) {
        if (temGemini) {
          const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: prompt }]
              }]
            }),
          });

          if (!geminiResponse.ok) {
            throw new Error(`Gemini API error: ${geminiResponse.status}`);
          }

          const geminiData = await geminiResponse.json();
          resposta = geminiData.candidates[0]?.content?.parts[0]?.text || '{}';
        } else {
          throw error;
        }
      }
    } else if (temGemini) {
      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        }),
      });

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const geminiData = await geminiResponse.json();
      resposta = geminiData.candidates[0]?.content?.parts[0]?.text || '{}';
    } else {
      throw new Error('Nenhuma IA disponível');
    }

    // Função auxiliar para extrair JSON válido da resposta
    function extrairJSON(texto: string): any {
      // Remove markdown code blocks
      let limpo = texto.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      
      // Remove texto antes do primeiro {
      const primeiroBrace = limpo.indexOf('{');
      if (primeiroBrace > 0) {
        limpo = limpo.substring(primeiroBrace);
      }
      
      // Remove texto depois do último }
      const ultimoBrace = limpo.lastIndexOf('}');
      if (ultimoBrace >= 0 && ultimoBrace < limpo.length - 1) {
        limpo = limpo.substring(0, ultimoBrace + 1);
      }
      
      // Tenta encontrar o primeiro objeto JSON válido (greedy match)
      const jsonMatch = limpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // Se falhar, tenta encontrar o JSON mais interno (non-greedy)
          const jsonProfundo = limpo.match(/\{[\s\S]*?\}/);
          if (jsonProfundo) {
            try {
              return JSON.parse(jsonProfundo[0]);
            } catch (e2) {
              // Ignora
            }
          }
        }
      }
      
      // Se não encontrou, tenta parse direto
      try {
        return JSON.parse(limpo);
      } catch (e) {
        throw new Error(`Resposta da IA não contém JSON válido: ${texto.substring(0, 200)}...`);
      }
    }

    const resultado = extrairJSON(resposta);
    
    if (resultado.transacoes && Array.isArray(resultado.transacoes)) {
      return resultado.transacoes.map((t: any) => {
        // Validação dupla: verifica palavras-chave na mensagem original
        let tipoFinal = 'saida';
        
        if (t.tipo) {
          const tipoLower = String(t.tipo).toLowerCase().trim();
          if (tipoLower === 'entrada') {
            tipoFinal = 'entrada';
          }
        }
        
        // Validação adicional: verifica palavras-chave na mensagem
        const temPalavraEntrada = palavrasEntrada.some(palavra => mensagemLower.includes(palavra));
        const temPalavraSaida = palavrasSaida.some(palavra => mensagemLower.includes(palavra));
        
        if (temPalavraEntrada && !temPalavraSaida) {
          tipoFinal = 'entrada';
        } else if (temPalavraSaida && !temPalavraEntrada) {
          tipoFinal = 'saida';
        }
        
        return {
          descricao: t.descricao || 'Transação',
          valor: parseFloat(t.valor) || 0,
          categoria: t.categoria || 'outros',
          tipo: tipoFinal as 'entrada' | 'saida',
          metodo: (t.metodo && t.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito' as 'credito' | 'debito',
          sucesso: true
        };
      }).filter((t: TransacaoExtraidaIA) => t.valor > 0);
    }

    return [];
  } catch (error: any) {
    console.error('❌ Erro ao processar mensagem com IA:', error);
    throw error;
  }
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
  "categoria": "contas",
  "recorrente": false,
  "totalParcelas": null
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
- IMPORTANTE: Se a mensagem menciona "parcelas", "parcela", "vezes", "x" (ex: "8 parcelas", "em 8x", "8 vezes"):
  - "recorrente" deve ser true
  - "totalParcelas" deve ser o número de parcelas mencionado
  - Exemplo: "boleto em 8 parcelas" -> {"recorrente": true, "totalParcelas": 8}

Se não houver informações suficientes para criar um agendamento, retorne null.
Retorne APENAS o JSON, sem texto adicional.`;
  
  try {
    // Tenta Groq primeiro se disponível
    if ((iaProvider === 'groq' || !geminiApiKey) && groqApiKey) {
      
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
          recorrente: resultado.recorrente === true || (resultado.totalParcelas && resultado.totalParcelas > 1),
          totalParcelas: resultado.totalParcelas && resultado.totalParcelas > 1 ? Number(resultado.totalParcelas) : undefined,
          sucesso: true,
        };
      }
    }
    
    // Tenta Gemini se Groq não funcionou ou não está disponível
    if (geminiApiKey) {
      
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
          recorrente: resultado.recorrente === true || (resultado.totalParcelas && resultado.totalParcelas > 1),
          totalParcelas: resultado.totalParcelas && resultado.totalParcelas > 1 ? Number(resultado.totalParcelas) : undefined,
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

/**
 * Divide uma mensagem longa em partes menores que o limite do WhatsApp (4096 caracteres)
 */
function dividirMensagemWorker(mensagem: string, limite: number = 4000): string[] {
  // Deixa uma margem de segurança (96 caracteres) para evitar problemas
  if (mensagem.length <= limite) {
    return [mensagem];
  }

  const partes: string[] = [];
  let inicio = 0;

  while (inicio < mensagem.length) {
    let fim = inicio + limite;
    
    // Se não é a última parte, tenta quebrar em uma linha nova ou espaço
    if (fim < mensagem.length) {
      // Procura por quebra de linha próxima
      const quebraLinha = mensagem.lastIndexOf('\n', fim);
      // Procura por espaço próximo
      const espaco = mensagem.lastIndexOf(' ', fim);
      
      // Prefere quebra de linha, depois espaço
      if (quebraLinha > inicio + limite * 0.7) {
        fim = quebraLinha + 1;
      } else if (espaco > inicio + limite * 0.7) {
        fim = espaco + 1;
      }
    } else {
      fim = mensagem.length;
    }
    
    partes.push(mensagem.substring(inicio, fim));
    inicio = fim;
  }

  return partes;
}

async function enviarMensagemZApi(
  telefone: string,
  mensagem: string,
  env: Bindings
): Promise<{ success: boolean; error?: string }> {
  console.log('🔍 enviarMensagemZApi chamada com:');
  console.log('   telefone:', telefone);
  console.log('   mensagem length:', mensagem.length);
  console.log('   ZAPI_INSTANCE_ID:', env.ZAPI_INSTANCE_ID ? '✅' : '❌');
  console.log('   ZAPI_TOKEN:', env.ZAPI_TOKEN ? '✅' : '❌');
  console.log('   ZAPI_CLIENT_TOKEN:', env.ZAPI_CLIENT_TOKEN ? '✅' : '❌');
  
  if (!env.ZAPI_INSTANCE_ID || !env.ZAPI_TOKEN || !env.ZAPI_CLIENT_TOKEN) {
    const erro = 'Z-API não configurada. Configure ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN no Cloudflare Workers.';
    console.error('❌', erro);
    return { success: false, error: erro };
  }
  
  // Divide mensagem longa em partes menores (evita "Ler mais" do WhatsApp)
  const partesMensagem = dividirMensagemWorker(mensagem);
  
  // Se a mensagem foi dividida, envia cada parte separadamente
  if (partesMensagem.length > 1) {
    console.log(`📤 Mensagem longa detectada (${mensagem.length} caracteres). Dividindo em ${partesMensagem.length} partes...`);
    
    let primeiroErro: string | undefined;
    
    // Envia cada parte sequencialmente
    for (let i = 0; i < partesMensagem.length; i++) {
      const parte = partesMensagem[i];
      
      console.log(`📤 Enviando parte ${i + 1}/${partesMensagem.length} (${parte.length} caracteres)...`);
      
      const resultado = await enviarMensagemZApiUnica(telefone, parte, env);
      
      if (!resultado.success) {
        primeiroErro = resultado.error;
        // Continua enviando as outras partes mesmo se uma falhar
        console.warn(`⚠️ Erro ao enviar parte ${i + 1}: ${resultado.error}`);
      }
      
      // Pequeno delay entre mensagens para evitar spam
      if (i < partesMensagem.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    if (primeiroErro) {
      // Retorna sucesso parcial se pelo menos uma parte foi enviada
      // Mas loga o erro para debug
      console.warn(`⚠️ Algumas partes falharam. Primeiro erro: ${primeiroErro}`);
    }
    
    return { success: true };
  }
  
  // Mensagem curta - envia normalmente
  return await enviarMensagemZApiUnica(telefone, mensagem, env);
}

/**
 * Envia uma única mensagem via Z-API (sem divisão)
 */
async function enviarMensagemZApiUnica(
  telefone: string,
  mensagem: string,
  env: Bindings
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = env.ZAPI_BASE_URL || 'https://api.z-api.io';
  const url = `${baseUrl}/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}/send-text`;
  
  // Remove prefixo whatsapp: se existir e formata o número
  const numeroLimpo = telefone.replace('whatsapp:', '').replace('+', '');
  const numeroFormatado = numeroLimpo.startsWith('55') 
    ? numeroLimpo 
    : `55${numeroLimpo}`;
  
  console.log('📤 Enviando para Z-API:');
  console.log('   URL:', url);
  console.log('   Telefone formatado:', numeroFormatado);
  console.log('   Tamanho da mensagem:', mensagem.length, 'caracteres');
  console.log('   Mensagem preview:', mensagem.substring(0, 100));
  
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
    
    const responseText = await response.text();
    console.log('📥 Resposta Z-API:');
    console.log('   Status:', response.status, response.statusText);
    console.log('   Body:', responseText);
    
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Erro ao parsear JSON:', responseText);
      return { success: false, error: `Resposta inválida: ${responseText.substring(0, 100)}` };
    }
    
    if (response.ok) {
      console.log('✅ Mensagem enviada com sucesso!');
      return { success: true };
    } else {
      const erro = data.message || data.error || 'Erro ao enviar mensagem';
      console.error('❌ Erro Z-API:', erro);
      return { success: false, error: erro };
    }
  } catch (error: any) {
    console.error('❌ Exceção ao enviar mensagem:', error);
    return { success: false, error: error.message };
  }
}

async function enviarMensagemComButtonListZApi(
  telefone: string,
  mensagem: string,
  botoes: Array<{ id: string; label: string }>,
  env: Bindings
): Promise<{ success: boolean; error?: string }> {
  console.log('🔍 enviarMensagemComButtonListZApi chamada:');
  console.log('   telefone:', telefone);
  console.log('   mensagem length:', mensagem.length);
  console.log('   botões:', botoes.length);
  
  if (!env.ZAPI_INSTANCE_ID || !env.ZAPI_TOKEN || !env.ZAPI_CLIENT_TOKEN) {
    const erro = 'Z-API não configurada. Configure ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN no Cloudflare Workers.';
    console.error('❌', erro);
    return { success: false, error: erro };
  }
  
  if (botoes.length === 0 || botoes.length > 3) {
    const erro = 'Deve ter entre 1 e 3 botões';
    console.error('❌', erro);
    return { success: false, error: erro };
  }
  
  const baseUrl = env.ZAPI_BASE_URL || 'https://api.z-api.io';
  const url = `${baseUrl}/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}/send-button-list`;
  
  // Remove prefixo whatsapp: se existir e formata o número
  const numeroLimpo = telefone.replace('whatsapp:', '').replace('+', '');
  const numeroFormatado = numeroLimpo.startsWith('55') 
    ? numeroLimpo 
    : `55${numeroLimpo}`;
  
  const requestBody = {
    phone: numeroFormatado,
    message: mensagem,
    buttonList: {
      buttons: botoes.map(btn => ({
        id: btn.id,
        label: btn.label
      }))
    }
  };
  
  console.log('📤 Enviando button-list para Z-API:');
  console.log('   URL:', url);
  console.log('   Telefone formatado:', numeroFormatado);
  console.log('   Body:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Client-Token': env.ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify(requestBody),
    });
    
    const responseText = await response.text();
    console.log('📥 Resposta Z-API (button-list):');
    console.log('   Status:', response.status, response.statusText);
    console.log('   Body:', responseText);
    
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Erro ao parsear JSON:', responseText);
      return { success: false, error: `Resposta inválida: ${responseText.substring(0, 100)}` };
    }
    
    if (response.ok) {
      console.log('✅ Button-list enviado com sucesso!');
      return { success: true };
    } else {
      const erro = data.message || data.error || 'Erro ao enviar mensagem com botões';
      console.error('❌ Erro Z-API (button-list):', erro);
      return { success: false, error: erro };
    }
  } catch (error: any) {
    console.error('❌ Exceção ao enviar button-list:', error);
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
  const telefoneFormatado = formatarTelefone(telefone);

  const carteiraResolvida = await resolverCarteiraPorTextoD1(c.env.financezap_db, telefone, {
    textoOriginal: mensagem,
    tipoPreferido: 'debito',
  });
  const carteiraIdResolvida = carteiraResolvida.carteira?.id ?? null;

  const transacaoId = await salvarTransacao(c.env.financezap_db, {
    telefone,
    descricao: mensagem || 'Mensagem recebida',
    valor,
    categoria: 'outros',
    tipo: valor >= 0 ? 'saida' : 'entrada',
    metodo: 'debito',
    dataHora,
    data,
    mensagemOriginal: mensagem,
    carteiraId: carteiraIdResolvida,
  });

  if (carteiraIdResolvida) {
    await registrarUltimaCarteiraUsadaD1(c.env.financezap_db, telefone, carteiraIdResolvida);
    if (carteiraResolvida.aliasUsado) {
      await registrarAliasCarteiraD1(c.env.financezap_db, telefone, carteiraIdResolvida, carteiraResolvida.aliasUsado);
    }
  }
  
  // SSE desabilitado - usando apenas botão de atualizar manual
  // notificarClientesSSE(telefoneFormatado, 'transacao-nova', {
  //   id: transacaoId,
  //   tipo: 'transacao',
  //   mensagem: 'Nova transação registrada'
  // });

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
      return c.json({ success: false, error: 'Token não fornecido' }, 401);
    }
    
    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    
    
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

// API: Criar nova transação - PROTEGIDA
app.post('/api/transacoes', async (c) => {
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
    
    const body = await c.req.json();
    const { descricao, valor, categoria, tipo, metodo, dataHora, data } = body;
    
    // Validações
    if (!descricao || !descricao.trim()) {
      return c.json({ success: false, error: 'Descrição é obrigatória' }, 400);
    }
    
    if (!valor || isNaN(Number(valor)) || Number(valor) <= 0) {
      return c.json({ success: false, error: 'Valor inválido' }, 400);
    }
    
    if (!tipo || !['entrada', 'saida'].includes(tipo)) {
      return c.json({ success: false, error: 'Tipo deve ser "entrada" ou "saida"' }, 400);
    }
    
    if (!metodo || !['credito', 'debito'].includes(metodo)) {
      return c.json({ success: false, error: 'Método deve ser "credito" ou "debito"' }, 400);
    }
    
    // Prepara dados da transação
    const agora = new Date();
    const dataHoraFormatada = dataHora || agora.toLocaleString('pt-BR');
    const dataFormatada = data || agora.toISOString().split('T')[0];
    
    const transacao = {
      telefone: telefoneFormatado,
      descricao: descricao.trim(),
      valor: Number(valor),
      categoria: categoria || 'outros',
      tipo: tipo,
      metodo: metodo,
      dataHora: dataHoraFormatada,
      data: dataFormatada,
    };
    
    const id = await salvarTransacao(c.env.financezap_db, transacao);
    
    // Busca a transação criada diretamente do banco com a carteira incluída
    const transacaoRow = await c.env.financezap_db
      .prepare(
        `SELECT 
          t.id, 
          t.telefone, 
          t.descricao, 
          t.valor, 
          t.categoria, 
          t.tipo, 
          t.metodo, 
          t.dataHora, 
          t.data, 
          t.mensagemOriginal,
          t.carteiraId,
          c.id as carteira_id,
          c.nome as carteira_nome
         FROM transacoes t
         LEFT JOIN carteiras c ON t.carteiraId = c.id AND c.ativo = 1
         WHERE t.id = ?`
      )
      .bind(id)
      .first<any>();
    
    let transacaoCriada: any;
    if (transacaoRow) {
      transacaoCriada = {
        id: transacaoRow.id,
        telefone: transacaoRow.telefone,
        descricao: transacaoRow.descricao,
        valor: transacaoRow.valor,
        categoria: transacaoRow.categoria,
        tipo: transacaoRow.tipo === 'entrada' ? 'entrada' : 'saida',
        metodo: transacaoRow.metodo === 'credito' ? 'credito' : 'debito',
        dataHora: transacaoRow.dataHora,
        data: transacaoRow.data,
        mensagemOriginal: transacaoRow.mensagemOriginal ?? null,
        carteiraId: transacaoRow.carteiraId ?? null,
        carteira: transacaoRow.carteira_id ? {
          id: transacaoRow.carteira_id,
          nome: transacaoRow.carteira_nome,
          tipo: transacaoRow.metodo === 'credito' ? 'credito' : 'debito',
        } : null,
      };
    } else {
      // Fallback se não encontrar
      transacaoCriada = {
        id,
        ...transacao,
        mensagemOriginal: null,
        carteiraId: null,
        carteira: null
      };
    }
    
    return c.json({
      success: true,
      message: 'Transação criada com sucesso',
      transacao: transacaoCriada
    });
  } catch (error: any) {
    console.error('Erro em POST /api/transacoes:', error);
    return c.json({ success: false, error: error.message || 'Erro ao criar transação' }, 500);
  }
});

app.put('/api/transacoes/:id', async (c) => {
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
    
    // Verifica se a transação pertence ao usuário antes de editar
    const transacaoExistente = await c.env.financezap_db
      .prepare('SELECT telefone FROM transacoes WHERE id = ?')
      .bind(id)
      .first<any>();
    
    if (!transacaoExistente) {
      return c.json({ success: false, error: 'Transação não encontrada' }, 404);
    }
    
    // Verifica se a transação pertence ao usuário autenticado
    if (!telefonesCorrespondem(transacaoExistente.telefone, telefoneFormatado)) {
      return c.json({ success: false, error: 'Você não tem permissão para editar esta transação' }, 403);
    }
    
    const body = await c.req.json();
    const { descricao, valor, categoria, tipo, metodo, dataHora, data, carteiraId } = body;
    
    // Monta objeto com apenas os campos fornecidos
    const dadosAtualizacao: any = {};
    
    if (descricao !== undefined) {
      if (!descricao || !descricao.trim()) {
        return c.json({ success: false, error: 'Descrição não pode ser vazia' }, 400);
      }
      dadosAtualizacao.descricao = descricao.trim();
    }
    
    if (valor !== undefined) {
      if (isNaN(Number(valor)) || Number(valor) <= 0) {
        return c.json({ success: false, error: 'Valor inválido' }, 400);
      }
      dadosAtualizacao.valor = Number(valor);
    }
    
    if (categoria !== undefined) {
      dadosAtualizacao.categoria = categoria || 'outros';
    }
    
    if (tipo !== undefined) {
      if (!['entrada', 'saida'].includes(tipo)) {
        return c.json({ success: false, error: 'Tipo deve ser "entrada" ou "saida"' }, 400);
      }
      dadosAtualizacao.tipo = tipo;
    }
    
    if (metodo !== undefined) {
      if (!['credito', 'debito'].includes(metodo)) {
        return c.json({ success: false, error: 'Método deve ser "credito" ou "debito"' }, 400);
      }
      dadosAtualizacao.metodo = metodo;
    }
    
    if (dataHora !== undefined) {
      dadosAtualizacao.dataHora = dataHora;
    }
    
    if (data !== undefined) {
      dadosAtualizacao.data = data;
    }
    
    if (carteiraId !== undefined) {
      dadosAtualizacao.carteiraId = carteiraId;
    }
    
    // Validação: entrada não pode ser em crédito
    const tipoFinal = dadosAtualizacao.tipo || transacaoExistente.tipo;
    const metodoFinal = dadosAtualizacao.metodo || transacaoExistente.metodo;
    
    if (tipoFinal === 'entrada' && metodoFinal === 'credito') {
      return c.json({ success: false, error: 'Recebimentos não podem ser em crédito' }, 400);
    }
    
    // Atualiza a transação
    const atualizado = await atualizarTransacao(c.env.financezap_db, id, dadosAtualizacao);
    
    if (!atualizado) {
      return c.json({ success: false, error: 'Nenhum campo foi atualizado ou transação não encontrada' }, 400);
    }
    
    // Busca a transação atualizada com a carteira incluída
    const transacaoRow = await c.env.financezap_db
      .prepare(
        `SELECT 
          t.id, 
          t.telefone, 
          t.descricao, 
          t.valor, 
          t.categoria, 
          t.tipo, 
          t.metodo, 
          t.dataHora, 
          t.data, 
          t.mensagemOriginal,
          t.carteiraId,
          c.id as carteira_id,
          c.nome as carteira_nome
         FROM transacoes t
         LEFT JOIN carteiras c ON t.carteiraId = c.id AND c.ativo = 1
         WHERE t.id = ?`
      )
      .bind(id)
      .first<any>();
    
    if (!transacaoRow) {
      return c.json({ success: false, error: 'Erro ao buscar transação atualizada' }, 500);
    }
    
    const transacaoAtualizada = {
      id: transacaoRow.id,
      telefone: transacaoRow.telefone,
      descricao: transacaoRow.descricao,
      valor: transacaoRow.valor,
      categoria: transacaoRow.categoria,
      tipo: transacaoRow.tipo,
      metodo: transacaoRow.metodo,
      dataHora: transacaoRow.dataHora,
      data: transacaoRow.data,
      mensagemOriginal: transacaoRow.mensagemOriginal,
      carteiraId: transacaoRow.carteiraId,
      carteira: transacaoRow.carteira_id ? {
        id: transacaoRow.carteira_id,
        nome: transacaoRow.carteira_nome,
        tipo: transacaoRow.metodo === 'credito' ? 'credito' : 'debito',
      } : null,
    };
    
    return c.json({
      success: true,
      message: 'Transação atualizada com sucesso',
      transacao: transacaoAtualizada,
    });
  } catch (error: any) {
    console.error('Erro em PUT /api/transacoes/:id:', error);
    return c.json({ success: false, error: error.message || 'Erro ao atualizar transação' }, 500);
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
    await salvarCodigoVerificacao(telefoneFormatado, codigo, c.env.financezap_db);
    
    
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
    const codigoValido = await verificarCodigo(telefoneFormatado, codigo, c.env.financezap_db);
    
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
    
    // Decodifica o token para verificar se está correto (sem verificar assinatura)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadPart = parts[1];
        const paddedPayload = payloadPart + '='.repeat((4 - payloadPart.length % 4) % 4);
        const decodedWithoutVerify = JSON.parse(
          atob(paddedPayload)
        );
      }
    } catch (e) {
    }
    
    
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
    
    // Verifica se é um novo número (primeira vez que se registra)
    const ehNovoNumero = !(await numeroEstaRegistrado(c.env.financezap_db, telefoneFormatado));
    
    // Registra o número se ainda não estiver registrado
    if (ehNovoNumero) {
      await registrarNumero(c.env.financezap_db, telefoneFormatado);
    }
    
    
    // Envia mensagem de boas-vindas se for um novo usuário
    if (ehNovoNumero) {
      try {
        const mensagemBoasVindas = `Olá! Eu sou a Zela 😄✅, sua assistente financeira inteligente.

Estou aqui para te ajudar a organizar e melhorar sua vida financeira! Comigo, você pode registrar facilmente suas transações e acompanhar suas finanças de forma prática.

Sinta-se à vontade para me usar quando precisar! Vou te acompanhar em cada passo para garantir que suas finanças estejam sempre em ordem! 💚

💸 *Lançamentos rápidos pelo WhatsApp*

* Para despesas e receitas, envie: texto, foto ou áudio.

* Palavras como "recebi" ou "ganhei" → *RECEITA* 💰

* Palavras como "gastei", "comprei" ou, caso não informe → *DESPESA*

* 📅 Sem data informada? Usaremos a *data de hoje* automaticamente.

📌 *Exemplos:*

* Receita: "Recebi 500 reais de salário hoje"

* Despesa: "Gastei 50 reais no supermercado"

* Despesa: "Comprei livro por 40 reais"

🗂 *Categorias e organização automática*

* A IA classifica automaticamente seus lançamentos usando categorias padrão já criadas. ✅

* Na plataforma, você pode criar ou editar categorias e subcategorias para ajudar a IA a organizar melhor suas receitas e despesas.

⏰ *Lembretes automáticos*

* Você pode agendar pagamentos e recebimentos futuros.

* Envie mensagens como "tenho que pagar 300 reais de aluguel no dia 5" ou "agende pagamento de 800 reais de aluguel para o dia 10".

*Plataforma Zela*

* 📊 Analisar suas finanças com gráficos inteligentes, relatórios detalhados e filtros avançados.

* ✍️ Registrar lançamentos de forma detalhada.

* 🏦 Criar contas bancárias para organizar melhor suas transações.

* 📝 Além de muitas outras funcionalidades!

💌 *Gostou do Zela? Indique para um amigo e ajude ele(a) a organizar as finanças também!*

Acesse: https://usezela.com 💚

📞 *Precisa de ajuda, suporte, tem sugestões ou reclamações?*

Entre em contato conosco: contato@usezela.com 📩

🚀 *Vamos lá começar a organizar suas finanças!*`;

        await enviarMensagemZApi(telefoneFormatado, mensagemBoasVindas, c.env);
      } catch (error: any) {
        console.error('❌ Erro ao enviar mensagem de boas-vindas:', error);
        // Não falha o cadastro se não conseguir enviar a mensagem
      }
    }
    
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

// Endpoint para excluir todos os dados do usuário
app.delete('/api/auth/excluir-dados', async (c) => {
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
    
    
    // Exclui todos os dados do usuário
    const resultado = await excluirTodosDadosUsuario(c.env.financezap_db, telefoneFormatado);
    
    if (resultado.sucesso) {
      return c.json({
        success: true,
        message: 'Todos os seus dados foram excluídos com sucesso',
        dadosRemovidos: resultado.dadosRemovidos
      });
    } else {
      console.error(`❌ Erro ao excluir dados para: ${telefoneFormatado}`);
      return c.json({
        success: false,
        error: 'Erro ao excluir dados. Tente novamente mais tarde.'
      }, 500);
    }
  } catch (error: any) {
    console.error('❌ Erro ao excluir dados do usuário:', error);
    return c.json({
      success: false,
      error: error.message || 'Erro ao excluir dados'
    }, 500);
  }
});

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
    let telefoneOriginal: string;
    try {
      telefoneOriginal = await extrairTelefoneDoToken(token, jwtSecret);
      telefoneFormatado = formatarTelefone(telefoneOriginal);
    } catch (error: any) {
      console.error('Erro ao verificar token:', error.message);
      if (error.message?.includes('expired')) {
        return c.json({ success: false, error: 'Token expirado' }, 401);
      }
      return c.json({ success: false, error: error.message || 'Token inválido' }, 401);
    }
    
    const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, telefoneFormatado);
    
    if (!usuario) {
      console.error('❌ Usuário não encontrado para telefone:', telefoneFormatado);
      console.error('   Telefone original do token:', telefoneOriginal);
      console.error('   Tentando buscar com variações...');
      return c.json({ success: false, error: 'Usuário não encontrado' }, 401);
    }
    
    
    const stats = await calcularEstatisticas(c.env.financezap_db, { telefone: telefoneFormatado });
    const agora = new Date();
    const trialExpiraEm = new Date(usuario.trialExpiraEm);
    const diasRestantes = usuario.status === 'trial' 
      ? Math.ceil((trialExpiraEm.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const resposta = {
      success: true,
      telefone: telefoneFormatado,
      usuario: {
        telefone: usuario.telefone,
        nome: usuario.nome,
        email: usuario.email,
        status: usuario.status,
        plano: usuario.plano || null, // 'mensal', 'trimestral', 'anual' ou null
        trialExpiraEm: usuario.trialExpiraEm,
        diasRestantesTrial: diasRestantes,
        totalTransacoes: stats.totalTransacoes,
      }
    };
    
    
    return c.json(resposta);
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
    console.error('Erro ao enviar contato:', error);
    return c.json({ success: false, error: error.message || 'Erro ao enviar mensagem' }, 500);
  }
});

// Ativar assinatura (atualiza status para 'ativo')
app.post('/api/auth/ativar-assinatura', async (c) => {
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
    
    const body = await c.req.json();
    const { planoId } = body;
    
    
    // Calcula a data de expiração baseada no plano
    const agora = new Date();
    let dataExpiracao: Date;
    
    switch (planoId) {
      case 'mensal':
        dataExpiracao = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias
        break;
      case 'trimestral':
        dataExpiracao = new Date(agora.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 dias
        break;
      case 'anual':
        dataExpiracao = new Date(agora.getTime() + 365 * 24 * 60 * 60 * 1000); // 365 dias
        break;
      default:
        dataExpiracao = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 dias
    }
    
    // Atualiza o status do usuário para 'ativo' e salva o plano
    await c.env.financezap_db.prepare(`
      UPDATE usuarios 
      SET status = 'ativo', 
          plano = ?,
          trialExpiraEm = ?,
          assinaturaEm = ?
      WHERE telefone = ?
    `).bind(planoId, dataExpiracao.toISOString(), agora.toISOString(), telefoneFormatado).run();
    
    
    return c.json({
      success: true,
      message: 'Assinatura ativada com sucesso!',
      plano: planoId,
      status: 'ativo',
      expiraEm: dataExpiracao.toISOString()
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
    
    // Verificação adicional de segurança antes de tentar atualizar
    const categoriaVerificacao = await c.env.financezap_db
      .prepare('SELECT padrao FROM categorias WHERE id = ?')
      .bind(id)
      .first<{ padrao: number }>();
    
    if (categoriaVerificacao && categoriaVerificacao.padrao === 1) {
      return c.json({ 
        success: false, 
        error: 'Não é possível atualizar categorias padrão do sistema' 
      }, 403);
    }
    
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
    
    // Verificação adicional de segurança antes de tentar remover
    const categoria = await c.env.financezap_db
      .prepare('SELECT padrao FROM categorias WHERE id = ?')
      .bind(id)
      .first<{ padrao: number }>();
    
    if (categoria && categoria.padrao === 1) {
      return c.json({ 
        success: false, 
        error: 'Não é possível remover categorias padrão do sistema' 
      }, 403);
    }
    
    await removerCategoriaD1(c.env.financezap_db, id, telefoneFormatado);
    
    // SSE desabilitado - usando apenas botão de atualizar manual
    // notificarClientesSSE(telefoneFormatado, 'categoria-removida', {
    //   id,
    //   tipo: 'categoria',
    //   mensagem: 'Categoria removida'
    // }, c.env.financezap_db);
    
    return c.json({ success: true, message: 'Categoria removida com sucesso' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== ENDPOINTS DE TEMPLATES ==========

app.get('/api/templates', async (c) => {
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
    
    const templates = await buscarTemplatesD1(c.env.financezap_db, telefoneFormatado);
    
    return c.json({
      success: true,
      templates: templates.map(t => ({
        id: t.id,
        nome: t.nome,
        tipo: t.tipo,
        corPrimaria: t.corPrimaria,
        corSecundaria: t.corSecundaria,
        corDestaque: t.corDestaque,
        corFundo: t.corFundo,
        corTexto: t.corTexto,
        ativo: t.ativo === 1,
        criadoEm: t.criadoEm
      }))
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/templates', async (c) => {
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
    const { nome, corPrimaria, corSecundaria, corDestaque, corFundo, corTexto } = body;
    
    if (!nome || !nome.trim()) {
      return c.json({ success: false, error: 'Nome do template é obrigatório' }, 400);
    }
    
    const id = await criarTemplateD1(c.env.financezap_db, telefoneFormatado, {
      nome: nome.trim(),
      corPrimaria,
      corSecundaria,
      corDestaque,
      corFundo,
      corTexto,
    });
    
    const templates = await buscarTemplatesD1(c.env.financezap_db, telefoneFormatado);
    const template = templates.find(t => t.id === id);
    
    return c.json({
      success: true,
      message: 'Template criado com sucesso',
      template: template ? {
        id: template.id,
        nome: template.nome,
        tipo: template.tipo,
        corPrimaria: template.corPrimaria,
        corSecundaria: template.corSecundaria,
        corDestaque: template.corDestaque,
        corFundo: template.corFundo,
        corTexto: template.corTexto,
        ativo: template.ativo === 1
      } : null
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.put('/api/templates/:id', async (c) => {
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
    const { nome, corPrimaria, corSecundaria, corDestaque, corFundo, corTexto } = body;
    
    await atualizarTemplateD1(c.env.financezap_db, id, telefoneFormatado, {
      nome,
      corPrimaria,
      corSecundaria,
      corDestaque,
      corFundo,
      corTexto,
    });
    
    const templates = await buscarTemplatesD1(c.env.financezap_db, telefoneFormatado);
    const template = templates.find(t => t.id === id);
    
    return c.json({
      success: true,
      message: 'Template atualizado com sucesso',
      template: template ? {
        id: template.id,
        nome: template.nome,
        tipo: template.tipo,
        corPrimaria: template.corPrimaria,
        corSecundaria: template.corSecundaria,
        corDestaque: template.corDestaque,
        corFundo: template.corFundo,
        corTexto: template.corTexto,
        ativo: template.ativo === 1
      } : null
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.delete('/api/templates/:id', async (c) => {
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
    
    await removerTemplateD1(c.env.financezap_db, id, telefoneFormatado);
    
    return c.json({ success: true, message: 'Template deletado com sucesso' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.put('/api/templates/:id/ativar', async (c) => {
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
    
    await ativarTemplateD1(c.env.financezap_db, id, telefoneFormatado);
    
    const templates = await buscarTemplatesD1(c.env.financezap_db, telefoneFormatado);
    const template = templates.find(t => t.id === id);
    
    return c.json({
      success: true,
      message: 'Template ativado com sucesso',
      template: template ? {
        id: template.id,
        nome: template.nome,
        tipo: template.tipo,
        corPrimaria: template.corPrimaria,
        corSecundaria: template.corSecundaria,
        corDestaque: template.corDestaque,
        corFundo: template.corFundo,
        corTexto: template.corTexto,
        ativo: template.ativo === 1
      } : null
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== ENDPOINTS DE CARTEIRAS ==========

app.get('/api/carteiras', async (c) => {
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
    
    // Debug: verifica se a tabela existe
    try {
      const testQuery = await c.env.financezap_db
        .prepare('SELECT COUNT(*) as count FROM carteiras')
        .first<{ count: number }>();
    } catch (testError: any) {
      console.error('❌ Erro ao testar tabela carteiras:', testError.message);
      return c.json({ 
        success: false, 
        error: `Erro ao acessar banco: ${testError.message}. Verifique se a tabela existe.` 
      }, 500);
    }
    
    const carteiras = await buscarCarteirasD1(c.env.financezap_db, telefoneFormatado);
    
    return c.json({
      success: true,
      carteiras: carteiras.map(cart => ({
        id: cart.id,
        telefone: cart.telefone,
        nome: cart.nome,
        descricao: cart.descricao,
        padrao: cart.padrao === 1,
        ativo: cart.ativo === 1,
        criadoEm: cart.criadoEm,
        atualizadoEm: cart.atualizadoEm
      }))
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/carteiras', async (c) => {
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
    const { nome, descricao, padrao } = body;
    
    if (!nome || !nome.trim()) {
      return c.json({ success: false, error: 'Nome da carteira é obrigatório' }, 400);
    }
    
    const id = await criarCarteiraD1(c.env.financezap_db, telefoneFormatado, {
      nome: nome.trim(),
      descricao: descricao?.trim(),
      padrao: padrao === true,
    });
    
    const carteiras = await buscarCarteirasD1(c.env.financezap_db, telefoneFormatado);
    const carteira = carteiras.find(c => c.id === id);
    
    return c.json({
      success: true,
      message: 'Carteira criada com sucesso',
      carteira: carteira ? {
        id: carteira.id,
        telefone: carteira.telefone,
        nome: carteira.nome,
        descricao: carteira.descricao,
        padrao: carteira.padrao === 1,
        ativo: carteira.ativo === 1
      } : null
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.put('/api/carteiras/:id', async (c) => {
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
    const { nome, descricao, padrao, ativo } = body;
    
    await atualizarCarteiraD1(c.env.financezap_db, id, telefoneFormatado, {
      nome,
      descricao,
      padrao,
      ativo,
    });
    
    const carteiras = await buscarCarteirasD1(c.env.financezap_db, telefoneFormatado);
    const carteira = carteiras.find(c => c.id === id);
    
    return c.json({
      success: true,
      message: 'Carteira atualizada com sucesso',
      carteira: carteira ? {
        id: carteira.id,
        telefone: carteira.telefone,
        nome: carteira.nome,
        descricao: carteira.descricao,
        padrao: carteira.padrao === 1,
        ativo: carteira.ativo === 1
      } : null
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.delete('/api/carteiras/:id', async (c) => {
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
    
    // Debug: verifica se o banco está acessível
    try {
      const testQuery = await c.env.financezap_db
        .prepare('SELECT COUNT(*) as count FROM carteiras')
        .first<{ count: number }>();
    } catch (testError: any) {
      console.error('❌ Erro ao testar acesso à tabela carteiras:', testError.message);
      return c.json({ 
        success: false, 
        error: `Erro ao acessar banco de dados: ${testError.message}. A tabela pode não existir ainda.` 
      }, 500);
    }
    
    await removerCarteiraD1(c.env.financezap_db, id, telefoneFormatado);
    
    return c.json({ success: true, message: 'Carteira removida com sucesso' });
  } catch (error: any) {
    console.error('❌ Erro ao remover carteira:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/carteiras/:id/padrao', async (c) => {
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
    
    await definirCarteiraPadraoD1(c.env.financezap_db, id, telefoneFormatado);
    
    const carteiras = await buscarCarteirasD1(c.env.financezap_db, telefoneFormatado);
    const carteira = carteiras.find(c => c.id === id);
    
    return c.json({
      success: true,
      message: 'Carteira definida como padrão com sucesso',
      carteira: carteira ? {
        id: carteira.id,
        telefone: carteira.telefone,
        nome: carteira.nome,
        descricao: carteira.descricao,
        padrao: carteira.padrao === 1,
        ativo: carteira.ativo === 1
      } : null
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== SERVER-SENT EVENTS (SSE) ==========
// SSE DESABILITADO - Usando apenas botão de atualizar manual

// Rota SSE desabilitada
app.get('/api/events', async (c) => {
  return c.json({ 
    success: false, 
    error: 'SSE desabilitado. Use o botão "Atualizar" para atualizar os dados manualmente.' 
  }, 503);
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
        recorrente: ag.recorrente === 1,
        totalParcelas: ag.totalParcelas,
        parcelaAtual: ag.parcelaAtual,
        agendamentoPaiId: ag.agendamentoPaiId,
        criadoEm: ag.criadoEm,
        atualizadoEm: ag.atualizadoEm,
      }))
    });
  } catch (error: any) {
    console.error('Erro em GET /api/agendamentos:', error);
    return c.json({ success: false, error: error.message || 'Erro ao buscar agendamentos' }, 500);
  }
});

// API: Criar novo agendamento - PROTEGIDA
app.post('/api/agendamentos', async (c) => {
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
    const { descricao, valor, dataAgendamento, tipo, categoria, recorrente, totalParcelas } = body;
    
    // Validações
    if (!descricao || !descricao.trim()) {
      return c.json({ success: false, error: 'Descrição é obrigatória' }, 400);
    }
    
    if (!valor || isNaN(Number(valor)) || Number(valor) <= 0) {
      return c.json({ success: false, error: 'Valor inválido' }, 400);
    }
    
    if (!dataAgendamento) {
      return c.json({ success: false, error: 'Data do agendamento é obrigatória' }, 400);
    }
    
    if (!tipo || !['pagamento', 'recebimento'].includes(tipo)) {
      return c.json({ success: false, error: 'Tipo deve ser "pagamento" ou "recebimento"' }, 400);
    }
    
    // Valida formato da data (YYYY-MM-DD)
    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRegex.test(dataAgendamento)) {
      return c.json({ success: false, error: 'Formato de data inválido. Use YYYY-MM-DD' }, 400);
    }
    
    // Validações para agendamentos recorrentes
    if (recorrente && (!totalParcelas || totalParcelas < 2 || totalParcelas > 999)) {
      return c.json({ success: false, error: 'Para agendamentos recorrentes, totalParcelas deve ser entre 2 e 999' }, 400);
    }
    
    const agendamento = {
      telefone: telefoneFormatado,
      descricao: descricao.trim(),
      valor: Number(valor),
      dataAgendamento: dataAgendamento,
      tipo: tipo,
      categoria: categoria || 'outros',
    };
    
    let ids: number[];
    if (recorrente && totalParcelas) {
      const { criarAgendamentosRecorrentesD1 } = await import('./d1');
      ids = await criarAgendamentosRecorrentesD1(c.env.financezap_db, {
        ...agendamento,
        totalParcelas: Number(totalParcelas),
      });
    } else {
      const id = await criarAgendamentoD1(c.env.financezap_db, agendamento);
      ids = [id];
    }
    
    return c.json({
      success: true,
      message: recorrente 
        ? `${ids.length} agendamentos recorrentes criados com sucesso`
        : 'Agendamento criado com sucesso',
      agendamentos: ids.map(id => ({
        id,
        ...agendamento,
        status: 'pendente',
        recorrente: recorrente || false,
        totalParcelas: recorrente ? totalParcelas : null,
      }))
    });
  } catch (error: any) {
    console.error('Erro em POST /api/agendamentos:', error);
    return c.json({ success: false, error: error.message || 'Erro ao criar agendamento' }, 500);
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
    const { status, descricao, valor, dataAgendamento, tipo, categoria, carteiraId, valorPago } = body;
    
    // Se apenas status foi enviado, usa a função antiga
    if (status && !descricao && !valor && !dataAgendamento && !tipo && !categoria) {
      if (!['pendente', 'pago', 'cancelado'].includes(status)) {
        return c.json({ success: false, error: 'Status inválido' }, 400);
      }
      
      // Busca o agendamento antes de atualizar para criar a transação se necessário
      const agendamento = await buscarAgendamentoPorIdD1(c.env.financezap_db, id);
      if (!agendamento) {
        return c.json({ success: false, error: 'Agendamento não encontrado' }, 404);
      }
      
      // Verifica se o telefone corresponde
      if (!telefonesCorrespondem(agendamento.telefone, telefoneFormatado)) {
        return c.json({ success: false, error: 'Você não tem permissão para atualizar este agendamento' }, 403);
      }
      
      const atualizado = await atualizarStatusAgendamentoD1(c.env.financezap_db, id, status);
      if (!atualizado) {
        return c.json({ success: false, error: 'Erro ao atualizar agendamento' }, 500);
      }
      
      // Se marcou como pago, cria transação automaticamente
      if (status === 'pago') {
        const dataAtual = new Date().toISOString().split('T')[0];
        const valorTransacao = valorPago || agendamento.valor;
        
        // Determina método baseado na carteira se fornecida
        let metodoTransacao = 'debito';
        if (carteiraId) {
          try {
            const { buscarCarteiraPorIdD1 } = await import('./d1');
            const carteira = await buscarCarteiraPorIdD1(c.env.financezap_db, carteiraId, telefoneFormatado);
            if (carteira && carteira.tipo === 'credito') {
              metodoTransacao = 'credito';
            }
          } catch (error) {
            console.error('Erro ao buscar carteira:', error);
            // Mantém débito como padrão
          }
        }
        
        try {
          const transacaoId = await salvarTransacao(c.env.financezap_db, {
            telefone: telefoneFormatado,
            descricao: agendamento.descricao,
            valor: valorTransacao,
            categoria: agendamento.categoria || 'outros',
            tipo: agendamento.tipo === 'recebimento' ? 'entrada' : 'saida',
            metodo: metodoTransacao,
            dataHora: new Date().toISOString(),
            data: dataAtual,
            mensagemOriginal: `Agendamento ${agendamento.id} - ${agendamento.descricao}`,
            carteiraId: carteiraId || null,
          });
        } catch (error: any) {
          console.error(`❌ Erro ao criar transação para agendamento ${id}:`, error.message);
          // Não falha a atualização do agendamento se a transação falhar
        }
      }
      
      return c.json({ success: true, message: 'Status atualizado com sucesso' });
    } else {
      // Atualização completa
      const dadosAtualizacao: any = {};
      if (descricao !== undefined) dadosAtualizacao.descricao = descricao.trim();
      if (valor !== undefined) {
        if (isNaN(Number(valor)) || Number(valor) <= 0) {
          return c.json({ success: false, error: 'Valor inválido' }, 400);
        }
        dadosAtualizacao.valor = Number(valor);
      }
      if (dataAgendamento !== undefined) {
        const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dataRegex.test(dataAgendamento)) {
          return c.json({ success: false, error: 'Formato de data inválido. Use YYYY-MM-DD' }, 400);
        }
        dadosAtualizacao.dataAgendamento = dataAgendamento;
      }
      if (tipo !== undefined) {
        if (!['pagamento', 'recebimento'].includes(tipo)) {
          return c.json({ success: false, error: 'Tipo deve ser "pagamento" ou "recebimento"' }, 400);
        }
        dadosAtualizacao.tipo = tipo;
      }
      if (categoria !== undefined) dadosAtualizacao.categoria = categoria;
      if (status !== undefined) {
        if (!['pendente', 'pago', 'cancelado'].includes(status)) {
          return c.json({ success: false, error: 'Status inválido. Use: pendente, pago ou cancelado' }, 400);
        }
        dadosAtualizacao.status = status;
      }
      
      // Busca o agendamento atualizado para criar a transação se necessário
      const agendamentoAtualizado = await buscarAgendamentoPorIdD1(c.env.financezap_db, id);
      if (!agendamentoAtualizado) {
        return c.json({ success: false, error: 'Agendamento não encontrado após atualização' }, 404);
      }
      
      // Se marcou como pago na atualização completa, cria transação automaticamente
      if (status === 'pago') {
        const dataAtual = new Date().toISOString().split('T')[0];
        const valorTransacao = valorPago || agendamentoAtualizado.valor;
        
        // Determina método baseado na carteira se fornecida
        let metodoTransacao = 'debito';
        if (carteiraId) {
          try {
            const { buscarCarteiraPorIdD1 } = await import('./d1');
            const carteira = await buscarCarteiraPorIdD1(c.env.financezap_db, carteiraId, telefoneFormatado);
            if (carteira && carteira.tipo === 'credito') {
              metodoTransacao = 'credito';
            }
          } catch (error) {
            console.error('Erro ao buscar carteira:', error);
            // Mantém débito como padrão
          }
        }
        
        try {
          const transacaoId = await salvarTransacao(c.env.financezap_db, {
            telefone: telefoneFormatado,
            descricao: agendamentoAtualizado.descricao,
            valor: valorTransacao,
            categoria: agendamentoAtualizado.categoria || 'outros',
            tipo: agendamentoAtualizado.tipo === 'recebimento' ? 'entrada' : 'saida',
            metodo: metodoTransacao,
            dataHora: new Date().toISOString(),
            data: dataAtual,
            mensagemOriginal: `Agendamento ${agendamentoAtualizado.id} - ${agendamentoAtualizado.descricao}`,
            carteiraId: carteiraId || null,
          });
        } catch (error: any) {
          console.error(`❌ Erro ao criar transação para agendamento ${id}:`, error.message);
          // Não falha a atualização do agendamento se a transação falhar
        }
      }
      
      return c.json({ success: true, message: 'Agendamento atualizado com sucesso' });
    }
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
      return c.json({ success: false, error: 'Você não tem permissão para remover este agendamento' }, 403);
    }
    
    await removerAgendamentoD1(c.env.financezap_db, id);
    
    return c.json({ success: true, message: 'Agendamento removido com sucesso' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Remover grupo de agendamentos recorrentes (pai e todos os filhos)
app.delete('/api/agendamentos/grupo/:paiId', autenticarMiddleware, async (c) => {
  try {
    const paiId = parseInt(c.req.param('paiId'));
    
    if (isNaN(paiId)) {
      return c.json({ success: false, error: 'ID do agendamento pai inválido' }, 400);
    }
    
    // Remove todos os agendamentos filhos
    await c.env.financezap_db.prepare(
      'DELETE FROM agendamentos WHERE agendamentoPaiId = ?'
    ).bind(paiId).run();
    
    // Remove o agendamento pai
    await removerAgendamentoD1(c.env.financezap_db, paiId);
    
    return c.json({ success: true, message: 'Grupo de agendamentos removido com sucesso' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Adicionar nova parcela a um grupo de agendamentos recorrentes
app.post('/api/agendamentos/:paiId/adicionar-parcela', autenticarMiddleware, async (c) => {
  try {
    const telefone = c.get('telefone');
    const paiId = parseInt(c.req.param('paiId'));
    
    if (isNaN(paiId)) {
      return c.json({ success: false, error: 'ID do agendamento pai inválido' }, 400);
    }
    
    // Busca o agendamento pai para obter informações base
    const agendamentoPai = await c.env.financezap_db.prepare(
      'SELECT * FROM agendamentos WHERE id = ? OR agendamentoPaiId = ? ORDER BY parcelaAtual DESC LIMIT 1'
    ).bind(paiId, paiId).first<any>();
    
    if (!agendamentoPai) {
      return c.json({ success: false, error: 'Agendamento não encontrado' }, 404);
    }
    
    // Busca a última parcela para calcular a próxima
    const ultimaParcela = await c.env.financezap_db.prepare(
      'SELECT * FROM agendamentos WHERE (id = ? OR agendamentoPaiId = ?) ORDER BY parcelaAtual DESC LIMIT 1'
    ).bind(paiId, paiId).first<any>();
    
    const novaParcelaNumero = (ultimaParcela?.parcelaAtual || 0) + 1;
    const novoTotal = (agendamentoPai.totalParcelas || ultimaParcela?.totalParcelas || 0) + 1;
    
    // Calcula a data da nova parcela (1 mês após a última)
    const ultimaData = new Date(ultimaParcela?.dataAgendamento || new Date());
    ultimaData.setMonth(ultimaData.getMonth() + 1);
    const novaData = ultimaData.toISOString().split('T')[0];
    
    // Cria a nova parcela
    const result = await c.env.financezap_db.prepare(`
      INSERT INTO agendamentos (telefone, descricao, valor, dataAgendamento, tipo, status, categoria, recorrente, totalParcelas, parcelaAtual, agendamentoPaiId, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, ?, ?, 'pendente', ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      telefone,
      agendamentoPai.descricao,
      agendamentoPai.valor,
      novaData,
      agendamentoPai.tipo,
      agendamentoPai.categoria || 'outros',
      novoTotal,
      novaParcelaNumero,
      paiId
    ).run();
    
    // Atualiza o totalParcelas de todos os agendamentos do grupo
    await c.env.financezap_db.prepare(`
      UPDATE agendamentos 
      SET totalParcelas = ?
      WHERE id = ? OR agendamentoPaiId = ?
    `).bind(novoTotal, paiId, paiId).run();
    
    return c.json({ 
      success: true, 
      message: 'Nova parcela adicionada com sucesso',
      parcela: {
        numero: novaParcelaNumero,
        total: novoTotal,
        data: novaData
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== ENDPOINTS DE NOTIFICAÇÕES ==========

// Buscar notificações não lidas
// Rota de notificações desabilitada
app.get('/api/notificacoes', async (c) => {
  return c.json({ 
    success: false, 
    error: 'Notificações desabilitadas. Use o botão "Atualizar" para atualizar os dados manualmente.' 
  }, 503);
});

// Rota de notificações desabilitada
app.put('/api/notificacoes', async (c) => {
  return c.json({ 
    success: false, 
    error: 'Notificações desabilitadas. Use o botão "Atualizar" para atualizar os dados manualmente.' 
  }, 503);
});

// Webhook Z-API (versão simplificada para Worker)
// Rota para chat de IA
app.post('/api/chat', autenticarMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { mensagem } = body;
    
    if (!mensagem || !mensagem.trim()) {
      return c.json({ success: false, error: 'Mensagem é obrigatória' }, 400);
    }
    
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
    
    
    // Busca estatísticas e transações do usuário para contexto
    const estatisticas = await calcularEstatisticas(c.env.financezap_db, { telefone: telefoneFormatado });
    const transacoesData = await buscarTransacoes(c.env.financezap_db, {
      telefone: telefoneFormatado,
      limit: 10,
      offset: 0
    });
    
    // Prepara o contexto financeiro
    const estatisticasTexto = `
- Total gasto: ${formatarMoeda(estatisticas.totalSaidas || 0)}
- Total de transações: ${estatisticas.totalTransacoes || 0}
- Média por transação: ${formatarMoeda(estatisticas.mediaGasto || 0)}
- Maior gasto: ${formatarMoeda(estatisticas.maiorGasto || 0)}
- Menor gasto: ${formatarMoeda(estatisticas.menorGasto || 0)}
- Gasto hoje: ${formatarMoeda(estatisticas.gastoHoje || 0)}
- Gasto do mês: ${formatarMoeda(estatisticas.gastoMes || 0)}
    `.trim();

    const transacoesTexto = transacoesData.transacoes.slice(0, 10).map((t: any) => 
      `- ${t.descricao}: ${formatarMoeda(t.valor)} (${t.categoria})`
    ).join('\n');

    const promptCompleto = `Você é um assistente inteligente do Zela, uma plataforma completa de gestão financeira pessoal via WhatsApp e portal web.

SUAS FUNÇÕES PRINCIPAIS:
1. Consultor financeiro pessoal - Analisar finanças e dar conselhos práticos
2. Suporte da plataforma - Responder dúvidas sobre como usar o Zela
3. Instrutor - Ensinar formas legais e eficientes de usar a plataforma

═══════════════════════════════════════════════════════════
📱 COMO USAR O ZELA VIA WHATSAPP
═══════════════════════════════════════════════════════════

1. 📝 REGISTRO DE TRANSAÇÕES VIA WHATSAPP
   - A IA extrai automaticamente: descrição, valor, categoria, tipo (entrada/saída) e método de pagamento
   - Suporta múltiplas transações em uma única mensagem
   - Aceita mensagens de texto ou áudio (transcrição automática)
   
   📱 EXEMPLOS DE MENSAGENS QUE O USUÁRIO PODE ENVIAR:
   
   💸 GASTOS (SAÍDAS):
   - "comprei um sanduíche por 20 reais"
   - "gastei 50 reais com gasolina"
   - "paguei 150 reais de conta de luz"
   - "comprei café por 5 reais e pão por 8 reais"
   - "gastei 30 reais no almoço e 15 no estacionamento"
   - "paguei 200 reais de internet no cartão de crédito"
   - "comprei remédio por 45 reais na farmácia"
   - "gastei 80 reais com uber hoje"
   
   💰 RECEITAS (ENTRADAS):
   - "recebi 500 reais do cliente"
   - "me pagaram 2000 reais de salário"
   - "recebi 300 reais de venda"
   - "o chefe acabou de me pagar 1500 reais"
   - "recebi pagamento de 800 reais"
   - "depositei 500 reais na conta"
   
   🎯 MÚLTIPLAS TRANSAÇÕES:
   - "comprei pão por 5 reais, leite por 8 e café por 12"
   - "gastei 50 com gasolina, 30 com almoço e 20 com estacionamento"
   - "recebi 1000 do cliente e paguei 200 de conta"
   
   💬 MENSAGENS DE ÁUDIO:
   - O usuário pode enviar áudios descrevendo suas transações
   - Exemplo: gravar "gastei 50 reais com gasolina e 30 com almoço"
   - A transcrição automática converte para texto

2. 📅 AGENDAMENTOS VIA WHATSAPP
   - Agende pagamentos e recebimentos futuros enviando mensagens
   - Receba notificações quando chegar a data
   - Visualize agendamentos pendentes, pagos e cancelados no portal
   
   📱 EXEMPLOS DE MENSAGENS PARA AGENDAR:
   - "tenho que pagar 300 reais de aluguel no dia 5"
   - "preciso pagar 200 de internet no dia 10"
   - "vou receber 1500 de salário no dia 1"
   - "tenho que pagar 500 de faculdade no dia 15"
   - "agende pagamento de 800 reais de aluguel para o dia 5"
   - "vou receber 2000 reais no dia 20"

3. 📊 VISUALIZAÇÃO E ANÁLISE (PORTAL WEB)
   - Dashboard com estatísticas em tempo real
   - Gráficos de gastos por dia, mês e categoria
   - Métricas: Total gasto, média por transação, maior/menor gasto
   - Filtros por data, categoria, tipo e método de pagamento

4. 💬 CHAT DE IA FINANCEIRA
   - Faça perguntas sobre suas finanças
   - Receba conselhos personalizados baseados nos seus dados
   - Sugestões de economia e planejamento financeiro

5. 🏷️ CATEGORIZAÇÃO AUTOMÁTICA
   - Categorias comuns: comida, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
   - A IA categoriza automaticamente baseado na descrição

═══════════════════════════════════════════════════════════
💡 DICAS DE USO
═══════════════════════════════════════════════════════════

1. REGISTRE TUDO RAPIDAMENTE VIA WHATSAPP
   - Envie mensagens logo após fazer uma compra ou receber um pagamento
   - Use frases naturais e simples - a IA entende perfeitamente
   - Exemplos que funcionam:
     ✅ "comprei café por 5 reais"
     ✅ "gastei 50 conto com gasolina"
     ✅ "recebi 500 pila do cliente"
     ✅ "paguei 150 de luz"
   - Não precisa ser formal, escreva como você fala!

2. USE ÁUDIO PARA SER MAIS RÁPIDO
   - Grave um áudio enquanto está na fila ou no trânsito
   - Exemplo: "Gastei 50 reais com gasolina e 30 com estacionamento"
   - A transcrição automática converte para texto

3. REGISTRE MÚLTIPLAS TRANSAÇÕES DE UMA VEZ
   - "Comprei pão por 5 reais, leite por 8 e café por 12"
   - A IA extrai todas as transações automaticamente

4. USE AGENDAMENTOS PARA PLANEJAR
   - Agende contas fixas no início do mês
   - Exemplo: "Tenho que pagar 800 de aluguel no dia 5 e 200 de internet no dia 10"
   - Receba lembretes automáticos

═══════════════════════════════════════════════════════════
📋 EXEMPLOS DE PERGUNTAS QUE VOCÊ PODE RESPONDER
═══════════════════════════════════════════════════════════

SOBRE FINANÇAS:
- "Como posso economizar mais dinheiro?"
- "Quanto estou gastando por mês?"
- "Qual minha maior categoria de gastos?"
- "Como criar um orçamento?"

SOBRE A PLATAFORMA:
- "Como registro uma transação?" → ⚠️ Envie mensagens diretamente no WhatsApp do Zela! Exemplo: "comprei X por Y reais"
- "Como funciona o agendamento?" → ⚠️ Envie mensagens diretamente no WhatsApp do Zela! Exemplo: "tenho que pagar X no dia Y"
- "Como usar o chat de IA?" → Você está usando agora! Faça perguntas sobre suas finanças
- "Quais categorias existem?" → comida, transporte, lazer, saúde, educação, moradia, roupas, tecnologia, serviços, outros
- "Como editar meu perfil?" → Acesse Configurações no portal web
- "Como salvar o contato do WhatsApp?" → Vá em Configurações > Salvar Contato no portal web
- "Como visualizar meus gastos?" → Acesse o Dashboard no portal web para ver gráficos e relatórios

⚠️ LEMBRE-SE: Para registrar transações e agendamentos, você DEVE enviar mensagens diretamente no WhatsApp do Zela, não no portal web!

═══════════════════════════════════════════════════════════
🎯 INSTRUÇÕES DE RESPOSTA
═══════════════════════════════════════════════════════════

Quando o usuário perguntar sobre:
- FINANÇAS: Use os dados financeiros fornecidos e dê conselhos práticos
- PLATAFORMA: Explique como usar as funcionalidades do Zela de forma clara e passo a passo, SEMPRE incluindo exemplos práticos de mensagens que podem ser enviadas
- COMO FAZER ALGO: Dê instruções detalhadas e exemplos práticos de mensagens

Sempre seja:
- Empático e encorajador
- Prático e objetivo
- Focado em soluções
- Claro nas explicações
- Use emojis quando apropriado para tornar a resposta mais amigável
- SEMPRE dê exemplos práticos de mensagens que o usuário pode enviar

⚠️ IMPORTANTE - QUANDO NÃO ENTENDER:
Se você não entender a pergunta do usuário, não tente inventar uma resposta. Em vez disso, responda EXATAMENTE com esta mensagem amigável:
"Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!"

Dados financeiros do usuário:
${estatisticasTexto}

Histórico de transações recentes:
${transacoesTexto || 'Nenhuma transação recente'}

Responda à pergunta do usuário de forma clara, prática e útil. Se for sobre finanças, use os dados fornecidos. Se for sobre a plataforma, explique como usar as funcionalidades do Zela e SEMPRE inclua exemplos práticos de mensagens que podem ser enviadas via WhatsApp. Se não entender, use a mensagem amigável especificada acima.`;

    // Função auxiliar para verificar se a resposta indica que não entendeu
    const verificarSeNaoEntendeu = (resposta: string): boolean => {
      const respostaLower = resposta.toLowerCase();
      const indicadoresNaoEntendeu = [
        'não entendi',
        'não compreendi',
        'não consegui entender',
        'não sei',
        'não tenho certeza',
        'não tenho informações',
        'não posso ajudar',
        'não consigo',
        'desculpe, mas',
        'lamento, mas',
        'não tenho dados',
        'não tenho acesso',
        'não posso responder',
        'não faço ideia',
        'não tenho conhecimento'
      ];
      
      // Verifica se a resposta contém algum indicador de não entendimento
      const temIndicador = indicadoresNaoEntendeu.some(indicador => 
        respostaLower.includes(indicador)
      );
      
      // Também verifica se a resposta é muito curta ou genérica
      const respostaMuitoCurta = resposta.trim().length < 30;
      const respostaGenerica = respostaLower.includes('desculpe') && 
                              (respostaLower.includes('não consegui') || 
                               respostaLower.includes('não posso'));
      
      return temIndicador || (respostaMuitoCurta && respostaGenerica);
    };

    const temGroq = c.env.GROQ_API_KEY && c.env.GROQ_API_KEY.trim() !== '';
    const temGemini = c.env.GEMINI_API_KEY && c.env.GEMINI_API_KEY.trim() !== '';

    if (!temGroq && !temGemini) {
      return c.json({ 
        success: false, 
        error: 'Nenhuma API de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY no Cloudflare Workers.' 
      }, 500);
    }

    let resposta: string;

    if (temGroq) {
      try {
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: promptCompleto },
              { role: 'user', content: mensagem }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }),
        });

        if (!groqResponse.ok) {
          throw new Error(`Groq API error: ${groqResponse.status}`);
        }

        const groqData = await groqResponse.json();
        const respostaGroq = groqData.choices[0]?.message?.content || '';
        
        if (!respostaGroq || verificarSeNaoEntendeu(respostaGroq)) {
          resposta = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
        } else {
          resposta = respostaGroq;
        }
      } catch (error: any) {
        if (temGemini) {
          try {
            const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${c.env.GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: `${promptCompleto}\n\nPergunta do usuário: ${mensagem}` }]
                }]
              }),
            });

            if (!geminiResponse.ok) {
              throw new Error(`Gemini API error: ${geminiResponse.status}`);
            }

            const geminiData = await geminiResponse.json();
            const respostaGemini = geminiData.candidates[0]?.content?.parts[0]?.text || '';
            
            if (!respostaGemini || verificarSeNaoEntendeu(respostaGemini)) {
              resposta = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
            } else {
              resposta = respostaGemini;
            }
          } catch (geminiError: any) {
            throw new Error(`Erro ao processar com ambas as IAs: ${error.message}`);
          }
        } else {
          throw error;
        }
      }
    } else if (temGemini) {
      try {
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${c.env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${promptCompleto}\n\nPergunta do usuário: ${mensagem}` }]
            }]
          }),
        });

        if (!geminiResponse.ok) {
          throw new Error(`Gemini API error: ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();
        const respostaGemini = geminiData.candidates[0]?.content?.parts[0]?.text || '';
        
        if (!respostaGemini || verificarSeNaoEntendeu(respostaGemini)) {
          resposta = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
        } else {
          resposta = respostaGemini;
        }
      } catch (error: any) {
        console.error('❌ Erro ao processar com Gemini:', error);
        throw error;
      }
    } else {
      throw new Error('Nenhuma IA disponível');
    }

    
    return c.json({
      success: true,
      resposta
    });
  } catch (error: any) {
    console.error('❌ Erro no chat de IA:', error);
    return c.json({
      success: false,
      error: error.message || 'Erro ao processar mensagem'
    }, 500);
  }
});

app.post('/webhook/zapi', async (c) => {
  try {
    const body = await c.req.json();
    
    // Extrai dados da mensagem
    const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
    if (!phoneNumber) {
      return c.json({ success: false, error: 'phone é obrigatório' }, 400);
    }
    
    
    // Remove caracteres não numéricos do número recebido
    const phoneNumberLimpo = phoneNumber.replace(/\D/g, '');
    
    // Formata o número - garante que tenha código do país (55 para Brasil)
    let telefoneFormatado: string;
    if (phoneNumberLimpo.startsWith('55')) {
      telefoneFormatado = formatarTelefone(`whatsapp:+${phoneNumberLimpo}`);
    } else {
      telefoneFormatado = formatarTelefone(`whatsapp:+55${phoneNumberLimpo}`);
    }
    
    
    // Extrai texto da mensagem ou botão clicado
    let messageText = body.text?.message || body.message?.text || body.message || '';
    
    // Verifica se é clique em botão
    const buttonId = body.buttonId || body.button?.id || body.buttonList?.button?.id;
    const buttonLabel = body.buttonLabel || body.button?.label || body.buttonList?.button?.label;
    
    if (buttonId) {
      
      // Processa clique no botão de excluir transação
      if (buttonId.startsWith('excluir_transacao_')) {
        const transacaoId = parseInt(buttonId.replace('excluir_transacao_', ''));
        
        if (!isNaN(transacaoId)) {
          try {
            // Busca ou cria token JWT para o usuário
            const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, cleanFromNumber);
            if (!usuario) {
              await enviarMensagemZApi(telefoneFormatado, '❌ Usuário não encontrado. Por favor, faça login primeiro.', c.env);
              return c.json({ success: false, error: 'Usuário não encontrado' }, 401);
            }
            
            const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
            const token = await jwt.sign({ telefone: telefoneFormatado }, jwtSecret);
            
            // Chama endpoint de exclusão
            const url = new URL(c.req.url);
            const baseUrl = `${url.protocol}//${url.host}`;
            const deleteUrl = `${baseUrl}/api/transacoes/${transacaoId}`;
            
            const response = await fetch(deleteUrl, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            
            const data: any = await response.json();
            
            if (data.success) {
              await enviarMensagemZApi(telefoneFormatado, '✅ Transação excluída com sucesso!', c.env);
              return c.json({ success: true, message: 'Transação excluída' });
            } else {
              await enviarMensagemZApi(telefoneFormatado, `❌ Erro ao excluir: ${data.error || 'Erro desconhecido'}`, c.env);
              return c.json({ success: false, error: data.error }, 400);
            }
          } catch (error: any) {
            console.error('❌ Erro ao processar exclusão via botão:', error);
            await enviarMensagemZApi(telefoneFormatado, '❌ Erro ao excluir transação. Tente novamente.', c.env);
            return c.json({ success: false, error: error.message }, 500);
          }
        }
      }
      
      // Se não for um botão conhecido, trata como mensagem normal
      messageText = buttonLabel || buttonId;
    }
    
    // Processa áudio se houver
    const audioUrl = body.audio?.audioUrl || body.audio?.url || body.mediaUrl;
    const audioType = body.audio?.mimeType || body.audio?.type || body.mediaType || '';
    
    if (audioUrl && (audioType.startsWith('audio/') || audioUrl.includes('audio'))) {
      
      try {
        // Baixa o áudio
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
          throw new Error(`Erro ao baixar áudio: ${audioResponse.status}`);
        }
        
        const audioBuffer = await audioResponse.arrayBuffer();
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
        
        
        // Transcreve usando Gemini ou Groq (se configurado)
        const geminiApiKey = c.env.GEMINI_API_KEY;
        const groqApiKey = c.env.GROQ_API_KEY;
        
        // Groq não suporta transcrição de áudio, então usa Gemini se disponível
        if (geminiApiKey) {
          try {
            
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
                throw new Error('GEMINI_QUOTA_EXCEEDED');
              }
              
              const errorText = JSON.stringify(errorData);
              console.error('❌ Erro na API do Gemini:', errorText);
              throw new Error(`Erro ao transcrever: ${geminiResponse.status}`);
            }
            
            const geminiData = await geminiResponse.json();
            const transcription = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            
            if (transcription && transcription.length > 0) {
              messageText = transcription;
            } else {
              throw new Error('TRANSCRIPTION_EMPTY');
            }
          } catch (error: any) {
            // Se Gemini falhou e temos Groq, tenta Groq
            if (error.message === 'GEMINI_QUOTA_EXCEEDED' && groqApiKey) {
              // Groq não suporta áudio diretamente, então envia mensagem amigável
              const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
              await enviarMensagemZApi(telefoneFormatado, mensagemAmigavel, c.env);
              return c.json({ 
                success: false, 
                error: 'Quota do Gemini excedida' 
              }, 400);
            }
            
            // Se não for erro de quota, propaga o erro
            if (error.message !== 'TRANSCRIPTION_EMPTY') {
              throw error;
            }
            
            // Envia mensagem amigável quando transcrição está vazia
            const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
            await enviarMensagemZApi(telefoneFormatado, mensagemAmigavel, c.env);
            return c.json({ 
              success: false, 
              error: 'Transcrição vazia' 
            }, 400);
          }
        } else if (!geminiApiKey && !groqApiKey) {
          const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
          await enviarMensagemZApi(telefoneFormatado, mensagemAmigavel, c.env);
          return c.json({ 
            success: false, 
            error: 'Transcrição não configurada' 
          }, 400);
        } else {
          // Groq não suporta áudio diretamente
          const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
          await enviarMensagemZApi(telefoneFormatado, mensagemAmigavel, c.env);
          return c.json({ 
            success: false, 
            error: 'Groq não suporta transcrição de áudio' 
          }, 400);
        }
      } catch (error: any) {
        console.error('❌ Erro ao processar áudio:', error);
        const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
        
        try {
          await enviarMensagemZApi(telefoneFormatado, mensagemAmigavel, c.env);
        } catch (envioError: any) {
          console.error('❌ Erro ao enviar mensagem amigável:', envioError.message);
        }
        
        return c.json({ 
          success: false, 
          error: 'Erro ao processar áudio' 
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
    
    // PRIMEIRO: Verifica se é solicitação de relatório
    const mensagemLowerRelatorio = messageText.toLowerCase();
    const palavrasRelatorio = [
      'relatório', 'relatorio', 'relatório semanal', 'relatorio semanal',
      'relatório diário', 'relatorio diario', 'relatório diario',
      'relatório mensal', 'relatorio mensal',
      'resumo semanal', 'resumo diário', 'resumo diario', 'resumo mensal',
      'resumo financeiro', 'resumo do dia', 'resumo da semana', 'resumo do mês', 'resumo do mes',
      'gastos da semana', 'gastos do dia', 'gastos do mês', 'gastos do mes',
      'despesas da semana', 'despesas do dia', 'despesas do mês', 'despesas do mes',
      'ver relatório', 'ver relatorio', 'mostrar relatório', 'mostrar relatorio'
    ];
    
    const temPalavraRelatorio = palavrasRelatorio.some(palavra => 
      mensagemLowerRelatorio.includes(palavra)
    );
    
    if (temPalavraRelatorio) {
      
      try {
        // Detecta o tipo de relatório
        let tipoRelatorio: 'diario' | 'semanal' | 'mensal' = 'semanal'; // padrão
        
        if (mensagemLowerRelatorio.includes('diário') || mensagemLowerRelatorio.includes('diario') || mensagemLowerRelatorio.includes('do dia') || mensagemLowerRelatorio.includes('hoje')) {
          tipoRelatorio = 'diario';
        } else if (mensagemLowerRelatorio.includes('semanal') || mensagemLowerRelatorio.includes('da semana')) {
          tipoRelatorio = 'semanal';
        } else if (mensagemLowerRelatorio.includes('mensal') || mensagemLowerRelatorio.includes('do mês') || mensagemLowerRelatorio.includes('do mes')) {
          tipoRelatorio = 'mensal';
        }
        
        
        // Calcula o período
        const periodo = calcularPeriodo(tipoRelatorio);
        
        // Busca carteira padrão do usuário
        let carteiraNome: string | undefined;
        try {
          const carteiraPadrao = await buscarCarteiraPadraoD1(c.env.financezap_db, cleanFromNumber);
          if (carteiraPadrao) {
            carteiraNome = carteiraPadrao.nome;
          }
        } catch (error) {
        }
        
        // Gera os dados do relatório
        const dadosRelatorio = await gerarDadosRelatorio(
          c.env.financezap_db,
          cleanFromNumber,
          periodo
        );
        
        // Formata o relatório
        let relatorioFormatado: string;
        if (tipoRelatorio === 'mensal' && mensagemLowerRelatorio.includes('resumo financeiro')) {
          relatorioFormatado = formatarRelatorioMensalCompleto(dadosRelatorio, carteiraNome);
        } else {
          relatorioFormatado = formatarRelatorioWhatsApp(dadosRelatorio, carteiraNome);
        }
        
        // Envia o relatório
        await enviarMensagemZApi(telefoneFormatado, relatorioFormatado, c.env);
        
        return c.json({ success: true, message: `Relatório ${tipoRelatorio} enviado com sucesso` });
      } catch (error: any) {
        console.error('❌ Erro ao gerar relatório:', error);
        const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
        await enviarMensagemZApi(
          telefoneFormatado,
          mensagemAmigavel,
          c.env
        );
        // Continua o processamento se houver erro
      }
    }
    
    // SEGUNDO: Verifica se é um agendamento antes de processar como transação
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
      
      try {
        // Processa agendamento usando IA
        const agendamentoExtraido = await processarAgendamentoComIA(messageText, c.env);
        
        if (agendamentoExtraido && agendamentoExtraido.sucesso) {
          
          // Verifica se é recorrente (tem parcelas)
          const isRecorrente = agendamentoExtraido.recorrente && agendamentoExtraido.totalParcelas && agendamentoExtraido.totalParcelas > 1;
          
          let ids: number[];
          if (isRecorrente) {
            // Cria agendamentos recorrentes
            const { criarAgendamentosRecorrentesD1 } = await import('./d1');
            ids = await criarAgendamentosRecorrentesD1(c.env.financezap_db, {
              telefone: cleanFromNumber,
              descricao: agendamentoExtraido.descricao,
              valor: agendamentoExtraido.valor,
              dataAgendamento: agendamentoExtraido.dataAgendamento,
              tipo: agendamentoExtraido.tipo,
              categoria: agendamentoExtraido.categoria || 'outros',
              totalParcelas: agendamentoExtraido.totalParcelas!,
            });
          } else {
            // Cria apenas um agendamento
          const agendamentoId = await criarAgendamentoD1(c.env.financezap_db, {
            telefone: cleanFromNumber,
            descricao: agendamentoExtraido.descricao,
            valor: agendamentoExtraido.valor,
            dataAgendamento: agendamentoExtraido.dataAgendamento,
            tipo: agendamentoExtraido.tipo,
            categoria: agendamentoExtraido.categoria || 'outros',
          });
            ids = [agendamentoId];
          }
          
          // Formata a resposta
          const tipoTexto = agendamentoExtraido.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento';
          const dataFormatada = new Date(agendamentoExtraido.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
          
          let respostaAgendamento = '';
          if (isRecorrente) {
            respostaAgendamento = `✅ Agendamento recorrente criado com sucesso!\n\n` +
            `📅 ${tipoTexto}: ${agendamentoExtraido.descricao}\n` +
              `💰 Valor: ${formatarMoeda(agendamentoExtraido.valor)} por parcela\n` +
              `📊 Total de parcelas: ${agendamentoExtraido.totalParcelas}\n` +
              `📆 Primeira parcela: ${dataFormatada}\n\n` +
              `Você receberá lembretes mensais até a parcela ${agendamentoExtraido.totalParcelas}.\n\n` +
              `💡 Quando pagar/receber, responda "pago" ou "recebido" para registrar automaticamente.`;
          } else {
            respostaAgendamento = `✅ Agendamento criado com sucesso!\n\n` +
              `📅 ${tipoTexto}: ${agendamentoExtraido.descricao}\n` +
              `💰 Valor: ${formatarMoeda(agendamentoExtraido.valor)}\n` +
            `📆 Data: ${dataFormatada}\n\n` +
            `Você receberá um lembrete no dia ${dataFormatada}.\n\n` +
            `💡 Quando pagar/receber, responda "pago" ou "recebido" para registrar automaticamente.`;
          }
          
          await enviarMensagemZApi(telefoneFormatado, respostaAgendamento, c.env);
          
          return c.json({ success: true, message: isRecorrente ? 'Agendamentos recorrentes processados com sucesso' : 'Agendamento processado com sucesso' });
        } else {
        }
      } catch (error: any) {
        console.error('❌ Erro ao processar agendamento:', error);
        // Continua o processamento se houver erro ao criar agendamento
      }
    }
    
    // MELHORIA: Adiciona feedback visual
    try {
      await enviarMensagemZApi(telefoneFormatado, '🤖 Processando sua mensagem...', c.env);
    } catch (e) {
      // Ignora erro de feedback visual
    }
    
    // MELHORIA: Obtém estado atual do usuário
    const estadoAtual = await obterEstadoUsuario(c.env.financezap_db, cleanFromNumber);
    
    // MELHORIA: Obtém contexto de conversação
    const contexto = await obterContextoConversacaoD1(c.env.financezap_db, cleanFromNumber);
    
    // MELHORIA: Adiciona mensagem do usuário ao contexto
    await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'user', messageText);
    
    // MELHORIA: Verifica se está em estado de confirmação
    if (estadoAtual?.estado === EstadoConversacao.AGUARDANDO_CONFIRMACAO) {
      const dadosTemp = estadoAtual.dadosTemporarios;
      
      if (intencao.intencao === 'confirmacao') {
        // Usuário confirmou - salva transações
        if (dadosTemp?.transacoes) {
          try {
            const dataHora = new Date().toISOString();
            const data = dataHora.slice(0, 10);
            const idsSalvos: number[] = [];
            
            for (const transacao of dadosTemp.transacoes) {
              const id = await executarDBComRetry(() =>
                salvarTransacao(c.env.financezap_db, {
                  telefone: cleanFromNumber,
                  descricao: transacao.descricao,
                  valor: transacao.valor,
                  categoria: transacao.categoria || 'outros',
                  tipo: transacao.tipo,
                  metodo: transacao.metodo || 'debito',
                  dataHora: dataHora,
                  data: data,
                })
              );
              idsSalvos.push(id);
            }
            
            // Limpa estado
            await limparEstadoUsuario(c.env.financezap_db, cleanFromNumber);
            
            // Formata resposta usando template
            const resposta = dadosTemp.transacoes.length === 1
              ? formatarResposta('transacao_sucesso', {
                  descricao: dadosTemp.transacoes[0].descricao,
                  valor: formatarMoeda(dadosTemp.transacoes[0].valor),
                  tipo: dadosTemp.transacoes[0].tipo === 'entrada' ? '💰 Entrada' : '🔴 Saída',
                  categoria: dadosTemp.transacoes[0].categoria || 'outros',
                  carteira: '—',
                  data: new Date().toLocaleDateString('pt-BR'),
                })
              : formatarResposta('transacao_multipla_sucesso', {
                  quantidade: dadosTemp.transacoes.length,
                  transacoes: formatarListaTransacoes(dadosTemp.transacoes),
                  total: formatarMoeda(dadosTemp.transacoes.reduce((sum: number, t: any) => sum + t.valor, 0)),
                });
            
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
            const mensagens = dividirMensagem(resposta);
            for (const msg of mensagens) {
              await enviarMensagemZApi(telefoneFormatado, msg, c.env);
            }
            
            return c.json({ success: true, message: 'Transações confirmadas e salvas' });
          } catch (error: any) {
            await limparEstadoUsuario(c.env.financezap_db, cleanFromNumber);
            throw error;
          }
        }
      } else if (intencao.intencao === 'cancelamento') {
        // Usuário cancelou
        await limparEstadoUsuario(c.env.financezap_db, cleanFromNumber);
        const resposta = '❌ Transação cancelada.';
        await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
        return c.json({ success: true, message: 'Transação cancelada' });
      } else if (intencao.intencao === 'edicao') {
        // Usuário quer editar - mantém estado mas permite edição
        await definirEstadoUsuario(
          c.env.financezap_db,
          cleanFromNumber,
          EstadoConversacao.EDITANDO_TRANSACAO,
          dadosTemp
        );
        const resposta = '✏️ O que deseja alterar? Envie os novos dados.';
        await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
        return c.json({ success: true, message: 'Aguardando edição' });
      }
    }
    
    // ROTEADOR IA DESABILITADO TEMPORARIAMENTE - usando processamento tradicional direto
    // const temIA = (c.env.GROQ_API_KEY && c.env.GROQ_API_KEY.trim() !== '') || 
    //               (c.env.GEMINI_API_KEY && c.env.GEMINI_API_KEY.trim() !== '');
    
    // if (temIA) {
    //   try {
    //     const contextoArray = contexto?.mensagens || [];
    //     const decisaoIA = await decidirEndpointComIA(messageText, contextoArray, c.env);
    //     
    //     if (decisaoIA && decisaoIA.endpoint) {
    //       let token: string | null = null;
    //       try {
    //         const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, cleanFromNumber);
    //         if (usuario) {
    //           const jwtSecret = c.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    //           token = await jwt.sign({ telefone: telefoneFormatado }, jwtSecret);
    //         }
    //       } catch (error: any) {
    //         // Continua com processamento tradicional
    //       }
    //       
    //       if (token) {
    //         const url = new URL(c.req.url);
    //         const baseUrl = `${url.protocol}//${url.host}`;
    //         const resultado = await chamarEndpointInterno(
    //           decisaoIA.endpoint,
    //           decisaoIA.params,
    //           telefoneFormatado,
    //           token,
    //           baseUrl,
    //           c.env
    //         );
    //         
    //         if (resultado.success && resultado.data) {
    //           try {
    //             const respostaFormatada = decisaoIA.endpoint.responseFormatter(resultado.data, decisaoIA.params);
    //             
    //             let mensagemTexto: string;
    //             let botoes: Array<{ id: string; label: string }> | undefined;
    //             
    //             if (typeof respostaFormatada === 'object' && respostaFormatada.message) {
    //               mensagemTexto = respostaFormatada.message;
    //               botoes = respostaFormatada.buttons;
    //             } else {
    //               mensagemTexto = respostaFormatada as string;
    //             }
    //             
    //             await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', mensagemTexto);
    //             
    //             if (botoes && botoes.length > 0) {
    //               const envioResult = await enviarMensagemComButtonListZApi(telefoneFormatado, mensagemTexto, botoes, c.env);
    //               if (!envioResult.success) {
    //                 const mensagens = dividirMensagem(mensagemTexto);
    //                 for (const msg of mensagens) {
    //                   await enviarMensagemZApi(telefoneFormatado, msg, c.env);
    //                 }
    //               }
    //             } else {
    //               const mensagens = dividirMensagem(mensagemTexto);
    //               for (const msg of mensagens) {
    //                 await enviarMensagemZApi(telefoneFormatado, msg, c.env);
    //               }
    //             }
    //             
    //             return c.json({ success: true, message: 'Processado via roteamento inteligente' });
    //           } catch (formatError: any) {
    //             // Continua com processamento tradicional
    //           }
    //         }
    //       }
    //     }
    //   } catch (error: any) {
    //     // Continua com processamento tradicional em caso de erro
    //   }
    // }
    
    // MELHORIA: Detecta intenção primeiro (processamento tradicional)
    const intencao = detectarIntencao(messageText, contexto);
    
    // MELHORIA: Processa comandos rápidos
    if (intencao.intencao === 'comando' && intencao.detalhes?.comando) {
      const comando = intencao.detalhes.comando;
      let respostaComando = '';
      
      if (comando === 'ajuda' || comando === 'help') {
        respostaComando = criarMenuAjuda();
      } else if (comando === 'exemplos') {
        respostaComando = criarMensagemExemplos();
      } else if (comando === 'comandos') {
        respostaComando = criarMensagemComandos();
      } else if (comando === 'hoje') {
        const estatisticas = await calcularEstatisticas(c.env.financezap_db, { telefone: cleanFromNumber });
        respostaComando = `📊 *Resumo do Dia*\n\n` +
          `💸 Gasto hoje: ${formatarMoeda(estatisticas.gastoHoje || 0)}\n` +
          `📝 Transações: ${estatisticas.totalTransacoes || 0}`;
      } else if (comando === 'mes') {
        const estatisticas = await calcularEstatisticas(c.env.financezap_db, { telefone: cleanFromNumber });
        respostaComando = formatarEstatisticasResumo(estatisticas);
      } else {
        respostaComando = `❓ Comando "${comando}" não reconhecido.\n\nDigite "/ajuda" para ver comandos disponíveis.`;
      }
      
      await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', respostaComando);
      const mensagens = dividirMensagem(respostaComando);
      
      for (const msg of mensagens) {
        await enviarMensagemZApi(telefoneFormatado, msg, c.env);
      }
      
      return c.json({ success: true, message: 'Comando processado' });
    }
    
    // MELHORIA: Processa pedido de ajuda
    if (intencao.intencao === 'ajuda') {
      const respostaAjuda = criarMenuAjuda();
      await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', respostaAjuda);
      const mensagens = dividirMensagem(respostaAjuda);
      
      for (const msg of mensagens) {
        await enviarMensagemZApi(telefoneFormatado, msg, c.env);
      }
      
      return c.json({ success: true, message: 'Ajuda enviada' });
    }
    
    // MELHORIA: Processa pedido de saldo (saldo total e por carteira)
    if (intencao.intencao === 'saldo') {
      
      // Calcula saldo por carteira
      const saldoTotal = await calcularSaldoPorCarteiraD1(c.env.financezap_db, telefoneFormatado);
      
      // Formata mensagem
      const resposta = formatarMensagemSaldo(saldoTotal);
      
      // Adiciona ao contexto
      await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
      
      // Divide mensagem se necessário
      const mensagens = dividirMensagem(resposta);
      
      for (const msg of mensagens) {
        await enviarMensagemZApi(telefoneFormatado, msg, c.env);
      }
      
      return c.json({ 
        success: true, 
        message: 'Saldo enviado com sucesso' 
      });
    }
    
    
    // MELHORIA: Processa pedido de exclusão de transação
    if (intencao.intencao === 'exclusao') {
      
      // Busca transações recentes do usuário (últimas 10)
      const { buscarTransacoes } = await import('./d1');
      const resultadoTransacoes = await buscarTransacoes(c.env.financezap_db, {
        telefone: cleanFromNumber,
        limit: 10
      });
      
      if (resultadoTransacoes.transacoes.length === 0) {
        const resposta = '❌ Você não tem transações para excluir.';
        await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
        await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
        
        return c.json({ success: true, message: 'Nenhuma transação encontrada' });
      }
      
      // Prepara lista de opções
      const { gerarIdentificadorTransacao } = await import('./formatadorTransacoes');
      const { formatarMoeda } = await import('./formatadorMensagens');
      const opcoes = resultadoTransacoes.transacoes.map((t, index) => {
        const identificador = gerarIdentificadorTransacao(t.id);
        const tipoEmoji = t.tipo === 'entrada' ? '💰' : '🔴';
        const dataFormatada = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
        
        return {
          titulo: `${tipoEmoji} ${t.descricao.substring(0, 20)}${t.descricao.length > 20 ? '...' : ''}`,
          descricao: `${formatarMoeda(t.valor)} • ${dataFormatada} • ID: ${identificador}`,
          id: `excluir_${t.id}` // ID da transação para processar exclusão
        };
      });
      
      const mensagem = '📋 *Selecione A Transação Que Deseja Excluir:*\n\nEscolha uma opção da lista abaixo:';
      
      // Envia lista de opções via Z-API
      // Nota: enviarListaOpcoesZApi não precisa de c.env, usa process.env diretamente
      const { enviarListaOpcoesZApi } = await import('./zapi');
      const resultado = await enviarListaOpcoesZApi(
        telefoneFormatado,
        mensagem,
        'Excluir Transação',
        'Ver Transações',
        opcoes
      );
      
      if (!resultado.success) {
        // Fallback: envia como mensagem normal com lista numerada
        let mensagemFallback = mensagem + '\n\n';
        resultadoTransacoes.transacoes.forEach((t, index) => {
          const identificador = gerarIdentificadorTransacao(t.id);
          const tipoEmoji = t.tipo === 'entrada' ? '💰' : '🔴';
          const dataFormatada = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
          mensagemFallback += `${index + 1}. ${tipoEmoji} ${t.descricao} - ${formatarMoeda(t.valor)} (${dataFormatada})\n`;
          mensagemFallback += `   ID: ${identificador}\n\n`;
        });
        mensagemFallback += '💡 Digite "Excluir Transação [ID]" para excluir.';
        
        await enviarMensagemZApi(telefoneFormatado, mensagemFallback, c.env);
      }
      
      await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', mensagem);
      
      return c.json({ success: true, message: 'Lista de transações enviada' });
    }
    
    // MELHORIA: Processa pedido de edição de agendamento
    if (intencao.intencao === 'edicao' && intencao.detalhes?.tipoAgendamento) {
      // Verifica se há um ID na mensagem (formato: "editar agendamento 123" ou "editar agendamento ID123")
      const mensagemLower = messageText.toLowerCase();
      const idMatch = mensagemLower.match(/(?:agendamento|agendamentos?)\s*(?:id|#)?\s*(\d+)/);
      
      if (idMatch) {
        // Edição direta com ID
        const agendamentoId = parseInt(idMatch[1]);
        
        try {
          const agendamento = await buscarAgendamentoPorIdD1(c.env.financezap_db, agendamentoId);
          
          if (!agendamento) {
            const resposta = `❌ Agendamento #${agendamentoId} não encontrado.`;
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
            await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
            return c.json({ success: true, message: 'Agendamento não encontrado' });
          }
          
          // Verifica se o agendamento pertence ao usuário
          if (!telefonesCorrespondem(agendamento.telefone, telefoneFormatado)) {
            const resposta = `❌ Você não tem permissão para editar este agendamento.`;
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
            await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
            return c.json({ success: true, message: 'Sem permissão' });
          }
          
          // Processa a edição com IA para extrair novos dados
          const temGroq = c.env.GROQ_API_KEY && c.env.GROQ_API_KEY.trim() !== '';
          const temGemini = c.env.GEMINI_API_KEY && c.env.GEMINI_API_KEY.trim() !== '';
          
          if (temGroq || temGemini) {
            const processadorAgendamento = await import('./processadorAgendamento');
            const novosDados = await processadorAgendamento.processarAgendamentoComIA(messageText);
            
            if (novosDados && novosDados.sucesso) {
              const dadosAtualizacao: any = {};
              if (novosDados.descricao) dadosAtualizacao.descricao = novosDados.descricao;
              if (novosDados.valor && novosDados.valor > 0) dadosAtualizacao.valor = novosDados.valor;
              if (novosDados.dataAgendamento) dadosAtualizacao.dataAgendamento = novosDados.dataAgendamento;
              if (novosDados.tipo) dadosAtualizacao.tipo = novosDados.tipo;
              if (novosDados.categoria) dadosAtualizacao.categoria = novosDados.categoria;
              
              if (Object.keys(dadosAtualizacao).length > 0) {
                const atualizado = await atualizarAgendamentoD1(c.env.financezap_db, agendamentoId, dadosAtualizacao);
                
                if (atualizado) {
                  const dataFormatada = novosDados.dataAgendamento 
                    ? new Date(novosDados.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR')
                    : new Date(agendamento.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
                  
                  const resposta = `✅ *Agendamento atualizado com sucesso!*\n\n` +
                    `📋 *${dadosAtualizacao.descricao || agendamento.descricao}*\n` +
                    `💰 ${formatarMoeda(dadosAtualizacao.valor || agendamento.valor)}\n` +
                    `📅 ${dataFormatada}\n` +
                    `🔄 ${(dadosAtualizacao.tipo || agendamento.tipo) === 'pagamento' ? 'Pagamento' : 'Recebimento'}`;
                  
                  await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
                  await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
                  
                  return c.json({ success: true, message: 'Agendamento atualizado' });
                } else {
                  const resposta = `❌ Erro ao atualizar agendamento. Tente novamente.`;
                  await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
                  return c.json({ success: false, error: 'Erro ao atualizar' });
                }
              } else {
                const resposta = `⚠️ Não foi possível extrair informações para atualização.\n\n` +
                  `💡 Envie uma mensagem como:\n` +
                  `"Editar agendamento ${agendamentoId}: valor 300, data 20/12"`;
                await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
                return c.json({ success: true, message: 'Dados insuficientes' });
              }
            } else {
              const resposta = `⚠️ Não consegui entender as informações para atualizar.\n\n` +
                `💡 Informe o que deseja alterar, por exemplo:\n` +
                `"Editar agendamento ${agendamentoId}: valor 300, data 20/12"`;
              await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
              return c.json({ success: true, message: 'Erro ao processar dados' });
            }
          } else {
            const resposta = `❌ Funcionalidade de edição requer configuração de IA.`;
            await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
            return c.json({ success: false, error: 'IA não configurada' });
          }
        } catch (error: any) {
          console.error('Erro ao editar agendamento:', error);
          const resposta = `❌ Erro ao editar agendamento: ${error.message}`;
          await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
          return c.json({ success: false, error: error.message });
        }
      } else {
        // Lista agendamentos para o usuário escolher
        const agendamentos = await buscarAgendamentosD1(c.env.financezap_db, telefoneFormatado, {
          status: 'pendente'
        });
        
        if (agendamentos.length === 0) {
          const resposta = '❌ Você não tem agendamentos pendentes para editar.';
          await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
          await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
          return c.json({ success: true, message: 'Nenhum agendamento encontrado' });
        }
        
        // Limita a 10 agendamentos
        const agendamentosLimitados = agendamentos.slice(0, 10);
        let mensagem = '📋 *Selecione O Agendamento Que Deseja Editar:*\n\n';
        mensagem += 'Envie uma mensagem com o ID do agendamento, por exemplo:\n';
        mensagem += '"Editar agendamento 1"\n\n';
        mensagem += '*Seus agendamentos pendentes:*\n\n';
        
        agendamentosLimitados.forEach((ag, index) => {
          const dataFormatada = new Date(ag.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
          const tipoEmoji = ag.tipo === 'recebimento' ? '💰' : '🔴';
          mensagem += `${index + 1}. ${tipoEmoji} *${ag.descricao}*\n`;
          mensagem += `   💰 ${formatarMoeda(ag.valor)}\n`;
          mensagem += `   📅 ${dataFormatada}\n`;
          mensagem += `   🆔 ID: ${ag.id}\n\n`;
        });
        
        mensagem += '💡 *Como editar:*\n';
        mensagem += 'Envie: "Editar agendamento [ID]: [mudanças]"\n';
        mensagem += 'Exemplo: "Editar agendamento 1: valor 300, data 25/12"';
        
        await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', mensagem);
        await enviarMensagemZApi(telefoneFormatado, mensagem, c.env);
        
        return c.json({ success: true, message: 'Lista de agendamentos enviada' });
      }
    }
    
    // Se não foi agendamento, processa como transação usando IA
    
    // MELHORIA: Só processa se intenção for transação ou desconhecida
    if (intencao.intencao === 'transacao' || intencao.intencao === 'desconhecida') {
      // Verifica se há IA disponível antes de tentar processar
      const temGroq = c.env.GROQ_API_KEY && c.env.GROQ_API_KEY.trim() !== '';
      const temGemini = c.env.GEMINI_API_KEY && c.env.GEMINI_API_KEY.trim() !== '';
      
      if (temGroq || temGemini) {
      try {
        // MELHORIA: Processa com cache, retry e métricas
        const tipoMensagem = 'extracao_transacao';
        const transacoesExtraidas = await medirTempoExecucao(
          c.env.financezap_db,
          cleanFromNumber,
          tipoMensagem,
          () => processarComCache(
            c.env.financezap_db,
            messageText,
            tipoMensagem,
            () => processarComRetry(
              () => processarMensagemComIAWorker(messageText, c.env),
              { maxTentativas: 3 }
            )
          )
        );
        
        if (transacoesExtraidas && transacoesExtraidas.length > 0) {
          
          // MELHORIA: Valida qualidade da extração
          const scoreExtracao = calcularScoreMedio(transacoesExtraidas.map(t => ({
            descricao: t.descricao,
            valor: t.valor,
            categoria: t.categoria,
            tipo: t.tipo,
            metodo: t.metodo
          })));
          
          
          // MELHORIA: Se qualidade baixa, pede mais informações
          if (devePedirMaisInformacoes(scoreExtracao)) {
            // Define estado como aguardando dados
            await definirEstadoUsuario(
              c.env.financezap_db,
              cleanFromNumber,
              EstadoConversacao.AGUARDANDO_DADOS,
              { problemas: scoreExtracao.problemas, sugestoes: scoreExtracao.sugestoes }
            );
            
            const respostaQualidade = formatarResposta('erro_validacao', {
              mensagem: 'Preciso de mais informações:',
              dicas: scoreExtracao.problemas.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\n' + scoreExtracao.sugestoes.join('\n'),
            });
            
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', respostaQualidade);
            const mensagens = dividirMensagem(respostaQualidade);
            
            for (const msg of mensagens) {
              await enviarMensagemZApi(telefoneFormatado, msg, c.env);
            }
            
            return c.json({ success: true, message: 'Solicitando mais informações' });
          }
          
          // MELHORIA: Sistema de confirmação (opcional - pode ser desabilitado)
          const usarConfirmacao = false; // Por enquanto desabilitado para manter comportamento atual
          
          if (usarConfirmacao && devePedirConfirmacao(scoreExtracao)) {
            // Define estado como aguardando confirmação
            await definirEstadoUsuario(
              c.env.financezap_db,
              cleanFromNumber,
              EstadoConversacao.AGUARDANDO_CONFIRMACAO,
              { transacoes: transacoesExtraidas }
            );
            
            // Mostra confirmação usando template
            const primeiraTransacao = transacoesExtraidas[0];
            const resposta = formatarResposta('confirmacao_transacao', {
              descricao: primeiraTransacao.descricao,
              valor: formatarMoeda(primeiraTransacao.valor),
              tipo: primeiraTransacao.tipo === 'entrada' ? '💰 Entrada' : '🔴 Saída',
              categoria: primeiraTransacao.categoria || 'outros',
            });
            
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
            await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
            
            return c.json({ success: true, message: 'Aguardando confirmação' });
          }
          
          // Salva transações diretamente (comportamento atual)
          const dataHora = new Date().toISOString();
          const data = dataHora.slice(0, 10);
          const idsSalvos: number[] = [];
          const transacoesSalvas: Array<{
            descricao: string;
            valor: number;
            categoria: string;
            tipo: 'entrada' | 'saida';
            metodo: 'credito' | 'debito';
            carteiraNome?: string;
            id?: number;
          }> = [];
          
          for (const transacaoExtraida of transacoesExtraidas) {
            try {
              const tipoFinal = (transacaoExtraida.tipo && transacaoExtraida.tipo.toLowerCase().trim() === 'entrada') 
                ? 'entrada' 
                : 'saida';
              
              const tipoCarteiraNecessario = (transacaoExtraida.metodo || 'debito') as 'debito' | 'credito';
              
              // Busca ou cria carteira apropriada
              const aliasInformado = (transacaoExtraida as any)?.carteira || (transacaoExtraida as any)?.carteiraNome;
              const carteiraResolvida = await resolverCarteiraPorTextoD1(c.env.financezap_db, telefoneFormatado, {
                nomeInformado: aliasInformado,
                textoOriginal: messageText,
                tipoPreferido: tipoCarteiraNecessario,
              });

              let carteiraId: number | null = carteiraResolvida.carteira?.id ?? null;
              let carteiraNome: string | undefined = carteiraResolvida.carteira?.nome;

              // Se não encontrou carteira (caso usuário não tenha carteiras ainda), cria uma do tipo necessário
              if (!carteiraId) {
                const carteiras = await buscarCarteirasD1(c.env.financezap_db, telefoneFormatado);
                if (carteiras.length > 0 && carteiras[0].id) {
                  carteiraId = carteiras[0].id;
                  carteiraNome = carteiras[0].nome;
                } else {
                  const novaCarteiraId = await criarCarteiraD1(c.env.financezap_db, telefoneFormatado, {
                    nome: tipoCarteiraNecessario === 'credito' ? 'Cartão de Crédito' : 'Carteira de Débito',
                    descricao: `Carteira ${tipoCarteiraNecessario}`,
                    padrao: false
                  });
                  carteiraId = novaCarteiraId;
                  const carteiraCriada = await buscarCarteiraPorIdD1(c.env.financezap_db, novaCarteiraId, telefoneFormatado);
                  if (carteiraCriada) {
                    carteiraNome = carteiraCriada.nome;
                  }
                }
              }
              
              // MELHORIA: Usa retry para salvar transação
              const transacaoId = await executarDBComRetry(() =>
                salvarTransacao(c.env.financezap_db, {
                telefone: telefoneFormatado,
                descricao: transacaoExtraida.descricao,
                valor: transacaoExtraida.valor,
                categoria: transacaoExtraida.categoria || 'outros',
                tipo: tipoFinal,
                metodo: (transacaoExtraida.metodo && transacaoExtraida.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito',
                dataHora,
                data,
                mensagemOriginal: messageText,
                carteiraId: carteiraId
                })
              );
              
              if (carteiraId) {
                await registrarUltimaCarteiraUsadaD1(c.env.financezap_db, telefoneFormatado, carteiraId);
                await registrarAliasCarteiraD1(
                  c.env.financezap_db,
                  telefoneFormatado,
                  carteiraId,
                  aliasInformado || carteiraResolvida.aliasUsado
                );
              }

              idsSalvos.push(transacaoId);
              
              // Armazena dados para formatação da mensagem
              transacoesSalvas.push({
                descricao: transacaoExtraida.descricao,
                valor: transacaoExtraida.valor,
                categoria: transacaoExtraida.categoria || 'outros',
                tipo: tipoFinal,
                metodo: (transacaoExtraida.metodo && transacaoExtraida.metodo.toLowerCase() === 'credito') ? 'credito' : 'debito',
                carteiraNome: carteiraNome,
                id: transacaoId
              });
              
            } catch (error: any) {
              console.error(`❌ Erro ao salvar transação: ${error.message}`);
            }
          }
          
          // Verifica se há transações salvas antes de formatar
          console.log(`📊 Transações salvas: ${transacoesSalvas.length}`);
          if (transacoesSalvas.length === 0) {
            // Não há transações salvas, tenta fallback
            console.error('❌ Nenhuma transação foi salva, tentando fallback');
            throw new Error('Nenhuma transação foi salva');
          }
          
          // Formata mensagem com informações completas
          console.log('📝 Formatando mensagem de resposta...');
          let resposta = '';
          let transacaoIdParaBotao: number | undefined = undefined;
          
          if (transacoesSalvas.length === 1) {
            const t = transacoesSalvas[0];
            transacaoIdParaBotao = idsSalvos[0];
            console.log(`📝 Formatando mensagem para transação única (ID: ${transacaoIdParaBotao})`);
            resposta = formatarMensagemTransacao({
              descricao: t.descricao,
              valor: t.valor,
              categoria: t.categoria,
              tipo: t.tipo,
              metodo: t.metodo,
              carteiraNome: t.carteiraNome,
              data: data,
              id: transacaoIdParaBotao
            });
            console.log(`📝 Mensagem formatada (${resposta.length} caracteres):`, resposta.substring(0, 100) + '...');
            
            // Adiciona ao contexto
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
            
            // Envia resposta simples (sem botão)
            console.log('📤 Enviando resposta simples para:', telefoneFormatado);
            const resultadoSimples = await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
            console.log('📥 Resultado mensagem simples:', JSON.stringify(resultadoSimples));
            if (!resultadoSimples.success) {
              console.error('❌ Erro ao enviar mensagem:', resultadoSimples.error);
              throw new Error(`Erro ao enviar mensagem: ${resultadoSimples.error}`);
            }
            console.log('✅ Resposta enviada com sucesso!');
          } else {
            // Múltiplas transações - MELHORIA: Usa template
            console.log(`📝 Formatando mensagem para ${transacoesSalvas.length} transações`);
            resposta = formatarResposta('transacao_multipla_sucesso', {
              quantidade: transacoesSalvas.length,
              transacoes: formatarListaTransacoes(
                transacoesSalvas.map(t => ({
                descricao: t.descricao,
                valor: t.valor,
                tipo: t.tipo,
                  categoria: t.categoria,
                data: data,
                }))
              ),
              total: formatarMoeda(transacoesSalvas.reduce((sum, t) => sum + t.valor, 0)),
            });
            console.log(`📝 Mensagem formatada (${resposta.length} caracteres):`, resposta.substring(0, 100) + '...');
          
          // Adiciona ao contexto
          await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
          
            // Envia resposta sem botões (múltiplas transações)
            console.log('📤 Tentando enviar resposta (múltiplas transações) para:', telefoneFormatado);
            const resultadoMultiplas = await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
            console.log('📥 Resultado múltiplas transações:', JSON.stringify(resultadoMultiplas));
            if (!resultadoMultiplas.success) {
              console.error('❌ Erro ao enviar mensagem múltiplas transações:', resultadoMultiplas.error);
              throw new Error(`Erro ao enviar mensagem: ${resultadoMultiplas.error}`);
            }
            console.log('✅ Resposta enviada com sucesso!');
          }
          
          console.log('✅ Retornando sucesso para o webhook');
          return c.json({ 
            success: true, 
            message: 'Transações salvas com sucesso' 
          });
        } else {
            // IA não encontrou transações - tenta fallback
            console.log('⚠️ IA não encontrou transações, tentando fallback');
        }
    } catch (error: any) {
      console.error('❌ Erro ao processar mensagem com IA:', error.message);
          // Erro na IA - tenta fallback
        }
      } else {
        // Sem IA configurada, tenta fallback direto
        console.log('⚠️ Sem IA configurada, tentando fallback');
      }
    
    // Fallback: tenta salvar como transação básica se a IA falhar ou não encontrou
      const valorMatch = messageText.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
      const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 0;
      
      if (valor > 0) {
        const dataHora = new Date().toISOString();
        const data = dataHora.slice(0, 10);
        
        // Detecta se é entrada ou saída baseado em palavras-chave
        const mensagemLower = messageText.toLowerCase();
        const palavrasEntrada = ['recebi', 'recebido', 'ganhei', 'vendi', 'salário', 'salario', 'me pagou', 'me pagaram'];
        const tipo = palavrasEntrada.some(p => mensagemLower.includes(p)) ? 'entrada' : 'saida';
        
        const carteiraFallback = await resolverCarteiraPorTextoD1(c.env.financezap_db, telefoneFormatado, {
          textoOriginal: messageText,
          tipoPreferido: 'debito',
        });
        const carteiraIdFallback = carteiraFallback.carteira?.id ?? null;

        const transacaoId = await salvarTransacao(c.env.financezap_db, {
          telefone: telefoneFormatado,
          descricao: messageText.substring(0, 200),
          valor,
          categoria: 'outros',
          tipo,
          metodo: 'debito',
          dataHora,
          data,
          mensagemOriginal: messageText,
          carteiraId: carteiraIdFallback,
        });

        if (carteiraIdFallback) {
          await registrarUltimaCarteiraUsadaD1(c.env.financezap_db, telefoneFormatado, carteiraIdFallback);
          await registrarAliasCarteiraD1(
            c.env.financezap_db,
            telefoneFormatado,
            carteiraIdFallback,
            carteiraFallback.aliasUsado
          );
        }
        
        
        // Busca o telefone do usuário no banco para garantir correspondência
        let telefoneParaNotificar = telefoneFormatado;
        try {
          const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, cleanFromNumber);
          if (usuario && usuario.telefone) {
            // Usa o telefone do banco (que é o formato correto usado no token JWT)
            telefoneParaNotificar = usuario.telefone.startsWith('whatsapp:') 
              ? usuario.telefone 
              : `whatsapp:${usuario.telefone}`;
          }
        } catch (error) {
        }
        
        // SSE desabilitado - usando apenas botão de atualizar manual
        // notificarClientesSSE(telefoneParaNotificar, 'transacao-nova', {
        //   id: transacaoId,
        //   tipo: 'transacao',
        //   mensagem: 'Nova transação registrada'
        // }, c.env.financezap_db);
        
        // if (telefoneParaNotificar !== telefoneFormatado) {
        //   notificarClientesSSE(telefoneFormatado, 'transacao-nova', {
        //     id: transacaoId,
        //     tipo: 'transacao',
        //     mensagem: 'Nova transação registrada'
        //   }, c.env.financezap_db);
        // }
        
        // notificarClientesSSE(cleanFromNumber, 'transacao-nova', {
        //   id: transacaoId,
        //   tipo: 'transacao',
        //   mensagem: 'Nova transação registrada'
        // }, c.env.financezap_db);
        
        // Busca nome da carteira se houver
        let carteiraNome: string | undefined = undefined;
        try {
          // Tenta buscar a última carteira usada ou padrão
          const carteiras = await buscarCarteirasD1(c.env.financezap_db, telefoneFormatado);
          if (carteiras.length > 0) {
            carteiraNome = carteiras[0].nome;
          }
        } catch (error) {
        }
        
        // Formata mensagem com informações completas
        const descricaoCompleta = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;
        const resposta = formatarMensagemTransacao({
          descricao: descricaoCompleta,
          valor: valor,
          categoria: 'outros',
          tipo: tipo,
          metodo: 'debito',
          carteiraNome: carteiraNome,
          data: data,
          id: transacaoId
        });
        
        // Envia resposta simples (sem botão)
        console.log('📤 Enviando resposta simples (fallback) para:', telefoneFormatado);
        const resultadoSimples = await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
        console.log('📥 Resultado mensagem simples (fallback):', JSON.stringify(resultadoSimples));
        if (!resultadoSimples.success) {
          console.error('❌ Erro ao enviar mensagem (fallback):', resultadoSimples.error);
        }
        
        return c.json({ success: true, message: 'Transação salva via fallback' });
      }
    }
    
    // Se chegou aqui e não processou nada, envia mensagem de "não consegui entender"
    const mensagemAmigavel = 'Desculpe, não consegui entender sua mensagem 😊.\n\n' +
      '💡 *Dicas:*\n' +
      '• Para registrar gasto: "comprei café por 5 reais"\n' +
      '• Para registrar receita: "recebi 500 reais"\n' +
      '• Para ver resumo: "resumo financeiro"\n' +
      '• Para ajuda: "ajuda" ou "/ajuda"';
    
    await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', mensagemAmigavel);
    const mensagens = dividirMensagem(mensagemAmigavel);
    for (const msg of mensagens) {
      await enviarMensagemZApi(telefoneFormatado, msg, c.env);
    }
    
    return c.json({ success: true, message: 'Mensagem processada' });
  } catch (error: any) {
    console.error('❌ Erro ao processar webhook Z-API:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Scheduled handler para notificações automáticas de agendamentos
// Endpoints de administração e monitoramento
app.get('/api/admin/metricas', async (c) => {
  try {
    const query = c.req.query();
    const telefone = query.telefone;
    const dias = query.dias ? parseInt(query.dias) : 7;

    const estatisticas = await obterEstatisticasProcessamento(
      c.env.financezap_db,
      telefone,
      dias
    );

    return c.json({ success: true, estatisticas });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get('/api/admin/queue/stats', async (c) => {
  try {
    const { obterEstatisticasQueue } = await import('./queueProcessamento');
    const stats = await obterEstatisticasQueue(c.env.financezap_db);

    return c.json({ success: true, stats });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/admin/queue/processar', async (c) => {
  try {
    const { obterProximaMensagemQueue, marcarMensagemProcessando, marcarMensagemConcluida, marcarMensagemErro } = await import('./queueProcessamento');
    
    const mensagem = await obterProximaMensagemQueue(c.env.financezap_db);
    
    if (!mensagem) {
      return c.json({ success: true, message: 'Nenhuma mensagem pendente' });
    }

    await marcarMensagemProcessando(c.env.financezap_db, mensagem.id);

    // Processa a mensagem (simula processamento)
    // Em produção, aqui chamaria o processador de mensagens
    try {
      // Simula processamento bem-sucedido
      await marcarMensagemConcluida(c.env.financezap_db, mensagem.id, 'Processado com sucesso');
      return c.json({ success: true, message: 'Mensagem processada', id: mensagem.id });
    } catch (error: any) {
      await marcarMensagemErro(c.env.financezap_db, mensagem.id, error.message);
      return c.json({ success: false, error: error.message }, 500);
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// API: Gerar dados do relatório - PROTEGIDA
app.post('/api/relatorios/gerar', async (c) => {
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
    const filtros: any = {
      telefone: telefoneFormatado,
      dataInicio: body.dataInicio,
      dataFim: body.dataFim,
      categoria: body.categoria,
      valorMin: body.valorMin,
      valorMax: body.valorMax,
      limit: 10000, // Busca todas as transações para o relatório
    };

    // Aplica filtro de tipo
    if (body.tipo && body.tipo !== 'todos') {
      filtros.tipo = body.tipo;
    }

    // Aplica filtro de método
    if (body.metodo && body.metodo !== 'todos') {
      filtros.metodo = body.metodo;
    }

    // Busca transações
    const resultado = await buscarTransacoes(c.env.financezap_db, filtros);
    const transacoes = resultado.transacoes || [];

    // Calcula totais
    const totalEntradas = transacoes
      .filter((t: any) => t.tipo === 'entrada')
      .reduce((sum: number, t: any) => sum + (t.valor || 0), 0);
    
    const totalSaidas = transacoes
      .filter((t: any) => t.tipo === 'saida')
      .reduce((sum: number, t: any) => sum + (t.valor || 0), 0);

    // Agrupa gastos por dia (últimos 30 dias ou período do filtro)
    const gastosPorDia: any[] = [];
    let dataInicio: Date;
    let dataFim: Date;
    
    if (filtros.dataInicio) {
      dataInicio = new Date(filtros.dataInicio);
      if (isNaN(dataInicio.getTime())) {
        dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - 30);
      }
    } else {
      dataInicio = new Date();
      dataInicio.setDate(dataInicio.getDate() - 30);
    }
    
    if (filtros.dataFim) {
      dataFim = new Date(filtros.dataFim);
      if (isNaN(dataFim.getTime())) {
        dataFim = new Date();
      }
    } else {
      dataFim = new Date();
    }

    // Garante que dataInicio não seja maior que dataFim
    if (dataInicio > dataFim) {
      const temp = dataInicio;
      dataInicio = dataFim;
      dataFim = temp;
    }

    for (let d = new Date(dataInicio); d <= dataFim; d.setDate(d.getDate() + 1)) {
      const dataStr = d.toISOString().split('T')[0];
      const transacoesDia = transacoes.filter((t: any) => {
        if (!t.dataHora) return false;
        try {
          const dataTransacaoObj = new Date(t.dataHora);
          if (isNaN(dataTransacaoObj.getTime())) return false;
          const dataTransacao = dataTransacaoObj.toISOString().split('T')[0];
          return dataTransacao === dataStr;
        } catch {
          return false;
        }
      });

      const entradas = transacoesDia
        .filter((t: any) => t.tipo === 'entrada')
        .reduce((sum: number, t: any) => sum + (t.valor || 0), 0);
      
      const saidas = transacoesDia
        .filter((t: any) => t.tipo === 'saida')
        .reduce((sum: number, t: any) => sum + (t.valor || 0), 0);

      gastosPorDia.push({
        data: dataStr,
        entradas,
        saidas,
        saldo: entradas - saidas,
      });
    }

    // Top categorias
    const categoriasMap = new Map<string, number>();
    transacoes
      .filter((t: any) => t.tipo === 'saida')
      .forEach((t: any) => {
        const cat = t.categoria || 'outros';
        categoriasMap.set(cat, (categoriasMap.get(cat) || 0) + (t.valor || 0));
      });

    const topCategorias = Array.from(categoriasMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Gastos por categoria (para gráfico de barras)
    const gastosPorCategoria = Array.from(categoriasMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return c.json({
      success: true,
      dados: {
        totalEntradas,
        totalSaidas,
        saldo: totalEntradas - totalSaidas,
        totalTransacoes: transacoes.length,
        transacoes: transacoes.slice(0, 100), // Limita a 100 para não sobrecarregar
        gastosPorDia,
        topCategorias,
        gastosPorCategoria,
      },
    });
  } catch (error: any) {
    console.error('Erro em POST /api/relatorios/gerar:', error);
    return c.json({ success: false, error: error.message || 'Erro ao gerar relatório' }, 500);
  }
});

// API: Enviar relatório via WhatsApp - PROTEGIDA
app.post('/api/relatorios/enviar-whatsapp', async (c) => {
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
    const filtros: any = {
      telefone: telefoneFormatado,
      dataInicio: body.dataInicio,
      dataFim: body.dataFim,
      categoria: body.categoria,
      valorMin: body.valorMin,
      valorMax: body.valorMax,
      limit: 10000,
    };

    if (body.tipo && body.tipo !== 'todos') {
      filtros.tipo = body.tipo;
    }

    if (body.metodo && body.metodo !== 'todos') {
      filtros.metodo = body.metodo;
    }

    // Busca transações
    const resultado = await buscarTransacoes(c.env.financezap_db, filtros);
    const transacoes = resultado.transacoes || [];

    // Calcula totais
    const totalEntradas = transacoes
      .filter((t: any) => t.tipo === 'entrada')
      .reduce((sum: number, t: any) => sum + (t.valor || 0), 0);
    
    const totalSaidas = transacoes
      .filter((t: any) => t.tipo === 'saida')
      .reduce((sum: number, t: any) => sum + (t.valor || 0), 0);

    // Formata período
    const periodoTexto = filtros.dataInicio && filtros.dataFim
      ? `${new Date(filtros.dataInicio).toLocaleDateString('pt-BR')} - ${new Date(filtros.dataFim).toLocaleDateString('pt-BR')}`
      : 'Período completo';

    // Monta mensagem
    let mensagem = `📊 *Relatório Financeiro*\n\n`;
    mensagem += `📅 *Período:* ${periodoTexto}\n\n`;
    mensagem += `💰 *Total de Entradas:* ${formatarMoeda(totalEntradas)}\n`;
    mensagem += `💸 *Total de Saídas:* ${formatarMoeda(totalSaidas)}\n`;
    mensagem += `📈 *Saldo:* ${formatarMoeda(totalEntradas - totalSaidas)}\n`;
    mensagem += `📋 *Total de Transações:* ${transacoes.length}\n\n`;

    // Top 5 categorias
    const categoriasMap = new Map<string, number>();
    transacoes
      .filter((t: any) => t.tipo === 'saida')
      .forEach((t: any) => {
        const cat = t.categoria || 'outros';
        categoriasMap.set(cat, (categoriasMap.get(cat) || 0) + (t.valor || 0));
      });

    const topCategorias = Array.from(categoriasMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    if (topCategorias.length > 0) {
      mensagem += `🏆 *Top 5 Categorias:*\n`;
      topCategorias.forEach((cat, index) => {
        mensagem += `${index + 1}. ${cat.name}: ${formatarMoeda(cat.value)}\n`;
      });
      mensagem += `\n`;
    }

    mensagem += `💡 Para visualizar gráficos detalhados e baixar o PDF, acesse o app: https://usezela.com`;

    // Envia via WhatsApp
    const resultadoEnvio = await enviarMensagemZApi(telefoneFormatado, mensagem, c.env);
    
    if (!resultadoEnvio.success) {
      return c.json({ success: false, error: resultadoEnvio.error || 'Erro ao enviar mensagem' }, 500);
    }

    return c.json({
      success: true,
      message: 'Relatório enviado via WhatsApp com sucesso',
    });
  } catch (error: any) {
    console.error('Erro em POST /api/relatorios/enviar-whatsapp:', error);
    return c.json({ success: false, error: error.message || 'Erro ao enviar relatório' }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    // Processa notificações de agendamentos
    ctx.waitUntil(processarNotificacoesAgendamentos(env));
    
    // MELHORIA: Limpeza automática de dados expirados
    ctx.waitUntil(limparDadosExpirados(env));
  },
};

// MELHORIA: Função para limpar dados expirados (cache, estados, métricas antigas, queue)
async function limparDadosExpirados(env: Bindings): Promise<void> {
  try {
    // Limpa estados de conversação expirados
    const { verificarElimparEstadosExpirados } = await import('./estadosConversacao');
    const estadosRemovidos = await verificarElimparEstadosExpirados(env.financezap_db);
    if (estadosRemovidos > 0) {
      console.log(`🧹 Limpeza: ${estadosRemovidos} estados expirados removidos`);
    }

    // Limpa cache de IA expirado
    const { limparCacheExpirado } = await import('./cacheIA');
    const cacheRemovido = await limparCacheExpirado(env.financezap_db);
    if (cacheRemovido > 0) {
      console.log(`🧹 Limpeza: ${cacheRemovido} entradas de cache expiradas removidas`);
    }

    // Limpa métricas antigas (mais de 30 dias)
    const { limparMetricasAntigas } = await import('./metricas');
    const metricasRemovidas = await limparMetricasAntigas(env.financezap_db);
    if (metricasRemovidas > 0) {
      console.log(`🧹 Limpeza: ${metricasRemovidas} métricas antigas removidas`);
    }

    // Limpa queue antiga (mais de 7 dias)
    const { limparQueueAntiga } = await import('./queueProcessamento');
    const queueRemovida = await limparQueueAntiga(env.financezap_db);
    if (queueRemovida > 0) {
      console.log(`🧹 Limpeza: ${queueRemovida} mensagens antigas da queue removidas`);
    }
  } catch (error: any) {
    console.error('❌ Erro ao limpar dados expirados:', error);
  }
}

async function processarNotificacoesAgendamentos(env: Bindings): Promise<void> {
  try {
    
    const hoje = new Date().toISOString().split('T')[0];
    
    // Busca todos os agendamentos pendentes do dia que ainda não foram notificados
    const query = `
      SELECT * FROM agendamentos 
      WHERE dataAgendamento = ? 
        AND status = 'pendente' 
        AND notificado = 0
      ORDER BY dataAgendamento ASC
    `;
    
    const result = await env.financezap_db.prepare(query).bind(hoje).all<AgendamentoRecord>();
    const agendamentos = result.results || [];
    
    
    if (agendamentos.length === 0) {
      return;
    }
    
    // Agrupa por telefone para enviar uma mensagem consolidada
    const agendamentosPorTelefone = new Map<string, AgendamentoRecord[]>();
    agendamentos.forEach(ag => {
      if (!agendamentosPorTelefone.has(ag.telefone)) {
        agendamentosPorTelefone.set(ag.telefone, []);
      }
      agendamentosPorTelefone.get(ag.telefone)!.push(ag);
    });
    
    // Envia notificação para cada telefone
    for (const [telefone, ags] of agendamentosPorTelefone.entries()) {
      try {
        let mensagem = `🔔 *Lembrete de Agendamentos - ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
        
        if (ags.length === 1) {
          const ag = ags[0];
          mensagem += `📋 *${ag.descricao}*\n`;
          mensagem += `💰 ${formatarMoeda(ag.valor)}\n`;
          mensagem += `📅 ${new Date(ag.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR')}\n`;
          mensagem += `📝 ${ag.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento'}\n\n`;
          if (ag.recorrente === 1 && ag.parcelaAtual && ag.totalParcelas) {
            mensagem += `📊 Parcela ${ag.parcelaAtual} de ${ag.totalParcelas}\n\n`;
          }
        } else {
          mensagem += `Você tem ${ags.length} agendamentos hoje:\n\n`;
          ags.forEach((ag, index) => {
            mensagem += `${index + 1}. *${ag.descricao}*\n`;
            mensagem += `   💰 ${formatarMoeda(ag.valor)}\n`;
            if (ag.recorrente === 1 && ag.parcelaAtual && ag.totalParcelas) {
              mensagem += `   📊 Parcela ${ag.parcelaAtual}/${ag.totalParcelas}\n`;
            }
            mensagem += `\n`;
          });
        }
        
        mensagem += `💡 Use o botão abaixo para marcar como pago ou acesse o app.`;
        
        // Envia mensagem via Z-API ou Twilio
        if (env.ZAPI_INSTANCE_ID && env.ZAPI_TOKEN && env.ZAPI_CLIENT_TOKEN) {
          await enviarMensagemZApi(telefone, mensagem, env);
        } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER) {
          // Implementar envio via Twilio se necessário
        }
        
        // Marca como notificado
        for (const ag of ags) {
          await env.financezap_db
            .prepare('UPDATE agendamentos SET notificado = 1 WHERE id = ?')
            .bind(ag.id)
            .run();
        }
        
      } catch (error: any) {
        console.error(`❌ Erro ao enviar notificação para ${telefone}:`, error);
      }
    }
    
  } catch (error: any) {
    console.error('❌ Erro ao processar notificações de agendamentos:', error);
  }
}
