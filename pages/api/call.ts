import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../lib/vapi-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID } = process.env;

  if (!VAPI_API_KEY) {
    return res.status(500).json({ detail: 'VAPI API key not configured' });
  }

  if (!VAPI_ASSISTANT_ID) {
    return res.status(500).json({ detail: 'Assistant ID not configured' });
  }

  if (!VAPI_PHONE_NUMBER_ID) {
    return res.status(500).json({ detail: 'Phone Number ID not configured' });
  }

  const { phone_number } = req.body;

  if (!phone_number) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  try {
    const vapiClient = new VAPIClient(VAPI_API_KEY);
    const result = await vapiClient.makeOutboundCall(
      phone_number,
      VAPI_ASSISTANT_ID,
      VAPI_PHONE_NUMBER_ID
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('Error making call:', error);
    res.status(500).json({ 
      detail: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
