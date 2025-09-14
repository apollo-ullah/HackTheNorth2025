import { NextApiRequest, NextApiResponse } from 'next';

// This endpoint can be used to send updates back to the VAPI call
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { callId, message, dispatchSid } = req.body;
    
    console.log('📢 Dispatch update:', { callId, message, dispatchSid });
    
    // In a real system, you could use this to send updates back to the VAPI call
    // For now, we'll just log it
    
    return res.json({ 
      success: true, 
      message: 'Update received',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dispatch update error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Update error' 
    });
  }
}
