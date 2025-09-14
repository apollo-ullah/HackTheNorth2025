import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { conference, role } = req.query;
    console.log('🎯 Conference endpoint called:', { conference, role });

    // Generate TwiML to join the conference
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">You are now being connected to the emergency conference.</Say>
  <Dial>
    <Conference statusCallback="${process.env.VAPI_SERVER_URL}/api/vapi/conference-status" statusCallbackEvent="start end join leave" statusCallbackMethod="POST">${conference}</Conference>
  </Dial>
</Response>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.status(200).send(twiml);

  } catch (error) {
    console.error('Conference endpoint error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Conference error' 
    });
  }
}
