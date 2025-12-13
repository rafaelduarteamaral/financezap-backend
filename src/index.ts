// IMPORTANTE: Carrega variáveis de ambiente ANTES de qualquer import que use process.env
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import twilio from 'twilio';
import path from 'path';
import { processarMensagemComIA } from './processadorIA';
import { processarChatFinanceiro } from './chatIA';
import { processarAgendamentoComIA } from './processadorAgendamento';
import { processarAudioTwilio, processarAudioPublico } from './transcricaoAudio';
import { verificarRateLimit } from './rateLimiter';
import { 
  detectarIntencao,
  type IntencaoUsuario 
} from './deteccaoIntencao';
import {
  obterContextoConversacao,
  adicionarMensagemContexto,
  formatarHistoricoParaPrompt,
  limparContextoConversacao
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
  calcularSaldoPorCarteira,
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
  salvarTransacao, 
  buscarTransacoesPorTelefone, 
  buscarTodasTransacoes, 
  calcularTotalPorTelefone, 
  buscarTransacoesComFiltros,
  obterEstatisticas,
  obterEstatisticasCredito,
  gastosPorDia,
  gastosPorDiaCredito,
  listarTelefones,
  registrarNumero,
  numeroEstaRegistrado,
  buscarTransacaoPorId,
  removerTransacao,
  excluirTodosDadosUsuario,
  Transacao,
  prisma
} from './database';
import { gerarToken, verificarToken, autenticarMiddleware } from './auth';
import { gerarCodigoVerificacao, salvarCodigoVerificacao, verificarCodigo } from './codigoVerificacao';
import { enviarMensagemZApi, enviarMensagemComBotoesZApi, enviarListaOpcoesZApi, zapiEstaConfigurada, verificarStatusInstancia } from './zapi';
import {
  criarAgendamento,
  criarAgendamentosRecorrentes,
  buscarAgendamentosPorTelefone,
  buscarAgendamentoPorId,
  atualizarStatusAgendamento,
  atualizarAgendamento,
  removerAgendamento,
  buscarAgendamentosDoDia,
  marcarComoNotificado,
} from './agendamentos';
import {
  buscarCarteirasPorTelefone,
  buscarCarteiraPorId,
  buscarCarteiraPadrao,
  criarCarteira,
  buscarOuCriarCarteiraPorTipo,
  atualizarCarteira,
  removerCarteira,
  definirCarteiraPadrao,
} from './carteiras';
import {
  inicializarCategoriasPadrao,
  buscarCategorias,
  criarCategoria,
  atualizarCategoria,
  removerCategoria,
} from './categorias';
import {
  sanitizarEntrada,
  validarPermissaoDados,
  validarTelefone,
  validarValor,
  validarData,
  sanitizarParaLog,
} from './security';

const app = express();
const PORT = process.env.PORT || 3000;

// Armazena mensagens recebidas em memória
interface MensagemRecebida {
  id: string;
  numero: string;
  mensagem: string;
  dataHora: string;
  messageSid: string;
}

const mensagensRecebidas: MensagemRecebida[] = [];
const clientesSSE: any[] = []; // Clientes conectados via Server-Sent Events

// Inicializa o cliente Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

// Verifica se pelo menos um serviço de envio está configurado
const zapiConfigurada = zapiEstaConfigurada();

if (!accountSid || !authToken) {
  if (!zapiConfigurada) {
    console.error('❌ Erro: Nenhum serviço de envio configurado!');
    console.error('');
    console.error('📌 Configure pelo menos UMA das opções:');
    console.error('');
    console.error('1️⃣  Twilio:');
    console.error('   - TWILIO_ACCOUNT_SID=seu_account_sid');
    console.error('   - TWILIO_AUTH_TOKEN=seu_auth_token');
    console.error('   - TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886');
    console.error('');
    console.error('2️⃣  Z-API:');
    console.error('   - ZAPI_INSTANCE_ID=seu_instance_id');
    console.error('   - ZAPI_TOKEN=seu_token');
    console.error('   - ZAPI_BASE_URL=https://api.z-api.io (opcional)');
    console.error('');
    process.exit(1);
  } else {
    console.log('⚠️  Twilio não configurado, usando Z-API');
  }
} else {
  if (!twilioWhatsAppNumber) {
    console.error('❌ Erro: TWILIO_WHATSAPP_NUMBER deve estar configurado no .env');
    console.error('💡 Para encontrar seu número do WhatsApp Sandbox:');
    console.error('   1. Acesse: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
    console.error('   2. Copie o número do WhatsApp Sandbox (formato: whatsapp:+14155238886)');
    console.error('   3. Adicione no .env: TWILIO_WHATSAPP_NUMBER=whatsapp:+SEU_NUMERO');
    if (!zapiConfigurada) {
      process.exit(1);
    } else {
      console.log('⚠️  Usando Z-API como alternativa');
    }
  }
}

if (zapiConfigurada && process.env.NODE_ENV !== 'test') {
  console.log('✅ Z-API configurada e disponível');
  // Verifica status da instância ao iniciar (não bloqueia a inicialização)
  verificarStatusInstancia().then(status => {
    if (status.conectada) {
      console.log('✅ Instância Z-API está conectada ao WhatsApp');
    } else {
      console.log('⚠️  Instância Z-API não está conectada:', status.erro);
      console.log('💡 Acesse o painel da Z-API e conecte a instância escaneando o QR code');
    }
  }).catch(() => {
    // Ignora erros na verificação inicial
  });
}

// Valida se pelo menos uma IA está configurada
const groqApiKey = process.env.GROQ_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const temGroq = groqApiKey && groqApiKey.trim() !== '';
const temGemini = geminiApiKey && geminiApiKey.trim() !== '';

if (!temGroq && !temGemini) {
  console.error('❌ Erro: Pelo menos uma API de IA deve estar configurada no .env');
  console.error('');
  console.error('🔧 Opções disponíveis:');
  console.error('');
  console.error('📌 Opção 1 - Groq (gratuito):');
  console.error('   1. Acesse: https://console.groq.com/');
  console.error('   2. Crie uma conta gratuita');
  console.error('   3. Vá em: https://console.groq.com/keys');
  console.error('   4. Crie uma API key');
  console.error('   5. Adicione no .env: GROQ_API_KEY=sua_chave_aqui');
  console.error('');
  console.error('📌 Opção 2 - Google Gemini (gratuito):');
  console.error('   1. Acesse: https://makersuite.google.com/app/apikey');
  console.error('   2. Faça login com sua conta Google');
  console.error('   3. Clique em "Create API Key"');
  console.error('   4. Copie a chave gerada');
  console.error('   5. Adicione no .env: GEMINI_API_KEY=sua_chave_aqui');
  console.error('');
  process.exit(1);
} else {
  if (temGroq) console.log('✅ GROQ_API_KEY configurada - Groq ativado!');
  if (temGemini) console.log('✅ GEMINI_API_KEY configurada - Gemini ativado!');
}

const client = twilio(accountSid, authToken);

// Número do WhatsApp de destino (formato: whatsapp:+556181474690)
const YOUR_WHATSAPP_NUMBER = 'whatsapp:+556181474690'; // Exatamente como no exemplo

// Middleware de segurança - sanitização de entrada
app.use(sanitizarEntrada);

// Middleware para parsing de dados
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// CORS - Configuração de segurança
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'];

// Função para verificar se uma origem é permitida (suporta wildcards)
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  
  // Verifica correspondência exata
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
  // Verifica wildcards (ex: *.pages.dev)
  for (const allowed of allowedOrigins) {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(origin)) {
        return true;
      }
    }
  }
  
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware CORS removido - já configurado acima com segurança

// Servir arquivos estáticos (para a interface web antiga - manter compatibilidade)
app.use(express.static(path.join(process.cwd(), 'public')));

// Middleware para log de todas as requisições (debug)
app.use((req, res, next) => {
  // Log de TODAS as requisições para debug
  console.log(`\n🌐 ${req.method} ${req.path}`);
  if (req.path === '/webhook/whatsapp') {
    console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`   Query:`, JSON.stringify(req.query, null, 2));
  }
  next();
});

// Função para notificar todos os clientes conectados
function notificarClientes(mensagem: MensagemRecebida) {
  clientesSSE.forEach((cliente) => {
    try {
      cliente.write(`data: ${JSON.stringify(mensagem)}\n\n`);
    } catch (error) {
      // Remove cliente se houver erro
      const index = clientesSSE.indexOf(cliente);
      if (index > -1) {
        clientesSSE.splice(index, 1);
      }
    }
  });
}

// Rota para receber webhooks do Twilio WhatsApp
app.post('/webhook/whatsapp', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🔔 WEBHOOK RECEBIDO DO TWILIO!');
  console.log('='.repeat(60));
  console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('🔗 URL:', req.url);
  console.log('📝 Method:', req.method);
  console.log('');
  
  const twiml = new twilio.twiml.MessagingResponse();
  
  // Extrai informações da mensagem recebida
  let messageBody = req.body.Body || '';
  const fromNumber = req.body.From || '';
  const toNumber = req.body.To || '';
  const messageSid = req.body.MessageSid || '';
  const numMedia = req.body.NumMedia || '0';
  const mediaUrls: string[] = [];
  const mediaTypes: string[] = [];
  
  // Remove o prefixo "whatsapp:" do número se existir (precisa para rate limit)
  const cleanFromNumber = fromNumber.replace('whatsapp:', '');
  
  // Extrai URLs de mídia e tipos se houver
  if (parseInt(numMedia) > 0) {
    for (let i = 0; i < parseInt(numMedia); i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const mediaType = req.body[`MediaContentType${i}`] || '';
      if (mediaUrl) {
        mediaUrls.push(mediaUrl);
        mediaTypes.push(mediaType);
      }
    }
  }
  
  // Verifica rate limiting ANTES de processar (incluindo áudio que é caro)
  const mensagemParaVerificacao = messageBody || (mediaUrls.length > 0 ? `[Mídia: ${mediaUrls.length} arquivo(s)]` : '');
  const rateLimitCheck = verificarRateLimit(cleanFromNumber, messageSid, mensagemParaVerificacao);
  
  if (!rateLimitCheck.permitido) {
    console.log(`🚫 Mensagem bloqueada por rate limit: ${rateLimitCheck.motivo}`);
    twiml.message(rateLimitCheck.motivo || 'Muitas mensagens enviadas. Aguarde um momento.');
    res.type('text/xml');
    return res.send(twiml.toString());
  }
  
  // Processa áudio se houver (só se passou no rate limit)
  let textoTranscrito = '';
  if (mediaUrls.length > 0 && accountSid && authToken) {
    console.log(`📎 ${mediaUrls.length} arquivo(s) de mídia detectado(s)`);
    
    for (let i = 0; i < mediaUrls.length; i++) {
      const mediaType = mediaTypes[i] || '';
      const mediaUrl = mediaUrls[i];
      
      console.log(`   📎 Mídia ${i + 1}:`);
      console.log(`      URL: ${mediaUrl}`);
      console.log(`      Tipo: ${mediaType || 'não especificado'}`);
      
      // Verifica se é áudio (múltiplas formas de detecção)
      const isAudio = 
        mediaType.startsWith('audio/') || 
        mediaType.includes('ogg') || 
        mediaType.includes('opus') || 
        mediaType.includes('m4a') ||
        mediaType.includes('mp3') ||
        mediaType.includes('wav') ||
        mediaType.includes('webm') ||
        mediaUrl.toLowerCase().includes('audio') ||
        mediaUrl.toLowerCase().includes('voice') ||
        mediaUrl.toLowerCase().includes('.ogg') ||
        mediaUrl.toLowerCase().includes('.opus') ||
        mediaUrl.toLowerCase().includes('.m4a');
      
      if (isAudio) {
        try {
          console.log('🎤 Áudio detectado! Iniciando transcrição...');
          console.log(`   📥 Baixando áudio de: ${mediaUrl}`);
          console.log(`   🎵 Tipo detectado: ${mediaType}`);
          
          textoTranscrito = await processarAudioTwilio(mediaUrl, accountSid, authToken, 'pt-BR');
          
          if (textoTranscrito && textoTranscrito.trim().length > 0) {
            console.log(`✅ Áudio transcrito com sucesso: "${textoTranscrito}"`);
            messageBody = textoTranscrito; // Usa o texto transcrito como mensagem
            break; // Para após processar o primeiro áudio
          } else {
            console.log('⚠️  Transcrição vazia ou não encontrada');
            twiml.message('Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!');
            res.type('text/xml');
            return res.send(twiml.toString());
          }
        } catch (error: any) {
          console.error('❌ Erro ao processar áudio:', error.message);
          console.error('   Stack:', error.stack);
          
          // Mensagem amigável em caso de erro
          twiml.message('Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!');
          res.type('text/xml');
          return res.send(twiml.toString());
        }
      } else {
        console.log(`   ℹ️  Não é áudio (tipo: ${mediaType}), pulando...`);
      }
    }
  } else if (mediaUrls.length > 0) {
    console.log('⚠️  Mídia detectada mas não há credenciais do Twilio configuradas para baixar');
  }
  
  const cleanToNumber = toNumber.replace('whatsapp:', '');
  
  // Cria objeto da mensagem (usa texto transcrito se houver áudio)
  const mensagem: MensagemRecebida = {
    id: messageSid || Date.now().toString(),
    numero: cleanFromNumber,
    mensagem: messageBody || (mediaUrls.length > 0 ? `[Mídia: ${mediaUrls.length} arquivo(s)]` : ''),
    dataHora: new Date().toLocaleString('pt-BR'),
    messageSid: messageSid
  };
  
  // Se foi transcrito de áudio, adiciona informação
  if (textoTranscrito) {
    (mensagem as any).transcritoDeAudio = true;
  }
  
  // Adiciona informações de mídia se houver
  if (mediaUrls.length > 0) {
    (mensagem as any).mediaUrls = mediaUrls;
  }
  
  // Adiciona à lista de mensagens
  mensagensRecebidas.unshift(mensagem); // Adiciona no início
  if (mensagensRecebidas.length > 100) {
    mensagensRecebidas.pop(); // Mantém apenas as últimas 100
  }
  
  // Processa a mensagem para extrair transações financeiras usando IA (obrigatório)
  if (messageBody && messageBody.trim().length > 0) {
    console.log('🤖 Processando mensagem com IA para extrair transações...');
    
    try {
      const transacoesExtraidas = await processarMensagemComIA(messageBody);
      
      if (transacoesExtraidas.length > 0) {
      console.log(`✅ ${transacoesExtraidas.length} transação(ões) encontrada(s)!`);
      
      // Salva cada transação no banco de dados
      for (const transacaoExtraida of transacoesExtraidas) {
        if (transacaoExtraida.sucesso) {
          try {
            // Extrai a data atual (apenas data, sem hora)
            const dataAtual = new Date().toISOString().split('T')[0];
            
            // Garante que o tipo seja 'entrada' ou 'saida'
            const tipoFinal = (transacaoExtraida.tipo && transacaoExtraida.tipo.toLowerCase().trim() === 'entrada') 
              ? 'entrada' 
              : 'saida';
            
            // Busca carteira mencionada ou usa a padrão
            let carteiraId: number | null = null;
            if (transacaoExtraida.carteiraNome) {
              // Busca carteira pelo nome (case-insensitive)
              const carteiras = await buscarCarteirasPorTelefone(cleanFromNumber);
              const carteiraEncontrada = carteiras.find(
                c => c.nome.toLowerCase().includes(transacaoExtraida.carteiraNome!.toLowerCase()) ||
                     transacaoExtraida.carteiraNome!.toLowerCase().includes(c.nome.toLowerCase())
              );
              if (carteiraEncontrada) {
                carteiraId = carteiraEncontrada.id;
              }
            }
            
            // Se não encontrou carteira mencionada, usa a padrão
            if (!carteiraId) {
              const carteiraPadrao = await buscarCarteiraPadrao(cleanFromNumber);
              if (carteiraPadrao) {
                carteiraId = carteiraPadrao.id;
              }
            }
            
            const transacao: Transacao = {
              telefone: cleanFromNumber,
              descricao: transacaoExtraida.descricao,
              valor: transacaoExtraida.valor,
              categoria: transacaoExtraida.categoria || 'outros',
              tipo: tipoFinal,
              metodo: transacaoExtraida.metodo || 'debito',
              dataHora: mensagem.dataHora,
              data: dataAtual,
              mensagemOriginal: textoTranscrito ? `[Áudio transcrito] ${messageBody}` : messageBody,
              carteiraId: carteiraId,
            };
            
            // Log do tipo antes de salvar
            console.log(`   🔍 Tipo extraído pela IA: "${transacaoExtraida.tipo}" -> Tipo final: "${tipoFinal}" (será salvo como: "${transacao.tipo}")`);
            
            const id = await salvarTransacao(transacao);
            console.log(`   💾 Transação salva (ID: ${id}):`);
            console.log(`      📝 Descrição: ${transacaoExtraida.descricao}`);
            console.log(`      💰 Valor: R$ ${transacaoExtraida.valor.toFixed(2)}`);
            console.log(`      🏷️  Categoria: ${transacaoExtraida.categoria}`);
            console.log(`      📊 Tipo: ${transacao.tipo} (${transacao.tipo === 'entrada' ? 'Entrada' : 'Saída'})`);
            console.log(`      💳 Método: ${transacao.metodo}`);
            console.log(`      📅 Data: ${dataAtual}`);
          } catch (error) {
            console.error('   ❌ Erro ao salvar transação:', error);
          }
        }
      }
      
      // Formata mensagem com informações completas usando o formatador
      const transacoesSalvas: Array<{
        descricao: string;
        valor: number;
        categoria: string;
        tipo: 'entrada' | 'saida';
        metodo: 'credito' | 'debito';
        carteiraNome?: string;
        data: string;
        id?: number;
      }> = [];
      const idsSalvos: number[] = [];
      
      // Coleta dados das transações salvas
      for (const transacaoExtraida of transacoesExtraidas) {
        if (transacaoExtraida.sucesso) {
          try {
            const tipoFinal = (transacaoExtraida.tipo && transacaoExtraida.tipo.toLowerCase().trim() === 'entrada') 
              ? 'entrada' 
              : 'saida';
            
            // Busca carteira mencionada ou usa a padrão
            let carteiraId: number | null = null;
            let carteiraNome: string | undefined = undefined;
            
            if (transacaoExtraida.carteiraNome) {
              const carteiras = await buscarCarteirasPorTelefone(cleanFromNumber);
              const carteiraEncontrada = carteiras.find(
                c => c.nome.toLowerCase().includes(transacaoExtraida.carteiraNome!.toLowerCase()) ||
                     transacaoExtraida.carteiraNome!.toLowerCase().includes(c.nome.toLowerCase())
              );
              if (carteiraEncontrada) {
                carteiraId = carteiraEncontrada.id;
                carteiraNome = carteiraEncontrada.nome;
              }
            }
            
            // Se não encontrou carteira mencionada, usa a padrão
            if (!carteiraId) {
              const carteiraPadrao = await buscarCarteiraPadrao(cleanFromNumber);
              if (carteiraPadrao) {
                carteiraId = carteiraPadrao.id;
                carteiraNome = carteiraPadrao.nome;
              }
            }
            
            const dataAtual = new Date().toISOString().split('T')[0];
            
            const transacao: Transacao = {
              telefone: cleanFromNumber,
              descricao: transacaoExtraida.descricao,
              valor: transacaoExtraida.valor,
              categoria: transacaoExtraida.categoria || 'outros',
              tipo: tipoFinal,
              metodo: transacaoExtraida.metodo || 'debito',
              dataHora: mensagem.dataHora,
              data: dataAtual,
              mensagemOriginal: textoTranscrito ? `[Áudio transcrito] ${messageBody}` : messageBody,
              carteiraId: carteiraId,
            };
            
            const id = await salvarTransacao(transacao);
            idsSalvos.push(id);
            
            transacoesSalvas.push({
              descricao: transacaoExtraida.descricao,
              valor: transacaoExtraida.valor,
              categoria: transacaoExtraida.categoria || 'outros',
              tipo: tipoFinal,
              metodo: (transacaoExtraida.metodo || 'debito') as 'credito' | 'debito',
              carteiraNome: carteiraNome,
              data: dataAtual,
              id: id
            });
          } catch (error) {
            console.error('   ❌ Erro ao salvar transação:', error);
          }
        }
      }
      
      // Formata resposta usando o formatador
      let resposta = '';
      if (transacoesSalvas.length === 1) {
        resposta = formatarMensagemTransacao(transacoesSalvas[0]);
      } else if (transacoesSalvas.length > 1) {
        resposta = formatarMensagemMultiplasTransacoes(transacoesSalvas);
      }
      
      twiml.message(resposta);
      } else {
        console.log('ℹ️  Nenhuma transação financeira encontrada na mensagem');
        twiml.message('Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!');
      }
    } catch (error: any) {
      console.error('❌ Erro ao processar mensagem com IA:', error.message);
      twiml.message('Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!');
    }
  }
  
  // Notifica clientes conectados
  notificarClientes(mensagem);
  
  // Exibe no console.log conforme solicitado
  console.log('='.repeat(50));
  console.log('📱 Nova mensagem recebida!');
  console.log('='.repeat(50));
  console.log(`📞 Número de telefone: ${cleanFromNumber}`);
  if (messageBody) {
    console.log(`💬 Mensagem: ${messageBody}`);
  }
  if (mediaUrls.length > 0) {
    console.log(`🖼️  Mídia: ${mediaUrls.length} arquivo(s)`);
    mediaUrls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
  }
  console.log(`📥 Para: ${cleanToNumber}`);
  console.log(`🆔 Message SID: ${messageSid}`);
  console.log(`⏰ Data/Hora: ${mensagem.dataHora}`);
  console.log('='.repeat(50));
  console.log('');
  
  // Envia resposta para o Twilio
  res.type('text/xml');
  res.send(twiml.toString());
});

// Rota para receber webhooks da Z-API
app.post('/webhook/zapi', express.json(), async (req: express.Request, res: express.Response) => {
  console.log('\n' + '='.repeat(60));
  console.log('🔔 WEBHOOK RECEBIDO DA Z-API!');
  console.log('='.repeat(60));
  console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('');
  
  try {
    // Z-API envia mensagens no formato JSON
    // Formato: { text: { message: "..." }, phone: "...", participantPhone: "...", isGroup: true/false }
    const body = req.body;
    
    // Verifica se é uma seleção de lista de opções
    const selectedOptionId = body.selectedOptionId || body.optionList?.selectedOptionId || body.interactive?.list_reply?.id;
    const selectedOptionTitle = body.selectedOptionTitle || body.optionList?.selectedOptionTitle || body.interactive?.list_reply?.title;
    
    if (selectedOptionId) {
      console.log('📋 Opção selecionada da lista!');
      console.log(`   Selected Option ID: ${selectedOptionId}`);
      console.log(`   Selected Option Title: ${selectedOptionTitle}`);
      
      // Para grupos, usa participantPhone; para mensagens diretas, usa phone
      const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
      
      if (!phoneNumber) {
        console.log('⚠️  Webhook da Z-API sem phone');
        return res.status(400).json({ success: false, error: 'phone é obrigatório' });
      }
      
      const fromNumber = phoneNumber.startsWith('55') ? `whatsapp:+${phoneNumber}` : `whatsapp:+55${phoneNumber}`;
      const cleanFromNumber = fromNumber.replace('whatsapp:', '');
      
      // Processa exclusão de transação
      if (selectedOptionId.startsWith('excluir_')) {
        const transacaoId = parseInt(selectedOptionId.replace('excluir_', ''));
        console.log(`🗑️ Processando exclusão da transação ${transacaoId}`);
        
        try {
          // Verifica se a transação pertence ao usuário
          const transacao = await buscarTransacaoPorId(transacaoId);
          
          if (!transacao) {
            const resposta = '❌ Transação não encontrada.';
            await enviarMensagemZApi(fromNumber, resposta);
            return res.json({ success: false, message: 'Transação não encontrada' });
          }
          
          // Verifica se o telefone corresponde
          const telefoneTransacao = transacao.telefone.replace('whatsapp:', '').replace('+', '');
          const telefoneUsuario = cleanFromNumber.replace('whatsapp:', '').replace('+', '');
          
          if (telefoneTransacao !== telefoneUsuario) {
            const resposta = '❌ Você não tem permissão para excluir esta transação.';
            await enviarMensagemZApi(fromNumber, resposta);
            return res.json({ success: false, message: 'Permissão negada' });
          }
          
          // Remove a transação
          await removerTransacao(transacaoId);
          
          const { gerarIdentificadorTransacao } = await import('./formatadorTransacoes');
          const identificador = gerarIdentificadorTransacao(transacaoId);
          
          const resposta = `✅ *Transação Excluída Com Sucesso!*\n\n` +
            `🆔 Identificador: ${identificador}\n` +
            `📄 Descrição: ${transacao.descricao}\n` +
            `💰 Valor: ${formatarMoeda(transacao.valor)}\n\n` +
            `A transação foi removida permanentemente.`;
          
          await enviarMensagemZApi(fromNumber, resposta);
          await adicionarMensagemContexto(cleanFromNumber, 'assistant', resposta);
          
          return res.json({ success: true, message: 'Transação excluída com sucesso' });
        } catch (error: any) {
          console.error('❌ Erro ao processar exclusão via lista:', error);
          const resposta = `❌ Erro ao excluir transação: ${error.message}`;
          await enviarMensagemZApi(fromNumber, resposta);
          return res.json({ success: false, message: 'Erro ao excluir transação' });
        }
      }
      
      return res.json({ success: true, message: 'Opção processada' });
    }
    
    // Verifica se é um clique em botão interativo
    const buttonId = body.buttonId || body.button?.id || body.interactive?.button_reply?.id;
    const buttonText = body.buttonText || body.button?.text || body.interactive?.button_reply?.title;
    
    if (buttonId) {
      console.log('🔘 Botão clicado detectado!');
      console.log(`   Button ID: ${buttonId}`);
      console.log(`   Button Text: ${buttonText}`);
      
      // Para grupos, usa participantPhone; para mensagens diretas, usa phone
      const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
      
      if (!phoneNumber) {
        console.log('⚠️  Webhook da Z-API sem phone');
        return res.status(400).json({ success: false, error: 'phone é obrigatório' });
      }
      
      const fromNumber = phoneNumber.startsWith('55') ? `whatsapp:+${phoneNumber}` : `whatsapp:+55${phoneNumber}`;
      const cleanFromNumber = fromNumber.replace('whatsapp:', '');
      
      // Processa ação do botão
      if (buttonId.startsWith('pagar_')) {
        const agendamentoId = parseInt(buttonId.replace('pagar_', ''));
        console.log(`💰 Processando pagamento do agendamento ${agendamentoId}`);
        
        try {
          // Busca o agendamento
          const agendamento = await buscarAgendamentosPorTelefone(cleanFromNumber);
          const agendamentoEncontrado = agendamento.find(a => a.id === agendamentoId);
          
          if (agendamentoEncontrado && agendamentoEncontrado.status === 'pendente') {
            // Marca como pago
            await atualizarStatusAgendamento(agendamentoId, 'pago');
            
            // Cria transação automaticamente
            const agora = new Date();
            await salvarTransacao({
              telefone: cleanFromNumber,
              descricao: agendamentoEncontrado.descricao,
              valor: agendamentoEncontrado.valor,
              categoria: agendamentoEncontrado.categoria || 'outros',
              tipo: agendamentoEncontrado.tipo === 'pagamento' ? 'saida' : 'entrada',
              metodo: 'debito',
              dataHora: agora.toISOString(),
              data: agora.toISOString().split('T')[0],
            });
            
            const resposta = `✅ Agendamento marcado como pago!\n\n` +
              `📝 ${agendamentoEncontrado.descricao}\n` +
              `💰 R$ ${agendamentoEncontrado.valor.toFixed(2)}\n` +
              `📅 ${new Date(agendamentoEncontrado.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR')}\n\n` +
              `A transação foi registrada automaticamente.`;
            
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, resposta);
            } else if (twilioWhatsAppNumber) {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: resposta
              });
            }
          } else {
            const resposta = `❌ Agendamento não encontrado ou já foi pago.`;
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, resposta);
            }
          }
        } catch (error: any) {
          console.error('❌ Erro ao processar pagamento via botão:', error);
          const resposta = `❌ Erro ao processar pagamento: ${error.message}`;
          if (zapiEstaConfigurada()) {
            await enviarMensagemZApi(fromNumber, resposta);
          }
        }
        
        return res.json({ success: true, message: 'Botão processado' });
      } else if (buttonId === 'ver_todos') {
        // Reenvia lista completa
        const todosAgendamentos = await buscarAgendamentosPorTelefone(cleanFromNumber);
        const pendentes = todosAgendamentos.filter(a => a.status === 'pendente');
        
        let resposta = `📋 *Todos os Agendamentos Pendentes:*\n\n`;
        pendentes.forEach((ag, index) => {
          const dataFormatada = new Date(ag.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
          const tipoTexto = ag.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento';
          resposta += `${index + 1}. *${ag.descricao}*\n`;
          resposta += `   💰 R$ ${ag.valor.toFixed(2)}\n`;
          resposta += `   📅 ${dataFormatada}\n`;
          resposta += `   📋 ${tipoTexto}\n`;
          resposta += `   🆔 ID: ${ag.id}\n\n`;
        });
        
        if (zapiEstaConfigurada()) {
          await enviarMensagemZApi(fromNumber, resposta);
        }
        
        return res.json({ success: true, message: 'Lista completa enviada' });
      } else if (buttonId === 'novo_agendamento') {
        const resposta = `💡 Para criar um novo agendamento, envie uma mensagem como:\n\n` +
          `"Agende um boleto de luz de 200 reais para o dia 25"\n\n` +
          `ou\n\n` +
          `"Agende recebimento de salário de 5000 reais para dia 5"`;
        
        if (zapiEstaConfigurada()) {
          await enviarMensagemZApi(fromNumber, resposta);
        }
        
        return res.json({ success: true, message: 'Instruções enviadas' });
      }
    }
    
    // Extrai o texto da mensagem (pode estar em text.message ou message)
    let messageText = body.text?.message || body.message?.text || body.message || '';
    
    // Verifica se há mídia (áudio, imagem, etc.)
    // Z-API usa audio.audioUrl e audio.mimeType
    const mediaUrl = body.mediaUrl || body.media?.url || body.audio?.audioUrl || body.audio?.url || body.voice?.url || body.voice?.audioUrl;
    const mediaType = body.mediaType || body.media?.type || body.audio?.mimeType || body.audio?.type || body.voice?.type || body.voice?.mimeType || '';
    
    // Para grupos, usa participantPhone; para mensagens diretas, usa phone
    const phoneNumber = body.isGroup ? body.participantPhone : body.phone;
    
    if (!phoneNumber) {
      console.log('⚠️  Webhook da Z-API sem phone');
      console.log('   Body recebido:', JSON.stringify(body, null, 2));
      return res.status(400).json({ success: false, error: 'phone é obrigatório' });
    }
    
    // Formata o número ANTES de processar áudio (para usar em mensagens de erro)
    const fromNumber = phoneNumber.startsWith('55') ? `whatsapp:+${phoneNumber}` : `whatsapp:+55${phoneNumber}`;
    
    // Processa áudio se houver (verifica também se existe objeto audio no body)
    const temAudio = body.audio && (body.audio.audioUrl || body.audio.url);
    const audioUrlFinal = temAudio ? (body.audio.audioUrl || body.audio.url) : mediaUrl;
    const audioTypeFinal = temAudio ? (body.audio.mimeType || body.audio.type || 'audio/ogg') : mediaType;
    
    if (temAudio || (mediaUrl && (mediaType.startsWith('audio/') || mediaType.startsWith('voice/') || mediaUrl.includes('audio') || mediaUrl.includes('voice')))) {
      try {
        console.log('🎤 Áudio detectado no webhook Z-API! Transcrevendo...');
        console.log(`   Audio URL: ${audioUrlFinal}`);
        console.log(`   Audio Type: ${audioTypeFinal}`);
        console.log(`   Body.audio completo:`, JSON.stringify(body.audio, null, 2));
        
        if (!audioUrlFinal) {
          console.error('❌ URL do áudio não encontrada');
          return res.json({ 
            success: false, 
            error: 'URL do áudio não encontrada no webhook' 
          });
        }
        
        const textoTranscrito = await processarAudioPublico(audioUrlFinal, 'pt-BR');
        
        if (textoTranscrito && textoTranscrito.trim().length > 0) {
          console.log(`✅ Áudio transcrito: "${textoTranscrito}"`);
          messageText = textoTranscrito; // Usa o texto transcrito como mensagem
        } else {
          console.log('⚠️  Transcrição vazia ou não encontrada');
          const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
          
          // Envia mensagem amigável via WhatsApp
          try {
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, mensagemAmigavel);
            } else if (twilioWhatsAppNumber) {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: mensagemAmigavel
              });
            }
          } catch (envioError: any) {
            console.error('❌ Erro ao enviar mensagem amigável:', envioError.message);
          }
          
          return res.json({ 
            success: false, 
            error: 'Transcrição vazia' 
          });
        }
      } catch (error: any) {
        console.error('❌ Erro ao processar áudio da Z-API:', error.message);
        const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
        
        // Envia mensagem amigável via WhatsApp
        try {
          if (zapiEstaConfigurada()) {
            await enviarMensagemZApi(fromNumber, mensagemAmigavel);
          } else if (twilioWhatsAppNumber) {
            await client.messages.create({
              from: twilioWhatsAppNumber,
              to: fromNumber,
              body: mensagemAmigavel
            });
          }
        } catch (envioError: any) {
          console.error('❌ Erro ao enviar mensagem amigável:', envioError.message);
        }
        
        return res.json({ 
          success: false, 
          error: 'Erro ao processar áudio' 
        });
      }
    }
    
    if (!messageText || messageText.trim().length === 0) {
      console.log('⚠️  Webhook da Z-API sem message ou mídia processável');
      console.log('   Body recebido:', JSON.stringify(body, null, 2));
      return res.status(400).json({ success: false, error: 'message ou mídia são obrigatórios' });
    }
    
    // Ignora mensagens de grupos por enquanto (ou processa se necessário)
    if (body.isGroup) {
      console.log('ℹ️  Mensagem de grupo ignorada:', body.chatName);
      return res.json({ success: true, message: 'Mensagem de grupo ignorada' });
    }
    
    // fromNumber já foi declarado acima, apenas limpa para usar no banco
    const cleanFromNumber = fromNumber.replace('whatsapp:', '');
    
    console.log(`📱 Mensagem recebida de: ${fromNumber}`);
    console.log(`💬 Texto: ${messageText}`);
    
    // Verifica rate limiting
    const messageSid = `zapi-${Date.now()}`;
    const rateLimitCheck = verificarRateLimit(cleanFromNumber, messageSid, messageText);
    
    if (!rateLimitCheck.permitido) {
      console.log(`🚫 Mensagem bloqueada por rate limit: ${rateLimitCheck.motivo}`);
      return res.status(429).json({ 
        success: false, 
        error: rateLimitCheck.motivo || 'Muitas mensagens enviadas. Aguarde um momento.' 
      });
    }
    
    // Registra o número se ainda não estiver registrado
    if (!(await numeroEstaRegistrado(fromNumber))) {
      await registrarNumero(fromNumber);
      console.log(`✅ Número ${fromNumber} registrado pela primeira vez`);
    }
    
    // Cria objeto da mensagem
    const mensagem: MensagemRecebida = {
      id: messageSid,
      numero: cleanFromNumber,
      mensagem: messageText,
      dataHora: new Date().toLocaleString('pt-BR'),
      messageSid: messageSid
    };
    
    // Processa a mensagem para extrair transações financeiras ou agendamentos usando IA
    if (messageText && messageText.trim().length > 0) {
      console.log('🤖 Processando mensagem com IA...');
      
      // MELHORIA: Adiciona feedback visual (envia mensagem de processamento)
      try {
        if (zapiEstaConfigurada()) {
          // Envia indicador de digitação se possível, ou mensagem rápida
          await enviarMensagemZApi(fromNumber, '🤖 Processando sua mensagem...');
        }
      } catch (e) {
        // Ignora erro de feedback visual
      }
      
      try {
        const mensagemLower = messageText.toLowerCase().trim();
        const telefoneAgendamento = cleanFromNumber.startsWith('whatsapp:') 
          ? cleanFromNumber.replace('whatsapp:', '') 
          : cleanFromNumber;
        
        // MELHORIA: Obtém contexto de conversação
        const contexto = await obterContextoConversacao(cleanFromNumber);
        
        // MELHORIA: Adiciona mensagem do usuário ao contexto
        await adicionarMensagemContexto(cleanFromNumber, 'user', messageText);
        
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
            const estatisticas = await obterEstatisticas({ telefone: cleanFromNumber });
            respostaComando = `📊 *Resumo do Dia*\n\n` +
              `💸 Gasto hoje: ${formatarMoeda(estatisticas.gastoHoje || 0)}\n` +
              `📝 Transações: ${estatisticas.totalTransacoes || 0}`;
          } else if (comando === 'mes') {
            const estatisticas = await obterEstatisticas({ telefone: cleanFromNumber });
            respostaComando = formatarEstatisticasResumo(estatisticas);
          } else {
            respostaComando = `❓ Comando "${comando}" não reconhecido.\n\nDigite "/ajuda" para ver comandos disponíveis.`;
          }
          
          await adicionarMensagemContexto(cleanFromNumber, 'assistant', respostaComando);
          const mensagens = dividirMensagem(respostaComando);
          
          for (const msg of mensagens) {
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, msg);
            } else if (twilioWhatsAppNumber) {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: msg
              });
            }
          }
          
          return res.json({ success: true, message: 'Comando processado' });
        }
        
        // MELHORIA: Processa pedido de ajuda
        if (intencao.intencao === 'ajuda') {
          const respostaAjuda = criarMenuAjuda();
          await adicionarMensagemContexto(cleanFromNumber, 'assistant', respostaAjuda);
          const mensagens = dividirMensagem(respostaAjuda);
          
          for (const msg of mensagens) {
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, msg);
            } else if (twilioWhatsAppNumber) {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: msg
              });
            }
          }
          
          return res.json({ success: true, message: 'Ajuda enviada' });
        }
        
        // MELHORIA: Processa pedido de exclusão de transação
        if (intencao.intencao === 'exclusao') {
          console.log('🗑️ Solicitação de exclusão detectada!');
          
          // Busca transações recentes do usuário (últimas 10)
          const transacoesRecentes = await buscarTransacoesComFiltros({
            telefone: cleanFromNumber,
            limit: 10
          });
          
          if (transacoesRecentes.transacoes.length === 0) {
            const resposta = '❌ Você não tem transações para excluir.';
            await adicionarMensagemContexto(cleanFromNumber, 'assistant', resposta);
            
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, resposta);
            } else if (twilioWhatsAppNumber) {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: resposta
              });
            }
            
            return res.json({ success: true, message: 'Nenhuma transação encontrada' });
          }
          
          // Prepara lista de opções
          const { gerarIdentificadorTransacao } = await import('./formatadorTransacoes');
          const opcoes = transacoesRecentes.transacoes.map((t, index) => {
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
          if (zapiEstaConfigurada()) {
            const resultado = await enviarListaOpcoesZApi(
              fromNumber,
              mensagem,
              'Excluir Transação',
              'Ver Transações',
              opcoes
            );
            
            if (!resultado.success) {
              // Fallback: envia como mensagem normal com lista numerada
              let mensagemFallback = mensagem + '\n\n';
              transacoesRecentes.transacoes.forEach((t, index) => {
                const identificador = gerarIdentificadorTransacao(t.id);
                const tipoEmoji = t.tipo === 'entrada' ? '💰' : '🔴';
                const dataFormatada = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
                mensagemFallback += `${index + 1}. ${tipoEmoji} ${t.descricao} - ${formatarMoeda(t.valor)} (${dataFormatada})\n`;
                mensagemFallback += `   ID: ${identificador}\n\n`;
              });
              mensagemFallback += '💡 Digite "Excluir Transação [ID]" para excluir.';
              
              await enviarMensagemZApi(fromNumber, mensagemFallback);
            }
          } else if (twilioWhatsAppNumber) {
            // Twilio não suporta lista de opções, envia como mensagem normal
            let mensagemTwilio = mensagem + '\n\n';
            transacoesRecentes.transacoes.forEach((t, index) => {
              const identificador = gerarIdentificadorTransacao(t.id);
              const tipoEmoji = t.tipo === 'entrada' ? '💰' : '🔴';
              const dataFormatada = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
              mensagemTwilio += `${index + 1}. ${tipoEmoji} ${t.descricao} - ${formatarMoeda(t.valor)} (${dataFormatada})\n`;
              mensagemTwilio += `   ID: ${identificador}\n\n`;
            });
            mensagemTwilio += '💡 Digite "Excluir Transação [ID]" para excluir.';
            
            await client.messages.create({
              from: twilioWhatsAppNumber,
              to: fromNumber,
              body: mensagemTwilio
            });
          }
          
          await adicionarMensagemContexto(cleanFromNumber, 'assistant', mensagem);
          
          return res.json({ success: true, message: 'Lista de transações enviada' });
        }
        
        // MELHORIA: Processa pedido de saldo (saldo total e por carteira)
        if (intencao.intencao === 'saldo') {
          console.log('💰 Solicitação de saldo detectada!');
          
          const telefoneFormatado = cleanFromNumber.startsWith('whatsapp:') 
            ? cleanFromNumber 
            : cleanFromNumber.startsWith('+')
            ? `whatsapp:${cleanFromNumber}`
            : `whatsapp:+${cleanFromNumber}`;
          
          // Calcula saldo por carteira
          const saldoTotal = await calcularSaldoPorCarteira(telefoneFormatado);
          
          // Formata mensagem
          const resposta = formatarMensagemSaldo(saldoTotal);
          
          // Adiciona ao contexto
          await adicionarMensagemContexto(cleanFromNumber, 'assistant', resposta);
          
          // Divide mensagem se necessário
          const mensagens = dividirMensagem(resposta);
          
          for (const msg of mensagens) {
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, msg);
            } else if (twilioWhatsAppNumber) {
              try {
                await client.messages.create({
                  from: twilioWhatsAppNumber,
                  to: fromNumber,
                  body: msg
                });
              } catch (error: any) {
                console.error('❌ Erro ao enviar resposta via Twilio:', error.message);
              }
            }
          }
          
          return res.json({ 
            success: true, 
            message: 'Saldo enviado com sucesso' 
          });
        }
        
        // Verifica se é solicitação de listagem de agendamentos
        // Verifica se é solicitação de estatísticas/resumo financeiro
        const palavrasEstatisticas = [
          'resumo', 'estatísticas', 'estatisticas', 'resumo financeiro',
          'gastos hoje', 'gasto hoje', 'quanto gastei hoje', 'quanto gastei',
          'saldo', 'meu saldo', 'saldo atual', 'situação financeira',
          'relatório', 'relatorio', 'dashboard', 'painel'
        ];
        
        const isEstatisticas = palavrasEstatisticas.some(palavra => mensagemLower.includes(palavra));
        
        if (isEstatisticas) {
          console.log('📊 Solicitação de estatísticas/resumo detectada!');
          
          // Busca estatísticas do usuário
          const estatisticas = await obterEstatisticas({ telefone: telefoneAgendamento });
          
          // Calcula saldo (entradas - saídas)
          const todasTransacoes = await buscarTransacoesComFiltros({
            telefone: telefoneAgendamento,
            limit: 1000,
            offset: 0
          });
          
          let totalEntradas = 0;
          let totalSaidas = 0;
          
          todasTransacoes.transacoes.forEach(t => {
            if (t.tipo === 'entrada') {
              totalEntradas += t.valor;
            } else {
              totalSaidas += t.valor;
            }
          });
          
          const saldo = totalEntradas - totalSaidas;
          
          // MELHORIA: Usa formatador de mensagens
          const resposta = formatarEstatisticasResumo(estatisticas);
          
          // MELHORIA: Adiciona sugestão proativa
          const transacoesRecentes = await buscarTransacoesComFiltros({
            telefone: telefoneAgendamento,
            limit: 10
          });
          
          const sugestao = criarSugestaoProativa(estatisticas, transacoesRecentes.transacoes);
          const respostaCompleta = sugestao ? `${resposta}\n\n${sugestao}` : resposta;
          
          // MELHORIA: Adiciona ao contexto
          await adicionarMensagemContexto(cleanFromNumber, 'assistant', respostaCompleta);
          
          // MELHORIA: Divide mensagem se necessário
          const mensagens = dividirMensagem(respostaCompleta);
          
          for (const msg of mensagens) {
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, msg);
            } else if (twilioWhatsAppNumber) {
              try {
                await client.messages.create({
                  from: twilioWhatsAppNumber,
                  to: fromNumber,
                  body: msg
                });
              } catch (error: any) {
                console.error('❌ Erro ao enviar resposta via Twilio:', error.message);
              }
            }
          }
          
          return res.json({ 
            success: true, 
            message: 'Estatísticas enviadas com sucesso' 
          });
        }
        
        const palavrasListagem = [
          'listar agendamentos', 'meus agendamentos', 'agendamentos pendentes',
          'listar agendamento', 'meu agendamento', 'agendamento pendente',
          'agendamentos', 'agendamento', 'listar', 'lista',
          'quais agendamentos', 'quais são os agendamentos', 'mostrar agendamentos'
        ];
        
        const isListagem = palavrasListagem.some(palavra => mensagemLower.includes(palavra));
        
        if (isListagem) {
          console.log('📋 Solicitação de listagem de agendamentos detectada!');
          
          // Busca todos os agendamentos do usuário
          const todosAgendamentos = await buscarAgendamentosPorTelefone(telefoneAgendamento);
          
          if (todosAgendamentos.length === 0) {
            const resposta = `📋 Você não possui agendamentos cadastrados.\n\n💡 Para criar um agendamento, envie uma mensagem como:\n"Agende um boleto de luz de 200 reais para o dia 25"`;
            
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, resposta);
            } else if (twilioWhatsAppNumber) {
              try {
                await client.messages.create({
                  from: twilioWhatsAppNumber,
                  to: fromNumber,
                  body: resposta
                });
              } catch (error: any) {
                console.error('❌ Erro ao enviar resposta via Twilio:', error.message);
              }
            }
            
            return res.json({ 
              success: true, 
              message: 'Listagem de agendamentos processada' 
            });
          }
          
          // Agrupa por status
          const pendentes = todosAgendamentos.filter(a => a.status === 'pendente');
          const pagos = todosAgendamentos.filter(a => a.status === 'pago');
          const cancelados = todosAgendamentos.filter(a => a.status === 'cancelado');
          
          // Formata a resposta
          let resposta = `📋 *Seus Agendamentos*\n\n`;
          resposta += `📊 *Resumo:*\n`;
          resposta += `   ⏳ Pendentes: ${pendentes.length}\n`;
          resposta += `   ✅ Pagos: ${pagos.length}\n`;
          resposta += `   ❌ Cancelados: ${cancelados.length}\n\n`;
          
          if (pendentes.length > 0) {
            resposta += `⏳ *Pendentes:*\n`;
            pendentes.forEach((ag, index) => {
              const dataFormatada = new Date(ag.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
              const tipoTexto = ag.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento';
              resposta += `\n${index + 1}. *${ag.descricao}*\n`;
              resposta += `   💰 R$ ${ag.valor.toFixed(2)}\n`;
              resposta += `   📅 ${dataFormatada}\n`;
              resposta += `   📋 ${tipoTexto}\n`;
              resposta += `   🆔 ID: ${ag.id}\n`;
            });
          }
          
          if (pagos.length > 0) {
            resposta += `\n✅ *Pagos:*\n`;
            pagos.slice(0, 5).forEach((ag, index) => {
              const dataFormatada = new Date(ag.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
              resposta += `\n${index + 1}. ${ag.descricao} - R$ ${ag.valor.toFixed(2)} (${dataFormatada})`;
            });
            if (pagos.length > 5) {
              resposta += `\n   ... e mais ${pagos.length - 5} agendamento(s) pago(s)`;
            }
          }
          
          // Prepara botões interativos para ações rápidas
          const botoes = [];
          
          if (pendentes.length > 0) {
            // Botão para marcar o primeiro agendamento pendente como pago
            const primeiroPendente = pendentes[0];
            botoes.push({
              id: `pagar_${primeiroPendente.id}`,
              texto: `✅ Pagar: ${primeiroPendente.descricao.substring(0, 15)}...`
            });
            
            // Botão para ver detalhes (se houver mais de 1)
            if (pendentes.length > 1) {
              botoes.push({
                id: 'ver_todos',
                texto: '📋 Ver Todos os Detalhes'
              });
            }
          }
          
          // Botão para criar novo agendamento
          botoes.push({
            id: 'novo_agendamento',
            texto: '➕ Novo Agendamento'
          });
          
          // Envia mensagem com botões interativos (se Z-API estiver configurada)
          if (zapiEstaConfigurada() && botoes.length > 0) {
            const resultado = await enviarMensagemComBotoesZApi(fromNumber, resposta, botoes);
            if (!resultado.success) {
              console.warn('⚠️  Erro ao enviar botões, enviando mensagem simples:', resultado.error);
              // Fallback: envia mensagem simples
              await enviarMensagemZApi(fromNumber, resposta + '\n\n💡 *Para marcar como pago:*\nEnvie "paguei [descrição]" ou "paguei o agendamento [ID]"');
            }
          } else if (twilioWhatsAppNumber) {
            // Twilio não suporta botões nativos, envia mensagem simples
            try {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: resposta + '\n\n💡 *Para marcar como pago:*\nEnvie "paguei [descrição]" ou "paguei o agendamento [ID]"'
              });
            } catch (error: any) {
              console.error('❌ Erro ao enviar resposta via Twilio:', error.message);
            }
          } else {
            // Fallback: envia mensagem simples
            await enviarMensagemZApi(fromNumber, resposta + '\n\n💡 *Para marcar como pago:*\nEnvie "paguei [descrição]" ou "paguei o agendamento [ID]"');
          }
          
          return res.json({ 
            success: true, 
            message: 'Listagem de agendamentos processada' 
          });
        }
        
        // Primeiro, tenta detectar se é um agendamento
        console.log('   🔍 Tentando detectar agendamento...');
        const agendamentoExtraido = await processarAgendamentoComIA(messageText);
        
        console.log(`   📋 Resultado do processamento de agendamento:`, agendamentoExtraido ? JSON.stringify(agendamentoExtraido, null, 2) : 'null');
        
        if (agendamentoExtraido && agendamentoExtraido.sucesso) {
          console.log('📅 Agendamento detectado!');
          console.log('   📋 Dados do agendamento:', JSON.stringify(agendamentoExtraido, null, 2));
          try {
            // Garante que o telefone está no formato correto (sem whatsapp:)
            const telefoneAgendamento = cleanFromNumber.startsWith('whatsapp:') 
              ? cleanFromNumber.replace('whatsapp:', '') 
              : cleanFromNumber;
            
            console.log(`   📞 Telefone para agendamento: "${telefoneAgendamento}"`);
            
            const idAgendamento = await criarAgendamento({
              telefone: telefoneAgendamento,
              descricao: agendamentoExtraido.descricao,
              valor: agendamentoExtraido.valor,
              dataAgendamento: agendamentoExtraido.dataAgendamento,
              tipo: agendamentoExtraido.tipo,
              categoria: agendamentoExtraido.categoria,
            });
            
            console.log(`   ✅ Agendamento criado (ID: ${idAgendamento})`);
            
            // Responde confirmando o agendamento
            const tipoTexto = agendamentoExtraido.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento';
            const dataFormatada = new Date(agendamentoExtraido.dataAgendamento + 'T00:00:00').toLocaleDateString('pt-BR');
            
            let respostaAgendamento = `✅ Agendamento criado com sucesso!\n\n`;
            respostaAgendamento += `📅 ${tipoTexto}: ${agendamentoExtraido.descricao}\n`;
            respostaAgendamento += `💰 Valor: R$ ${agendamentoExtraido.valor.toFixed(2)}\n`;
            respostaAgendamento += `📆 Data: ${dataFormatada}\n\n`;
            respostaAgendamento += `Você receberá um lembrete no dia ${dataFormatada}.`;
            respostaAgendamento += `\n\n💡 Quando pagar/receber, responda "pago" ou "recebido" para registrar automaticamente.`;
            
            // Envia resposta via Z-API ou Twilio
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, respostaAgendamento);
            } else if (twilioWhatsAppNumber) {
              try {
                await client.messages.create({
                  from: twilioWhatsAppNumber,
                  to: fromNumber,
                  body: respostaAgendamento
                });
              } catch (error: any) {
                console.error('❌ Erro ao enviar resposta via Twilio:', error.message);
              }
            }
            
            // Não processa como transação se foi agendamento
            // Retorna resposta HTTP imediatamente para evitar processamento duplicado
            return res.json({ 
              success: true, 
              message: 'Agendamento processado com sucesso' 
            });
          } catch (error: any) {
            console.error('❌ Erro ao criar agendamento:', error.message);
            // Continua o processamento se houver erro ao criar agendamento
          }
        }
        
        // Se não foi agendamento, verifica se é confirmação de pagamento/recebimento
        if (mensagemLower.includes('pago') || mensagemLower.includes('recebido') || mensagemLower.includes('paguei') || mensagemLower.includes('recebi') || mensagemLower.includes('pague')) {
          console.log(`   🔍 Buscando agendamentos pendentes para: "${telefoneAgendamento}"`);
          
          // Busca agendamentos pendentes do usuário
          const agendamentosPendentes = await buscarAgendamentosPorTelefone(telefoneAgendamento, { status: 'pendente' });
          
          console.log(`   📋 Agendamentos pendentes encontrados: ${agendamentosPendentes.length}`);
          
          if (agendamentosPendentes.length > 0) {
            let agendamento = agendamentosPendentes[0]; // Padrão: pega o mais próximo
            
            // Tenta identificar qual agendamento específico foi pago
            // Procura por ID na mensagem (ex: "paguei o agendamento 3", "paguei o 3")
            const idMatch = mensagemLower.match(/(?:agendamento|id|numero|#)\s*(\d+)|^(\d+)$/);
            if (idMatch) {
              const idProcurado = parseInt(idMatch[1] || idMatch[2]);
              const agendamentoPorId = agendamentosPendentes.find(a => a.id === idProcurado);
              if (agendamentoPorId) {
                agendamento = agendamentoPorId;
                console.log(`   ✅ Agendamento específico identificado: ID ${idProcurado}`);
              }
            } else {
              // Tenta identificar por descrição (ex: "paguei o boleto de luz")
              const palavrasDescricao = mensagemLower.split(/\s+/).filter((p: string) => p.length > 3);
              const agendamentoPorDescricao = agendamentosPendentes.find(a => {
                const descLower = a.descricao.toLowerCase();
                return palavrasDescricao.some((palavra: string) => descLower.includes(palavra));
              });
              if (agendamentoPorDescricao) {
                agendamento = agendamentoPorDescricao;
                console.log(`   ✅ Agendamento identificado por descrição: "${agendamento.descricao}"`);
              }
            }
            
            // Atualiza status para pago
            await atualizarStatusAgendamento(agendamento.id, 'pago');
            
            // Busca ou cria carteira padrão antes de criar a transação
            const telefoneFormatado = cleanFromNumber.startsWith('whatsapp:') 
              ? cleanFromNumber 
              : cleanFromNumber.startsWith('+')
              ? `whatsapp:${cleanFromNumber}`
              : `whatsapp:+${cleanFromNumber}`;
            
            // Para agendamentos, sempre usa débito (pagamento/recebimento)
            const carteiraApropriada = await buscarOuCriarCarteiraPorTipo(telefoneFormatado, 'debito');
            
            // Cria transação automaticamente
            const dataAtual = new Date().toISOString().split('T')[0];
            const transacao: Transacao = {
              telefone: cleanFromNumber,
              descricao: agendamento.descricao,
              valor: agendamento.valor,
              categoria: agendamento.categoria || 'outros',
              tipo: agendamento.tipo === 'recebimento' ? 'entrada' : 'saida',
              metodo: 'debito',
              dataHora: new Date().toLocaleString('pt-BR'),
              data: dataAtual,
              mensagemOriginal: messageText,
              carteiraId: carteiraApropriada.id
            };
            
            await salvarTransacao(transacao);
            
            let respostaConfirmacao = `✅ Agendamento marcado como ${agendamento.tipo === 'recebimento' ? 'recebido' : 'pago'}!\n\n`;
            respostaConfirmacao += `📝 ${agendamento.descricao}\n`;
            respostaConfirmacao += `💰 Valor: R$ ${agendamento.valor.toFixed(2)}\n`;
            respostaConfirmacao += `🆔 ID: ${agendamento.id}\n`;
            respostaConfirmacao += `📊 Transação registrada automaticamente.`;
            
            // Se há mais agendamentos pendentes, informa
            if (agendamentosPendentes.length > 1) {
              respostaConfirmacao += `\n\n📋 Você ainda tem ${agendamentosPendentes.length - 1} agendamento(s) pendente(s).`;
              respostaConfirmacao += `\n💡 Envie "listar agendamentos" para ver todos.`;
            }
            
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, respostaConfirmacao);
            } else if (twilioWhatsAppNumber) {
              try {
                await client.messages.create({
                  from: twilioWhatsAppNumber,
                  to: fromNumber,
                  body: respostaConfirmacao
                });
              } catch (error: any) {
                console.error('❌ Erro ao enviar resposta via Twilio:', error.message);
              }
            }
            
            // Retorna resposta HTTP imediatamente
            return res.json({ 
              success: true, 
              message: 'Confirmação de pagamento/recebimento processada' 
            });
          }
        }
        
        // Se não foi agendamento nem confirmação, processa como transação normal ou pergunta
        // MELHORIA: Só processa transação se intenção for transação ou desconhecida (pode ser transação)
        if (intencao.intencao === 'transacao' || intencao.intencao === 'desconhecida') {
          const transacoesExtraidas = await processarMensagemComIA(messageText);
          
          if (transacoesExtraidas.length > 0) {
            console.log(`✅ ${transacoesExtraidas.length} transação(ões) encontrada(s)!`);
            
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
              
              await adicionarMensagemContexto(cleanFromNumber, 'assistant', respostaQualidade);
              const mensagens = dividirMensagem(respostaQualidade);
              
              for (const msg of mensagens) {
                if (zapiEstaConfigurada()) {
                  await enviarMensagemZApi(fromNumber, msg);
                } else if (twilioWhatsAppNumber) {
                  await client.messages.create({
                    from: twilioWhatsAppNumber,
                    to: fromNumber,
                    body: msg
                  });
                }
              }
              
              return res.json({ success: true, message: 'Solicitando mais informações' });
            }
            
            // Salva transações diretamente sem confirmação
            const telefoneFormatado = cleanFromNumber.startsWith('whatsapp:') 
              ? cleanFromNumber 
              : cleanFromNumber.startsWith('+')
              ? `whatsapp:${cleanFromNumber}`
              : `whatsapp:+${cleanFromNumber}`;
            
            const idsSalvos: number[] = [];
            const dataAtual = new Date().toISOString().split('T')[0];
            const transacoesSalvas: Array<{
              descricao: string;
              valor: number;
              categoria: string;
              tipo: 'entrada' | 'saida';
              metodo: 'credito' | 'debito';
              carteiraId: number | null;
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
                let carteiraIdParaTransacao: number | null = null;
                let carteiraNome: string | undefined = undefined;
                
                if (transacaoExtraida.carteiraNome) {
                  const carteirasUsuario = await buscarCarteirasPorTelefone(telefoneFormatado);
                  const carteiraEncontrada = carteirasUsuario.find(c => 
                    c.nome.toLowerCase().includes(transacaoExtraida.carteiraNome!.toLowerCase()) ||
                    transacaoExtraida.carteiraNome!.toLowerCase().includes(c.nome.toLowerCase())
                  );
                  if (carteiraEncontrada && carteiraEncontrada.tipo === tipoCarteiraNecessario) {
                    carteiraIdParaTransacao = carteiraEncontrada.id;
                    carteiraNome = carteiraEncontrada.nome;
                  }
                }
                
                if (!carteiraIdParaTransacao) {
                  const carteiraApropriada = await buscarOuCriarCarteiraPorTipo(telefoneFormatado, tipoCarteiraNecessario);
                  carteiraIdParaTransacao = carteiraApropriada.id;
                  carteiraNome = carteiraApropriada.nome;
                }
                
                const transacao: Transacao = {
                  telefone: cleanFromNumber,
                  descricao: transacaoExtraida.descricao,
                  valor: transacaoExtraida.valor,
                  categoria: transacaoExtraida.categoria || 'outros',
                  tipo: tipoFinal,
                  metodo: transacaoExtraida.metodo || 'debito',
                  dataHora: new Date().toLocaleString('pt-BR'),
                  data: dataAtual,
                  mensagemOriginal: messageText,
                  carteiraId: carteiraIdParaTransacao
                };
                
                const id = await salvarTransacao(transacao);
                idsSalvos.push(id);
                
                // Armazena dados para formatação da mensagem
                transacoesSalvas.push({
                  descricao: transacaoExtraida.descricao,
                  valor: transacaoExtraida.valor,
                  categoria: transacaoExtraida.categoria || 'outros',
                  tipo: tipoFinal,
                  metodo: transacaoExtraida.metodo || 'debito',
                  carteiraId: carteiraIdParaTransacao,
                  carteiraNome: carteiraNome,
                  id: id
                });
                
                console.log(`✅ Transação salva (ID: ${id}): ${transacaoExtraida.descricao} - R$ ${transacaoExtraida.valor.toFixed(2)}`);
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
                data: dataAtual,
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
                  data: dataAtual,
                  id: idsSalvos[index] || undefined
                }))
              );
            }
            
            // Adiciona ao contexto
            await adicionarMensagemContexto(cleanFromNumber, 'assistant', resposta);
            
            // Envia resposta
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, resposta);
            } else if (twilioWhatsAppNumber) {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: resposta
              });
            }
            
            return res.json({ 
              success: true, 
              message: 'Transações salvas com sucesso' 
            });
          }
        }
        
        // MELHORIA: Se não foi transação ou não encontrou transação, verifica se é pergunta
        if (intencao.intencao === 'pergunta') {
          console.log('❓ Pergunta detectada, usando chat de IA...');
              
              // Busca estatísticas e transações para contexto
              const estatisticas = await obterEstatisticas({ telefone: cleanFromNumber });
              const transacoesRecentes = await buscarTransacoesComFiltros({
                telefone: cleanFromNumber,
                limit: 10
              });
              
              // MELHORIA: Inclui histórico no prompt
              const historicoTexto = formatarHistoricoParaPrompt(contexto);
              
              try {
                const respostaIA = await processarChatFinanceiro(
                  messageText,
                  estatisticas,
                  transacoesRecentes.transacoes,
                  historicoTexto
                );
                
                await adicionarMensagemContexto(cleanFromNumber, 'assistant', respostaIA);
                
                // MELHORIA: Divide resposta longa
                const mensagens = dividirMensagem(respostaIA);
                
                for (const msg of mensagens) {
                  if (zapiEstaConfigurada()) {
                    await enviarMensagemZApi(fromNumber, msg);
                  } else if (twilioWhatsAppNumber) {
                    await client.messages.create({
                      from: twilioWhatsAppNumber,
                      to: fromNumber,
                      body: msg
                    });
                  }
                }
                
                return res.json({ success: true, message: 'Pergunta respondida' });
              } catch (error: any) {
                console.error('❌ Erro no chat de IA:', error);
                const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
                
                await adicionarMensagemContexto(cleanFromNumber, 'assistant', mensagemAmigavel);
                
                if (zapiEstaConfigurada()) {
                  await enviarMensagemZApi(fromNumber, mensagemAmigavel);
                } else if (twilioWhatsAppNumber) {
                  await client.messages.create({
                    from: twilioWhatsAppNumber,
                    to: fromNumber,
                    body: mensagemAmigavel
                  });
                }
                
                return res.json({ success: true, message: 'Erro ao processar pergunta' });
              }
            } else {
              console.log('ℹ️  Nenhuma transação financeira encontrada na mensagem');
              // MELHORIA: Mensagem mais útil quando não entende
              const mensagemAmigavel = 'Desculpe, não consegui entender sua mensagem 😊.\n\n' +
                '💡 *Dicas:*\n' +
                '• Para registrar gasto: "comprei café por 5 reais"\n' +
                '• Para registrar receita: "recebi 500 reais"\n' +
                '• Para ver resumo: "resumo financeiro"\n' +
                '• Para ajuda: "ajuda" ou "/ajuda"';
              
              await adicionarMensagemContexto(cleanFromNumber, 'assistant', mensagemAmigavel);
              
              if (zapiEstaConfigurada()) {
                await enviarMensagemZApi(fromNumber, mensagemAmigavel);
              } else if (twilioWhatsAppNumber) {
                try {
                  await client.messages.create({
                    from: twilioWhatsAppNumber,
                    to: fromNumber,
                    body: mensagemAmigavel
                  });
                } catch (error: any) {
                  console.error('❌ Erro ao enviar resposta via Twilio:', error.message);
                }
              }
            }
          }
        }
        
        // MELHORIA: Se não foi transação, verifica se é pergunta
        if (intencao.intencao === 'pergunta') {
          // MELHORIA: Processa perguntas com contexto
          console.log('❓ Pergunta detectada, usando chat de IA...');
          
          const estatisticas = await obterEstatisticas({ telefone: cleanFromNumber });
          const transacoesRecentes = await buscarTransacoesComFiltros({
            telefone: cleanFromNumber,
            limit: 10
          });
          
          const historicoTexto = formatarHistoricoParaPrompt(contexto);
          
          try {
            const respostaIA = await processarChatFinanceiro(
              messageText,
              estatisticas,
              transacoesRecentes.transacoes,
              historicoTexto
            );
            
            await adicionarMensagemContexto(cleanFromNumber, 'assistant', respostaIA);
            
            const mensagens = dividirMensagem(respostaIA);
            
            for (const msg of mensagens) {
              if (zapiEstaConfigurada()) {
                await enviarMensagemZApi(fromNumber, msg);
              } else if (twilioWhatsAppNumber) {
                await client.messages.create({
                  from: twilioWhatsAppNumber,
                  to: fromNumber,
                  body: msg
                });
              }
            }
            
            return res.json({ success: true, message: 'Pergunta respondida' });
          } catch (error: any) {
            console.error('❌ Erro no chat de IA:', error);
            const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
            
            await adicionarMensagemContexto(cleanFromNumber, 'assistant', mensagemAmigavel);
            
            if (zapiEstaConfigurada()) {
              await enviarMensagemZApi(fromNumber, mensagemAmigavel);
            } else if (twilioWhatsAppNumber) {
              await client.messages.create({
                from: twilioWhatsAppNumber,
                to: fromNumber,
                body: mensagemAmigavel
              });
            }
            
            return res.json({ success: true, message: 'Erro ao processar pergunta' });
          }
        }
      } catch (error: any) {
        console.error('❌ Erro ao processar mensagem com IA:', error.message);
        // Envia mensagem amigável em caso de erro
        const mensagemAmigavel = 'Desculpe, não consegui entender sua pergunta 😊. Poderia reformular de outra forma? Estou aqui para ajudar com suas finanças ou dúvidas sobre o Zela!';
        
        try {
          if (zapiEstaConfigurada()) {
            await enviarMensagemZApi(fromNumber, mensagemAmigavel);
          } else if (twilioWhatsAppNumber) {
            await client.messages.create({
              from: twilioWhatsAppNumber,
              to: fromNumber,
              body: mensagemAmigavel
            });
          }
        } catch (envioError: any) {
          console.error('❌ Erro ao enviar mensagem amigável:', envioError.message);
        }
      }
    }
    
    // Responde à Z-API
    res.json({ 
      success: true, 
      message: 'Mensagem processada com sucesso' 
    });
  } catch (error: any) {
    console.error('❌ Erro ao processar webhook da Z-API:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Erro ao processar mensagem' 
    });
  }
});

// Rota para testar se o webhook está acessível (GET)
app.get('/webhook/whatsapp', (req, res) => {
  console.log('✅ Webhook está acessível! (GET request)');
  console.log('   IP:', req.ip);
  console.log('   Headers:', JSON.stringify(req.headers, null, 2));
  res.json({ 
    status: 'ok', 
    message: 'Webhook está funcionando',
    method: 'GET',
    note: 'O Twilio envia requisições POST para este endpoint',
    timestamp: new Date().toISOString()
  });
});

// Rota de teste para verificar se o servidor está recebendo requisições
app.all('/test-webhook', (req, res) => {
  console.log('\n🧪 TESTE DE WEBHOOK RECEBIDO!');
  console.log('   Method:', req.method);
  console.log('   URL:', req.url);
  console.log('   IP:', req.ip);
  console.log('   Headers:', JSON.stringify(req.headers, null, 2));
  console.log('   Body:', JSON.stringify(req.body, null, 2));
  console.log('   Query:', JSON.stringify(req.query, null, 2));
  console.log('');
  
  res.json({
    success: true,
    message: 'Servidor está recebendo requisições!',
    method: req.method,
    timestamp: new Date().toISOString(),
    received: {
      headers: req.headers,
      body: req.body,
      query: req.query
    }
  });
});

// Rota para a interface web de mensagens
app.get('/app', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Rota para a interface web financeira
app.get('/financeiro', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'financeiro.html'));
});

// API: Retorna todas as mensagens recebidas
// REMOVIDO: Endpoint público removido por segurança
// Use apenas endpoints autenticados para acessar dados
// app.get('/api/mensagens', ...) - REMOVIDO

// REMOVIDO: Endpoint público removido por segurança
// Use /api/transacoes com autenticação que já filtra pelo telefone do usuário
// app.get('/api/transacoes/:telefone', ...) - REMOVIDO

// API: Retorna todas as transações (com filtros opcionais)
// API: Lista todas as transações (com filtros e paginação) - PROTEGIDA
app.get('/api/transacoes', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📥 GET /api/transacoes - INÍCIO');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    const {
      dataInicio,
      dataFim,
      valorMin,
      valorMax,
      descricao,
      categoria,
      page = '1',
      limit = '20'
    } = req.query;

    console.log('📋 Query params recebidos:', JSON.stringify(req.query, null, 2));
    console.log('🔐 Telefone extraído do token JWT:', req.telefone);

    // Usa o telefone do token JWT (usuário autenticado)
    const telefone = req.telefone;
    
    if (!telefone) {
      console.error('❌ ERRO: telefone não encontrado no token JWT');
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    console.log(`\n🔍 Verificando banco de dados para telefone: "${telefone}"`);
    
    // Verifica se há transações no banco para esse telefone (debug)
    const todasTransacoes = await prisma.transacao.findMany({
      select: { telefone: true },
      distinct: ['telefone'],
    });
    console.log(`📊 Total de telefones únicos com transações: ${todasTransacoes.length}`);
    console.log('📋 Telefones com transações:', todasTransacoes.map(t => t.telefone));
    
    const todosRegistrados = await prisma.numeroRegistrado.findMany({
      select: { telefone: true },
    });
    console.log(`📊 Total de telefones registrados: ${todosRegistrados.length}`);
    console.log('📋 Telefones registrados:', todosRegistrados.map(t => t.telefone));
    
    // Verifica se o telefone do token existe nas transações
    const telefoneExisteTransacoes = todasTransacoes.some(t => {
      const tLimpo = t.telefone.replace(/\D/g, '');
      const telefoneLimpo = telefone.replace(/\D/g, '');
      return t.telefone === telefone || tLimpo === telefoneLimpo || 
             tLimpo.slice(-8) === telefoneLimpo.slice(-8);
    });
    console.log(`✅ Telefone "${telefone}" existe nas transações? ${telefoneExisteTransacoes ? 'SIM' : 'NÃO'}`);
    
    // Verifica se o telefone do token existe nos registrados
    const telefoneExisteRegistrados = todosRegistrados.some(t => {
      const tLimpo = t.telefone.replace(/\D/g, '');
      const telefoneLimpo = telefone.replace(/\D/g, '');
      return t.telefone === telefone || tLimpo === telefoneLimpo || 
             tLimpo.slice(-8) === telefoneLimpo.slice(-8);
    });
    console.log(`✅ Telefone "${telefone}" existe nos registrados? ${telefoneExisteRegistrados ? 'SIM' : 'NÃO'}`);
    // Validação e normalização dos parâmetros de paginação
    let pageNum = parseInt(page as string) || 1;
    let limitNum = parseInt(limit as string) || 20;
    
    // Validação: página deve ser >= 1
    if (pageNum < 1) pageNum = 1;
    
    // Validação: limit deve estar entre 1 e 100 (evita abusos)
    if (limitNum < 1) limitNum = 1;
    if (limitNum > 100) limitNum = 100;
    
    // Valores permitidos para limit (5, 10, 15, 25)
    const limitesPermitidos = [5, 10, 15, 25];
    if (!limitesPermitidos.includes(limitNum)) {
      // Arredonda para o mais próximo permitido
      limitNum = limitesPermitidos.reduce((prev, curr) => 
        Math.abs(curr - limitNum) < Math.abs(prev - limitNum) ? curr : prev
      );
    }
    
    const offset = (pageNum - 1) * limitNum;

    console.log(`\n📄 Paginação: página ${pageNum}, limite ${limitNum}, offset ${offset}`);

    const filtros: any = {
      telefone, // Sempre filtra pelo telefone do usuário autenticado
      limit: limitNum,
      offset
    };
    
    if (dataInicio) filtros.dataInicio = dataInicio as string;
    if (dataFim) filtros.dataFim = dataFim as string;
    if (valorMin) filtros.valorMin = parseFloat(valorMin as string);
    if (valorMax) filtros.valorMax = parseFloat(valorMax as string);
    if (descricao) filtros.descricao = descricao as string;
    if (categoria) filtros.categoria = categoria as string;
    
    // Filtro de múltiplas carteiras
    const carteirasIds = req.query.carteirasIds;
    if (carteirasIds) {
      if (Array.isArray(carteirasIds)) {
        filtros.carteirasIds = carteirasIds.map(id => parseInt(id as string)).filter(id => !isNaN(id));
      } else {
        filtros.carteirasIds = [parseInt(carteirasIds as string)].filter(id => !isNaN(id));
      }
    }

    console.log('\n🔍 Filtros que serão usados na busca:');
    console.log(JSON.stringify(filtros, null, 2));
    console.log('\n🚀 Chamando buscarTransacoesComFiltros...\n');

    const resultado = await buscarTransacoesComFiltros(filtros);
    
    console.log('\n📊 RESULTADO DA BUSCA:');
    console.log(`   Total encontrado: ${resultado.total}`);
    console.log(`   Transações retornadas: ${resultado.transacoes.length}`);
    console.log(`   Telefone buscado: "${telefone}"`);
    
    if (resultado.transacoes.length > 0) {
      console.log(`   Primeira transação:`, {
        id: resultado.transacoes[0].id,
        telefone: resultado.transacoes[0].telefone,
        descricao: resultado.transacoes[0].descricao,
        valor: resultado.transacoes[0].valor
      });
    }
    
    // Calcula informações de paginação
    const totalPages = resultado.total > 0 ? Math.ceil(resultado.total / limitNum) : 1;
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;
    
    // Validação: se a página solicitada for maior que o total, ajusta para a última página
    if (pageNum > totalPages && totalPages > 0) {
      pageNum = totalPages;
      // Recalcula offset e busca novamente
      const novoOffset = (pageNum - 1) * limitNum;
      filtros.offset = novoOffset;
      const resultadoAjustado = await buscarTransacoesComFiltros(filtros);
      resultado.transacoes = resultadoAjustado.transacoes;
    }
    
    console.log(`\n✅ Preparando resposta: ${resultado.transacoes.length} transações de ${resultado.total} total (página ${pageNum}/${totalPages})`);
    console.log(`   📊 Informações de paginação:`, {
      page: pageNum,
      limit: limitNum,
      total: resultado.total,
      totalPages,
      hasNextPage,
      hasPrevPage,
      offset
    });
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const resposta = {
      success: true,
      total: resultado.total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage,
      hasPrevPage,
      transacoes: resultado.transacoes
    };
    
    console.log('📤 Enviando resposta ao frontend:', {
      success: resposta.success,
      total: resposta.total,
      transacoesCount: resposta.transacoes.length
    });
    
    res.json(resposta);
  } catch (error: any) {
    console.error('\n❌ ERRO em /api/transacoes:');
    console.error('   Mensagem:', error.message);
    console.error('   Stack:', error.stack);
    console.log('═══════════════════════════════════════════════════════════\n');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Criar nova transação - PROTEGIDA
app.post('/api/transacoes', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;
    
    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📥 POST /api/transacoes - Criando nova transação');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📞 Telefone do token:', telefone);
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));
    
    const { descricao, valor, categoria, tipo, metodo, dataHora, data, carteiraId } = req.body;
    
    // Validações
    if (!descricao || !descricao.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Descrição é obrigatória'
      });
    }
    
    if (!valor || isNaN(Number(valor)) || Number(valor) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valor inválido'
      });
    }
    
    if (!tipo || !['entrada', 'saida'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo deve ser "entrada" ou "saida"'
      });
    }
    
    if (!metodo || !['credito', 'debito'].includes(metodo)) {
      return res.status(400).json({
        success: false,
        error: 'Método deve ser "credito" ou "debito"'
      });
    }
    
    // Formata o telefone
    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;
    
    // Busca ou cria carteira padrão se não foi informada
    let carteiraIdFinal: number;
    if (carteiraId) {
      // Valida se a carteira pertence ao usuário
      const carteira = await buscarCarteiraPorId(Number(carteiraId), telefoneFormatado);
      if (!carteira) {
        return res.status(400).json({
          success: false,
          error: 'Carteira não encontrada ou não pertence ao usuário'
        });
      }
      carteiraIdFinal = carteira.id;
    } else {
      // Determina o tipo de carteira baseado no método da transação
      const tipoCarteiraNecessario = (metodo || 'debito') as 'debito' | 'credito';
      
      // Busca ou cria carteira apropriada para o tipo
      const carteiraApropriada = await buscarOuCriarCarteiraPorTipo(telefoneFormatado, tipoCarteiraNecessario);
      carteiraIdFinal = carteiraApropriada.id;
      console.log(`📦 Carteira utilizada: "${carteiraApropriada.nome}" (ID: ${carteiraApropriada.id}, tipo: ${carteiraApropriada.tipo})`);
    }
    
    // Prepara dados da transação
    const agora = new Date();
    const dataHoraFormatada = dataHora || agora.toLocaleString('pt-BR');
    const dataFormatada = data || agora.toISOString().split('T')[0];
    
    const transacao: Transacao = {
      telefone: telefoneFormatado,
      descricao: descricao.trim(),
      valor: Number(valor),
      categoria: categoria || 'outros',
      tipo: tipo,
      metodo: metodo,
      dataHora: dataHoraFormatada,
      data: dataFormatada,
      carteiraId: carteiraIdFinal,
    };
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📥 POST /api/transacoes - Criando nova transação');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📞 Telefone:', telefoneFormatado);
    console.log('📝 Dados recebidos:', {
      descricao,
      valor,
      categoria,
      tipo,
      metodo,
      dataHora: dataHoraFormatada,
      data: dataFormatada,
    });
    
    const id = await salvarTransacao(transacao);
    
    console.log('✅ Transação criada com sucesso! ID:', id);
    
    // Verifica se a transação foi salva corretamente
    const transacaoSalva = await prisma.transacao.findUnique({
      where: { id }
    });
    
    if (transacaoSalva) {
      console.log('✅ Transação confirmada no banco:', {
        id: transacaoSalva.id,
        telefone: transacaoSalva.telefone,
        descricao: transacaoSalva.descricao,
        dataHora: transacaoSalva.dataHora
      });
    } else {
      console.error('❌ ERRO: Transação não encontrada no banco após salvar!');
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');
    
    res.json({
      success: true,
      message: 'Transação criada com sucesso',
      transacao: {
        id,
        ...transacao
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao criar transação:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar transação'
    });
  }
});

// API: Deletar transação - PROTEGIDA
app.delete('/api/transacoes/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'ID inválido'
      });
    }

    const transacao = await buscarTransacaoPorId(parseInt(id));

    if (!transacao) {
      return res.status(404).json({
        success: false,
        error: 'Transação não encontrada'
      });
    }

    // Compara telefones de forma flexível
    console.log(`🔍 Comparando telefones para remoção de transação ${id}:`);
    console.log(`   Telefone do token: "${telefone}"`);
    console.log(`   Telefone da transação: "${transacao.telefone}"`);

    if (!telefonesSaoIguais(telefone, transacao.telefone)) {
      const tel1Norm = normalizarTelefoneParaComparacao(telefone);
      const tel2Norm = normalizarTelefoneParaComparacao(transacao.telefone);
      console.log(`   ❌ Telefones não correspondem:`);
      console.log(`      Token normalizado: "${tel1Norm}"`);
      console.log(`      Transação normalizada: "${tel2Norm}"`);
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para remover esta transação'
      });
    }
    
    console.log(`   ✅ Telefones correspondem!`);

    await removerTransacao(parseInt(id));

    console.log(`✅ Transação ${id} removida com sucesso`);

    res.json({
      success: true,
      message: 'Transação removida com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro ao remover transação:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao remover transação'
    });
  }
});

// API: Estatísticas gerais - PROTEGIDA
app.get('/api/estatisticas', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const {
      dataInicio,
      dataFim,
      valorMin,
      valorMax,
      descricao,
      categoria
    } = req.query;
    
    console.log('📊 GET /api/estatisticas - Query params:', req.query);
    console.log('🔐 Telefone do token JWT:', req.telefone);
    
    // Usa o telefone do token JWT (usuário autenticado)
    const telefone = req.telefone;
    
    if (!telefone) {
      console.error('❌ Erro: telefone não encontrado no token JWT');
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    const filtros: any = {
      telefone // Sempre filtra pelo telefone do usuário autenticado
    };
    if (dataInicio) filtros.dataInicio = dataInicio as string;
    if (dataFim) filtros.dataFim = dataFim as string;
    if (valorMin) filtros.valorMin = parseFloat(valorMin as string);
    if (valorMax) filtros.valorMax = parseFloat(valorMax as string);
    if (descricao) filtros.descricao = descricao as string;
    if (categoria) filtros.categoria = categoria as string;
    
    // Filtro de múltiplas carteiras
    const carteirasIds = req.query.carteirasIds;
    if (carteirasIds) {
      if (Array.isArray(carteirasIds)) {
        filtros.carteirasIds = carteirasIds.map(id => parseInt(id as string)).filter(id => !isNaN(id));
      } else {
        filtros.carteirasIds = [parseInt(carteirasIds as string)].filter(id => !isNaN(id));
      }
    }

    console.log('📊 Filtros para estatísticas:', JSON.stringify(filtros, null, 2));

    const stats = await obterEstatisticas(filtros);
    
    console.log('📊 Estatísticas retornadas:', JSON.stringify(stats, null, 2));
    
    res.json({
      success: true,
      estatisticas: stats
    });
  } catch (error: any) {
    console.error('❌ Erro em /api/estatisticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Estatísticas de CRÉDITO - PROTEGIDA
app.get('/api/estatisticas-credito', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { dataInicio, dataFim, valorMin, valorMax, descricao, categoria } = req.query;
    const telefone = req.telefone;
    
    if (!telefone) {
      console.error('❌ Erro: telefone não encontrado no token JWT');
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    const filtros: any = {
      telefone
    };
    if (dataInicio) filtros.dataInicio = dataInicio as string;
    if (dataFim) filtros.dataFim = dataFim as string;
    if (valorMin) filtros.valorMin = parseFloat(valorMin as string);
    if (valorMax) filtros.valorMax = parseFloat(valorMax as string);
    if (descricao) filtros.descricao = descricao as string;
    if (categoria) filtros.categoria = categoria as string;
    
    // Filtro de múltiplas carteiras
    const carteirasIds = req.query.carteirasIds;
    if (carteirasIds) {
      if (Array.isArray(carteirasIds)) {
        filtros.carteirasIds = carteirasIds.map(id => parseInt(id as string)).filter(id => !isNaN(id));
      } else {
        filtros.carteirasIds = [parseInt(carteirasIds as string)].filter(id => !isNaN(id));
      }
    }

    console.log('📊 Filtros para estatísticas de crédito:', JSON.stringify(filtros, null, 2));

    const stats = await obterEstatisticasCredito(filtros);
    
    console.log('📊 Estatísticas de crédito retornadas:', JSON.stringify(stats, null, 2));
    
    res.json({
      success: true,
      estatisticas: stats
    });
  } catch (error: any) {
    console.error('❌ Erro em /api/estatisticas-credito:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Gastos por dia (gráfico) - PROTEGIDA
app.get('/api/gastos-por-dia', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { dias } = req.query;
    const diasNum = parseInt(dias as string) || 30;
    
    console.log('📊 GET /api/gastos-por-dia - Query params:', req.query);
    console.log('🔐 Telefone do token JWT:', req.telefone);
    
    // Usa o telefone do token JWT (usuário autenticado)
    const telefone = req.telefone;
    
    if (!telefone) {
      console.error('❌ Erro: telefone não encontrado no token JWT');
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    const dados = await gastosPorDia(telefone, diasNum);
    
    res.json({
      success: true,
      dias: diasNum,
      dados: dados
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Gastos por dia de CRÉDITO (gráfico) - PROTEGIDA
app.get('/api/gastos-por-dia-credito', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { dias } = req.query;
    const diasNum = parseInt(dias as string) || 30;
    
    console.log('📊 GET /api/gastos-por-dia-credito - Query params:', req.query);
    console.log('🔐 Telefone do token JWT:', req.telefone);
    
    // Usa o telefone do token JWT (usuário autenticado)
    const telefone = req.telefone;
    
    if (!telefone) {
      console.error('❌ Erro: telefone não encontrado no token JWT');
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    const dados = await gastosPorDiaCredito(telefone, diasNum);
    
    res.json({
      success: true,
      dias: diasNum,
      dados: dados
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// REMOVIDO: Endpoint público removido por segurança
// Lista de telefones não deve ser exposta publicamente
// app.get('/api/telefones', ...) - REMOVIDO

// API: Solicitar código de verificação via WhatsApp
app.post('/api/auth/solicitar-codigo', async (req, res) => {
  try {
    const { telefone } = req.body;
    
    if (!telefone || !telefone.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Telefone é obrigatório'
      });
    }
    
    // Valida e sanitiza telefone
    const telefoneValidado = validarTelefone(telefone);
    if (!telefoneValidado) {
      return res.status(400).json({
        success: false,
        error: 'Telefone inválido'
      });
    }
    
    // Formata o telefone
    const telefoneLimpo = telefoneValidado.replace(/\D/g, ''); // Remove tudo que não é dígito
    const telefoneFormatado = telefoneLimpo.startsWith('55') 
      ? `whatsapp:+${telefoneLimpo}` 
      : `whatsapp:+55${telefoneLimpo}`;
    
    // Sanitiza log para não expor telefone completo
    const telefoneLog = telefoneFormatado.length > 8 
      ? telefoneFormatado.slice(0, -4) + '****' 
      : '****';
    console.log('📱 Solicitação de código de verificação para:', telefoneLog);
    
    // Verifica se o número está registrado no banco
    const estaRegistrado = await numeroEstaRegistrado(telefoneFormatado);
    
    if (!estaRegistrado) {
      return res.status(404).json({
        success: false,
        error: 'Número não encontrado. Você precisa ter enviado pelo menos uma mensagem para este número via WhatsApp primeiro.'
      });
    }
    
    // Gera código de verificação
    const codigo = gerarCodigoVerificacao();
    await salvarCodigoVerificacao(telefoneFormatado, codigo);
    
    // LOG PARA DESENVOLVIMENTO: Mostra o código no console
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔐 CÓDIGO DE VERIFICAÇÃO GERADO');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📞 Telefone: ${telefoneFormatado}`);
    console.log(`🔑 Código: ${codigo}`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Envia código via WhatsApp (usa Z-API se configurada, caso contrário Twilio)
    const mensagem = `🔐 Seu código de verificação Zela é: *${codigo}*\n\nEste código expira em 5 minutos.\n\nSe você não solicitou este código, ignore esta mensagem.`;
    
    let mensagemEnviada = false;
    let erroEnvio: any = null;
    
    // Prioriza Z-API se configurada
    if (zapiEstaConfigurada()) {
      console.log('📱 Enviando código via Z-API...');
      console.log(`   📞 Telefone formatado: ${telefoneFormatado}`);
      const resultadoZApi = await enviarMensagemZApi(telefoneFormatado, mensagem);
      
      if (resultadoZApi.success) {
        console.log(`✅ Código de verificação enviado via Z-API para ${telefoneFormatado}`);
        mensagemEnviada = true;
      } else {
        console.error(`❌ Erro ao enviar via Z-API: ${resultadoZApi.error}`);
        console.error(`   Detalhes:`, resultadoZApi);
        erroEnvio = resultadoZApi.error;
        
        // Se o erro for de instância não conectada, fornece instruções claras
        if (resultadoZApi.error?.includes('não está conectada') || resultadoZApi.error?.includes('client-token')) {
          console.error('⚠️  Instância Z-API não conectada. Por favor, conecte a instância no painel da Z-API primeiro.');
          console.error('💡 Acesse: https://www.z-api.io → Instâncias → Sua instância → Conectar (QR Code)');
        }
      }
    } else {
      // Se Z-API não está configurada, usa Twilio como fallback
      console.log('⚠️  Z-API não configurada. Usando Twilio como fallback...');
      
      if (!twilioWhatsAppNumber) {
        return res.status(500).json({
          success: false,
          error: 'Nenhum serviço de envio configurado. Configure Z-API (ZAPI_INSTANCE_ID e ZAPI_TOKEN) ou Twilio no .env'
        });
      }
      
      try {
        console.log('📱 Tentando enviar código via Twilio...');
        const messageParams: any = {
          from: twilioWhatsAppNumber,
          to: telefoneFormatado,
          body: mensagem
        };
        
        await client.messages.create(messageParams);
        
        console.log(`✅ Código de verificação enviado via Twilio para ${telefoneFormatado}`);
        mensagemEnviada = true;
      } catch (error: any) {
        console.error('❌ Erro ao enviar código via Twilio:', error);
        erroEnvio = error;
        
        // Verifica se é erro de limite diário
        if (error.code === 63038 || error.status === 429) {
          console.log(`⚠️  Limite diário do Twilio excedido. Código gerado: ${codigo}`);
          console.log(`💡 Para desenvolvimento, use o código acima para fazer login.`);
          
          // Em desenvolvimento, retorna o código no response (apenas se for erro de limite)
          const isDevelopment = process.env.NODE_ENV !== 'production';
          
          if (isDevelopment) {
            return res.json({
              success: true,
              message: 'Código de verificação gerado (limite diário do Twilio excedido)',
              telefone: telefoneFormatado,
              codigo: codigo, // Retorna o código em desenvolvimento
              warning: 'Limite diário do Twilio excedido. Configure Z-API para evitar este limite. Use o código acima para fazer login.'
            });
          } else {
            return res.status(429).json({
              success: false,
              error: 'Limite diário de mensagens do Twilio excedido. Configure Z-API para evitar este limite.',
              code: 'LIMIT_EXCEEDED'
            });
          }
        }
      }
    }
    
    // Se nenhum método funcionou
    if (!mensagemEnviada) {
      const isDevelopment = process.env.NODE_ENV !== 'production';
      
      // Verifica se o erro foi de instância Z-API não conectada
      const erroZApiNaoConectada = erroEnvio?.includes('não está conectada') || erroEnvio?.includes('client-token');
      const erroTwilioLimite = erroEnvio?.code === 63038 || erroEnvio?.status === 429;
      
      if (isDevelopment) {
        console.log(`⚠️  Nenhum serviço de envio disponível. Código gerado: ${codigo}`);
        
        let warningMessage = 'Nenhum serviço de envio disponível. Use o código acima para fazer login.';
        
        if (erroZApiNaoConectada) {
          warningMessage = 'Instância Z-API não está conectada ao WhatsApp. Conecte a instância no painel da Z-API primeiro. Use o código acima para fazer login enquanto isso.';
        } else if (erroTwilioLimite) {
          warningMessage = 'Limite diário do Twilio excedido e Z-API não disponível. Use o código acima para fazer login.';
        }
        
        return res.json({
          success: true,
          message: 'Código de verificação gerado (nenhum serviço de envio disponível)',
          telefone: telefoneFormatado,
          codigo: codigo,
          warning: warningMessage,
          erroZApi: erroZApiNaoConectada ? 'Instância Z-API não conectada. Acesse o painel da Z-API e conecte escaneando o QR code.' : null,
          erroTwilio: erroTwilioLimite ? 'Limite diário do Twilio excedido (50 mensagens/dia).' : null
        });
      } else {
        let errorMessage = 'Erro ao enviar código via WhatsApp. Tente novamente.';
        
        if (erroZApiNaoConectada) {
          errorMessage = 'Instância Z-API não está conectada ao WhatsApp. Por favor, conecte a instância no painel da Z-API primeiro.';
        } else if (erroTwilioLimite) {
          errorMessage = 'Limite diário de mensagens do Twilio excedido. Tente novamente amanhã ou conecte a instância Z-API.';
        }
        
        return res.status(500).json({
          success: false,
          error: errorMessage,
          details: erroEnvio?.message || 'Nenhum serviço de envio disponível',
          code: erroTwilioLimite ? 'LIMIT_EXCEEDED' : 'SERVICE_UNAVAILABLE'
        });
      }
    }
    
    // Sucesso
    res.json({
      success: true,
      message: 'Código de verificação enviado via WhatsApp',
      telefone: telefoneFormatado
    });
  } catch (error: any) {
    console.error('❌ Erro ao solicitar código:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar solicitação'
    });
  }
});

// API: Cadastro de novo usuário
app.post('/api/auth/cadastro', async (req, res) => {
  try {
    const { telefone, nome, email } = req.body;
    
    if (!telefone || !telefone.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Telefone é obrigatório'
      });
    }
    
    if (!nome || !nome.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Nome é obrigatório'
      });
    }
    
    // Limpa o telefone
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneFormatado = telefoneLimpo.startsWith('55') 
      ? `whatsapp:+${telefoneLimpo}` 
      : `whatsapp:+55${telefoneLimpo}`;
    
    console.log('📝 Cadastro de novo usuário:', telefoneFormatado);
    
    // Verifica se o usuário já existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { telefone: telefoneFormatado }
    });
    
    if (usuarioExistente) {
      return res.status(400).json({
        success: false,
        error: 'Usuário já cadastrado. Faça login ou recupere sua senha.'
      });
    }
    
    // Calcula data de expiração do trial (7 dias a partir de agora)
    const trialExpiraEm = new Date();
    trialExpiraEm.setDate(trialExpiraEm.getDate() + 7);
    
    // Cria o usuário
    const novoUsuario = await prisma.usuario.create({
      data: {
        telefone: telefoneFormatado,
        nome: nome.trim(),
        email: email?.trim() || null,
        trialExpiraEm: trialExpiraEm,
        status: 'trial'
      }
    });
    
    // Registra o número se ainda não estiver registrado
    if (!(await numeroEstaRegistrado(telefoneFormatado))) {
      await registrarNumero(telefoneFormatado);
    }
    
    console.log(`✅ Usuário cadastrado: ${novoUsuario.nome} (${telefoneFormatado})`);
    console.log(`   Trial expira em: ${trialExpiraEm.toLocaleString('pt-BR')}`);
    
    res.json({
      success: true,
      message: 'Cadastro realizado com sucesso! Seu trial de 7 dias foi ativado.',
      usuario: {
        telefone: novoUsuario.telefone,
        nome: novoUsuario.nome,
        trialExpiraEm: novoUsuario.trialExpiraEm,
        status: novoUsuario.status
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao cadastrar usuário:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar cadastro'
    });
  }
});

// API: Verificar código e fazer login
app.post('/api/auth/verificar-codigo', async (req, res) => {
  try {
    const { telefone, codigo } = req.body;
    
    if (!telefone || !telefone.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Telefone é obrigatório'
      });
    }
    
    if (!codigo || !codigo.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Código é obrigatório'
      });
    }
    
    // Limpa o telefone
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneFormatado = telefoneLimpo.startsWith('55') 
      ? `whatsapp:+${telefoneLimpo}` 
      : `whatsapp:+55${telefoneLimpo}`;
    
    console.log('🔍 Verificando código para:', telefoneFormatado);
    console.log('   Código recebido do frontend:', codigo);
    
    // Verifica o código (já normaliza internamente)
    const codigoValido = await verificarCodigo(telefoneFormatado, codigo);
    
    if (!codigoValido) {
      return res.status(401).json({
        success: false,
        error: 'Código inválido ou expirado'
      });
    }
    
    // Verifica se o usuário existe no cadastro
    const usuario = await prisma.usuario.findUnique({
      where: { telefone: telefoneFormatado }
    });
    
    if (!usuario) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não cadastrado. Por favor, faça o cadastro primeiro.',
        precisaCadastro: true
      });
    }
    
    // Verifica se o trial expirou
    const agora = new Date();
    const trialExpirado = agora > usuario.trialExpiraEm;
    
    if (trialExpirado && usuario.status === 'trial') {
      // Atualiza status para expirado
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { status: 'expirado' }
      });
      
      return res.status(403).json({
        success: false,
        error: 'Seu período de trial expirou. Por favor, assine um plano para continuar usando o sistema.',
        trialExpirado: true,
        trialExpiraEm: usuario.trialExpiraEm
      });
    }
    
    // Registra o número se ainda não estiver registrado (para compatibilidade)
    if (!(await numeroEstaRegistrado(telefoneFormatado))) {
      await registrarNumero(telefoneFormatado);
    }
    
    // Cria templates padrão se não existirem
    await criarTemplatesPadrao(telefoneFormatado);
    
    // Gera token JWT
    const token = gerarToken(telefoneFormatado);
    
    // Calcula dias restantes do trial
    const diasRestantes = usuario.status === 'trial' 
      ? Math.ceil((usuario.trialExpiraEm.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    // LOG PARA DESENVOLVIMENTO: Mostra o token no console
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ LOGIN REALIZADO COM SUCESSO');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📞 Telefone: ${telefoneFormatado}`);
    console.log(`👤 Nome: ${usuario.nome}`);
    console.log(`📊 Status: ${usuario.status}`);
    if (diasRestantes !== null) {
      console.log(`⏰ Dias restantes do trial: ${diasRestantes}`);
    }
    console.log(`🔑 TOKEN JWT:`);
    console.log(token);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    res.json({
      success: true,
      token,
      telefone: telefoneFormatado,
      message: 'Login realizado com sucesso',
      usuario: {
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        status: usuario.status,
        trialExpiraEm: usuario.trialExpiraEm,
        diasRestantesTrial: diasRestantes
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao verificar código:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar verificação'
    });
  }
});

// API: Atualizar perfil do usuário - PROTEGIDA
app.put('/api/auth/perfil', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📝 PUT /api/auth/perfil - INÍCIO');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    const { nome, email } = req.body;
    const telefone = req.telefone; // Telefone do usuário autenticado via JWT

    if (!telefone) {
      console.error('❌ ERRO: telefone não encontrado no token JWT');
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    console.log(`📞 Telefone do usuário: ${telefone}`);
    console.log(`📝 Dados recebidos:`, { nome, email });

    // Validação
    if (!nome || !nome.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Nome é obrigatório'
      });
    }

    // Formata o telefone para o formato do banco
    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;

    // Busca o usuário
    const usuario = await prisma.usuario.findUnique({
      where: { telefone: telefoneFormatado }
    });

    if (!usuario) {
      console.error(`❌ Usuário não encontrado: ${telefoneFormatado}`);
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    // Atualiza o usuário (nome e email)
    const dadosAtualizacao: any = {
      nome: nome.trim()
    };

    if (email && email.trim()) {
      // Valida formato de email básico
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Formato de email inválido'
        });
      }
      dadosAtualizacao.email = email.trim();
    }

    const usuarioAtualizado = await prisma.usuario.update({
      where: { telefone: telefoneFormatado },
      data: dadosAtualizacao
    });

    console.log(`✅ Perfil atualizado com sucesso para: ${telefoneFormatado}`);
    console.log(`   Nome: ${usuarioAtualizado.nome}`);
    console.log(`   Email: ${usuarioAtualizado.email || 'Não informado'}`);

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      usuario: {
        nome: usuarioAtualizado.nome,
        email: usuarioAtualizado.email,
        telefone: usuarioAtualizado.telefone,
        status: usuarioAtualizado.status
      }
    });
  } catch (error: any) {
    console.error('\n❌ ERRO em PUT /api/auth/perfil:');
    console.error('   Mensagem:', error.message);
    console.error('   Stack:', error.stack);
    console.log('═══════════════════════════════════════════════════════════\n');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao atualizar perfil'
    });
  }
});

// Função auxiliar para criar templates padrão
async function criarTemplatesPadrao(telefone: string) {
  const telefoneFormatado = telefone.startsWith('whatsapp:') 
    ? telefone 
    : telefone.startsWith('+')
    ? `whatsapp:${telefone}`
    : `whatsapp:+${telefone}`;

  // Verifica se já existem templates para este usuário
  const templatesExistentes = await prisma.template.findMany({
    where: { telefone: telefoneFormatado }
  });

  if (templatesExistentes.length > 0) {
    return; // Já existem templates
  }

  // Template Dark
  const templateDark = await prisma.template.create({
    data: {
      telefone: telefoneFormatado,
      nome: 'Dark',
      tipo: 'dark',
      corPrimaria: '#3B82F6',
      corSecundaria: '#8B5CF6',
      corDestaque: '#10B981',
      corFundo: '#1E293B',
      corTexto: '#F1F5F9',
      ativo: 0
    }
  });

  // Template Light
  const templateLight = await prisma.template.create({
    data: {
      telefone: telefoneFormatado,
      nome: 'Light',
      tipo: 'light',
      corPrimaria: '#3B82F6',
      corSecundaria: '#8B5CF6',
      corDestaque: '#10B981',
      corFundo: '#F9FAFB',
      corTexto: '#111827',
      ativo: 1 // Light é o padrão
    }
  });

  // Atualiza o usuário com o template ativo
  await prisma.usuario.update({
    where: { telefone: telefoneFormatado },
    data: { templateAtivoId: templateLight.id }
  });

  console.log(`✅ Templates padrão criados para: ${telefoneFormatado}`);
}

// API: Listar templates - PROTEGIDA
app.get('/api/templates', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;

    // Cria templates padrão se não existirem
    await criarTemplatesPadrao(telefoneFormatado);

    const templates = await prisma.template.findMany({
      where: { telefone: telefoneFormatado },
      orderBy: [
        { ativo: 'desc' },
        { tipo: 'asc' },
        { criadoEm: 'asc' }
      ]
    });

    res.json({
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
    console.error('❌ Erro ao listar templates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao listar templates'
    });
  }
});

// API: Criar template - PROTEGIDA
app.post('/api/templates', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { nome, corPrimaria, corSecundaria, corDestaque, corFundo, corTexto } = req.body;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    if (!nome || !nome.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Nome do template é obrigatório'
      });
    }

    // Valida formato hex das cores
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const cores = [corPrimaria, corSecundaria, corDestaque, corFundo, corTexto];
    for (const cor of cores) {
      if (!cor || !hexRegex.test(cor)) {
        return res.status(400).json({
          success: false,
          error: 'Todas as cores devem estar no formato hexadecimal (ex: #3B82F6)'
        });
      }
    }

    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;

    const template = await prisma.template.create({
      data: {
        telefone: telefoneFormatado,
        nome: nome.trim(),
        tipo: 'custom',
        corPrimaria,
        corSecundaria,
        corDestaque,
        corFundo,
        corTexto,
        ativo: 0
      }
    });

    res.json({
      success: true,
      message: 'Template criado com sucesso',
      template: {
        id: template.id,
        nome: template.nome,
        tipo: template.tipo,
        corPrimaria: template.corPrimaria,
        corSecundaria: template.corSecundaria,
        corDestaque: template.corDestaque,
        corFundo: template.corFundo,
        corTexto: template.corTexto,
        ativo: template.ativo === 1
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao criar template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar template'
    });
  }
});

// API: Atualizar template - PROTEGIDA
app.put('/api/templates/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { nome, corPrimaria, corSecundaria, corDestaque, corFundo, corTexto } = req.body;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;

    // Verifica se o template pertence ao usuário
    const template = await prisma.template.findFirst({
      where: { id: parseInt(id), telefone: telefoneFormatado }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado'
      });
    }

    // Não permite editar templates padrão (dark e light)
    if (template.tipo !== 'custom') {
      return res.status(400).json({
        success: false,
        error: 'Não é possível editar templates padrão'
      });
    }

    const dadosAtualizacao: any = {};
    if (nome) dadosAtualizacao.nome = nome.trim();
    
    // Valida formato hex das cores se fornecidas
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (corPrimaria !== undefined) {
      if (!corPrimaria || !hexRegex.test(corPrimaria)) {
        return res.status(400).json({
          success: false,
          error: 'Cor primária deve estar no formato hexadecimal'
        });
      }
      dadosAtualizacao.corPrimaria = corPrimaria;
    }
    if (corSecundaria !== undefined) {
      if (!corSecundaria || !hexRegex.test(corSecundaria)) {
        return res.status(400).json({
          success: false,
          error: 'Cor secundária deve estar no formato hexadecimal'
        });
      }
      dadosAtualizacao.corSecundaria = corSecundaria;
    }
    if (corDestaque !== undefined) {
      if (!corDestaque || !hexRegex.test(corDestaque)) {
        return res.status(400).json({
          success: false,
          error: 'Cor de destaque deve estar no formato hexadecimal'
        });
      }
      dadosAtualizacao.corDestaque = corDestaque;
    }
    if (corFundo !== undefined) {
      if (!corFundo || !hexRegex.test(corFundo)) {
        return res.status(400).json({
          success: false,
          error: 'Cor de fundo deve estar no formato hexadecimal'
        });
      }
      dadosAtualizacao.corFundo = corFundo;
    }
    if (corTexto !== undefined) {
      if (!corTexto || !hexRegex.test(corTexto)) {
        return res.status(400).json({
          success: false,
          error: 'Cor de texto deve estar no formato hexadecimal'
        });
      }
      dadosAtualizacao.corTexto = corTexto;
    }

    const templateAtualizado = await prisma.template.update({
      where: { id: parseInt(id) },
      data: dadosAtualizacao
    });

    res.json({
      success: true,
      message: 'Template atualizado com sucesso',
      template: {
        id: templateAtualizado.id,
        nome: templateAtualizado.nome,
        tipo: templateAtualizado.tipo,
        corPrimaria: templateAtualizado.corPrimaria,
        corSecundaria: templateAtualizado.corSecundaria,
        corDestaque: templateAtualizado.corDestaque,
        corFundo: templateAtualizado.corFundo,
        corTexto: templateAtualizado.corTexto,
        ativo: templateAtualizado.ativo === 1
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao atualizar template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao atualizar template'
    });
  }
});

// API: Deletar template - PROTEGIDA
app.delete('/api/templates/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;

    // Verifica se o template pertence ao usuário
    const template = await prisma.template.findFirst({
      where: { id: parseInt(id), telefone: telefoneFormatado }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado'
      });
    }

    // Não permite deletar templates padrão
    if (template.tipo !== 'custom') {
      return res.status(400).json({
        success: false,
        error: 'Não é possível deletar templates padrão'
      });
    }

    await prisma.template.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Template deletado com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro ao deletar template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao deletar template'
    });
  }
});

// API: Ativar template - PROTEGIDA
app.put('/api/templates/:id/ativar', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;

    // Verifica se o template pertence ao usuário
    const template = await prisma.template.findFirst({
      where: { id: parseInt(id), telefone: telefoneFormatado }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template não encontrado'
      });
    }

    // Desativa todos os templates do usuário
    await prisma.template.updateMany({
      where: { telefone: telefoneFormatado },
      data: { ativo: 0 }
    });

    // Ativa o template selecionado
    await prisma.template.update({
      where: { id: parseInt(id) },
      data: { ativo: 1 }
    });

    // Atualiza o usuário com o template ativo
    await prisma.usuario.update({
      where: { telefone: telefoneFormatado },
      data: { templateAtivoId: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Template ativado com sucesso',
      template: {
        id: template.id,
        nome: template.nome,
        tipo: template.tipo,
        corPrimaria: template.corPrimaria,
        corSecundaria: template.corSecundaria,
        corDestaque: template.corDestaque,
        corFundo: template.corFundo,
        corTexto: template.corTexto,
        ativo: true
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao ativar template:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao ativar template'
    });
  }
});

// API: Enviar mensagem para salvar contato - PROTEGIDA
app.post('/api/auth/enviar-contato', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📱 POST /api/auth/enviar-contato - INÍCIO');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    const telefone = req.telefone; // Telefone do usuário autenticado via JWT

    if (!telefone) {
      console.error('❌ ERRO: telefone não encontrado no token JWT');
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    console.log(`📞 Telefone do usuário: ${telefone}`);

    // Formata o telefone para o formato do banco
    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;

    // Busca o usuário para obter o nome
    const usuario = await prisma.usuario.findUnique({
      where: { telefone: telefoneFormatado }
    });

    if (!usuario) {
      console.error(`❌ Usuário não encontrado: ${telefoneFormatado}`);
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    // Obtém o número do WhatsApp do agente
    // Prioriza Z-API, depois Twilio
    let numeroAgenteFormatado = ''; // Formato: (61) 98147-4690
    let numeroAgenteCompleto = ''; // Formato: +5561981474690
    let nomeAgente = 'Zela';
    
    if (zapiEstaConfigurada()) {
      // Para Z-API, usa o número do .env ou padrão
      const zapiPhone = process.env.ZAPI_PHONE || process.env.TWILIO_WHATSAPP_NUMBER || YOUR_WHATSAPP_NUMBER;
      const numeroLimpo = zapiPhone.replace('whatsapp:', '').replace('+', '');
      numeroAgenteCompleto = numeroLimpo.startsWith('55') ? `+${numeroLimpo}` : `+55${numeroLimpo}`;
      
      // Formata para exibição: (61) 98147-4690
      const ddd = numeroLimpo.substring(2, 4);
      const parte1 = numeroLimpo.substring(4, 9);
      const parte2 = numeroLimpo.substring(9);
      numeroAgenteFormatado = `(${ddd}) ${parte1}-${parte2}`;
    } else if (twilioWhatsAppNumber) {
      const numeroLimpo = twilioWhatsAppNumber.replace('whatsapp:', '').replace('+', '');
      numeroAgenteCompleto = numeroLimpo.startsWith('55') ? `+${numeroLimpo}` : `+55${numeroLimpo}`;
      
      // Formata para exibição
      const ddd = numeroLimpo.substring(2, 4);
      const parte1 = numeroLimpo.substring(4, 9);
      const parte2 = numeroLimpo.substring(9);
      numeroAgenteFormatado = `(${ddd}) ${parte1}-${parte2}`;
    } else {
      // Usa o número padrão
      const numeroLimpo = YOUR_WHATSAPP_NUMBER.replace('whatsapp:', '').replace('+', '');
      numeroAgenteCompleto = numeroLimpo.startsWith('55') ? `+${numeroLimpo}` : `+55${numeroLimpo}`;
      
      const ddd = numeroLimpo.substring(2, 4);
      const parte1 = numeroLimpo.substring(4, 9);
      const parte2 = numeroLimpo.substring(9);
      numeroAgenteFormatado = `(${ddd}) ${parte1}-${parte2}`;
    }

    // Monta a mensagem com instruções para salvar o contato
    const numeroParaSalvar = numeroAgenteCompleto.replace('+', ''); // Remove o + para facilitar a cópia
    const mensagem = `📱 *Salvar Contato do Zela*\n\n` +
      `Olá ${usuario.nome || 'usuário'}! 👋\n\n` +
      `Para não perder nossas mensagens importantes, salve nosso contato no seu WhatsApp:\n\n` +
      `📝 *Nome:* ${nomeAgente}\n` +
      `📞 *Número:* ${numeroAgenteFormatado}\n` +
      `📱 *Número completo:* ${numeroParaSalvar}\n\n` +
      `*Como salvar:*\n` +
      `1️⃣ Abra o WhatsApp\n` +
      `2️⃣ Toque em "Novo contato" ou no ícone ➕\n` +
      `3️⃣ Digite o nome: ${nomeAgente}\n` +
      `4️⃣ Digite o número: ${numeroParaSalvar}\n` +
      `5️⃣ Toque em "Salvar"\n\n` +
      `Assim você sempre receberá nossas notificações importantes! ✅`;

    console.log(`📤 Enviando mensagem para salvar contato...`);
    console.log(`   Número do agente (formatado): ${numeroAgenteFormatado}`);
    console.log(`   Número completo: ${numeroAgenteCompleto}`);

    // Envia a mensagem via Z-API ou Twilio
    let mensagemEnviada = false;
    
    if (zapiEstaConfigurada()) {
      const resultado = await enviarMensagemZApi(telefoneFormatado, mensagem);
      if (resultado.success) {
        mensagemEnviada = true;
        console.log(`✅ Mensagem enviada via Z-API`);
      } else {
        console.error(`❌ Erro ao enviar via Z-API: ${resultado.error}`);
      }
    }
    
    if (!mensagemEnviada && twilioWhatsAppNumber) {
      try {
        await client.messages.create({
          from: twilioWhatsAppNumber,
          to: telefoneFormatado,
          body: mensagem
        });
        mensagemEnviada = true;
        console.log(`✅ Mensagem enviada via Twilio`);
      } catch (error: any) {
        console.error(`❌ Erro ao enviar via Twilio: ${error.message}`);
      }
    }

    if (!mensagemEnviada) {
      return res.status(500).json({
        success: false,
        error: 'Não foi possível enviar a mensagem. Verifique a configuração do WhatsApp.'
      });
    }

    console.log(`✅ Mensagem de contato enviada com sucesso!`);
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso! Verifique seu WhatsApp.',
      numeroAgente: numeroAgenteFormatado,
      numeroCompleto: numeroAgenteCompleto
    });
  } catch (error: any) {
    console.error('\n❌ ERRO em POST /api/auth/enviar-contato:');
    console.error('   Mensagem:', error.message);
    console.error('   Stack:', error.stack);
    console.log('═══════════════════════════════════════════════════════════\n');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao enviar mensagem'
    });
  }
});

// API: Verificar se telefone existe e fazer login (DEPRECADO - mantido para compatibilidade)
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Requisição de login recebida:', req.body);
  try {
    const { telefone } = req.body;
    
    if (!telefone) {
      return res.status(400).json({
        success: false,
        error: 'Telefone é obrigatório'
      });
    }

    // Limpa o telefone (remove espaços, caracteres especiais)
    const telefoneLimpo = telefone.replace(/\D/g, '');
    
    // Tenta diferentes formatos
    // Se o número tem 11 dígitos (DDD + número), assume que é brasileiro
    const temDDD = telefoneLimpo.length === 11;
    const ddd = temDDD ? telefoneLimpo.substring(0, 2) : '';
    const numero = temDDD ? telefoneLimpo.substring(2) : telefoneLimpo;
    
    const formatos = [
      `+55${telefoneLimpo}`,                    // +5561981474690
      `+55${ddd}${numero}`,                     // +5561981474690 (com DDD)
      `+${telefoneLimpo}`,                      // +61981474690 (se já tiver 55)
      telefoneLimpo,                             // 5561981474690
      telefoneLimpo.replace(/^55/, ''),         // 61981474690 (sem DDI)
      `55${telefoneLimpo}`,                      // 5561981474690 (sem +)
      `+5561${numero}`,                          // +5561981474690 (assumindo DDD 61)
      `5561${numero}`,                           // 5561981474690 (sem +, DDD 61)
    ];
    
    // Remove duplicatas
    const formatosUnicos = [...new Set(formatos)];
    
    console.log(`   📞 Telefone recebido: ${telefone}`);
    console.log(`   📞 Telefone limpo: ${telefoneLimpo}`);
    console.log(`   🔍 Tentando formatos:`, formatosUnicos);

    // Tenta buscar com cada formato até encontrar
    let transacoes: any[] = [];
    let telefoneEncontrado = '';
    let numeroRegistrado = false;
    
    // Primeiro verifica se o número está registrado (mesmo sem transações)
    console.log(`   🔍 Verificando se número está registrado...`);
    for (const formato of formatosUnicos) {
      const estaRegistrado = await numeroEstaRegistrado(formato);
      console.log(`   🔍 Verificando registro "${formato}": ${estaRegistrado ? 'SIM' : 'NÃO'}`);
      if (estaRegistrado) {
        numeroRegistrado = true;
        // Busca o telefone exato do banco para usar o formato correto
        const transacoesTeste = await buscarTransacoesPorTelefone(formato);
        if (transacoesTeste.length > 0) {
          telefoneEncontrado = transacoesTeste[0].telefone; // Usa o formato do banco
          transacoes = transacoesTeste; // Já tem as transações
        } else {
          // Se não tem transações, busca o telefone exato na tabela de registrados
          const todosNumeros = await prisma.numeroRegistrado.findMany({
            select: { telefone: true },
          });
          for (const num of todosNumeros) {
            const numLimpo = num.telefone.replace(/\D/g, '');
            const formatoLimpo = formato.replace(/\D/g, '');
            // Compara últimos dígitos
            for (const tamanho of [8, 9, 10, 11]) {
              if (formatoLimpo.length >= tamanho && numLimpo.length >= tamanho) {
                if (formatoLimpo.slice(-tamanho) === numLimpo.slice(-tamanho)) {
                  telefoneEncontrado = num.telefone;
                  break;
                }
              }
            }
            if (telefoneEncontrado) break;
          }
          if (!telefoneEncontrado) telefoneEncontrado = formato;
        }
        console.log(`   ✅ Número registrado encontrado: ${telefoneEncontrado}`);
        break;
      }
    }
    
    // Se não está registrado, busca por transações
    if (!numeroRegistrado) {
      for (const formato of formatosUnicos) {
        const resultado = await buscarTransacoesPorTelefone(formato);
        console.log(`   🔍 Buscando "${formato}": ${resultado.length} transações`);
        
        if (resultado.length > 0) {
          transacoes = resultado;
          telefoneEncontrado = resultado[0].telefone; // Usa o formato exato do banco
          console.log(`   ✅ Telefone encontrado no formato: ${telefoneEncontrado}`);
          break;
        }
      }
    }
    
    // Se não encontrou nem registro nem transações
    if (!numeroRegistrado && transacoes.length === 0) {
      // Lista todos os telefones no banco para debug
      const todosTelefones = await listarTelefones();
      console.log(`   📋 Total de telefones no banco: ${todosTelefones.length}`);
      console.log(`   📋 Telefones no banco:`, todosTelefones.map(t => t.telefone));
      
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado. Você precisa ter pelo menos uma mensagem enviada ou transação registrada.',
        debug: {
          telefoneRecebido: telefone,
          formatosTentados: formatosUnicos,
          telefonesNoBanco: todosTelefones.map(t => t.telefone),
          totalTelefones: todosTelefones.length
        }
      });
    }
    
    // Se encontrou registro mas não tem transações, busca transações vazias
    if (numeroRegistrado && transacoes.length === 0) {
      transacoes = [];
    }

    // Busca estatísticas do telefone (pode ser 0 se não tiver transações ainda)
    const total = transacoes.length > 0 ? await calcularTotalPorTelefone(telefoneEncontrado) : 0;
    const stats = transacoes.length > 0 ? await obterEstatisticas({ telefone: telefoneEncontrado }) : {
      totalGasto: 0,
      totalTransacoes: 0,
      mediaGasto: 0,
      maiorGasto: 0,
      menorGasto: 0,
      gastoHoje: 0,
      gastoMes: 0
    };

    // Gera token JWT
    const token = gerarToken(telefoneEncontrado);

    res.json({
      success: true,
      token: token,
      telefone: telefoneEncontrado,
      usuario: {
        telefone: telefoneEncontrado,
        totalTransacoes: transacoes.length,
        totalGasto: total,
        primeiraTransacao: transacoes.length > 0 ? transacoes[transacoes.length - 1]?.dataHora : null,
        ultimaTransacao: transacoes.length > 0 ? transacoes[0]?.dataHora : null,
        numeroRegistrado: numeroRegistrado
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Verificar token JWT
app.get('/api/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token não fornecido'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verificarToken(token);

    // Formata o telefone para buscar no banco
    const telefoneFormatado = decoded.telefone.startsWith('whatsapp:') 
      ? decoded.telefone 
      : decoded.telefone.startsWith('+')
      ? `whatsapp:${decoded.telefone}`
      : `whatsapp:+${decoded.telefone}`;

    // Busca o usuário no banco de dados
    console.log('🔍 Verificando usuário com telefone formatado:', telefoneFormatado);
    let usuario = await prisma.usuario.findUnique({
      where: { telefone: telefoneFormatado }
    });

    if (!usuario) {
      console.error('❌ Usuário não encontrado para telefone:', telefoneFormatado);
      console.error('   Telefone original do token:', decoded.telefone);
      // Tenta buscar com variações do telefone
      const telefoneSemWhatsapp = telefoneFormatado.replace('whatsapp:', '');
      const telefoneSemMais = telefoneSemWhatsapp.replace('+', '');
      const variacoes = [
        telefoneFormatado,
        telefoneSemWhatsapp,
        telefoneSemMais,
        `whatsapp:${telefoneSemMais}`,
        `+${telefoneSemMais}`
      ];
      
      for (const variacao of variacoes) {
        const usuarioVariacao = await prisma.usuario.findUnique({
          where: { telefone: variacao }
        });
        if (usuarioVariacao) {
          console.log('✅ Usuário encontrado com variação:', variacao);
          // Atualiza o telefone no banco para o formato correto
          await prisma.usuario.update({
            where: { id: usuarioVariacao.id },
            data: { telefone: telefoneFormatado }
          });
          // Usa o usuário encontrado
          usuario = usuarioVariacao;
          break;
        }
      }
      
      if (!usuario) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }
    } else {
      console.log('✅ Usuário encontrado:', {
        telefone: usuario.telefone,
        nome: usuario.nome,
        status: usuario.status
      });
    }

    // Busca estatísticas do usuário
    const stats = await obterEstatisticas({ telefone: decoded.telefone });
    const total = await calcularTotalPorTelefone(decoded.telefone);

    // Calcula dias restantes do trial
    const agora = new Date();
    const diasRestantes = usuario.status === 'trial' 
      ? Math.ceil((usuario.trialExpiraEm.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    res.json({
      success: true,
      telefone: decoded.telefone,
      usuario: {
        telefone: usuario.telefone,
        nome: usuario.nome,
        email: usuario.email,
        status: usuario.status,
        trialExpiraEm: usuario.trialExpiraEm,
        diasRestantesTrial: diasRestantes,
        totalTransacoes: stats.totalTransacoes,
        totalGasto: total,
      }
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message || 'Token inválido'
    });
  }
});

// REMOVIDO: Endpoint público removido por segurança
// Use /api/estatisticas com autenticação que já retorna resumo do usuário
// app.get('/api/resumo/:telefone', ...) - REMOVIDO

// Server-Sent Events: Stream de mensagens em tempo real
app.get('/api/mensagens/stream', (req, res) => {
  console.log('🔌 Cliente SSE conectado');
  
  // Configura headers para SSE
  // Verifica origem para SSE também
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Accel-Buffering', 'no'); // Desabilita buffering do nginx
  
  // Envia um ping inicial para manter a conexão viva
  res.write(': ping\n\n');
  
  // Adiciona cliente à lista
  clientesSSE.push(res);
  console.log(`   Total de clientes conectados: ${clientesSSE.length}`);
  
  // Envia mensagens existentes ao conectar
  if (mensagensRecebidas.length > 0) {
    console.log(`   Enviando ${mensagensRecebidas.length} mensagens existentes`);
    mensagensRecebidas.forEach((mensagem) => {
      res.write(`data: ${JSON.stringify(mensagem)}\n\n`);
    });
  } else {
    // Envia mensagem vazia para confirmar conexão
    res.write(`data: ${JSON.stringify({ tipo: 'conexao', mensagem: 'Conectado com sucesso' })}\n\n`);
  }
  
  // Remove cliente quando desconectar
  req.on('close', () => {
    const index = clientesSSE.indexOf(res);
    if (index > -1) {
      clientesSSE.splice(index, 1);
      console.log('🔌 Cliente SSE desconectado');
      console.log(`   Total de clientes conectados: ${clientesSSE.length}`);
    }
  });
  
  // Envia ping a cada 30 segundos para manter conexão viva
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (error) {
      clearInterval(pingInterval);
      const index = clientesSSE.indexOf(res);
      if (index > -1) {
        clientesSSE.splice(index, 1);
      }
    }
  }, 30000);
  
  // Limpa o intervalo quando desconectar
  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Servidor rodando',
    mensagens: mensagensRecebidas.length,
    clientesConectados: clientesSSE.length
  });
});

// Rota de teste para SSE
app.get('/test-sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"teste": "conexao funcionando"}\n\n');
  
  setTimeout(() => {
    res.write('data: {"teste": "segunda mensagem"}\n\n');
    res.end();
  }, 2000);
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor WhatsApp Webhook está rodando',
    endpoints: {
      webhook: '/webhook/whatsapp',
      statusCallback: '/webhook/status',
      sendMessage: '/send-message',
      sendTemplate: '/send-template',
      app: '/app'
    },
    twilioNumber: twilioWhatsAppNumber,
    destinationNumber: YOUR_WHATSAPP_NUMBER,
    examples: {
      sendSimpleMessage: {
        method: 'POST',
        url: '/send-message',
        body: { message: 'oi', to: 'whatsapp:+556181474690' }
      },
      sendTemplate: {
        method: 'POST',
        url: '/send-template',
        body: {
          contentSid: 'HXb5b62575e6e4ff6129ad7c8efe1f983e',
          contentVariables: '{"1":"12/1","2":"3pm"}',
          to: 'whatsapp:+556181474690'
        }
      }
    }
  });
});

// Rota para testar envio de mensagem manualmente (texto simples ou com mídia)
app.post('/send-message', async (req, res) => {
  try {
    const { 
      message = 'oi', 
      to, 
      mediaUrl,
      statusCallback 
    } = req.body;
    const destination = to || YOUR_WHATSAPP_NUMBER;
    
    console.log('📤 Enviando mensagem:');
    console.log('   De:', twilioWhatsAppNumber);
    console.log('   Para:', destination);
    console.log('   Mensagem:', message);
    if (mediaUrl) {
      console.log('   Mídia:', Array.isArray(mediaUrl) ? mediaUrl.join(', ') : mediaUrl);
    }
    if (statusCallback) {
      console.log('   Status Callback:', statusCallback);
    }
    console.log('');
    
    // Prepara parâmetros da mensagem
    const messageParams: any = {
      body: message,
      from: twilioWhatsAppNumber,
      to: destination
    };

    // Adiciona mídia se fornecida (pode ser string ou array)
    if (mediaUrl) {
      messageParams.mediaUrl = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
    }

    // Adiciona status callback se fornecido
    if (statusCallback) {
      messageParams.statusCallback = statusCallback;
    }
    
    const twilioMessage = await client.messages.create(messageParams);

    // Registra o número na primeira mensagem enviada
    await registrarNumero(destination);

    console.log('✅ Mensagem enviada com sucesso!');
    console.log('   SID:', twilioMessage.sid);
    console.log('   Status:', twilioMessage.status);
    if (twilioMessage.numMedia) {
      console.log('   Mídia:', twilioMessage.numMedia, 'arquivo(s)');
    }
    console.log('');

    res.json({ 
      success: true, 
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
      numMedia: twilioMessage.numMedia || '0',
      message: 'Mensagem enviada com sucesso!'
    });
  } catch (error: any) {
    console.error('❌ Erro ao enviar mensagem:');
    console.error('   Mensagem:', error.message);
    console.error('   Código:', error.code);
    console.error('');
    
    res.status(400).json({ 
      success: false, 
      error: error.message,
      code: error.code
    });
  }
});

// Rota para receber status callbacks do Twilio
app.post('/webhook/status', (req, res) => {
  console.log('📊 Status callback recebido:');
  console.log('   Message SID:', req.body.MessageSid);
  console.log('   Status:', req.body.MessageStatus);
  console.log('   Error Code:', req.body.ErrorCode || 'N/A');
  console.log('   Error Message:', req.body.ErrorMessage || 'N/A');
  console.log('');
  
  // Responde ao Twilio
  res.status(200).send('OK');
});

// Rota para enviar mensagem usando ContentSid (templates do WhatsApp)
app.post('/send-template', async (req, res) => {
  try {
    const { 
      contentSid, 
      contentVariables, 
      to 
    } = req.body;
    
    console.log('📤 Recebida requisição para enviar template:');
    console.log('   ContentSid:', contentSid);
    console.log('   ContentVariables:', contentVariables);
    console.log('   To:', to);
    console.log('');
    
    if (!contentSid) {
      return res.status(400).json({ 
        success: false, 
        error: 'ContentSid é obrigatório' 
      });
    }

    const destination = to || YOUR_WHATSAPP_NUMBER;
    
    // Prepara os parâmetros da mensagem
    const messageParams: any = {
      from: twilioWhatsAppNumber,
      to: destination,
      contentSid: contentSid
    };

    // Adiciona ContentVariables se fornecido
    // IMPORTANTE: contentVariables deve ser uma STRING JSON, não um objeto
    if (contentVariables) {
      messageParams.contentVariables = typeof contentVariables === 'string' 
        ? contentVariables 
        : JSON.stringify(contentVariables);
    }
    
    console.log('📋 Parâmetros da mensagem:');
    console.log('   From:', messageParams.from);
    console.log('   To:', messageParams.to);
    console.log('   ContentSid:', messageParams.contentSid);
    console.log('   ContentVariables:', messageParams.contentVariables);
    console.log('');
    
    console.log('⏳ Enviando mensagem via Twilio...');
    const twilioMessage = await client.messages.create(messageParams);

    // Registra o número na primeira mensagem enviada
    await registrarNumero(destination);

    console.log('✅ Mensagem enviada com sucesso!');
    console.log('   SID:', twilioMessage.sid);
    console.log('   Status:', twilioMessage.status);
    console.log('');

    res.json({
      success: true,
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
      message: 'Template enviado com sucesso!'
    });
  } catch (error: any) {
    console.error('❌ Erro ao enviar template:');
    console.error('   Mensagem:', error.message);
    console.error('   Código:', error.code);
    if (error.moreInfo) {
      console.error('   Mais info:', error.moreInfo);
    }
    console.error('');
    
    res.status(400).json({ 
      success: false, 
      error: error.message,
      code: error.code,
      moreInfo: error.moreInfo
    });
  }
});

// API: Chat de IA para consultas financeiras - PROTEGIDA
// API: Agendamentos - PROTEGIDA
app.get('/api/agendamentos', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { status, dataInicio, dataFim } = req.query;
    const telefone = req.telefone;

    console.log('📋 GET /api/agendamentos');
    console.log(`   Telefone do token: ${telefone}`);
    console.log(`   Filtros: status=${status}, dataInicio=${dataInicio}, dataFim=${dataFim}`);

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    // Não precisa formatar, a função buscarAgendamentosPorTelefone já faz busca flexível
    // Passa o telefone como está (pode ter whatsapp: ou não)
    const filtros: any = {};
    if (status) filtros.status = status;
    if (dataInicio) filtros.dataInicio = dataInicio;
    if (dataFim) filtros.dataFim = dataFim;

    console.log(`   Buscando agendamentos para: "${telefone}" (formato original do token)`);
    const agendamentos = await buscarAgendamentosPorTelefone(telefone, filtros);
    console.log(`   ✅ Encontrados ${agendamentos.length} agendamentos`);
    
    // Log dos agendamentos encontrados para debug
    if (agendamentos.length > 0) {
      console.log(`   📋 Primeiro agendamento:`, {
        id: agendamentos[0].id,
        telefone: agendamentos[0].telefone,
        descricao: agendamentos[0].descricao
      });
    }

    res.json({
      success: true,
      agendamentos
    });
  } catch (error: any) {
    console.error('❌ Erro ao buscar agendamentos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Função auxiliar para normalizar telefones para comparação
function normalizarTelefoneParaComparacao(telefone: string): string {
  if (!telefone) return '';
  // Remove "whatsapp:" se houver
  let normalizado = telefone.replace(/^whatsapp:/i, '').trim();
  // Remove todos os caracteres não numéricos
  normalizado = normalizado.replace(/\D/g, '');
  return normalizado;
}

// Função auxiliar para comparar telefones de forma flexível
function telefonesSaoIguais(telefone1: string, telefone2: string): boolean {
  if (!telefone1 || !telefone2) return false;
  
  const tel1 = normalizarTelefoneParaComparacao(telefone1);
  const tel2 = normalizarTelefoneParaComparacao(telefone2);
  
  // Comparação exata
  if (tel1 === tel2) return true;
  
  // Se ambos têm pelo menos 8 dígitos, compara pelos últimos 8, 9, 10 ou 11 dígitos
  if (tel1.length >= 8 && tel2.length >= 8) {
    for (const tamanho of [8, 9, 10, 11]) {
      if (tel1.length >= tamanho && tel2.length >= tamanho) {
        const ultimos1 = tel1.slice(-tamanho);
        const ultimos2 = tel2.slice(-tamanho);
        if (ultimos1 === ultimos2) return true;
      }
    }
  }
  
  return false;
}

// API: Criar novo agendamento - PROTEGIDA
app.post('/api/agendamentos', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;
    
    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    const { descricao, valor, dataAgendamento, tipo, categoria, recorrente, totalParcelas } = req.body;
    
    // Validações
    if (!descricao || !descricao.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Descrição é obrigatória'
      });
    }
    
    if (!valor || isNaN(Number(valor)) || Number(valor) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valor inválido'
      });
    }
    
    if (!dataAgendamento) {
      return res.status(400).json({
        success: false,
        error: 'Data do agendamento é obrigatória'
      });
    }
    
    if (!tipo || !['pagamento', 'recebimento'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo deve ser "pagamento" ou "recebimento"'
      });
    }
    
    // Valida formato da data (YYYY-MM-DD)
    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRegex.test(dataAgendamento)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de data inválido. Use YYYY-MM-DD'
      });
    }
    
    // Validações para agendamentos recorrentes
    if (recorrente && (!totalParcelas || totalParcelas < 2 || totalParcelas > 999)) {
      return res.status(400).json({
        success: false,
        error: 'Para agendamentos recorrentes, totalParcelas deve ser entre 2 e 999'
      });
    }
    
    // Formata o telefone
    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;
    
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
      const { criarAgendamentosRecorrentes } = await import('./agendamentos');
      ids = await criarAgendamentosRecorrentes({
        ...agendamento,
        totalParcelas: Number(totalParcelas),
      });
    } else {
      const id = await criarAgendamento(agendamento);
      ids = [id];
    }
    
    res.json({
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
    console.error('❌ Erro ao criar agendamento:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar agendamento'
    });
  }
});

// API: Atualizar agendamento - PROTEGIDA
app.put('/api/agendamentos/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status, descricao, valor, dataAgendamento, tipo, categoria, carteiraId, valorPago } = req.body;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const agendamento = await buscarAgendamentoPorId(parseInt(id));

    if (!agendamento) {
      return res.status(404).json({
        success: false,
        error: 'Agendamento não encontrado'
      });
    }

    // Compara telefones de forma flexível
    console.log(`🔍 Comparando telefones para atualização de agendamento ${id}:`);
    console.log(`   Telefone do token: "${telefone}"`);
    console.log(`   Telefone do agendamento: "${agendamento.telefone}"`);

    if (!telefonesSaoIguais(telefone, agendamento.telefone)) {
      const tel1Norm = normalizarTelefoneParaComparacao(telefone);
      const tel2Norm = normalizarTelefoneParaComparacao(agendamento.telefone);
      console.log(`   ❌ Telefones não correspondem:`);
      console.log(`      Token normalizado: "${tel1Norm}"`);
      console.log(`      Agendamento normalizado: "${tel2Norm}"`);
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para atualizar este agendamento'
      });
    }
    
    console.log(`   ✅ Telefones correspondem!`);

    // Se apenas status foi enviado, usa a função antiga
    if (status && !descricao && !valor && !dataAgendamento && !tipo && !categoria) {
      if (!['pendente', 'pago', 'cancelado'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Status inválido. Use: pendente, pago ou cancelado'
        });
      }
      
      // Atualiza o status
      await atualizarStatusAgendamento(parseInt(id), status);
      
      // Se marcou como pago, cria transação automaticamente
      if (status === 'pago') {
        const dataAtual = new Date().toISOString().split('T')[0];
        const valorTransacao = valorPago || agendamento.valor;
        
        // Determina método baseado na carteira se fornecida
        let metodoTransacao: 'credito' | 'debito' = 'debito';
        if (carteiraId) {
          try {
            const { buscarCarteiraPorId } = await import('./carteiras');
            const carteira = await buscarCarteiraPorId(carteiraId, telefone);
            if (carteira && carteira.tipo === 'credito') {
              metodoTransacao = 'credito';
            }
          } catch (error) {
            console.error('Erro ao buscar carteira:', error);
            // Mantém débito como padrão
          }
        }
        
        try {
          const transacao: Transacao = {
            telefone: telefone,
            descricao: agendamento.descricao,
            valor: valorTransacao,
            categoria: agendamento.categoria || 'outros',
            tipo: agendamento.tipo === 'recebimento' ? 'entrada' : 'saida',
            metodo: metodoTransacao,
            dataHora: new Date().toLocaleString('pt-BR'),
            data: dataAtual,
            mensagemOriginal: `Agendamento ${agendamento.id} - ${agendamento.descricao}`,
            carteiraId: carteiraId || null,
          };
          
          const transacaoId = await salvarTransacao(transacao);
          console.log(`✅ Transação criada automaticamente para agendamento ${id} (ID: ${transacaoId})`);
        } catch (error: any) {
          console.error(`❌ Erro ao criar transação para agendamento ${id}:`, error.message);
          // Não falha a atualização do agendamento se a transação falhar
        }
      }
    } else {
      // Atualização completa
      const dadosAtualizacao: any = {};
      if (descricao !== undefined) dadosAtualizacao.descricao = descricao.trim();
      if (valor !== undefined) {
        if (isNaN(Number(valor)) || Number(valor) <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Valor inválido'
          });
        }
        dadosAtualizacao.valor = Number(valor);
      }
      if (dataAgendamento !== undefined) {
        const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dataRegex.test(dataAgendamento)) {
          return res.status(400).json({
            success: false,
            error: 'Formato de data inválido. Use YYYY-MM-DD'
          });
        }
        dadosAtualizacao.dataAgendamento = dataAgendamento;
      }
      if (tipo !== undefined) {
        if (!['pagamento', 'recebimento'].includes(tipo)) {
          return res.status(400).json({
            success: false,
            error: 'Tipo deve ser "pagamento" ou "recebimento"'
          });
        }
        dadosAtualizacao.tipo = tipo;
      }
      if (categoria !== undefined) dadosAtualizacao.categoria = categoria;
      if (status !== undefined) {
        if (!['pendente', 'pago', 'cancelado'].includes(status)) {
          return res.status(400).json({
            success: false,
            error: 'Status inválido. Use: pendente, pago ou cancelado'
          });
        }
        dadosAtualizacao.status = status;
      }
      
      await atualizarAgendamento(parseInt(id), dadosAtualizacao);
      
      // Busca o agendamento atualizado para criar a transação se necessário
      const { buscarAgendamentoPorId } = await import('./agendamentos');
      const agendamentoAtualizado = await buscarAgendamentoPorId(parseInt(id));
      if (!agendamentoAtualizado) {
        return res.status(404).json({
          success: false,
          error: 'Agendamento não encontrado após atualização'
        });
      }
      
      // Se marcou como pago na atualização completa, cria transação automaticamente
      if (status === 'pago') {
        const dataAtual = new Date().toISOString().split('T')[0];
        const valorTransacao = valorPago || agendamentoAtualizado.valor;
        
        // Determina método baseado na carteira se fornecida
        let metodoTransacao: 'credito' | 'debito' = 'debito';
        if (carteiraId) {
          try {
            const { buscarCarteiraPorId } = await import('./carteiras');
            const carteira = await buscarCarteiraPorId(carteiraId, telefone);
            if (carteira && carteira.tipo === 'credito') {
              metodoTransacao = 'credito';
            }
          } catch (error) {
            console.error('Erro ao buscar carteira:', error);
            // Mantém débito como padrão
          }
        }
        
        try {
          const transacao: Transacao = {
            telefone: telefone,
            descricao: agendamentoAtualizado.descricao,
            valor: valorTransacao,
            categoria: agendamentoAtualizado.categoria || 'outros',
            tipo: agendamentoAtualizado.tipo === 'recebimento' ? 'entrada' : 'saida',
            metodo: metodoTransacao,
            dataHora: new Date().toLocaleString('pt-BR'),
            data: dataAtual,
            mensagemOriginal: `Agendamento ${agendamentoAtualizado.id} - ${agendamentoAtualizado.descricao}`,
            carteiraId: carteiraId || null,
          };
          
          const transacaoId = await salvarTransacao(transacao);
          console.log(`✅ Transação criada automaticamente para agendamento ${id} (ID: ${transacaoId})`);
        } catch (error: any) {
          console.error(`❌ Erro ao criar transação para agendamento ${id}:`, error.message);
          // Não falha a atualização do agendamento se a transação falhar
        }
      }
    }

    res.json({
      success: true,
      message: 'Agendamento atualizado com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Remover agendamento - PROTEGIDA
app.delete('/api/agendamentos/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const agendamento = await buscarAgendamentoPorId(parseInt(id));

    if (!agendamento) {
      return res.status(404).json({
        success: false,
        error: 'Agendamento não encontrado'
      });
    }

    // Compara telefones de forma flexível
    console.log(`🔍 Comparando telefones para remoção de agendamento ${id}:`);
    console.log(`   Telefone do token: "${telefone}"`);
    console.log(`   Telefone do agendamento: "${agendamento.telefone}"`);

    if (!telefonesSaoIguais(telefone, agendamento.telefone)) {
      const tel1Norm = normalizarTelefoneParaComparacao(telefone);
      const tel2Norm = normalizarTelefoneParaComparacao(agendamento.telefone);
      console.log(`   ❌ Telefones não correspondem:`);
      console.log(`      Token normalizado: "${tel1Norm}"`);
      console.log(`      Agendamento normalizado: "${tel2Norm}"`);
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para remover este agendamento'
      });
    }
    
    console.log(`   ✅ Telefones correspondem!`);

    await removerAgendamento(parseInt(id));

    res.json({
      success: true,
      message: 'Agendamento removido com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/chat', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { mensagem } = req.body;
    const telefone = req.telefone;
    
    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Mensagem é obrigatória'
      });
    }
    
    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }
    
    console.log('💬 Chat de IA - Mensagem recebida:', mensagem);
    console.log('   Telefone:', telefone);
    
    // Busca estatísticas e transações do usuário para contexto
    const estatisticas = await obterEstatisticas({ telefone });
    const transacoes = await buscarTransacoesComFiltros({ 
      telefone, 
      limit: 10,
      offset: 0
    });
    
    // Processa a mensagem com IA
    const resposta = await processarChatFinanceiro(
      mensagem,
      estatisticas,
      transacoes.transacoes
    );
    
    console.log('✅ Chat de IA - Resposta gerada');
    
    res.json({
      success: true,
      resposta
    });
  } catch (error: any) {
    console.error('❌ Erro no chat de IA:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar mensagem'
    });
  }
});

// API: Inicializar categorias padrão (executar uma vez)
app.post('/api/categorias/inicializar', async (req, res) => {
  try {
    await inicializarCategoriasPadrao();
    res.json({
      success: true,
      message: 'Categorias padrão inicializadas com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Buscar categorias - PROTEGIDA
app.get('/api/categorias', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const categorias = await buscarCategorias(telefone);

    res.json({
      success: true,
      categorias
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Criar categoria - PROTEGIDA
app.post('/api/categorias', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;
    const { nome, descricao, cor, tipo } = req.body;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    if (!nome || !nome.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Nome da categoria é obrigatório'
      });
    }

    const categoria = await criarCategoria(telefone, {
      nome: nome.trim(),
      descricao: descricao?.trim(),
      cor: cor?.trim(),
      tipo: tipo || 'saida',
    });

    res.json({
      success: true,
      categoria,
      message: 'Categoria criada com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Atualizar categoria - PROTEGIDA
app.put('/api/categorias/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;
    const { nome, descricao, cor, tipo } = req.body;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    const categoria = await atualizarCategoria(parseInt(id), telefone, {
      nome: nome?.trim(),
      descricao: descricao?.trim(),
      cor: cor?.trim(),
      tipo: tipo,
    });

    res.json({
      success: true,
      categoria,
      message: 'Categoria atualizada com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Remover categoria - PROTEGIDA
app.delete('/api/categorias/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;

    if (!telefone) {
      return res.status(401).json({
        success: false,
        error: 'Telefone não encontrado no token'
      });
    }

    await removerCategoria(parseInt(id), telefone);

    res.json({
      success: true,
      message: 'Categoria removida com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// API: CARTEIRAS
// ============================================

// API: Buscar carteiras - PROTEGIDA
app.get('/api/carteiras', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;
    const carteiras = await buscarCarteirasPorTelefone(telefone);
    
    res.json({
      success: true,
      carteiras: carteiras.map(c => ({
        id: c.id,
        nome: c.nome,
        descricao: c.descricao,
        tipo: c.tipo,
        limiteCredito: c.limiteCredito,
        diaPagamento: c.diaPagamento,
        padrao: c.padrao === 1,
        ativo: c.ativo === 1,
        criadoEm: c.criadoEm,
        atualizadoEm: c.atualizadoEm,
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Buscar carteira padrão - PROTEGIDA
app.get('/api/carteiras/padrao', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;
    const carteira = await buscarCarteiraPadrao(telefone);
    
    if (!carteira) {
      return res.json({
        success: true,
        carteira: null
      });
    }
    
    res.json({
      success: true,
      carteira: {
        id: carteira.id,
        nome: carteira.nome,
        descricao: carteira.descricao,
        padrao: carteira.padrao === 1,
        ativo: carteira.ativo === 1,
        criadoEm: carteira.criadoEm,
        atualizadoEm: carteira.atualizadoEm,
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Criar carteira - PROTEGIDA
app.post('/api/carteiras', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const telefone = req.telefone;
    const { nome, descricao, padrao, tipo, limiteCredito, diaPagamento } = req.body;

    if (!nome || nome.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Nome da carteira é obrigatório'
      });
    }

    const carteira = await criarCarteira(
      telefone, 
      nome.trim(), 
      descricao?.trim(), 
      padrao === true,
      tipo || 'debito',
      tipo === 'credito' ? limiteCredito : null,
      tipo === 'credito' ? diaPagamento : null
    );

    res.json({
      success: true,
      carteira: {
        id: carteira.id,
        nome: carteira.nome,
        descricao: carteira.descricao,
        tipo: carteira.tipo,
        limiteCredito: carteira.limiteCredito,
        diaPagamento: carteira.diaPagamento,
        padrao: carteira.padrao === 1,
        ativo: carteira.ativo === 1,
        criadoEm: carteira.criadoEm,
        atualizadoEm: carteira.atualizadoEm,
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Atualizar carteira - PROTEGIDA
app.put('/api/carteiras/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;
    const { nome, descricao, padrao, ativo, tipo, limiteCredito, diaPagamento } = req.body;

    const dadosAtualizacao: any = {};
    if (nome !== undefined) dadosAtualizacao.nome = nome.trim();
    if (descricao !== undefined) dadosAtualizacao.descricao = descricao?.trim() || null;
    if (padrao !== undefined) dadosAtualizacao.padrao = padrao;
    if (ativo !== undefined) dadosAtualizacao.ativo = ativo;
    if (tipo !== undefined) dadosAtualizacao.tipo = tipo;
    if (tipo === 'credito') {
      if (limiteCredito !== undefined) dadosAtualizacao.limiteCredito = limiteCredito;
      if (diaPagamento !== undefined) dadosAtualizacao.diaPagamento = diaPagamento;
    } else if (tipo === 'debito') {
      dadosAtualizacao.limiteCredito = null;
      dadosAtualizacao.diaPagamento = null;
    }

    const carteira = await atualizarCarteira(parseInt(id), telefone, dadosAtualizacao);

    res.json({
      success: true,
      carteira: {
        id: carteira.id,
        nome: carteira.nome,
        descricao: carteira.descricao,
        tipo: carteira.tipo,
        limiteCredito: carteira.limiteCredito,
        diaPagamento: carteira.diaPagamento,
        padrao: carteira.padrao === 1,
        ativo: carteira.ativo === 1,
        criadoEm: carteira.criadoEm,
        atualizadoEm: carteira.atualizadoEm,
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Definir carteira como padrão - PROTEGIDA
app.post('/api/carteiras/:id/padrao', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;

    const carteira = await definirCarteiraPadrao(parseInt(id), telefone);

    res.json({
      success: true,
      carteira: {
        id: carteira.id,
        nome: carteira.nome,
        descricao: carteira.descricao,
        padrao: carteira.padrao === 1,
        ativo: carteira.ativo === 1,
        criadoEm: carteira.criadoEm,
        atualizadoEm: carteira.atualizadoEm,
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API: Remover carteira - PROTEGIDA
app.delete('/api/carteiras/:id', autenticarMiddleware, validarPermissaoDados, async (req: any, res) => {
  try {
    const { id } = req.params;
    const telefone = req.telefone;

    await removerCarteira(parseInt(id), telefone);

    res.json({
      success: true,
      message: 'Carteira removida com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Inicia o servidor apenas se não estiver em modo de teste
if (process.env.NODE_ENV !== 'test') {
app.listen(PORT, async () => {
  // Inicializa categorias padrão ao iniciar o servidor
  try {
    await inicializarCategoriasPadrao();
  } catch (error) {
    console.error('⚠️  Erro ao inicializar categorias padrão:', error);
  }
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API de autenticação: http://localhost:${PORT}/api/auth/login`);
  console.log('');
  console.log('📱 Interface Web:');
  console.log(`   👉 http://localhost:${PORT}/app`);
  console.log('');
  console.log('📡 Endpoints:');
  console.log(`   Webhook: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`   Teste: http://localhost:${PORT}/test-webhook`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log('');
  console.log('⚠️  IMPORTANTE: Para receber mensagens, você precisa:');
  console.log('');
  console.log('1️⃣  Expor o servidor publicamente usando ngrok:');
  console.log('   - Instale: brew install ngrok (ou baixe em ngrok.com)');
  console.log('   - Execute: ngrok http 3000');
  console.log('   - Copie a URL HTTPS (ex: https://abc123.ngrok.io)');
  console.log('');
  console.log('2️⃣  Teste se o servidor está acessível:');
  console.log('   - Acesse no navegador: https://SUA_URL_NGROK.ngrok.io/test-webhook');
  console.log('   - Deve retornar: {"success":true,"message":"Servidor está recebendo requisições!"}');
  console.log('');
  console.log('3️⃣  Configurar o webhook no Twilio:');
  console.log('   - Acesse: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
  console.log('   - Procure por "When a message comes in"');
  console.log('   - Cole: https://SUA_URL_NGROK.ngrok.io/webhook/whatsapp');
  console.log('   - Salve as configurações');
  console.log('');
  console.log('4️⃣  Verifique os logs do servidor quando enviar uma mensagem');
  console.log('   - Você deve ver: "🔔 WEBHOOK RECEBIDO DO TWILIO!"');
  console.log('');
  console.log('5️⃣  Abra a interface web para ver as mensagens:');
  console.log(`   👉 http://localhost:${PORT}/app`);
  console.log('');
});
}

// Exporta o app para uso em testes
export { app };

