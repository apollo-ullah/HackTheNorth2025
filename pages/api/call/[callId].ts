import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../../lib/vapi-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_BACKEND_KEY } = process.env;
  const { callId } = req.query;

  if (!VAPI_BACKEND_KEY) {
    return res.status(500).json({ detail: 'VAPI Backend key not configured' });
  }

  if (!callId || typeof callId !== 'string') {
    return res.status(400).json({ detail: 'Call ID is required' });
  }

  try {
    const vapiClient = new VAPIClient(VAPI_BACKEND_KEY);
    const result = await vapiClient.getCallStatus(callId);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting call status:', error);
    res.status(500).json({ 
      detail: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
