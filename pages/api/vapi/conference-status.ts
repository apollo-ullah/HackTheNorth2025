import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('🎯 Conference status update:', req.body);
    
    const { 
      ConferenceSid, 
      StatusCallbackEvent, 
      FriendlyName,
      CallSid,
      Muted,
      Hold
    } = req.body;

    console.log(`📞 Conference ${FriendlyName}: ${StatusCallbackEvent} - Call ${CallSid}`);

    // You can add logic here to track conference participants, 
    // send notifications, or update your database
    
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  } catch (error) {
    console.error('Conference status error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Conference status error' 
    });
  }
}
