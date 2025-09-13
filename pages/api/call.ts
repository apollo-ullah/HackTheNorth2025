import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../lib/vapi-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_BACKEND_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER } = process.env;

  if (!VAPI_BACKEND_KEY) {
    return res.status(500).json({ detail: 'VAPI Backend key not configured' });
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ detail: 'Twilio credentials not fully configured' });
  }

  const { phone_number, message, assistant_name, system_prompt } = req.body;

  if (!phone_number) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  try {
    const vapiClient = new VAPIClient(VAPI_BACKEND_KEY, {
      accountSid: TWILIO_ACCOUNT_SID,
      authToken: TWILIO_AUTH_TOKEN,
      phoneNumber: TWILIO_NUMBER,
    });
    
    // Create assistant config if provided
    const assistantConfig = system_prompt ? {
      name: assistant_name || 'Voice Agent',
      system_prompt: system_prompt || 'You are a helpful voice assistant.'
    } : undefined;

    // You can use either phoneNumberId OR Twilio config
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID; // Add this to your .env.local if you want to use it
    
    const result = await vapiClient.makeOutboundCall(
      phone_number,
      assistantConfig,
      phoneNumberId
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('Error making call:', error);
    res.status(500).json({ 
      detail: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
