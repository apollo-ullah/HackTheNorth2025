import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const status = {
    vapi_backend_key_configured: !!process.env.VAPI_BACKEND_KEY,
    vapi_phone_number_id_configured: !!process.env.VAPI_PHONE_NUMBER_ID,
    vapi_assistant_id_configured: !!process.env.VAPI_ASSISTANT_ID,
    openai_api_key_configured: !!process.env.OPENAI_API_KEY,
    twilio_configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_NUMBER),
    environment: process.env.NODE_ENV || 'development'
  };

  res.status(200).json(status);
}
