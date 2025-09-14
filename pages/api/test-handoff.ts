import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools } from '../../lib/stacy-tools';

// Test endpoint for VAPI emergency transfer validation
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ error: 'Missing required environment variables' });
  }

  const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  try {
    const { destination, reason } = req.body;
    
    const testDestination = destination || '+15146605707';
    const testReason = reason || 'Test emergency transfer validation';
    
    console.log('🧨 Testing VAPI emergency transfer validation');
    console.log(`📞 Destination: ${testDestination}`);
    console.log(`📜 Reason: ${testReason}`);

    // Validate the emergency transfer request
    const validation = stacyTools.validateEmergencyTransfer(testDestination, testReason);

    return res.json({
      success: validation.valid,
      destination: testDestination,
      reason: testReason,
      validation: validation.message,
      message: validation.valid 
        ? 'Emergency transfer validation successful - VAPI transferCall tool is properly configured' 
        : 'Emergency transfer validation failed',
      note: 'This test validates the transfer configuration. Actual transfers are handled by VAPI\'s built-in transferCall functionality.'
    });

  } catch (error) {
    console.error('Test transfer validation error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
