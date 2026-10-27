import { ai } from './gemini.ts';

export async function generateSpeechAudio(
  text: string,
  voiceName: string = 'Kore'
): Promise<{ audioBase64: string; mimeType: string }> {
  // Trim text to reasonable chunk for audio synthesis (max ~500 words at a time)
  const safeText = text.slice(0, 1200);

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: safeText,
            speechMetadata: {
              style: 'Clear, engaging, narrative audio storytelling for Vietnamese Xianxia novel',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Không thể tạo file âm thanh từ mô hình AI.');
  }

  return {
    audioBase64: base64Audio,
    mimeType: 'audio/wav',
  };
}
