// Integração com Z-API para envio de mensagens WhatsApp
// Documentação: https://developer.z-api.io

interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
  baseUrl?: string;
}

// Configuração da Z-API
const zapiConfig: ZApiConfig | null = (() => {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  
  if (!instanceId || !token || !clientToken) {
    console.log('⚠️  Z-API não configurada:');
    console.log('   ZAPI_INSTANCE_ID:', instanceId ? '✅' : '❌');
    console.log('   ZAPI_TOKEN:', token ? '✅' : '❌');
    console.log('   ZAPI_CLIENT_TOKEN:', clientToken ? '✅' : '❌ (OBRIGATÓRIO!)');
    if (!clientToken) {
      console.log('   💡 O Client-Token é obrigatório! Adicione ZAPI_CLIENT_TOKEN no .env');
      console.log('   💡 Você encontra o Client-Token no painel da Z-API, na mesma área do ID e Token');
    }
    return null;
  }
  
  const config = {
    instanceId: instanceId.trim(),
    token: token.trim(),
    clientToken: clientToken.trim(),
    baseUrl: process.env.ZAPI_BASE_URL || 'https://api.z-api.io'
  };
  
  console.log('✅ Z-API configurada:');
  console.log('   Instance ID:', config.instanceId);
  console.log('   Token:', config.token.substring(0, 10) + '...' + config.token.substring(config.token.length - 5));
  console.log('   Client-Token:', config.clientToken.substring(0, 10) + '...' + config.clientToken.substring(config.clientToken.length - 5));
  console.log('   Base URL:', config.baseUrl);
  
  return config;
})();

/**
 * Envia mensagem via Z-API
 */
export async function enviarMensagemZApi(
  telefone: string,
  mensagem: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!zapiConfig) {
    return {
      success: false,
      error: 'Z-API não configurada. Configure ZAPI_INSTANCE_ID e ZAPI_TOKEN no .env'
    };
  }

  try {
    // Remove prefixo whatsapp: se existir e formata o número
    const numeroLimpo = telefone.replace('whatsapp:', '').replace('+', '');
    
    // Z-API espera o número no formato: 5561981474690 (sem + e sem whatsapp:)
    const numeroFormatado = numeroLimpo.startsWith('55') 
      ? numeroLimpo 
      : `55${numeroLimpo}`;

    // Z-API endpoint: /instances/{instance}/token/{token}/send-text
    // Documentação: https://developer.z-api.io
    const url = `${zapiConfig.baseUrl}/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/send-text`;
    
    console.log(`📤 Enviando mensagem via Z-API:`);
    console.log(`   URL: ${url}`);
    console.log(`   Telefone original: ${telefone}`);
    console.log(`   Telefone formatado: ${numeroFormatado}`);
    console.log(`   Mensagem: ${mensagem.substring(0, 50)}...`);
    
    const requestBody = {
      phone: numeroFormatado,
      message: mensagem
    };
    
    const bodyJson = JSON.stringify(requestBody, null, 2);
    console.log(`   Body:`, bodyJson);
    
    // Gera o comando cURL completo para debug
    const curlCommand = `curl -X POST '${url}' \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      `  -H 'Accept: application/json' \\\n` +
      `  -H 'Client-Token: ${zapiConfig.clientToken}' \\\n` +
      `  -d '${bodyJson.replace(/'/g, "'\\''")}'`;
    
    console.log(`\n📋 Comando cURL equivalente:`);
    console.log(`\`\`\`bash`);
    console.log(curlCommand);
    console.log(`\`\`\`\n`);
    
    console.log(`   Fazendo requisição POST para: ${url}`);
    console.log(`   Headers:`, { 
      'Content-Type': 'application/json', 
      'Accept': 'application/json',
      'Client-Token': zapiConfig.clientToken.substring(0, 10) + '...' + zapiConfig.clientToken.substring(zapiConfig.clientToken.length - 5)
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Client-Token': zapiConfig.clientToken,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`\n📥 Resposta da Z-API:`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
    console.log(`   Response Body:`, responseText);
    
    // Tenta formatar a resposta como JSON se possível
    try {
      const responseJson = JSON.parse(responseText);
      console.log(`   Response JSON formatado:`, JSON.stringify(responseJson, null, 2));
    } catch (e) {
      // Não é JSON, já mostramos como texto
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Erro ao parsear resposta JSON:', responseText);
      return {
        success: false,
        error: `Resposta inválida da Z-API: ${responseText.substring(0, 100)}`
      };
    }

    if (!response.ok) {
      console.error('❌ Erro Z-API:', data);
      
      // Mensagens de erro mais específicas
      let mensagemErro = data?.message || data?.error || `Erro ${response.status}: ${response.statusText}`;
      
      if (data?.error === 'your client-token is not configured' || mensagemErro.includes('client-token')) {
        mensagemErro = 'Instância Z-API não está conectada ao WhatsApp ou token inválido.';
        console.error('💡 POSSÍVEIS SOLUÇÕES:');
        console.error('   1. Verifique se a instância está "Conectada" no painel da Z-API');
        console.error('   2. Se gerou um novo token, desconecte e reconecte a instância');
        console.error('   3. Reinicie o backend após atualizar o token no .env');
        console.error('   4. Aguarde alguns segundos após conectar a instância');
        console.error('   5. Token atual sendo usado:', zapiConfig.token.substring(0, 10) + '...' + zapiConfig.token.substring(zapiConfig.token.length - 5));
        console.error('   6. Instance ID:', zapiConfig.instanceId);
      } else if (mensagemErro.includes('não encontrado') || mensagemErro.includes('not found') || mensagemErro.includes('precisa ter enviado')) {
        mensagemErro = 'Número não encontrado. É necessário que o usuário tenha enviado pelo menos uma mensagem para este número via WhatsApp primeiro.';
        console.error('💡 ERRO: Número não encontrado na Z-API');
        console.error('   Isso geralmente acontece quando:');
        console.error('   1. O número nunca enviou uma mensagem para o WhatsApp da instância');
        console.error('   2. Os dados da instância foram apagados/resetados');
        console.error('   3. A instância foi desconectada e reconectada');
        console.error('   SOLUÇÃO: O usuário precisa enviar uma mensagem primeiro para o número do WhatsApp da instância');
        console.error('   Número tentado:', numeroFormatado);
      }
      
      return {
        success: false,
        error: mensagemErro
      };
    }

    console.log(`✅ Mensagem enviada via Z-API para ${numeroFormatado}`);
    console.log(`   Message ID: ${data?.messageId || data?.id || 'N/A'}`);
    return {
      success: true,
      messageId: data?.messageId || data?.id || 'unknown'
    };
  } catch (error: any) {
    console.error('❌ Erro ao enviar mensagem via Z-API:', error);
    console.error('   Stack:', error.stack);
    return {
      success: false,
      error: error.message || 'Erro ao enviar mensagem via Z-API'
    };
  }
}

/**
 * Verifica o status da instância Z-API
 */
export async function verificarStatusInstancia(): Promise<{ conectada: boolean; erro?: string }> {
  if (!zapiConfig) {
    return { conectada: false, erro: 'Z-API não configurada' };
  }

  try {
    // Tenta verificar o status fazendo uma requisição simples
    // Algumas APIs têm endpoint de status, mas vamos testar com send-text mesmo
    // Se retornar erro de client-token, sabemos que não está conectada
    const url = `${zapiConfig.baseUrl}/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/send-text`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '5511999999999', // Número de teste
        message: 'test'
      }),
    });

    const responseText = await response.text();
    const data = JSON.parse(responseText);

    if (data?.error === 'your client-token is not configured') {
      return { conectada: false, erro: 'Instância não conectada ao WhatsApp' };
    }

    // Se não for erro de client-token, provavelmente está conectada
    return { conectada: true };
  } catch (error: any) {
    return { conectada: false, erro: error.message };
  }
}

/**
 * Envia mensagem com botões interativos via Z-API
 */
export async function enviarMensagemComBotoesZApi(
  telefone: string,
  mensagem: string,
  botoes: Array<{ id: string; texto: string }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!zapiConfig) {
    return {
      success: false,
      error: 'Z-API não configurada. Configure ZAPI_INSTANCE_ID e ZAPI_TOKEN no .env'
    };
  }

  if (botoes.length > 3) {
    return {
      success: false,
      error: 'Máximo de 3 botões permitidos'
    };
  }

  try {
    // Remove prefixo whatsapp: se existir e formata o número
    const numeroLimpo = telefone.replace('whatsapp:', '').replace('+', '');
    
    // Z-API espera o número no formato: 5561981474690 (sem + e sem whatsapp:)
    const numeroFormatado = numeroLimpo.startsWith('55') 
      ? numeroLimpo 
      : `55${numeroLimpo}`;

    // Z-API endpoint para botões: /instances/{instance}/token/{token}/send-buttons
    // Nota: Se este endpoint não funcionar, o sistema fará fallback para mensagem normal
    const url = `${zapiConfig.baseUrl}/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/send-buttons`;
    
    console.log(`📤 Enviando mensagem com botões via Z-API:`);
    console.log(`   URL: ${url}`);
    console.log(`   Telefone: ${numeroFormatado}`);
    console.log(`   Mensagem: ${mensagem.substring(0, 50)}...`);
    console.log(`   Botões: ${botoes.length}`);
    
    // Formato da requisição conforme documentação Z-API
    const requestBody = {
      phone: numeroFormatado,
      message: mensagem,
      buttons: botoes.map(btn => ({
        id: btn.id,
        text: btn.texto
      }))
    };
    
    console.log(`   Request Body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Client-Token': zapiConfig.clientToken,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`📥 Resposta da Z-API (botões):`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Body: ${responseText}`);

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Erro ao parsear resposta JSON:', responseText);
      return {
        success: false,
        error: `Resposta inválida da Z-API: ${responseText.substring(0, 100)}`
      };
    }

    // Verifica se há erro na resposta (mesmo com status 200, pode ter erro no body)
    if (!response.ok || (data && (data.error || data.message === 'NOT_FOUND'))) {
      console.error('❌ Erro Z-API ao enviar botões:', data);
      let mensagemErro = data?.message || data?.error || `Erro ${response.status}: ${response.statusText}`;
      
      // Se o endpoint não existe, tenta enviar como mensagem normal com formatação
      if (data?.error === 'NOT_FOUND' || mensagemErro.includes('NOT_FOUND')) {
        console.log('⚠️  Endpoint /send-buttons não encontrado. Enviando como mensagem normal...');
        
        // Formata a mensagem com os botões como texto clicável
        let mensagemComBotoes = mensagem + '\n\n';
        botoes.forEach((btn, index) => {
          mensagemComBotoes += `${index + 1}. ${btn.texto}\n`;
        });
        
        // Envia como mensagem normal
        return await enviarMensagemZApi(telefone, mensagemComBotoes);
      }
      
      return {
        success: false,
        error: mensagemErro
      };
    }

    console.log(`✅ Mensagem com botões enviada via Z-API para ${numeroFormatado}`);
    return {
      success: true,
      messageId: data?.messageId || data?.id || 'unknown'
    };
  } catch (error: any) {
    console.error('❌ Erro ao enviar mensagem com botões via Z-API:', error);
    return {
      success: false,
      error: error.message || 'Erro ao enviar mensagem com botões via Z-API'
    };
  }
}

/**
 * Verifica se Z-API está configurada
 */
export function zapiEstaConfigurada(): boolean {
  return zapiConfig !== null;
}

/**
 * Obtém informações de configuração da Z-API (sem expor tokens)
 */
export function obterInfoZApi(): { configurada: boolean; instanceId?: string } {
  if (!zapiConfig) {
    return { configurada: false };
  }
  
  return {
    configurada: true,
    instanceId: zapiConfig.instanceId
  };
}

