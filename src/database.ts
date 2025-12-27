import { PrismaClient } from '@prisma/client';
import path from 'path';
import { formatarMoeda } from './formatadorMensagens';

// Inicializa o Prisma Client
const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Interface para transações financeiras (mantida para compatibilidade)
export interface Transacao {
  id?: number;
  telefone: string;
  descricao: string;
  valor: number;
  categoria: string;
  tipo?: 'entrada' | 'saida';
  metodo?: 'credito' | 'debito';
  dataHora: string;
  data: string;
  mensagemOriginal?: string;
  carteiraId?: number | null;
}

// Salvar uma transação
export async function salvarTransacao(transacao: Transacao): Promise<number> {
  try {
    const dataApenas = transacao.data || (transacao.dataHora ? transacao.dataHora.split(' ')[0] : new Date().toISOString().split('T')[0]);
    
    // Importa validações
    const { validarTransacaoCompleta } = await import('./validacoesFinanceiras');
    
    // Valida todas as regras financeiras ANTES de salvar
    const validacao = await validarTransacaoCompleta({
      valor: transacao.valor,
      tipo: (transacao.tipo || 'saida') as 'entrada' | 'saida',
      metodo: (transacao.metodo || 'debito') as 'credito' | 'debito',
      descricao: transacao.descricao,
      data: dataApenas,
      carteiraId: transacao.carteiraId || null,
      telefone: transacao.telefone,
      permitirDataFutura: false, // Transações normais não podem ter data futura
    });
    
    if (!validacao.valido) {
      throw new Error(validacao.erro || 'Validação falhou');
    }
    
    // Garante que a transação tenha uma carteira
    let carteiraIdFinal = transacao.carteiraId;
    
    if (!carteiraIdFinal) {
      // Importa funções de carteiras dinamicamente para evitar dependência circular
      const { buscarOuCriarCarteiraPorTipo } = await import('./carteiras');
      
      // Determina o tipo de carteira baseado no método da transação
      const tipoCarteiraNecessario = (transacao.metodo || 'debito') as 'debito' | 'credito';
      
      // Busca ou cria carteira apropriada para o tipo
      const carteiraApropriada = await buscarOuCriarCarteiraPorTipo(transacao.telefone, tipoCarteiraNecessario);
      carteiraIdFinal = carteiraApropriada.id;
      console.log(`📦 Carteira utilizada: "${carteiraApropriada.nome}" (ID: ${carteiraApropriada.id}, tipo: ${carteiraApropriada.tipo})`);
    }
    
    const result = await prisma.transacao.create({
      data: {
        telefone: transacao.telefone,
        descricao: transacao.descricao,
        valor: transacao.valor,
        categoria: transacao.categoria || 'outros',
        tipo: transacao.tipo || 'saida',
        metodo: transacao.metodo || 'debito',
        dataHora: transacao.dataHora,
        data: dataApenas,
        mensagemOriginal: transacao.mensagemOriginal || null,
        carteiraId: carteiraIdFinal, // Sempre terá um valor
      },
    });
    
    return result.id;
  } catch (error) {
    console.error('❌ Erro ao salvar transação:', error);
    throw error;
  }
}

// Buscar transações por telefone (busca flexível)
export async function buscarTransacoesPorTelefone(telefone: string): Promise<Transacao[]> {
  try {
    const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
    
    // Tenta busca exata primeiro
    let transacoes = await prisma.transacao.findMany({
      where: { telefone: telefoneLimpo },
      orderBy: { dataHora: 'desc' },
      take: 100,
      include: {
        carteira: {
          select: {
            id: true,
            nome: true,
            tipo: true,
          },
        },
      },
    });
    
    // Se não encontrou, tenta sem o +
    if (transacoes.length === 0) {
      const semMais = telefoneLimpo.replace(/^\+/, '');
      const comMais = `+${semMais}`;
      
      transacoes = await prisma.transacao.findMany({
        where: {
          OR: [
            { telefone: semMais },
            { telefone: comMais },
          ],
        },
        orderBy: { dataHora: 'desc' },
        take: 100,
        include: {
          carteira: {
            select: {
              id: true,
              nome: true,
              tipo: true,
            },
          },
        },
      });
    }
    
    // Se ainda não encontrou, busca flexível pelos últimos dígitos
    if (transacoes.length === 0) {
      const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
      const todosTelefones = await prisma.transacao.findMany({
        select: { telefone: true },
        distinct: ['telefone'],
      });
      
      for (const t of todosTelefones) {
        const numLimpo = t.telefone.replace(/\D/g, '');
        
        // Compara últimos 8, 9 ou 10 dígitos
        for (const tamanho of [8, 9, 10]) {
          if (apenasNumeros.length >= tamanho && numLimpo.length >= tamanho) {
            const ultimosDigitos = apenasNumeros.slice(-tamanho);
            const ultimosDigitosBanco = numLimpo.slice(-tamanho);
            
            if (ultimosDigitos === ultimosDigitosBanco) {
              // Encontrou match, busca todas as transações desse telefone
              transacoes = await prisma.transacao.findMany({
                where: { telefone: t.telefone },
                orderBy: { dataHora: 'desc' },
                take: 100,
                include: {
                  carteira: {
                    select: {
                      id: true,
                      nome: true,
                      tipo: true,
                    },
                  },
                },
              });
              break;
            }
          }
        }
        if (transacoes.length > 0) break;
      }
    }
    
    return transacoes.map((t: any) => ({
      id: t.id,
      telefone: t.telefone,
      descricao: t.descricao,
      valor: t.valor,
      categoria: t.categoria || 'outros',
      tipo: (t.tipo === 'entrada' ? 'entrada' : 'saida') as 'entrada' | 'saida', // Inclui tipo (entrada ou saida)
      metodo: (t.metodo === 'credito' ? 'credito' : 'debito') as 'credito' | 'debito', // Inclui metodo (credito ou debito)
      dataHora: t.dataHora,
      data: t.data,
      mensagemOriginal: t.mensagemOriginal || undefined,
      carteira: t.carteira ? {
        id: t.carteira.id,
        nome: t.carteira.nome,
        tipo: t.carteira.tipo,
      } : undefined,
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar transações:', error);
    throw error;
  }
}

// Buscar transação por ID
export async function buscarTransacaoPorId(id: number): Promise<Transacao | null> {
  try {
    const transacao = await prisma.transacao.findUnique({
      where: { id },
    });
    
    if (!transacao) {
      return null;
    }
    
    return {
      id: transacao.id,
      telefone: transacao.telefone,
      descricao: transacao.descricao,
      valor: transacao.valor,
      categoria: transacao.categoria || 'outros',
      tipo: (transacao.tipo === 'entrada' ? 'entrada' : 'saida') as 'entrada' | 'saida',
      metodo: (transacao.metodo === 'credito' ? 'credito' : 'debito') as 'credito' | 'debito',
      dataHora: transacao.dataHora,
      data: transacao.data,
      mensagemOriginal: transacao.mensagemOriginal || undefined,
    };
  } catch (error) {
    console.error('❌ Erro ao buscar transação por ID:', error);
    throw error;
  }
}

// Remover transação por ID
export async function removerTransacao(id: number): Promise<void> {
  try {
    await prisma.transacao.delete({
      where: { id },
    });
  } catch (error) {
    console.error('❌ Erro ao remover transação:', error);
    throw error;
  }
}

/**
 * Exclui TODOS os dados de um usuário (conforme LGPD - Direito ao Esquecimento)
 * Remove: transações, agendamentos, categorias personalizadas, número registrado e usuário
 */
export async function excluirTodosDadosUsuario(telefone: string): Promise<{
  transacoesRemovidas: number;
  agendamentosRemovidos: number;
  categoriasRemovidas: number;
  usuarioRemovido: boolean;
  numeroRemovido: boolean;
}> {
  try {
    console.log(`\n🗑️  Iniciando exclusão completa de dados do usuário: ${telefone}`);
    
    // Formata o telefone para buscar em diferentes formatos
    const telefoneFormatado = telefone.startsWith('whatsapp:') 
      ? telefone 
      : telefone.startsWith('+')
      ? `whatsapp:${telefone}`
      : `whatsapp:+${telefone}`;
    
    const telefoneLimpo = telefoneFormatado.replace('whatsapp:', '').replace('+', '');
    
    // Busca todas as variações possíveis do telefone
    const telefoneVariacoes = [
      telefoneFormatado,
      telefoneLimpo,
      `+${telefoneLimpo}`,
      `whatsapp:+${telefoneLimpo}`,
    ];
    
    // 1. Remove todas as transações
    const transacoesRemovidas = await prisma.transacao.deleteMany({
      where: {
        OR: telefoneVariacoes.map(t => ({ telefone: t }))
      }
    });
    console.log(`   ✅ ${transacoesRemovidas.count} transações removidas`);
    
    // 2. Remove todos os agendamentos
    const agendamentosRemovidos = await prisma.agendamento.deleteMany({
      where: {
        OR: telefoneVariacoes.map(t => ({ telefone: t }))
      }
    });
    console.log(`   ✅ ${agendamentosRemovidos.count} agendamentos removidos`);
    
    // 3. Remove categorias personalizadas (onde telefone não é null)
    const categoriasRemovidas = await prisma.categoria.deleteMany({
      where: {
        telefone: {
          in: telefoneVariacoes
        }
      }
    });
    console.log(`   ✅ ${categoriasRemovidas.count} categorias personalizadas removidas`);
    
    // 4. Remove o número registrado
    let numeroRemovido = false;
    try {
      await prisma.numeroRegistrado.deleteMany({
        where: {
          OR: telefoneVariacoes.map(t => ({ telefone: t }))
        }
      });
      numeroRemovido = true;
      console.log(`   ✅ Número registrado removido`);
    } catch (error: any) {
      console.log(`   ⚠️  Número registrado não encontrado ou já removido`);
    }
    
    // 5. Remove o usuário (último passo)
    let usuarioRemovido = false;
    try {
      await prisma.usuario.delete({
        where: { telefone: telefoneFormatado }
      });
      usuarioRemovido = true;
      console.log(`   ✅ Usuário removido`);
    } catch (error: any) {
      // Tenta outras variações
      for (const variacao of telefoneVariacoes) {
        try {
          const usuario = await prisma.usuario.findUnique({
            where: { telefone: variacao }
          });
          if (usuario) {
            await prisma.usuario.delete({
              where: { telefone: variacao }
            });
            usuarioRemovido = true;
            console.log(`   ✅ Usuário removido (variação: ${variacao})`);
            break;
          }
        } catch (e) {
          // Continua tentando
        }
      }
    }
    
    console.log(`\n✅ Exclusão completa finalizada para: ${telefone}`);
    
    return {
      transacoesRemovidas: transacoesRemovidas.count,
      agendamentosRemovidos: agendamentosRemovidos.count,
      categoriasRemovidas: categoriasRemovidas.count,
      usuarioRemovido,
      numeroRemovido
    };
  } catch (error: any) {
    console.error('❌ Erro ao excluir dados do usuário:', error);
    throw error;
  }
}

// Buscar todas as transações
export async function buscarTodasTransacoes(limit: number = 100): Promise<Transacao[]> {
  try {
    const transacoes = await prisma.transacao.findMany({
      orderBy: { dataHora: 'desc' },
      take: limit,
      include: {
        carteira: {
          select: {
            id: true,
            nome: true,
            tipo: true,
          },
        },
      },
    });
    
    return transacoes.map((t: any) => ({
      id: t.id,
      telefone: t.telefone,
      descricao: t.descricao,
      valor: t.valor,
      categoria: t.categoria || 'outros',
      tipo: (t.tipo === 'entrada' ? 'entrada' : 'saida') as 'entrada' | 'saida', // Inclui tipo (entrada ou saida)
      metodo: (t.metodo === 'credito' ? 'credito' : 'debito') as 'credito' | 'debito', // Inclui metodo (credito ou debito)
      dataHora: t.dataHora,
      data: t.data,
      mensagemOriginal: t.mensagemOriginal || undefined,
      carteira: t.carteira ? {
        id: t.carteira.id,
        nome: t.carteira.nome,
        tipo: t.carteira.tipo,
      } : undefined,
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar todas as transações:', error);
    throw error;
  }
}

// Calcular saldo total por telefone (entradas - saídas) - busca flexível
export async function calcularTotalPorTelefone(telefone: string): Promise<number> {
  try {
    const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
    
    // Busca todas as transações do telefone (com busca flexível)
    const telefoneConditions: any[] = [
      { telefone: telefoneLimpo },
      { telefone: telefoneLimpo.replace(/^\+/, '') },
      { telefone: `+${telefoneLimpo.replace(/^\+/, '')}` }
    ];
    
    // Busca transações com busca flexível
    const transacoes = await prisma.transacao.findMany({
      where: {
        OR: telefoneConditions
      },
      select: {
        valor: true,
        tipo: true
      }
    });
    
    // Calcula saldo: entradas somam, saídas subtraem
    let saldo = 0;
    for (const transacao of transacoes) {
      if (transacao.tipo === 'entrada') {
        saldo += transacao.valor;
      } else {
        saldo -= transacao.valor;
      }
    }
    
    console.log(`   💰 Cálculo de saldo para ${telefoneLimpo}:`);
    console.log(`      Total de transações: ${transacoes.length}`);
    console.log(`      Entradas: ${transacoes.filter((t: any) => t.tipo === 'entrada').reduce((sum: number, t: any) => sum + t.valor, 0).toFixed(2)}`);
    console.log(`      Saídas: ${transacoes.filter((t: any) => t.tipo === 'saida').reduce((sum: number, t: any) => sum + t.valor, 0).toFixed(2)}`);
    console.log(`      Saldo final: ${formatarMoeda(saldo)}`);
    
    return saldo;
  } catch (error) {
    console.error('❌ Erro ao calcular saldo:', error);
    return 0;
  }
}

// Buscar transações com filtros
export async function buscarTransacoesComFiltros(filtros: {
  telefone?: string;
  dataInicio?: string;
  dataFim?: string;
  valorMin?: number;
  valorMax?: number;
  descricao?: string;
  categoria?: string;
  carteirasIds?: number[];
  limit?: number;
  offset?: number;
}): Promise<{ transacoes: Transacao[]; total: number }> {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 buscarTransacoesComFiltros - INÍCIO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 Filtros recebidos:', JSON.stringify(filtros, null, 2));
    
    const telefoneConditions: any[] = [];
    
    if (filtros.telefone) {
      const telefoneLimpo = filtros.telefone.replace('whatsapp:', '').trim();
      const semMais = telefoneLimpo.replace(/^\+/, '');
      const comMais = `+${semMais}`;
      const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
      
      console.log(`   📞 Buscando telefone: "${filtros.telefone}"`);
      console.log(`   📞 Formatos tentados: "${telefoneLimpo}", "${semMais}", "${comMais}"`);
      console.log(`   📞 Apenas números: "${apenasNumeros}"`);
      
      // Busca flexível: tenta com e sem +, e com prefixo whatsapp:
      const formatosTentados = [
        telefoneLimpo,
        semMais,
        comMais,
        `whatsapp:${telefoneLimpo}`,
        `whatsapp:${semMais}`,
        `whatsapp:${comMais}`
      ];
      
      formatosTentados.forEach(formato => {
        telefoneConditions.push({ telefone: formato });
      });
      
      console.log(`   📞 Total de formatos tentados: ${formatosTentados.length}`);
      
      // Também tenta formatos alternativos comuns
      if (apenasNumeros.length >= 11) {
        // Formato brasileiro: +55 + DDD + número
        const ddd = apenasNumeros.substring(0, 2);
        const numero = apenasNumeros.substring(2);
        const formatosBrasileiros = [
          `+55${ddd}${numero}`,
          `55${ddd}${numero}`,
          `${ddd}${numero}`,
          `whatsapp:+55${ddd}${numero}`,
          `whatsapp:55${ddd}${numero}`,
          `whatsapp:${ddd}${numero}`
        ];
        
        formatosBrasileiros.forEach(formato => {
          telefoneConditions.push({ telefone: formato });
        });
        
        console.log(`   📞 Formatos brasileiros adicionados: ${formatosBrasileiros.length}`);
      }
      
      console.log(`   📞 Total de condições de telefone: ${telefoneConditions.length}`);
    }

    // Monta condições AND
    const andConditions: any[] = [];
    
    // Adiciona filtro de telefone (busca flexível)
    if (telefoneConditions.length > 0) {
      console.log(`   📞 Formatos de telefone que serão buscados:`, telefoneConditions.map((c: any) => c.telefone));
      andConditions.push({ OR: telefoneConditions });
    }
    
    // Adiciona filtro de data
    // Usa o campo 'data' (YYYY-MM-DD) para filtros de data, que é mais eficiente
    if (filtros.dataInicio || filtros.dataFim) {
      const dataFilter: any = {};
      if (filtros.dataInicio) {
        // Normaliza a data para formato YYYY-MM-DD
        const dataInicioStr = filtros.dataInicio.split('T')[0]; // Remove hora se houver
        dataFilter.gte = dataInicioStr;
        console.log(`   📅 Filtro dataInicio: ${dataInicioStr}`);
      }
      if (filtros.dataFim) {
        // Normaliza a data para formato YYYY-MM-DD
        const dataFimStr = filtros.dataFim.split('T')[0]; // Remove hora se houver
        dataFilter.lte = dataFimStr;
        console.log(`   📅 Filtro dataFim: ${dataFimStr}`);
      }
      
      // Busca em ambos os campos (data e dataHora) usando OR para compatibilidade
      const dataHoraFilter: any = {};
      if (filtros.dataInicio) {
        const dataInicioObj = new Date(filtros.dataInicio);
        dataInicioObj.setHours(0, 0, 0, 0);
        dataHoraFilter.gte = dataInicioObj.toISOString();
      }
      if (filtros.dataFim) {
        const dataFimObj = new Date(filtros.dataFim);
        dataFimObj.setHours(23, 59, 59, 999);
        dataHoraFilter.lte = dataFimObj.toISOString();
      }
      
      // Usa OR para buscar em ambos os campos
      andConditions.push({
        OR: [
          { data: dataFilter },
          { dataHora: dataHoraFilter }
        ]
      });
    }
    
    // Adiciona filtro de valor
    if (filtros.valorMin !== undefined || filtros.valorMax !== undefined) {
      const valor: any = {};
      if (filtros.valorMin !== undefined) valor.gte = filtros.valorMin;
      if (filtros.valorMax !== undefined) valor.lte = filtros.valorMax;
      andConditions.push({ valor });
    }
    
    // Adiciona filtro de descrição
    if (filtros.descricao) {
      andConditions.push({ descricao: { contains: filtros.descricao } });
    }
    
    // Adiciona filtro de categoria
    if (filtros.categoria) {
      andConditions.push({ categoria: filtros.categoria });
    }
    
    // Adiciona filtro de carteiras (múltiplas carteiras)
    if (filtros.carteirasIds && filtros.carteirasIds.length > 0) {
      andConditions.push({ carteiraId: { in: filtros.carteirasIds } });
      console.log(`   💳 Filtro de carteiras: ${filtros.carteirasIds.join(', ')}`);
    }
    
    // Monta o where final
    let finalWhere = andConditions.length > 0 ? { AND: andConditions } : {};
    
    console.log('\n🔍 WHERE clause montado:');
    console.log(JSON.stringify(finalWhere, null, 2));

    // Contar total
    console.log('\n📊 Contando total de transações...');
    let total = await prisma.transacao.count({ where: finalWhere });
    console.log(`✅ Total encontrado na primeira busca: ${total}`);

    // Se não encontrou nada e há filtro de telefone, tenta busca flexível pelos últimos dígitos
    if (total === 0 && filtros.telefone) {
      console.log('   🔄 Tentando busca flexível por últimos dígitos...');
      const telefoneLimpo = filtros.telefone.replace('whatsapp:', '').trim();
      const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
      
      // Busca todos os telefones registrados (mais confiável que buscar nas transações)
      const todosTelefonesRegistrados = await prisma.numeroRegistrado.findMany({
        select: { telefone: true },
      });
      
      // Também busca telefones únicos nas transações
      const todosTelefonesTransacoes = await prisma.transacao.findMany({
        select: { telefone: true },
        distinct: ['telefone'],
      });
      
      // Combina ambos (sem duplicatas)
      const todosTelefones = [
        ...todosTelefonesRegistrados.map((t: any) => t.telefone),
        ...todosTelefonesTransacoes.map((t: any) => t.telefone)
      ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicatas
      
      console.log(`   📋 Telefones no banco: ${todosTelefones.join(', ')}`);
      
      // Tenta encontrar match pelos últimos dígitos
      for (const telefoneBanco of todosTelefones) {
        const numLimpo = telefoneBanco.replace(/\D/g, '');
        
        // Compara últimos 8, 9, 10 ou 11 dígitos
        for (const tamanho of [8, 9, 10, 11]) {
          if (apenasNumeros.length >= tamanho && numLimpo.length >= tamanho) {
            const ultimosDigitos = apenasNumeros.slice(-tamanho);
            const ultimosDigitosBanco = numLimpo.slice(-tamanho);
            
            if (ultimosDigitos === ultimosDigitosBanco) {
              console.log(`   ✅ Match encontrado: "${filtros.telefone}" corresponde a "${telefoneBanco}" (últimos ${tamanho} dígitos)`);
              
              // Atualiza o filtro de telefone para usar o telefone encontrado
              const telefoneEncontrado = telefoneBanco;
              const telefoneConditionsMatch = [
                { telefone: telefoneEncontrado },
                { telefone: telefoneEncontrado.replace(/^\+/, '') },
                { telefone: `+${telefoneEncontrado.replace(/^\+/, '')}` }
              ];
              
              // Reconstrói o where com o telefone correto, mantendo outros filtros
              const andConditionsMatch: any[] = [
                { OR: telefoneConditionsMatch }
              ];
              
              // Adiciona outros filtros (data, valor, descrição, categoria)
              if (filtros.dataInicio || filtros.dataFim) {
                const dataHora: any = {};
                if (filtros.dataInicio) dataHora.gte = filtros.dataInicio;
                if (filtros.dataFim) dataHora.lte = filtros.dataFim;
                andConditionsMatch.push({ dataHora });
              }
              
              if (filtros.valorMin !== undefined || filtros.valorMax !== undefined) {
                const valor: any = {};
                if (filtros.valorMin !== undefined) valor.gte = filtros.valorMin;
                if (filtros.valorMax !== undefined) valor.lte = filtros.valorMax;
                andConditionsMatch.push({ valor });
              }
              
              if (filtros.descricao) {
                andConditionsMatch.push({ descricao: { contains: filtros.descricao } });
              }
              
              if (filtros.categoria) {
                andConditionsMatch.push({ categoria: filtros.categoria });
              }
              
              finalWhere = { AND: andConditionsMatch };
              
              // Recalcula total e busca transações
              total = await prisma.transacao.count({ where: finalWhere });
              console.log(`   📊 Total encontrado após match: ${total}`);
              break;
            }
          }
        }
        if (total > 0) break;
      }
    }

    // Buscar transações
    console.log(`\n📥 Buscando transações com:`, {
      limit: filtros.limit || 100,
      offset: filtros.offset || 0
    });
    
    console.log(`\n🔍 Executando query com condições:`, JSON.stringify(finalWhere, null, 2));
    
    const transacoes = await prisma.transacao.findMany({
      where: finalWhere,
      orderBy: { dataHora: 'desc' },
      take: filtros.limit || 100,
      skip: filtros.offset || 0,
      include: {
        carteira: {
          select: {
            id: true,
            nome: true,
            tipo: true,
          },
        },
      },
    });
    
    console.log(`✅ Transações retornadas do banco: ${transacoes.length}`);
    
    if (transacoes.length > 0) {
      console.log(`   📋 Telefones das transações encontradas:`, transacoes.map((t: any) => t.telefone).slice(0, 5));
      // Debug: verificar carteiras
      const transacoesComCarteira = transacoes.filter((t: any) => t.carteira).length;
      const transacoesSemCarteira = transacoes.filter((t: any) => !t.carteira).length;
      console.log(`   💳 Transações com carteira: ${transacoesComCarteira}, sem carteira: ${transacoesSemCarteira}`);
      if (transacoes[0].carteira) {
        console.log(`   💳 Exemplo de carteira:`, transacoes[0].carteira);
      } else {
        console.log(`   💳 Primeira transação sem carteira - carteiraId:`, transacoes[0].carteiraId);
      }
    }
    
    // Remove duplicatas por ID (caso existam)
    const transacoesUnicas = transacoes.filter((t: any, index: number, self: any[]) => 
      index === self.findIndex((tr: any) => tr.id === t.id)
    );
    
    if (transacoesUnicas.length !== transacoes.length) {
      console.log(`⚠️ Duplicatas detectadas no backend: ${transacoes.length - transacoesUnicas.length} removidas`);
    }
    
    // Tenta associar carteiras para transações que não têm (em background, não bloqueia a resposta)
    const transacoesSemCarteira = transacoesUnicas.filter((t: any) => !t.carteiraId && !t.carteira);
    if (transacoesSemCarteira.length > 0) {
      console.log(`   🔄 ${transacoesSemCarteira.length} transações sem carteira detectadas. Tentando associar...`);
      // Executa em background para não bloquear a resposta
      (async () => {
        try {
          const { buscarOuCriarCarteiraPorTipo } = await import('./carteiras');
          for (const transacao of transacoesSemCarteira.slice(0, 10)) { // Limita a 10 por vez para não sobrecarregar
            try {
              const tipoCarteira = (transacao.metodo || 'debito') as 'debito' | 'credito';
              const carteira = await buscarOuCriarCarteiraPorTipo(transacao.telefone, tipoCarteira);
              await prisma.transacao.update({
                where: { id: transacao.id },
                data: { carteiraId: carteira.id },
              });
              console.log(`   ✅ Transação ${transacao.id} associada à carteira ${carteira.nome}`);
            } catch (err) {
              console.error(`   ❌ Erro ao associar carteira para transação ${transacao.id}:`, err);
            }
          }
        } catch (err) {
          console.error('   ❌ Erro ao importar buscarOuCriarCarteiraPorTipo:', err);
        }
      })();
    }
    
    if (transacoesUnicas.length > 0) {
      console.log(`   Primeira transação:`, {
        id: transacoesUnicas[0].id,
        telefone: transacoesUnicas[0].telefone,
        descricao: transacoesUnicas[0].descricao,
        valor: transacoesUnicas[0].valor,
        dataHora: transacoesUnicas[0].dataHora,
        carteiraId: transacoesUnicas[0].carteiraId,
        carteira: transacoesUnicas[0].carteira ? {
          id: transacoesUnicas[0].carteira.id,
          nome: transacoesUnicas[0].carteira.nome,
          tipo: transacoesUnicas[0].carteira.tipo
        } : null
      });
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ buscarTransacoesComFiltros - FIM: ${transacoesUnicas.length} transações únicas de ${total} total\n`);

    // Busca carteiras para transações sem carteira (em batch por telefone e tipo)
    const carteirasCache: { [key: string]: { id: number; nome: string; tipo: string } } = {};
    const transacoesSemCarteiraParaBuscar = transacoesUnicas.filter((t: any) => !t.carteira);
    
    if (transacoesSemCarteiraParaBuscar.length > 0) {
      console.log(`   🔄 Buscando carteiras para ${transacoesSemCarteiraParaBuscar.length} transações sem carteira...`);
      try {
        const { buscarOuCriarCarteiraPorTipo } = await import('./carteiras');
        const telefonesUnicos = [...new Set(transacoesSemCarteiraParaBuscar.map((t: any) => t.telefone))];
        
        // Busca carteiras para cada combinação telefone+tipo (limita para não travar)
        for (const telefone of telefonesUnicos.slice(0, 5)) { // Limita a 5 telefones por vez
          const transacoesDoTelefone = transacoesSemCarteiraParaBuscar.filter((t: any) => t.telefone === telefone);
          const tipos = [...new Set(transacoesDoTelefone.map((t: any) => t.metodo || 'debito'))];
          
          for (const tipo of tipos) {
            const tipoCarteira = tipo as 'debito' | 'credito';
            const cacheKey = `${telefone}-${tipoCarteira}`;
            
            if (!carteirasCache[cacheKey]) {
              try {
                console.log(`   🔍 Buscando carteira ${tipoCarteira} para telefone ${telefone}...`);
                const carteira = await buscarOuCriarCarteiraPorTipo(telefone as string, tipoCarteira);
                carteirasCache[cacheKey] = {
                  id: carteira.id,
                  nome: carteira.nome,
                  tipo: carteira.tipo || tipoCarteira,
                };
                console.log(`   ✅ Carteira encontrada: ${carteira.nome} (ID: ${carteira.id})`);
              } catch (err) {
                console.error(`   ⚠️ Erro ao buscar carteira ${tipoCarteira} para ${telefone}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.error('   ⚠️ Erro ao importar buscarOuCriarCarteiraPorTipo:', err);
      }
    }
    
    // Mapeia todas as transações
    const transacoesMapeadas = transacoesUnicas.map((t: any) => {
      let carteiraData = t.carteira ? {
        id: t.carteira.id,
        nome: t.carteira.nome,
        tipo: t.carteira.tipo,
      } : undefined;
      
      // Se não tem carteira, tenta usar do cache
      if (!carteiraData && t.metodo) {
        const tipoCarteira = (t.metodo || 'debito') as 'debito' | 'credito';
        const cacheKey = `${t.telefone}-${tipoCarteira}`;
        carteiraData = carteirasCache[cacheKey];
        
        if (carteiraData) {
          console.log(`   ✅ Usando carteira do cache para transação ${t.id}: ${carteiraData.nome}`);
        }
        
        // Atualiza a transação no banco em background (não bloqueia)
        if (carteiraData && !t.carteiraId) {
          prisma.transacao.update({
            where: { id: t.id },
            data: { carteiraId: carteiraData.id },
          }).catch((err: any) => {
            console.error(`   ⚠️ Erro ao atualizar carteiraId da transação ${t.id}:`, err);
          });
        }
      }
      
      return {
        id: t.id,
        telefone: t.telefone,
        descricao: t.descricao,
        valor: t.valor,
        categoria: t.categoria || 'outros',
        tipo: (t.tipo === 'entrada' ? 'entrada' : 'saida') as 'entrada' | 'saida',
        metodo: (t.metodo === 'credito' ? 'credito' : 'debito') as 'credito' | 'debito',
        dataHora: t.dataHora,
        data: t.data,
        mensagemOriginal: t.mensagemOriginal || undefined,
        carteira: carteiraData,
      };
    });
    
    // Debug: verifica quantas transações têm carteira após o mapeamento
    const comCarteira = transacoesMapeadas.filter((t: any) => t.carteira).length;
    const semCarteira = transacoesMapeadas.filter((t: any) => !t.carteira).length;
    console.log(`   📊 Após mapeamento: ${comCarteira} com carteira, ${semCarteira} sem carteira`);

    return {
      transacoes: transacoesMapeadas,
      total,
    };
  } catch (error) {
    console.error('❌ Erro ao buscar transações com filtros:', error);
    throw error;
  }
}

// Estatísticas gerais
export async function obterEstatisticas(filtros?: {
  telefone?: string;
  dataInicio?: string;
  dataFim?: string;
  valorMin?: number;
  valorMax?: number;
  descricao?: string;
  categoria?: string;
  carteirasIds?: number[];
  tipo?: string;
  metodo?: string;
}): Promise<{
  totalGasto: number;
  totalTransacoes: number;
  mediaGasto: number;
  maiorGasto: number;
  menorGasto: number;
  gastoHoje: number;
  gastoMes: number;
}> {
  try {
    const where: any = {};
    const telefoneConditions: any[] = [];

    if (filtros?.telefone) {
      const telefoneLimpo = filtros.telefone.replace('whatsapp:', '').trim();
      const semMais = telefoneLimpo.replace(/^\+/, '');
      const comMais = `+${semMais}`;
      
      // Busca flexível: tenta com e sem +
      telefoneConditions.push(
        { telefone: telefoneLimpo },
        { telefone: semMais },
        { telefone: comMais }
      );
    }

    // Adiciona filtro de data
    // Usa o campo 'data' (YYYY-MM-DD) para filtros de data, que é mais eficiente
    if (filtros?.dataInicio || filtros?.dataFim) {
      const dataFilter: any = {};
      if (filtros.dataInicio) {
        // Normaliza a data para formato YYYY-MM-DD
        const dataInicioStr = filtros.dataInicio.split('T')[0]; // Remove hora se houver
        dataFilter.gte = dataInicioStr;
      }
      if (filtros.dataFim) {
        // Normaliza a data para formato YYYY-MM-DD
        const dataFimStr = filtros.dataFim.split('T')[0]; // Remove hora se houver
        dataFilter.lte = dataFimStr;
      }
      
      // Usa OR para buscar em ambos os campos (data ou dataHora)
      const dataHoraFilter: any = {};
      if (filtros.dataInicio) {
        const dataInicioObj = new Date(filtros.dataInicio);
        dataInicioObj.setHours(0, 0, 0, 0);
        dataHoraFilter.gte = dataInicioObj.toISOString();
      }
      if (filtros.dataFim) {
        const dataFimObj = new Date(filtros.dataFim);
        dataFimObj.setHours(23, 59, 59, 999);
        dataHoraFilter.lte = dataFimObj.toISOString();
      }
      
      where.OR = [
        { data: dataFilter },
        { dataHora: dataHoraFilter }
      ];
    }
    
    // Adiciona filtro de valor
    if (filtros?.valorMin !== undefined || filtros?.valorMax !== undefined) {
      where.valor = {};
      if (filtros.valorMin !== undefined) where.valor.gte = filtros.valorMin;
      if (filtros.valorMax !== undefined) where.valor.lte = filtros.valorMax;
    }
    
    // Adiciona filtro de descrição
    if (filtros?.descricao) {
      where.descricao = { contains: filtros.descricao };
    }
    
    // Adiciona filtro de categoria
    if (filtros?.categoria) {
      where.categoria = filtros.categoria;
    }
    
    // Adiciona filtro de carteiras (múltiplas carteiras)
    if (filtros?.carteirasIds && filtros.carteirasIds.length > 0) {
      where.carteiraId = { in: filtros.carteirasIds };
    }
    
    // Adiciona filtro de tipo (se necessário)
    if (filtros?.tipo) {
      where.tipo = filtros.tipo;
    }
    
    // Adiciona filtro de método (se necessário)
    if (filtros?.metodo) {
      where.metodo = filtros.metodo;
    }

    // Combina todas as condições usando AND
    const andConditions: any[] = [];
    
    if (telefoneConditions.length > 0) {
      andConditions.push({ OR: telefoneConditions });
    }
    
    // Adiciona todos os outros filtros
    if (where.OR) {
      // Se há filtro de data (OR entre data e dataHora), adiciona como uma condição
      andConditions.push(where.OR);
    }
    if (where.valor) andConditions.push({ valor: where.valor });
    if (where.carteiraId) andConditions.push({ carteiraId: where.carteiraId });
    if (where.descricao) andConditions.push({ descricao: where.descricao });
    if (where.categoria) andConditions.push({ categoria: where.categoria });
    if (where.tipo) andConditions.push({ tipo: where.tipo });
    if (where.metodo) andConditions.push({ metodo: where.metodo });
    
    const finalWhere = andConditions.length > 0 ? { AND: andConditions } : {};
    
    console.log(`   🔍 WHERE clause para estatísticas:`, JSON.stringify(finalWhere, null, 2));

    // Total geral - TODAS as transações (para contagem total)
    let [totalCount] = await Promise.all([
      prisma.transacao.count({ where: finalWhere }),
    ]);
    
    // Total de SAÍDAS (para "Total Gasto") - APENAS de carteiras de DÉBITO
    const saidasWhereConditions: any[] = [];
    if (finalWhere.AND && Array.isArray(finalWhere.AND)) {
      saidasWhereConditions.push(...finalWhere.AND);
    } else if (Object.keys(finalWhere).length > 0) {
      saidasWhereConditions.push(finalWhere);
    }
    saidasWhereConditions.push({ tipo: 'saida' }); // Apenas saídas
    // Filtra apenas carteiras de débito (ou carteiras sem tipo definido, para compatibilidade)
    saidasWhereConditions.push({
      OR: [
        { carteira: { tipo: 'debito' } },
        { carteira: null }, // Compatibilidade com transações antigas sem carteira
        { carteiraId: null }, // Compatibilidade com transações antigas sem carteiraId
      ]
    });
    
    const saidasWhere = { AND: saidasWhereConditions };
    
    let [totalSum, minMax] = await Promise.all([
      prisma.transacao.aggregate({
        where: saidasWhere,
        _sum: { valor: true },
      }),
      prisma.transacao.aggregate({
        where: saidasWhere,
        _min: { valor: true },
        _max: { valor: true },
      }),
    ]);
    
    // Se não encontrou nada e há filtro de telefone, tenta busca flexível
    if (totalCount === 0 && filtros?.telefone) {
      console.log('   🔄 obterEstatisticas: Tentando busca flexível por últimos dígitos...');
      const telefoneLimpo = filtros.telefone.replace('whatsapp:', '').trim();
      const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
      
      // Busca todos os telefones no banco
      const todosTelefones = await prisma.transacao.findMany({
        select: { telefone: true },
        distinct: ['telefone'],
      });
      
      // Tenta encontrar match pelos últimos dígitos
      for (const t of todosTelefones) {
        const numLimpo = t.telefone.replace(/\D/g, '');
        
        // Compara últimos 8, 9, 10 ou 11 dígitos
        for (const tamanho of [8, 9, 10, 11]) {
          if (apenasNumeros.length >= tamanho && numLimpo.length >= tamanho) {
            const ultimosDigitos = apenasNumeros.slice(-tamanho);
            const ultimosDigitosBanco = numLimpo.slice(-tamanho);
            
            if (ultimosDigitos === ultimosDigitosBanco) {
              console.log(`   ✅ Match encontrado em estatísticas: "${filtros.telefone}" corresponde a "${t.telefone}" (últimos ${tamanho} dígitos)`);
              
              // Reconstrói o where com o telefone correto, mantendo todos os outros filtros
              const telefoneEncontrado = t.telefone;
              const telefoneConditionsMatch = [
                { telefone: telefoneEncontrado },
                { telefone: telefoneEncontrado.replace(/^\+/, '') },
                { telefone: `+${telefoneEncontrado.replace(/^\+/, '')}` }
              ];
              
              const andConditionsMatch: any[] = [
                { OR: telefoneConditionsMatch }
              ];
              
              // Adiciona todos os outros filtros
              if (where.dataHora) andConditionsMatch.push({ dataHora: where.dataHora });
              if (where.valor) andConditionsMatch.push({ valor: where.valor });
              if (where.descricao) andConditionsMatch.push({ descricao: where.descricao });
              if (where.categoria) andConditionsMatch.push({ categoria: where.categoria });
              
              const finalWhereMatch = { AND: andConditionsMatch };
              
              // Recalcula contagem total com o telefone correto
              totalCount = await prisma.transacao.count({ where: finalWhereMatch });
              
              // Recalcula saídas com o telefone correto - apenas débito
              const saidasWhereMatchConditions: any[] = [...andConditionsMatch];
              saidasWhereMatchConditions.push({ tipo: 'saida' });
              saidasWhereMatchConditions.push({
                OR: [
                  { carteira: { tipo: 'debito' } },
                  { carteira: null },
                  { carteiraId: null },
                ]
              });
              const saidasWhereMatch = { AND: saidasWhereMatchConditions };
              
              [totalSum, minMax] = await Promise.all([
                prisma.transacao.aggregate({
                  where: saidasWhereMatch,
                  _sum: { valor: true },
                }),
                prisma.transacao.aggregate({
                  where: saidasWhereMatch,
                  _min: { valor: true },
                  _max: { valor: true },
                }),
              ]);
              break;
            }
          }
        }
        if (totalCount > 0) break;
      }
    }

    // Gasto hoje (apenas saídas)
    // Usa timezone local para evitar problemas com UTC
    const agora = new Date();
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    
    // Cria range de dataHora para hoje (00:00:00 até 23:59:59)
    const hojeInicio = new Date(agora);
    hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date(agora);
    hojeFim.setHours(23, 59, 59, 999);
    
    // Monta WHERE para gasto hoje: mantém filtros existentes + data de hoje + tipo saida
    const hojeWhereConditions: any[] = [];
    
    // Copia condições existentes do finalWhere
    if (finalWhere.AND && Array.isArray(finalWhere.AND)) {
      hojeWhereConditions.push(...finalWhere.AND);
    } else if (Object.keys(finalWhere).length > 0) {
      hojeWhereConditions.push(finalWhere);
    }
    
    // Adiciona filtros específicos para hoje (usa OR para buscar em data OU dataHora)
    hojeWhereConditions.push({
      OR: [
        { data: hoje },
        {
          dataHora: {
            gte: hojeInicio.toISOString(),
            lte: hojeFim.toISOString()
          }
        }
      ]
    });
    hojeWhereConditions.push({ tipo: 'saida' }); // Apenas saídas para "gasto hoje"
    // Filtra apenas carteiras de débito
    hojeWhereConditions.push({
      OR: [
        { carteira: { tipo: 'debito' } },
        { carteira: null },
        { carteiraId: null },
      ]
    });
    
    const hojeWhere = { AND: hojeWhereConditions };
    
    console.log(`   🔍 WHERE para gasto hoje:`, JSON.stringify(hojeWhere, null, 2));
    
    const hojeSum = await prisma.transacao.aggregate({
      where: hojeWhere,
      _sum: { valor: true },
    });
    
    console.log(`   📊 Gasto hoje (${hoje}): ${formatarMoeda(hojeSum._sum.valor || 0)}`);
    
    // Debug: conta quantas transações de hoje existem
    const hojeCount = await prisma.transacao.count({
      where: hojeWhere,
    });
    console.log(`   📊 Transações de hoje (saídas): ${hojeCount}`);

    // Gasto do mês (apenas saídas)
    // Usa timezone local para evitar problemas com UTC
    const mesInicio = new Date();
    mesInicio.setDate(1);
    mesInicio.setHours(0, 0, 0, 0);
    const mesInicioStr = `${mesInicio.getFullYear()}-${String(mesInicio.getMonth() + 1).padStart(2, '0')}-${String(mesInicio.getDate()).padStart(2, '0')}`;
    
    // Monta WHERE para gasto do mês: mantém filtros existentes + data >= início do mês + tipo saida
    const mesWhereConditions: any[] = [];
    
    // Copia condições existentes do finalWhere
    if (finalWhere.AND && Array.isArray(finalWhere.AND)) {
      mesWhereConditions.push(...finalWhere.AND);
    } else if (Object.keys(finalWhere).length > 0) {
      mesWhereConditions.push(finalWhere);
    }
    
    // Adiciona filtros específicos para o mês
    mesWhereConditions.push({ data: { gte: mesInicioStr } });
    mesWhereConditions.push({ tipo: 'saida' }); // Apenas saídas para "gasto do mês"
    // Filtra apenas carteiras de débito
    mesWhereConditions.push({
      OR: [
        { carteira: { tipo: 'debito' } },
        { carteira: null },
        { carteiraId: null },
      ]
    });
    
    const mesWhere = { AND: mesWhereConditions };
    
    console.log(`   🔍 WHERE para gasto do mês:`, JSON.stringify(mesWhere, null, 2));
    
    const mesSum = await prisma.transacao.aggregate({
      where: mesWhere,
      _sum: { valor: true },
    });
    
    console.log(`   📊 Gasto do mês (desde ${mesInicioStr}): ${formatarMoeda(mesSum._sum.valor || 0)}`);
    
    // Debug: conta quantas transações do mês existem
    const mesCount = await prisma.transacao.count({
      where: mesWhere,
    });
    console.log(`   📊 Transações do mês (saídas): ${mesCount}`);

    // Total Gasto = soma apenas de SAÍDAS
    const totalGasto = totalSum._sum.valor || 0;
    
    // Total Transações = contagem de TODAS as transações (entradas + saídas)
    const totalTransacoes = totalCount;
    
    // Média por Transação = média apenas de SAÍDAS (para ser consistente com totalGasto)
    // Conta quantas saídas existem para calcular a média corretamente
    const saidasCount = await prisma.transacao.count({ where: saidasWhere });
    const mediaGasto = saidasCount > 0 ? totalGasto / saidasCount : 0;

    return {
      totalGasto,
      totalTransacoes,
      mediaGasto,
      maiorGasto: minMax._max.valor || 0,
      menorGasto: minMax._min.valor || 0,
      gastoHoje: hojeSum._sum.valor || 0,
      gastoMes: mesSum._sum.valor || 0,
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    return {
      totalGasto: 0,
      totalTransacoes: 0,
      mediaGasto: 0,
      maiorGasto: 0,
      menorGasto: 0,
      gastoHoje: 0,
      gastoMes: 0,
    };
  }
}

// Estatísticas para CARTEIRAS DE CRÉDITO
export async function obterEstatisticasCredito(filtros?: {
  telefone?: string;
  dataInicio?: string;
  dataFim?: string;
  valorMin?: number;
  valorMax?: number;
  descricao?: string;
  categoria?: string;
  carteirasIds?: number[];
  tipo?: string;
  metodo?: string;
}): Promise<{
  totalGasto: number;
  totalTransacoes: number;
  mediaGasto: number;
  maiorGasto: number;
  menorGasto: number;
  gastoHoje: number;
  gastoMes: number;
  limiteUtilizado?: number;
  limiteDisponivel?: number;
}> {
  try {
    // Reutiliza a lógica de obterEstatisticas, mas filtra apenas carteiras de crédito
    const where: any = {};
    const telefoneConditions: any[] = [];

    if (filtros?.telefone) {
      const telefoneLimpo = filtros.telefone.replace('whatsapp:', '').trim();
      const semMais = telefoneLimpo.replace(/^\+/, '');
      const comMais = `+${semMais}`;
      
      telefoneConditions.push(
        { telefone: telefoneLimpo },
        { telefone: semMais },
        { telefone: comMais }
      );
    }

    if (filtros?.dataInicio || filtros?.dataFim) {
      const dataFilter: any = {};
      if (filtros.dataInicio) {
        const dataInicioStr = filtros.dataInicio.split('T')[0];
        dataFilter.gte = dataInicioStr;
      }
      if (filtros.dataFim) {
        const dataFimStr = filtros.dataFim.split('T')[0];
        dataFilter.lte = dataFimStr;
      }
      
      const dataHoraFilter: any = {};
      if (filtros.dataInicio) {
        const dataInicioObj = new Date(filtros.dataInicio);
        dataInicioObj.setHours(0, 0, 0, 0);
        dataHoraFilter.gte = dataInicioObj.toISOString();
      }
      if (filtros.dataFim) {
        const dataFimObj = new Date(filtros.dataFim);
        dataFimObj.setHours(23, 59, 59, 999);
        dataHoraFilter.lte = dataFimObj.toISOString();
      }
      
      where.OR = [
        { data: dataFilter },
        { dataHora: dataHoraFilter }
      ];
    }
    
    if (filtros?.valorMin !== undefined || filtros?.valorMax !== undefined) {
      where.valor = {};
      if (filtros.valorMin !== undefined) where.valor.gte = filtros.valorMin;
      if (filtros.valorMax !== undefined) where.valor.lte = filtros.valorMax;
    }
    
    if (filtros?.descricao) {
      where.descricao = { contains: filtros.descricao };
    }
    
    if (filtros?.categoria) {
      where.categoria = filtros.categoria;
    }
    
    // Filtra apenas carteiras de CRÉDITO
    if (filtros?.carteirasIds && filtros.carteirasIds.length > 0) {
      where.carteiraId = { in: filtros.carteirasIds };
    } else {
      // Se não especificou carteiras, filtra apenas carteiras de crédito
      where.carteira = { tipo: 'credito' };
    }
    
    if (filtros?.tipo) {
      where.tipo = filtros.tipo;
    }
    
    if (filtros?.metodo) {
      where.metodo = filtros.metodo;
    }

    const andConditions: any[] = [];
    
    if (telefoneConditions.length > 0) {
      andConditions.push({ OR: telefoneConditions });
    }
    
    if (where.OR) {
      andConditions.push(where.OR);
    }
    if (where.valor) andConditions.push({ valor: where.valor });
    if (where.carteiraId) {
      andConditions.push({ carteiraId: where.carteiraId });
      // Garante que as carteiras selecionadas são de crédito
      andConditions.push({ carteira: { tipo: 'credito' } });
    } else if (where.carteira) {
      andConditions.push({ carteira: { tipo: 'credito' } });
    }
    if (where.descricao) andConditions.push({ descricao: where.descricao });
    if (where.categoria) andConditions.push({ categoria: where.categoria });
    if (where.tipo) andConditions.push({ tipo: where.tipo });
    if (where.metodo) andConditions.push({ metodo: where.metodo });
    
    const finalWhere = andConditions.length > 0 ? { AND: andConditions } : {};
    
    // Total geral
    let totalCount = await prisma.transacao.count({ where: finalWhere });
    
    // Total de SAÍDAS de CRÉDITO
    const saidasWhereConditions: any[] = [];
    if (finalWhere.AND && Array.isArray(finalWhere.AND)) {
      saidasWhereConditions.push(...finalWhere.AND);
    } else if (Object.keys(finalWhere).length > 0) {
      saidasWhereConditions.push(finalWhere);
    }
    saidasWhereConditions.push({ tipo: 'saida' });
    // Garante que é apenas crédito
    if (!filtros?.carteirasIds || filtros.carteirasIds.length === 0) {
      saidasWhereConditions.push({ carteira: { tipo: 'credito' } });
    }
    
    const saidasWhere = { AND: saidasWhereConditions };
    
    let [totalSum, minMax] = await Promise.all([
      prisma.transacao.aggregate({
        where: saidasWhere,
        _sum: { valor: true },
      }),
      prisma.transacao.aggregate({
        where: saidasWhere,
        _min: { valor: true },
        _max: { valor: true },
      }),
    ]);

    // Gasto hoje
    const agora = new Date();
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    
    const hojeInicio = new Date(agora);
    hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date(agora);
    hojeFim.setHours(23, 59, 59, 999);
    
    const hojeWhereConditions: any[] = [];
    if (finalWhere.AND && Array.isArray(finalWhere.AND)) {
      hojeWhereConditions.push(...finalWhere.AND);
    } else if (Object.keys(finalWhere).length > 0) {
      hojeWhereConditions.push(finalWhere);
    }
    
    hojeWhereConditions.push({
      OR: [
        { data: hoje },
        {
          dataHora: {
            gte: hojeInicio.toISOString(),
            lte: hojeFim.toISOString()
          }
        }
      ]
    });
    hojeWhereConditions.push({ tipo: 'saida' });
    if (!filtros?.carteirasIds || filtros.carteirasIds.length === 0) {
      hojeWhereConditions.push({ carteira: { tipo: 'credito' } });
    }
    
    const hojeWhere = { AND: hojeWhereConditions };
    
    const hojeSum = await prisma.transacao.aggregate({
      where: hojeWhere,
      _sum: { valor: true },
    });

    // Gasto do mês
    const mesInicio = new Date();
    mesInicio.setDate(1);
    mesInicio.setHours(0, 0, 0, 0);
    const mesInicioStr = `${mesInicio.getFullYear()}-${String(mesInicio.getMonth() + 1).padStart(2, '0')}-${String(mesInicio.getDate()).padStart(2, '0')}`;
    
    const mesWhereConditions: any[] = [];
    if (finalWhere.AND && Array.isArray(finalWhere.AND)) {
      mesWhereConditions.push(...finalWhere.AND);
    } else if (Object.keys(finalWhere).length > 0) {
      mesWhereConditions.push(finalWhere);
    }
    
    mesWhereConditions.push({ data: { gte: mesInicioStr } });
    mesWhereConditions.push({ tipo: 'saida' });
    if (!filtros?.carteirasIds || filtros.carteirasIds.length === 0) {
      mesWhereConditions.push({ carteira: { tipo: 'credito' } });
    }
    
    const mesWhere = { AND: mesWhereConditions };
    
    const mesSum = await prisma.transacao.aggregate({
      where: mesWhere,
      _sum: { valor: true },
    });

    const totalGasto = totalSum._sum.valor || 0;
    const totalTransacoes = totalCount;
    const saidasCount = await prisma.transacao.count({ where: saidasWhere });
    const mediaGasto = saidasCount > 0 ? totalGasto / saidasCount : 0;

    // Calcula limite utilizado e disponível (se houver carteiras de crédito)
    let limiteUtilizado = 0;
    let limiteDisponivel = 0;
    
    if (filtros?.carteirasIds && filtros.carteirasIds.length > 0) {
      const carteiras = await prisma.carteira.findMany({
        where: { id: { in: filtros.carteirasIds }, tipo: 'credito' },
        select: { id: true, limiteCredito: true, diaPagamento: true },
      });
      
      const limiteTotal = carteiras.reduce((sum: number, c: any) => sum + (c.limiteCredito || 0), 0);
      
      // CORREÇÃO: Calcula apenas saídas de CRÉDITO no período da fatura, não todas as saídas
      const { calcularLimiteUtilizadoCredito } = await import('./validacoesFinanceiras');
      
      // Calcula limite utilizado para cada carteira de crédito
      let totalLimiteUtilizado = 0;
      for (const carteira of carteiras) {
        if (carteira.limiteCredito && carteira.limiteCredito > 0) {
          // Busca telefone do filtro ou usa o primeiro telefone encontrado
          const telefoneParaCalculo = filtros.telefone || '';
          if (telefoneParaCalculo) {
            const utilizado = await calcularLimiteUtilizadoCredito(
              telefoneParaCalculo,
              carteira.id,
              carteira.diaPagamento
            );
            totalLimiteUtilizado += utilizado;
          }
        }
      }
      
      limiteUtilizado = totalLimiteUtilizado;
      limiteDisponivel = limiteTotal - limiteUtilizado;
    }

    return {
      totalGasto,
      totalTransacoes,
      mediaGasto,
      maiorGasto: minMax._max.valor || 0,
      menorGasto: minMax._min.valor || 0,
      gastoHoje: hojeSum._sum.valor || 0,
      gastoMes: mesSum._sum.valor || 0,
      limiteUtilizado,
      limiteDisponivel,
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas de crédito:', error);
    return {
      totalGasto: 0,
      totalTransacoes: 0,
      mediaGasto: 0,
      maiorGasto: 0,
      menorGasto: 0,
      gastoHoje: 0,
      gastoMes: 0,
      limiteUtilizado: 0,
      limiteDisponivel: 0,
    };
  }
}

// Gastos por dia para CARTEIRAS DE CRÉDITO
export async function gastosPorDiaCredito(telefone?: string, dias: number = 30): Promise<Array<{ data: string; entradas: number; saidas: number; saldo: number }>> {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 gastosPorDiaCredito - INÍCIO');
    console.log(`   Telefone: ${telefone || 'todos'}`);
    console.log(`   Dias: ${dias}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);
    dataLimite.setHours(0, 0, 0, 0);

    const telefoneConditions: any[] = [];
    
    if (telefone) {
      const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
      const semMais = telefoneLimpo.replace(/^\+/, '');
      const comMais = `+${semMais}`;
      const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
      
      telefoneConditions.push(
        { telefone: telefoneLimpo },
        { telefone: semMais },
        { telefone: comMais }
      );
      
      if (apenasNumeros.length >= 11) {
        const ddd = apenasNumeros.substring(0, 2);
        const numero = apenasNumeros.substring(2);
        telefoneConditions.push(
          { telefone: `+55${ddd}${numero}` },
          { telefone: `55${ddd}${numero}` },
          { telefone: `${ddd}${numero}` }
        );
      }
    }

    const dataLimiteStr = dataLimite.toISOString().split('T')[0];
    
    const andConditions: any[] = [
      { data: { gte: dataLimiteStr } },
      { carteira: { tipo: 'credito' } } // Apenas carteiras de crédito
    ];
    
    if (telefoneConditions.length > 0) {
      andConditions.push({ OR: telefoneConditions });
    }

    let where = { AND: andConditions };

    let transacoes = await prisma.transacao.findMany({
      where,
      select: {
        data: true,
        valor: true,
        tipo: true,
        dataHora: true,
      },
    });

    // Agrupa por data
    const gastosPorData: { [key: string]: { entradas: number; saidas: number } } = {};
    
    transacoes.forEach((transacao: any) => {
      const data = transacao.data;
      if (!gastosPorData[data]) {
        gastosPorData[data] = { entradas: 0, saidas: 0 };
      }
      
      if (transacao.tipo === 'entrada') {
        gastosPorData[data].entradas += transacao.valor;
      } else {
        gastosPorData[data].saidas += transacao.valor;
      }
    });

    // Converte para array e ordena por data
    const resultado = Object.keys(gastosPorData)
      .sort()
      .map(data => ({
        data,
        entradas: gastosPorData[data].entradas,
        saidas: gastosPorData[data].saidas,
        saldo: gastosPorData[data].entradas - gastosPorData[data].saidas,
      }));

    console.log(`✅ gastosPorDiaCredito - FIM: ${resultado.length} dias\n`);
    return resultado;
  } catch (error) {
    console.error('❌ Erro ao obter gastos por dia (crédito):', error);
    return [];
  }
}

// Gastos por dia (últimos 30 dias) - agora retorna entradas e saídas separadas
export async function gastosPorDia(telefone?: string, dias: number = 30): Promise<Array<{ data: string; entradas: number; saidas: number; saldo: number }>> {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 gastosPorDia - INÍCIO');
    console.log(`   Telefone: ${telefone || 'todos'}`);
    console.log(`   Dias: ${dias}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);
    dataLimite.setHours(0, 0, 0, 0);

    const telefoneConditions: any[] = [];
    
    if (telefone) {
      const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
      const semMais = telefoneLimpo.replace(/^\+/, '');
      const comMais = `+${semMais}`;
      const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
      
      console.log(`   📞 Buscando telefone: "${telefone}"`);
      console.log(`   📞 Formatos tentados: "${telefoneLimpo}", "${semMais}", "${comMais}"`);
      
      // Busca flexível: tenta com e sem +
      telefoneConditions.push(
        { telefone: telefoneLimpo },
        { telefone: semMais },
        { telefone: comMais }
      );
      
      // Também tenta formatos alternativos comuns
      if (apenasNumeros.length >= 11) {
        const ddd = apenasNumeros.substring(0, 2);
        const numero = apenasNumeros.substring(2);
        telefoneConditions.push(
          { telefone: `+55${ddd}${numero}` },
          { telefone: `55${ddd}${numero}` },
          { telefone: `${ddd}${numero}` }
        );
      }
    }

    // Usa o campo 'data' (YYYY-MM-DD) para filtrar por data, que é mais eficiente
    const dataLimiteStr = dataLimite.toISOString().split('T')[0];
    
    const andConditions: any[] = [
      { data: { gte: dataLimiteStr } }
    ];
    
    if (telefoneConditions.length > 0) {
      andConditions.push({ OR: telefoneConditions });
    }

    let where = { AND: andConditions };

    console.log('   🔍 WHERE clause inicial:', JSON.stringify(where, null, 2));

    // Filtra apenas carteiras de débito para gastosPorDia
    const andConditionsComDebito = [...andConditions];
    andConditionsComDebito.push({
      OR: [
        { carteira: { tipo: 'debito' } },
        { carteira: null },
        { carteiraId: null },
      ]
    });
    
    let whereComDebito = { AND: andConditionsComDebito };

    let transacoes = await prisma.transacao.findMany({
      where: whereComDebito,
      select: {
        data: true,
        valor: true,
        tipo: true, // Inclui tipo para separar entradas e saídas
        dataHora: true,
      },
    });

    console.log(`   📊 Transações encontradas na primeira busca: ${transacoes.length}`);

    // Se não encontrou nada e há filtro de telefone, tenta busca flexível pelos últimos dígitos
    if (transacoes.length === 0 && telefone) {
      console.log('   🔄 Tentando busca flexível por últimos dígitos...');
      const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
      const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
      
      // Busca todos os telefones registrados (mais confiável que buscar nas transações)
      const todosTelefonesRegistrados = await prisma.numeroRegistrado.findMany({
        select: { telefone: true },
      });
      
      // Também busca telefones únicos nas transações
      const todosTelefonesTransacoes = await prisma.transacao.findMany({
        select: { telefone: true },
        distinct: ['telefone'],
      });
      
      // Combina ambos (sem duplicatas)
      const todosTelefones = [
        ...todosTelefonesRegistrados.map((t: any) => t.telefone),
        ...todosTelefonesTransacoes.map((t: any) => t.telefone)
      ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicatas
      
      console.log(`   📋 Telefones no banco: ${todosTelefones.join(', ')}`);
      
      // Tenta encontrar match pelos últimos dígitos
      for (const telefoneBanco of todosTelefones) {
        const numLimpo = telefoneBanco.replace(/\D/g, '');
        
        // Compara últimos 8, 9, 10 ou 11 dígitos
        for (const tamanho of [8, 9, 10, 11]) {
          if (apenasNumeros.length >= tamanho && numLimpo.length >= tamanho) {
            const ultimosDigitos = apenasNumeros.slice(-tamanho);
            const ultimosDigitosBanco = numLimpo.slice(-tamanho);
            
            if (ultimosDigitos === ultimosDigitosBanco) {
              console.log(`   ✅ Match encontrado: "${telefone}" corresponde a "${telefoneBanco}" (últimos ${tamanho} dígitos)`);
              
              // Reconstrói o where com o telefone correto
              const telefoneEncontrado = telefoneBanco;
              const telefoneConditionsMatch = [
                { telefone: telefoneEncontrado },
                { telefone: telefoneEncontrado.replace(/^\+/, '') },
                { telefone: `+${telefoneEncontrado.replace(/^\+/, '')}` }
              ];
              
              where = {
                AND: [
                  { OR: telefoneConditionsMatch },
                  { data: { gte: dataLimiteStr } },
                  {
                    OR: [
                      { carteira: { tipo: 'debito' } },
                      { carteira: null },
                      { carteiraId: null },
                    ]
                  }
                ]
              };
              
              console.log('   🔍 WHERE clause após match:', JSON.stringify(where, null, 2));
              
              // Busca novamente com o telefone correto
              transacoes = await prisma.transacao.findMany({
                where,
                select: {
                  data: true,
                  valor: true,
                  tipo: true, // Inclui tipo para separar entradas e saídas
                  dataHora: true,
                },
              });
              
              console.log(`   📊 Transações encontradas após match: ${transacoes.length}`);
              break;
            }
          }
        }
        if (transacoes.length > 0) break;
      }
    }

    // Agrupa por data separando entradas e saídas
    const dadosPorData: Record<string, { entradas: number; saidas: number }> = {};
    
    transacoes.forEach((t: any) => {
      // Usa o campo data se existir, senão extrai da dataHora
      let dataStr: string;
      if (t.data) {
        dataStr = t.data;
      } else if (t.dataHora) {
        // Extrai apenas a data (YYYY-MM-DD) da dataHora
        const data = new Date(t.dataHora);
        dataStr = data.toISOString().split('T')[0];
      } else {
        return; // Pula se não tiver data
      }
      
      if (!dadosPorData[dataStr]) {
        dadosPorData[dataStr] = { entradas: 0, saidas: 0 };
      }
      
      // Separa por tipo: entrada ou saida
      const tipo = t.tipo || 'saida';
      if (tipo === 'entrada') {
        dadosPorData[dataStr].entradas += t.valor;
      } else {
        dadosPorData[dataStr].saidas += t.valor;
      }
    });

    // Cria array de todos os dias dos últimos N dias (mesmo sem transações)
    const todosOsDias: Array<{ data: string; entradas: number; saidas: number; saldo: number }> = [];
    for (let i = dias - 1; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      data.setHours(0, 0, 0, 0);
      const dataStr = data.toISOString().split('T')[0];
      
      const dadosDia = dadosPorData[dataStr] || { entradas: 0, saidas: 0 };
      const saldo = dadosDia.entradas - dadosDia.saidas;
      
      todosOsDias.push({
        data: dataStr,
        entradas: dadosDia.entradas,
        saidas: dadosDia.saidas,
        saldo: saldo
      });
    }

    console.log(`   ✅ Retornando ${todosOsDias.length} dias`);
    console.log(`   📊 Dias com transações: ${todosOsDias.filter(d => d.entradas > 0 || d.saidas > 0).length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return todosOsDias;
  } catch (error) {
    console.error('❌ Erro ao obter gastos por dia:', error);
    return [];
  }
}

// Registrar número quando enviar primeira mensagem
export async function registrarNumero(telefone: string): Promise<boolean> {
  try {
    const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
    
    const existe = await prisma.numeroRegistrado.findUnique({
      where: { telefone: telefoneLimpo },
    });

    if (existe) {
      // Atualiza última mensagem enviada e incrementa contador
      await prisma.numeroRegistrado.update({
        where: { telefone: telefoneLimpo },
        data: {
          ultimaMensagemEnviada: new Date(),
          totalMensagensEnviadas: { increment: 1 },
        },
      });
      return false; // Já existia
    } else {
      // Insere novo número
      await prisma.numeroRegistrado.create({
        data: {
          telefone: telefoneLimpo,
        },
      });
      console.log(`✅ Número registrado para login: ${telefoneLimpo}`);
      return true; // Novo número
    }
  } catch (error) {
    console.error('❌ Erro ao registrar número:', error);
    return false;
  }
}

// Verificar se número está registrado (busca flexível)
export async function numeroEstaRegistrado(telefone: string): Promise<boolean> {
  try {
    const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
    
    // Tenta busca exata primeiro
    let existe = await prisma.numeroRegistrado.findUnique({
      where: { telefone: telefoneLimpo },
    });
    
    if (existe) return true;
    
    // Remove o + e tenta novamente
    const semMais = telefoneLimpo.replace(/^\+/, '');
    if (semMais !== telefoneLimpo) {
      existe = await prisma.numeroRegistrado.findFirst({
        where: {
          OR: [
            { telefone: semMais },
            { telefone: `+${semMais}` },
          ],
        },
      });
      if (existe) return true;
    }
    
    // Busca flexível: extrai apenas os últimos dígitos e compara
    const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
    
    // Busca todos os números registrados e compara os últimos dígitos
    const todosNumeros = await prisma.numeroRegistrado.findMany({
      select: { telefone: true },
    });
    
    for (const num of todosNumeros) {
      const numLimpo = num.telefone.replace(/\D/g, '');
      
      // Compara últimos 8, 9 ou 10 dígitos
      for (const tamanho of [8, 9, 10]) {
        if (apenasNumeros.length >= tamanho && numLimpo.length >= tamanho) {
          const ultimosDigitos = apenasNumeros.slice(-tamanho);
          const ultimosDigitosRegistrado = numLimpo.slice(-tamanho);
          
          if (ultimosDigitos === ultimosDigitosRegistrado) {
            console.log(`   ✅ Match encontrado: ${telefoneLimpo} corresponde a ${num.telefone} (últimos ${tamanho} dígitos)`);
            return true;
          }
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Erro ao verificar número registrado:', error);
    return false;
  }
}

// Lista de telefones únicos com estatísticas
export async function listarTelefones(): Promise<Array<{ telefone: string; total: number; totalGasto: number }>> {
  try {
    const resultado = await prisma.transacao.groupBy({
      by: ['telefone'],
      _count: { id: true },
      _sum: { valor: true },
      orderBy: { _sum: { valor: 'desc' } },
    });

    return resultado.map((r: any) => ({
      telefone: r.telefone,
      total: r._count.id,
      totalGasto: r._sum.valor || 0,
    }));
  } catch (error) {
    console.error('❌ Erro ao listar telefones:', error);
    return [];
  }
}

// Fechar conexão (útil para testes)
export async function fecharConexao(): Promise<void> {
  await prisma.$disconnect();
}

// Exportar prisma para uso direto se necessário
export { prisma };
