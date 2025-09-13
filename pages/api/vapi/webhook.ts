import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools } from '../../../lib/stacy-tools';

// Simplified VAPI Webhook handler for Stacy's emergency tools
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  try {
    const { message } = req.body;
    
    // Only handle function calls - ignore other message types
    if (message.type !== 'function-call') {
      return res.json({ received: true });
    }

    const { functionCall } = message;
    const { name, parameters } = functionCall;

    console.log(`Executing Stacy tool: ${name}`, parameters);

    let result;
    const mockCaseFile = {
      id: `emergency_${Date.now()}`,
      timestamp: new Date().toISOString(),
      riskLevel: 'CRITICAL' as const,
      timeline: [],
      evidence: [],
      userStatus: { canSpeak: true, canText: true, isHidden: false },
    };

    switch (name) {
      case 'notify_emergency_contact':
        result = await stacyTools.notifyEmergencyContact(parameters.contact, mockCaseFile, parameters.urgentMessage);
        break;
      
      case 'call_demo_emergency':
        result = await stacyTools.callDemoEmergency(mockCaseFile, parameters.briefingScript);
        break;
      
      case 'send_contact_sms':
        const location = parameters.includeLocation ? { lat: 37.7749, lng: -122.4194 } : undefined;
        result = await stacyTools.sendContactSms(parameters.phoneNumber, parameters.message, location);
        break;
      
      case 'get_safe_locations':
        const safeLocations = await stacyTools.getSafeLocations({ lat: 37.7749, lng: -122.4194 }, parameters.radius || 5000);
        result = { success: true, locations: safeLocations };
        break;
      
      default:
        result = { success: false, error: `Unknown function: ${name}` };
    }

    return res.json({ result });

  } catch (error) {
    console.error('VAPI webhook error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
