import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const status = {
    vapi_backend_key_configured: !!process.env.VAPI_BACKEND_KEY,
    vapi_frontend_key_configured: !!process.env.VAPI_FRONTEND_KEY,
    twilio_configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_NUMBER),
  };

  res.status(200).json(status);
}
