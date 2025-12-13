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
  // Normaliza o telefone recebido (pode vir em vários formatos)
  let telefoneNormalizado = telefone;
  
  // Remove prefixos comuns
  telefoneNormalizado = telefoneNormalizado.replace('whatsapp:', '').trim();
  
  // Garante que tem o + no início
  if (!telefoneNormalizado.startsWith('+')) {
    telefoneNormalizado = '+' + telefoneNormalizado;
  }
  
  // Remove o + para criar variações
  const telefoneSemMais = telefoneNormalizado.replace(/^\+/, '');
  
  // Cria todas as variações possíveis do telefone
  const telefonesParaNotificar = [
    telefoneNormalizado,                    // +5561981474690
    telefoneSemMais,                        // 5561981474690
    `whatsapp:${telefoneNormalizado}`,      // whatsapp:+5561981474690
    `whatsapp:${telefoneSemMais}`,          // whatsapp:5561981474690
    // Variações com/sem o 9 (para números brasileiros)
    ...(telefoneSemMais.startsWith('55') && telefoneSemMais.length === 13 ? [
      telefoneSemMais.substring(0, 4) + telefoneSemMais.substring(5), // Remove o 9
      `+${telefoneSemMais.substring(0, 4)}${telefoneSemMais.substring(5)}`,
    ] : []),
    ...(telefoneSemMais.startsWith('55') && telefoneSemMais.length === 12 ? [
      telefoneSemMais.substring(0, 4) + '9' + telefoneSemMais.substring(4), // Adiciona o 9
      `+${telefoneSemMais.substring(0, 4)}9${telefoneSemMais.substring(4)}`,
    ] : []),
  ];
  
  console.log(`📡 SSE: Tentando notificar telefone original: ${telefone}`);
  console.log(`📡 SSE: Telefone normalizado: ${telefoneNormalizado}`);
  console.log(`📡 SSE: Variações a tentar:`, telefonesParaNotificar);
  console.log(`📡 SSE: Clientes conectados:`, Array.from(clientesSSE.keys()));
  
  let notificados = 0;
  telefonesParaNotificar.forEach(tel => {
    const clientes = clientesSSE.get(tel);
    if (clientes && clientes.length > 0) {
      console.log(`📡 SSE: ✅ Encontrados ${clientes.length} cliente(s) para telefone: ${tel}`);
      const mensagem = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
      clientes.forEach(controller => {
        try {
          controller.enqueue(new TextEncoder().encode(mensagem));
          notificados++;
          console.log(`✅ SSE: Mensagem enviada para cliente (evento: ${evento})`);
        } catch (error) {
          console.error('❌ Erro ao enviar mensagem SSE:', error);
        }
      });
    } else {
      console.log(`⚠️ SSE: Nenhum cliente encontrado para telefone: ${tel}`);
    }
  });
  
  if (notificados > 0) {
    console.log(`📡 SSE: ✅ Notificados ${notificados} cliente(s) SSE para telefone: ${telefoneNormalizado}`);
  } else {
    console.warn(`⚠️ SSE: ❌ Nenhum cliente foi notificado para telefone: ${telefoneNormalizado}`);
    console.warn(`⚠️ SSE: Verifique se o telefone usado na conexão SSE corresponde ao telefone da transação`);
    
    // FALLBACK: Se não encontrou nenhum cliente, tenta notificar TODOS os clientes conectados
    // Isso é útil quando há um problema de correspondência de telefone
    console.log(`🔄 SSE: Tentando fallback - notificando todos os clientes conectados...`);
    let fallbackNotificados = 0;
    clientesSSE.forEach((clientes, tel) => {
      if (clientes.length > 0) {
        console.log(`📡 SSE: Fallback - notificando ${clientes.length} cliente(s) no telefone: ${tel}`);
        const mensagem = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
        clientes.forEach(controller => {
          try {
            controller.enqueue(new TextEncoder().encode(mensagem));
            fallbackNotificados++;
            console.log(`✅ SSE: Mensagem enviada via fallback (evento: ${evento})`);
          } catch (error) {
            console.error('❌ Erro ao enviar mensagem SSE (fallback):', error);
          }
        });
      }
    });
    
    if (fallbackNotificados > 0) {
      console.log(`📡 SSE: ✅ Fallback - Notificados ${fallbackNotificados} cliente(s) SSE`);
    } else {
      console.warn(`⚠️ SSE: ❌ Fallback também não encontrou clientes. Total de clientes SSE: ${clientesSSE.size}`);
      // Salva notificação no D1 para o frontend consultar via polling
      if (db) {
        salvarNotificacaoFallback(db, telefoneNormalizado, evento, dados).catch(err => {
          console.error('❌ Erro ao salvar notificação no D1:', err);
        });
      }
    }
  }
}

// Função auxiliar para salvar notificação no D1 quando SSE não funciona
async function salvarNotificacaoFallback(db: D1Database, telefone: string, evento: string, dados: any) {
  try {
    // Normaliza telefone para buscar no banco
    const telefoneNormalizado = telefone.replace('whatsapp:', '').replace(/^\+/, '').trim();
    
    // Busca o telefone do usuário no banco
    const usuario = await buscarUsuarioPorTelefone(db, telefoneNormalizado);
    if (usuario && usuario.telefone) {
      const telefoneParaNotificar = usuario.telefone.replace('whatsapp:', '').replace(/^\+/, '').trim();
      await salvarNotificacaoD1(db, telefoneParaNotificar, evento, dados);
      console.log(`💾 SSE: Notificação salva no D1 para telefone: ${telefoneParaNotificar}`);
    } else {
      // Se não encontrou usuário, salva com o telefone normalizado mesmo
      await salvarNotificacaoD1(db, telefoneNormalizado, evento, dados);
      console.log(`💾 SSE: Notificação salva no D1 para telefone: ${telefoneNormalizado}`);
    }
  } catch (error) {
    console.error('❌ Erro ao salvar notificação no D1:', error);
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
      console.warn(`⚠️ Origem não permitida: ${origin}. Permitidas: ${allowed.join(', ')}`);
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
  // Remove prefixos existentes
  let telefoneLimpo = telefone.replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
  // Remove todos os caracteres não numéricos
  telefoneLimpo = telefoneLimpo.replace(/\D/g, '');
  // Retorna no formato que será usado no banco (sem whatsapp:)
  return telefoneLimpo.startsWith('55') 
    ? `+${telefoneLimpo}` 
    : `+55${telefoneLimpo}`;
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

// Função auxiliar para normalizar telefone (mesma lógica usada ao salvar transações)
function normalizarTelefoneParaComparacao(telefone: string): string {
  // Remove apenas o prefixo whatsapp: mas mantém o + e o número
  return telefone.replace(/^whatsapp:/i, '').trim();
}

// Função para criar variações com/sem dígito 9 (para números brasileiros)
function criarVariacoesComSem9(telefone: string): string[] {
  const apenasNumeros = telefone.replace(/\D/g, '');
  const variacoes: string[] = [apenasNumeros];
  
  // Se é número brasileiro (começa com 55)
  if (apenasNumeros.startsWith('55') && apenasNumeros.length >= 12) {
    const ddd = apenasNumeros.substring(2, 4); // DDD (2 dígitos após o 55)
    const resto = apenasNumeros.substring(4); // Resto do número após DDD
    
    // Números brasileiros podem ter 8 ou 9 dígitos após o DDD
    // Se tem 9 dígitos e começa com 9, cria variação sem 9 (8 dígitos)
    if (resto.length === 9 && resto.startsWith('9')) {
      const sem9 = `55${ddd}${resto.substring(1)}`; // Remove o 9
      variacoes.push(sem9);
      console.log(`   🔄 Criada variação sem 9: ${sem9} (original: ${apenasNumeros})`);
    }
    // Se tem 8 dígitos e não começa com 9, cria variação com 9 (9 dígitos)
    else if (resto.length === 8 && !resto.startsWith('9')) {
      const com9 = `55${ddd}9${resto}`; // Adiciona o 9
      variacoes.push(com9);
      console.log(`   🔄 Criada variação com 9: ${com9} (original: ${apenasNumeros})`);
    }
    // Se tem 10 dígitos (formato antigo com 9), cria variação sem 9
    else if (resto.length === 10 && resto.startsWith('9')) {
      const sem9 = `55${ddd}${resto.substring(1)}`;
      variacoes.push(sem9);
      console.log(`   🔄 Criada variação sem 9 (10->9): ${sem9} (original: ${apenasNumeros})`);
    }
  }
  
  return variacoes;
}

// Função auxiliar para comparar telefones (considera todas as variações, incluindo dígito 9)
function telefonesCorrespondem(telefone1: string, telefone2: string): boolean {
  // Normaliza ambos usando a mesma função usada ao salvar transações
  const tel1Norm = normalizarTelefoneParaComparacao(telefone1);
  const tel2Norm = normalizarTelefoneParaComparacao(telefone2);
  
  // Remove o + para obter apenas números
  const tel1SemMais = tel1Norm.replace(/^\+/, '');
  const tel2SemMais = tel2Norm.replace(/^\+/, '');
  
  // Comparação direta após normalização
  if (tel1SemMais === tel2SemMais) {
    console.log(`✅ Telefones correspondem (direto): "${tel1SemMais}" === "${tel2SemMais}"`);
    return true;
  }
  
  // Cria variações com/sem dígito 9 para ambos os telefones
  const variacoes1 = criarVariacoesComSem9(tel1SemMais);
  const variacoes2 = criarVariacoesComSem9(tel2SemMais);
  
  console.log(`   🔍 Variações criadas para telefone 1 (${tel1SemMais}):`, variacoes1);
  console.log(`   🔍 Variações criadas para telefone 2 (${tel2SemMais}):`, variacoes2);
  
  // Verifica se há alguma correspondência entre as variações
  const corresponde = variacoes1.some(v1 => variacoes2.includes(v1));
  
  if (corresponde) {
    const variacaoCorrespondente = variacoes1.find(v1 => variacoes2.includes(v1));
    console.log(`✅ Telefones correspondem (variações com/sem 9): "${telefone1}" <-> "${telefone2}"`);
    console.log(`   Variação correspondente: ${variacaoCorrespondente}`);
    return true;
  } else {
    // Tenta também com as variações completas (incluindo prefixos)
    const variacoesCompletas1 = telefoneVariacoes(telefone1);
    const variacoesCompletas2 = telefoneVariacoes(telefone2);
    
    const variacoesCompletas1Norm = variacoesCompletas1.map(v => v.replace(/^whatsapp:/i, '').replace(/^\+/, ''));
    const variacoesCompletas2Norm = variacoesCompletas2.map(v => v.replace(/^whatsapp:/i, '').replace(/^\+/, ''));
    
    const correspondeCompleto = variacoesCompletas1Norm.some(v1 => variacoesCompletas2Norm.includes(v1));
    
    if (correspondeCompleto) {
      console.log(`✅ Telefones correspondem (variações completas): "${telefone1}" <-> "${telefone2}"`);
      return true;
    }
    
    console.log(`❌ Telefones NÃO correspondem: "${telefone1}" <-> "${telefone2}"`);
    console.log(`   Normalizados: "${tel1Norm}" <-> "${tel2Norm}"`);
    console.log(`   Sem +: "${tel1SemMais}" <-> "${tel2SemMais}"`);
    console.log(`   Variações 1: ${variacoes1.join(', ')}`);
    console.log(`   Variações 2: ${variacoes2.join(', ')}`);
  }
  
  return corresponde;
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
      "metodo": "debito"
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

    // Tenta Groq primeiro (se configurado)
    if ((IA_PROVIDER === 'groq' || !IA_PROVIDER) && temGroq) {
      try {
        console.log('🤖 Processando mensagem com Groq...');
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
                content: 'Você é um assistente especializado em extrair informações financeiras de mensagens de texto. Sempre retorne JSON válido.'
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
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini...', error.message);
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
      // Usa Gemini diretamente
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

    // Extrai JSON da resposta
    let jsonStr = resposta.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const resultado = JSON.parse(jsonStr);
    
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
          console.log(`   ✅ CORREÇÃO: Tipo corrigido para "entrada" baseado em palavras-chave`);
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
  const telefoneFormatado = formatarTelefone(telefone);

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
  });
  
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
    await salvarCodigoVerificacao(telefoneFormatado, codigo, c.env.financezap_db);
    
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
    
    // Verifica se é um novo número (primeira vez que se registra)
    const ehNovoNumero = !(await numeroEstaRegistrado(c.env.financezap_db, telefoneFormatado));
    
    // Registra o número se ainda não estiver registrado
    if (ehNovoNumero) {
      await registrarNumero(c.env.financezap_db, telefoneFormatado);
    }
    
    console.log(`✅ Usuário cadastrado: ${nome.trim()} (${telefoneFormatado})`);
    console.log(`   Trial expira em: ${trialExpiraEm.toLocaleString('pt-BR')}`);
    console.log(`   É novo número: ${ehNovoNumero}`);
    
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
        console.log(`📨 Mensagem de boas-vindas enviada para: ${telefoneFormatado}`);
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
    
    console.log(`🗑️ Solicitação de exclusão de dados para: ${telefoneFormatado}`);
    
    // Exclui todos os dados do usuário
    const resultado = await excluirTodosDadosUsuario(c.env.financezap_db, telefoneFormatado);
    
    if (resultado.sucesso) {
      console.log(`✅ Dados excluídos com sucesso para: ${telefoneFormatado}`);
      console.log(`   Transações removidas: ${resultado.dadosRemovidos?.transacoes || 0}`);
      console.log(`   Agendamentos removidos: ${resultado.dadosRemovidos?.agendamentos || 0}`);
      console.log(`   Categorias removidas: ${resultado.dadosRemovidos?.categorias || 0}`);
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
      console.log('🔍 Token verificado - Telefone original:', telefoneOriginal, 'Formatado:', telefoneFormatado);
    } catch (error: any) {
      console.error('Erro ao verificar token:', error.message);
      if (error.message?.includes('expired')) {
        return c.json({ success: false, error: 'Token expirado' }, 401);
      }
      return c.json({ success: false, error: error.message || 'Token inválido' }, 401);
    }
    
    console.log('🔍 Verificando usuário com telefone formatado:', telefoneFormatado);
    const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, telefoneFormatado);
    
    if (!usuario) {
      console.error('❌ Usuário não encontrado para telefone:', telefoneFormatado);
      console.error('   Telefone original do token:', telefoneOriginal);
      console.error('   Tentando buscar com variações...');
      return c.json({ success: false, error: 'Usuário não encontrado' }, 401);
    }
    
    console.log('✅ Usuário encontrado:', {
      telefone: usuario.telefone,
      nome: usuario.nome,
      status: usuario.status
    });
    
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
        trialExpiraEm: usuario.trialExpiraEm,
        diasRestantesTrial: diasRestantes,
        totalTransacoes: stats.totalTransacoes,
      }
    };
    
    console.log('📤 Retornando dados do usuário:', {
      telefone: resposta.telefone,
      status: resposta.usuario.status,
      nome: resposta.usuario.nome
    });
    
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
      console.warn(`🚫 Tentativa de atualizar categoria padrão bloqueada na rota! ID: ${id}`);
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
      console.warn(`🚫 Tentativa de remover categoria padrão bloqueada na rota! ID: ${id}`);
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
      console.log(`🔍 Debug GET /api/carteiras: Tabela existe, total: ${testQuery?.count || 0}`);
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
      console.log(`🔍 Debug: Tabela carteiras existe, total de registros: ${testQuery?.count || 0}`);
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
        console.log('⚠️ Telefones não correspondem ao atualizar agendamento:');
        console.log(`   Agendamento: ${agendamento.telefone}`);
        console.log(`   Usuário: ${telefoneFormatado}`);
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
          console.log(`✅ Transação criada automaticamente para agendamento ${id} (ID: ${transacaoId})`);
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
          console.log(`✅ Transação criada automaticamente para agendamento ${id} (ID: ${transacaoId})`);
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
    
    console.log('💬 Chat de IA - Mensagem recebida:', mensagem);
    console.log('   Telefone:', telefoneFormatado);
    
    // Busca estatísticas e transações do usuário para contexto
    const estatisticas = await calcularEstatisticas(c.env.financezap_db, { telefone: telefoneFormatado });
    const transacoesData = await buscarTransacoes(c.env.financezap_db, {
      telefone: telefoneFormatado,
      limit: 10,
      offset: 0
    });
    
    // Prepara o contexto financeiro
    const estatisticasTexto = `
- Total gasto: R$ ${estatisticas.totalSaidas?.toFixed(2) || '0.00'}
- Total de transações: ${estatisticas.totalTransacoes || 0}
- Média por transação: R$ ${estatisticas.mediaGasto?.toFixed(2) || '0.00'}
- Maior gasto: R$ ${estatisticas.maiorGasto?.toFixed(2) || '0.00'}
- Menor gasto: R$ ${estatisticas.menorGasto?.toFixed(2) || '0.00'}
- Gasto hoje: R$ ${estatisticas.gastoHoje?.toFixed(2) || '0.00'}
- Gasto do mês: R$ ${estatisticas.gastoMes?.toFixed(2) || '0.00'}
    `.trim();

    const transacoesTexto = transacoesData.transacoes.slice(0, 10).map((t: any) => 
      `- ${t.descricao}: R$ ${t.valor.toFixed(2)} (${t.categoria})`
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

    // Verifica qual IA está disponível
    const temGroq = c.env.GROQ_API_KEY && c.env.GROQ_API_KEY.trim() !== '';
    const temGemini = c.env.GEMINI_API_KEY && c.env.GEMINI_API_KEY.trim() !== '';
    const IA_PROVIDER = (c.env.IA_PROVIDER || '').toLowerCase().trim();

    if (!temGroq && !temGemini) {
      return c.json({ 
        success: false, 
        error: 'Nenhuma API de IA configurada. Configure GROQ_API_KEY ou GEMINI_API_KEY no Cloudflare Workers.' 
      }, 500);
    }

    let resposta: string;

    // Tenta usar Groq primeiro (se configurado)
    if ((IA_PROVIDER === 'groq' || !IA_PROVIDER) && temGroq) {
      try {
        console.log('🤖 Chat IA - Usando Groq');
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
        
        // Verifica se a IA não entendeu e substitui por mensagem amigável
        if (!respostaGroq || verificarSeNaoEntendeu(respostaGroq)) {
          console.log('⚠️  IA não entendeu a mensagem, retornando resposta amigável');
          resposta = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
        } else {
          resposta = respostaGroq;
        }
      } catch (error: any) {
        console.warn('⚠️  Erro ao usar Groq, tentando Gemini...', error.message);
        if (temGemini) {
          // Fallback para Gemini
          try {
            console.log('🤖 Chat IA - Usando Gemini (fallback)');
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
            
            // Verifica se a IA não entendeu e substitui por mensagem amigável
            if (!respostaGemini || verificarSeNaoEntendeu(respostaGemini)) {
              console.log('⚠️  IA não entendeu a mensagem, retornando resposta amigável');
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
      // Usa Gemini diretamente
      try {
        console.log('🤖 Chat IA - Usando Gemini');
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
        
        // Verifica se a IA não entendeu e substitui por mensagem amigável
        if (!respostaGemini || verificarSeNaoEntendeu(respostaGemini)) {
          console.log('⚠️  IA não entendeu a mensagem, retornando resposta amigável');
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

    console.log('✅ Chat de IA - Resposta gerada');
    
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
          console.log('⚠️ Nenhuma IA configurada para transcrição de áudio');
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
    console.log('🔍 Verificando se é solicitação de relatório...');
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
      console.log('📊 Solicitação de relatório detectada, processando...');
      
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
        
        console.log(`📊 Gerando relatório ${tipoRelatorio}...`);
        
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
          console.warn('⚠️ Erro ao buscar carteira padrão:', error);
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
        console.log(`✅ Relatório ${tipoRelatorio} enviado para:`, telefoneFormatado);
        
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
    
    // MELHORIA: Adiciona feedback visual
    try {
      await enviarMensagemZApi(telefoneFormatado, '🤖 Processando sua mensagem...', c.env);
    } catch (e) {
      // Ignora erro de feedback visual
    }
    
    // MELHORIA: Obtém contexto de conversação
    const contexto = await obterContextoConversacaoD1(c.env.financezap_db, cleanFromNumber);
    
    // MELHORIA: Adiciona mensagem do usuário ao contexto
    await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'user', messageText);
    
    // MELHORIA: Detecta intenção primeiro
    const intencao = detectarIntencao(messageText, contexto);
    console.log(`🎯 Intenção detectada: ${intencao.intencao} (confiança: ${intencao.confianca})`);
    
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
      console.log('💰 Solicitação de saldo detectada!');
      
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
      console.log('🗑️ Solicitação de exclusão detectada!');
      
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
    
    // Se não foi agendamento, processa como transação usando IA
    console.log('💰 Processando como transação com IA...');
    
    // MELHORIA: Só processa se intenção for transação ou desconhecida
    if (intencao.intencao === 'transacao' || intencao.intencao === 'desconhecida') {
      try {
        // Processa mensagem com IA para extrair transações
        const transacoesExtraidas = await processarMensagemComIAWorker(messageText, c.env);
        
        if (transacoesExtraidas && transacoesExtraidas.length > 0) {
          console.log(`✅ ${transacoesExtraidas.length} transação(ões) extraída(s) pela IA`);
          
          // MELHORIA: Valida qualidade da extração
          const scoreExtracao = calcularScoreMedio(transacoesExtraidas.map(t => ({
            descricao: t.descricao,
            valor: t.valor,
            categoria: t.categoria,
            tipo: t.tipo,
            metodo: t.metodo
          })));
          
          console.log(`📊 Score de qualidade: ${scoreExtracao.valor.toFixed(2)} - ${scoreExtracao.motivo}`);
          
          // MELHORIA: Se qualidade baixa, pede mais informações
          if (devePedirMaisInformacoes(scoreExtracao)) {
            let respostaQualidade = `⚠️ Preciso de mais informações:\n\n`;
            scoreExtracao.problemas.forEach((p, i) => {
              respostaQualidade += `${i + 1}. ${p}\n`;
            });
            respostaQualidade += `\n💡 ${scoreExtracao.sugestoes.join('\n💡 ')}`;
            
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', respostaQualidade);
            const mensagens = dividirMensagem(respostaQualidade);
            
            for (const msg of mensagens) {
              await enviarMensagemZApi(telefoneFormatado, msg, c.env);
            }
            
            return c.json({ success: true, message: 'Solicitando mais informações' });
          }
          
          // Salva transações diretamente sem confirmação
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
              const carteiras = await buscarCarteirasD1(c.env.financezap_db, telefoneFormatado);
              let carteiraId: number | null = null;
              let carteiraNome: string | undefined = undefined;
              
              const tipoNome = tipoCarteiraNecessario === 'credito' ? 'Crédito' : 'Débito';
              const carteiraEncontrada = carteiras.find(c => 
                c.nome.toLowerCase().includes(tipoCarteiraNecessario) ||
                c.nome.toLowerCase().includes(tipoNome.toLowerCase())
              );
              
              if (carteiraEncontrada && carteiraEncontrada.id) {
                carteiraId = carteiraEncontrada.id;
                carteiraNome = carteiraEncontrada.nome;
              } else if (carteiras.length > 0 && carteiras[0].id) {
                carteiraId = carteiras[0].id;
                carteiraNome = carteiras[0].nome;
              } else {
                const novaCarteiraId = await criarCarteiraD1(c.env.financezap_db, telefoneFormatado, {
                  nome: tipoCarteiraNecessario === 'credito' ? 'Cartão de Crédito' : 'Cartão de Débito',
                  descricao: `Carteira ${tipoCarteiraNecessario}`,
                  padrao: false
                });
                carteiraId = novaCarteiraId;
                // Busca a carteira criada para obter o nome
                const carteiraCriada = await buscarCarteiraPorIdD1(c.env.financezap_db, novaCarteiraId, telefoneFormatado);
                if (carteiraCriada) {
                  carteiraNome = carteiraCriada.nome;
                }
              }
              
              const transacaoId = await salvarTransacao(c.env.financezap_db, {
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
              });
              
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
              
              console.log(`✅ Transação salva (ID: ${transacaoId}): ${transacaoExtraida.descricao} - R$ ${transacaoExtraida.valor.toFixed(2)}`);
            } catch (error: any) {
              console.error(`❌ Erro ao salvar transação: ${error.message}`);
            }
          }
          
          // Formata mensagem com informações completas
          let resposta = '';
          
          if (transacoesSalvas.length === 1) {
            const t = transacoesSalvas[0];
            resposta = formatarMensagemTransacao({
              descricao: t.descricao,
              valor: t.valor,
              categoria: t.categoria,
              tipo: t.tipo,
              metodo: t.metodo,
              carteiraNome: t.carteiraNome,
              data: data,
              id: idsSalvos[0] || undefined
            });
          } else {
            resposta = formatarMensagemMultiplasTransacoes(
              transacoesSalvas.map((t, index) => ({
                descricao: t.descricao,
                valor: t.valor,
                categoria: t.categoria,
                tipo: t.tipo,
                metodo: t.metodo,
                carteiraNome: t.carteiraNome,
                data: data,
                id: idsSalvos[index] || undefined
              }))
            );
          }
          
          // Adiciona ao contexto
          await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', resposta);
          
          // Envia resposta
          await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
          
          return c.json({ 
            success: true, 
            message: 'Transações salvas com sucesso' 
          });
        } else {
          // MELHORIA: Se não encontrou transação, verifica se é pergunta
          if (intencao.intencao === 'pergunta') {
            console.log('❓ Pergunta detectada, usando chat de IA...');
            
            const estatisticas = await calcularEstatisticas(c.env.financezap_db, { telefone: cleanFromNumber });
            const transacoesRecentes = await buscarTransacoes(c.env.financezap_db, {
              telefone: cleanFromNumber,
              limit: 10
            });
            
            const historicoTexto = formatarHistoricoParaPrompt(contexto);
            
            // Processa pergunta com chat IA (precisa implementar função similar)
            const respostaIA = '💡 Para perguntas sobre suas finanças, acesse o portal web em usezela.com/painel';
            
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', respostaIA);
            const mensagens = dividirMensagem(respostaIA);
            
            for (const msg of mensagens) {
              await enviarMensagemZApi(telefoneFormatado, msg, c.env);
            }
            
            return c.json({ success: true, message: 'Pergunta respondida' });
          } else {
            console.log('⚠️ Nenhuma transação financeira encontrada na mensagem');
            // MELHORIA: Mensagem mais útil quando não entende
            const mensagemAmigavel = 'Desculpe, não consegui entender sua mensagem 😊.\n\n' +
              '💡 *Dicas:*\n' +
              '• Para registrar gasto: "comprei café por 5 reais"\n' +
              '• Para registrar receita: "recebi 500 reais"\n' +
              '• Para ver resumo: "resumo financeiro"\n' +
              '• Para ajuda: "ajuda" ou "/ajuda"';
            
            await adicionarMensagemContextoD1(c.env.financezap_db, cleanFromNumber, 'assistant', mensagemAmigavel);
            await enviarMensagemZApi(telefoneFormatado, mensagemAmigavel, c.env);
          }
        }
    } catch (error: any) {
      console.error('❌ Erro ao processar mensagem com IA:', error.message);
      // Envia mensagem amigável em caso de erro
      const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
      
      try {
        await enviarMensagemZApi(telefoneFormatado, mensagemAmigavel, c.env);
      } catch (envioError: any) {
        console.error('❌ Erro ao enviar mensagem amigável:', envioError.message);
      }
      // Fallback: tenta salvar como transação básica se a IA falhar
      const valorMatch = messageText.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
      const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 0;
      
      if (valor > 0) {
        console.log('⚠️ Usando fallback: salvando transação básica');
        const dataHora = new Date().toISOString();
        const data = dataHora.slice(0, 10);
        
        // Detecta se é entrada ou saída baseado em palavras-chave
        const mensagemLower = messageText.toLowerCase();
        const palavrasEntrada = ['recebi', 'recebido', 'ganhei', 'vendi', 'salário', 'salario', 'me pagou', 'me pagaram'];
        const tipo = palavrasEntrada.some(p => mensagemLower.includes(p)) ? 'entrada' : 'saida';
        
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
        });
        
        console.log(`📡 SSE: Transação criada com ID ${transacaoId}, notificando clientes...`);
        console.log(`📡 SSE: Telefone da transação: ${telefoneFormatado}`);
        console.log(`📡 SSE: cleanFromNumber: ${cleanFromNumber}`);
        
        // Busca o telefone do usuário no banco para garantir correspondência
        let telefoneParaNotificar = telefoneFormatado;
        try {
          const usuario = await buscarUsuarioPorTelefone(c.env.financezap_db, cleanFromNumber);
          if (usuario && usuario.telefone) {
            // Usa o telefone do banco (que é o formato correto usado no token JWT)
            telefoneParaNotificar = usuario.telefone.startsWith('whatsapp:') 
              ? usuario.telefone 
              : `whatsapp:${usuario.telefone}`;
            console.log(`📡 SSE: Telefone do usuário no banco: ${telefoneParaNotificar}`);
          }
        } catch (error) {
          console.warn('⚠️ Erro ao buscar telefone do usuário:', error);
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
          console.warn('⚠️ Erro ao buscar nome da carteira:', error);
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
          data: data
        });
        
        await enviarMensagemZApi(telefoneFormatado, resposta, c.env);
      }
      }
    }
    
    return c.json({ success: true, message: 'Mensagem processada' });
  } catch (error: any) {
    console.error('❌ Erro ao processar webhook Z-API:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Scheduled handler para notificações automáticas de agendamentos
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processarNotificacoesAgendamentos(env));
  },
};

async function processarNotificacoesAgendamentos(env: Bindings): Promise<void> {
  try {
    console.log('🔔 Iniciando processamento de notificações de agendamentos...');
    
    const hoje = new Date().toISOString().split('T')[0];
    console.log(`📅 Buscando agendamentos para: ${hoje}`);
    
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
    
    console.log(`📋 Encontrados ${agendamentos.length} agendamentos para notificar`);
    
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
          mensagem += `💰 R$ ${ag.valor.toFixed(2)}\n`;
          mensagem += `📅 ${new Date(ag.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR')}\n`;
          mensagem += `📝 ${ag.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento'}\n\n`;
          if (ag.recorrente === 1 && ag.parcelaAtual && ag.totalParcelas) {
            mensagem += `📊 Parcela ${ag.parcelaAtual} de ${ag.totalParcelas}\n\n`;
          }
        } else {
          mensagem += `Você tem ${ags.length} agendamentos hoje:\n\n`;
          ags.forEach((ag, index) => {
            mensagem += `${index + 1}. *${ag.descricao}*\n`;
            mensagem += `   💰 R$ ${ag.valor.toFixed(2)}\n`;
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
          console.log('⚠️ Twilio não implementado para notificações automáticas');
        }
        
        // Marca como notificado
        for (const ag of ags) {
          await env.financezap_db
            .prepare('UPDATE agendamentos SET notificado = 1 WHERE id = ?')
            .bind(ag.id)
            .run();
        }
        
        console.log(`✅ Notificação enviada para ${telefone} (${ags.length} agendamento(s))`);
      } catch (error: any) {
        console.error(`❌ Erro ao enviar notificação para ${telefone}:`, error);
      }
    }
    
    console.log('✅ Processamento de notificações concluído');
  } catch (error: any) {
    console.error('❌ Erro ao processar notificações de agendamentos:', error);
  }
}
