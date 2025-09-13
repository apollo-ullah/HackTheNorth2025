import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    // Parse the uploaded file
    const form = formidable();
    const [fields, files] = await form.parse(req);
    
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    
    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log(`🎤 Transcribing audio file: ${audioFile.originalFilename}, size: ${audioFile.size} bytes`);

    // Read the audio file
    const audioBuffer = fs.readFileSync(audioFile.filepath);
    
    // Create FormData for OpenAI Whisper API
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI Whisper error:', error);
      return res.status(500).json({ error: 'Failed to transcribe audio' });
    }

    const result = await response.json();
    
    console.log(`🎤 Transcription result: "${result.text}"`);

    // Clean up temporary file
    fs.unlinkSync(audioFile.filepath);

    res.json({
      success: true,
      text: result.text,
      language: result.language || 'en'
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
