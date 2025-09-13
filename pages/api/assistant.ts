import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../lib/vapi-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_API_KEY } = process.env;

  if (!VAPI_API_KEY) {
    return res.status(500).json({ detail: 'VAPI API key not configured' });
  }

  const { name, system_prompt } = req.body;

  if (!name || !system_prompt) {
    return res.status(400).json({ detail: 'Name and system prompt are required' });
  }

  try {
    const vapiClient = new VAPIClient(VAPI_API_KEY);
    const result = await vapiClient.createAssistant(name, system_prompt);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error creating assistant:', error);
    res.status(500).json({ 
      detail: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
