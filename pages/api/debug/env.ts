import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ message: 'Not found' });
  }

  const envStatus = {
    VAPI_BACKEND_KEY: !!process.env.VAPI_BACKEND_KEY,
    VAPI_PHONE_NUMBER_ID: !!process.env.VAPI_PHONE_NUMBER_ID,
    TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
    TWILIO_NUMBER: !!process.env.TWILIO_NUMBER,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    NODE_ENV: process.env.NODE_ENV
  };

  console.log('🔍 Environment variables status:', envStatus);

  res.status(200).json({
    success: true,
    environment: envStatus,
    message: 'Environment variables checked'
  });
}
