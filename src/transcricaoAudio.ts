// Transcrição de áudio usando Google Gemini (suporta áudio diretamente)
import axios from 'axios';

// Função para baixar áudio do Twilio
async function baixarAudio(url: string, accountSid: string, authToken: string): Promise<Buffer> {
  try {
    const response = await axios.get(url, {
      auth: {
        username: accountSid,
        password: authToken,
      },
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('❌ Erro ao baixar áudio:', error);
    throw error;
  }
}

// Função para baixar áudio de URL pública (Z-API ou outras fontes)
async function baixarAudioPublico(url: string): Promise<Buffer> {
  try {
    console.log(`📥 Baixando áudio de URL pública: ${url}`);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000, // 30 segundos
    });
    return Buffer.from(response.data);
  } catch (error: any) {
    console.error('❌ Erro ao baixar áudio público:', error.message);
    throw error;
  }
}

// Função para transcrever áudio usando Google Gemini (suporta áudio multimodal)
export async function transcreverAudioComGemini(audioBuffer: Buffer, languageCode: string = 'pt-BR'): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini não configurado. Configure GEMINI_API_KEY no .env');
  }

  try {
    console.log('🎤 Transcrevendo áudio usando Google Gemini...');
    
    // Converte o buffer para base64
    const audioBase64 = audioBuffer.toString('base64');
    
    // Determina o MIME type baseado no formato do áudio
    // WhatsApp geralmente envia OGG Opus, mas pode ser outros formatos
    // Tenta detectar pelo tamanho do buffer ou usa o padrão
    let mimeType = 'audio/ogg'; // Padrão do WhatsApp
    
    // Tenta detectar o formato pelo conteúdo do buffer
    // OGG Opus geralmente começa com "OggS"
    if (audioBuffer.length > 4) {
      const header = audioBuffer.toString('ascii', 0, 4);
      if (header === 'OggS') {
        mimeType = 'audio/ogg';
      } else if (header.startsWith('RIFF') || header.startsWith('WEBP')) {
        mimeType = 'audio/webm';
      } else if (header.startsWith('ftyp')) {
        mimeType = 'audio/mp4';
      }
    }
    
    console.log(`🎵 Formato detectado: ${mimeType}`);
    
    // Usa o Gemini para transcrever o áudio
    // O Gemini 2.5 Flash suporta entrada multimodal incluindo áudio
    const prompt = 'Transcreva este áudio para texto em português brasileiro. Retorne apenas o texto transcrito, sem explicações adicionais.';
    
    // Gemini suporta entrada multimodal - usa API REST diretamente para melhor controle
    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
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
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    const transcription = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    if (transcription && transcription.length > 0) {
      console.log(`✅ Transcrição: "${transcription}"`);
      return transcription;
    } else {
      console.log('⚠️  Nenhuma transcrição encontrada no áudio');
      return '';
    }
  } catch (error: any) {
    console.error('❌ Erro ao transcrever áudio com Gemini:');
    console.error('   Mensagem:', error.message || error);
    console.error('   Status:', error.response?.status);
    console.error('   Status Text:', error.response?.statusText);
    console.error('   Response Data:', JSON.stringify(error.response?.data, null, 2));
    
    // Mensagens de erro mais específicas
    if (error.response?.status === 400) {
      throw new Error('Formato de áudio não suportado ou inválido. Tente enviar o áudio novamente.');
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Chave da API do Gemini inválida ou sem permissão. Verifique GEMINI_API_KEY no .env');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de requisições do Gemini excedido. Aguarde um momento e tente novamente.');
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      throw new Error('Timeout ao processar áudio. O áudio pode estar muito longo. Tente enviar um áudio mais curto.');
    }
    
    throw error;
  }
}

// Função principal para processar áudio do Twilio
export async function processarAudioTwilio(
  mediaUrl: string,
  accountSid: string,
  authToken: string,
  languageCode: string = 'pt-BR'
): Promise<string> {
  try {
    console.log('📥 Baixando áudio do Twilio...');
    const audioBuffer = await baixarAudio(mediaUrl, accountSid, authToken);
    
    console.log(`📊 Tamanho do áudio: ${audioBuffer.length} bytes`);
    
    // Tenta transcrever usando Gemini
    const transcription = await transcreverAudioComGemini(audioBuffer, languageCode);
    
    return transcription;
  } catch (error: any) {
    console.error('❌ Erro ao processar áudio:', error.message);
    throw error;
  }
}

// Função para processar áudio de URL pública (Z-API ou outras fontes)
export async function processarAudioPublico(
  mediaUrl: string,
  languageCode: string = 'pt-BR'
): Promise<string> {
  try {
    console.log('📥 Baixando áudio de URL pública...');
    const audioBuffer = await baixarAudioPublico(mediaUrl);
    
    console.log(`📊 Tamanho do áudio: ${audioBuffer.length} bytes`);
    
    // Tenta transcrever usando Gemini
    const transcription = await transcreverAudioComGemini(audioBuffer, languageCode);
    
    return transcription;
  } catch (error: any) {
    console.error('❌ Erro ao processar áudio público:', error.message);
    throw error;
  }
}

