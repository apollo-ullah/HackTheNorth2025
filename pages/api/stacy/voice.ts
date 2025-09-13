import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { text, voice = 'nova' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log(`🔊 Generating voice for: "${text}" with voice: ${voice}`);

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice, // nova, alloy, echo, fable, onyx, shimmer
        response_format: 'mp3',
        speed: 1.0
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI TTS error:', error);
      return res.status(500).json({ error: 'Failed to generate speech' });
    }

    // Get the audio data
    const audioBuffer = await response.arrayBuffer();
    
    console.log(`🔊 Generated ${audioBuffer.byteLength} bytes of audio`);

    // Return the audio as base64 for easy handling in the browser
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    res.json({
      success: true,
      audio: base64Audio,
      format: 'mp3',
      voice: voice
    });

  } catch (error) {
    console.error('Voice generation error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}