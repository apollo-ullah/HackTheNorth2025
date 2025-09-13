import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const status = {
    api_key_configured: !!process.env.VAPI_API_KEY,
    assistant_id_configured: !!process.env.VAPI_ASSISTANT_ID,
    phone_number_id_configured: !!process.env.VAPI_PHONE_NUMBER_ID,
  };

  res.status(200).json(status);
}
