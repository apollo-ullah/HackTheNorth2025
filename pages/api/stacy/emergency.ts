import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools, CaseFile, EmergencyContact, assessRiskLevel } from '../../../lib/stacy-tools';

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
    const { action, data } = req.body;

    switch (action) {
      case 'update_casefile': {
        const { caseId, updates } = data;
        const caseFile = await stacyTools.updateCaseFile(caseId, updates);
        return res.json({ success: true, caseFile });
      }

      case 'notify_emergency_contact': {
        const { contact, caseFile, message } = data;
        const result = await stacyTools.notifyEmergencyContact(contact, caseFile, message);
        return res.json(result);
      }

      case 'call_demo_emergency': {
        const { caseFile, briefingScript } = data;
        const result = await stacyTools.callDemoEmergency(caseFile, briefingScript);
        return res.json(result);
      }

      case 'get_safe_locations': {
        const { location, radius } = data;
        const safeLocations = await stacyTools.getSafeLocations(location, radius);
        return res.json({ success: true, safeLocations });
      }

      case 'send_contact_sms': {
        const { phoneNumber, message, location } = data;
        const result = await stacyTools.sendContactSms(phoneNumber, message, location);
        return res.json(result);
      }

      case 'assess_risk': {
        const { message } = data;
        const riskLevel = assessRiskLevel(message);
        return res.json({ success: true, riskLevel });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Stacy emergency API error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
