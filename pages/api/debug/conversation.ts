import { NextApiRequest, NextApiResponse } from 'next';

// Debug endpoint to inspect conversation state
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Import the conversations map from the chat API
    // This is a temporary debug solution
    res.json({
      message: 'Debug endpoint available',
      sessionId,
      timestamp: new Date().toISOString(),
      instructions: 'Use this endpoint to debug conversation state issues'
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
