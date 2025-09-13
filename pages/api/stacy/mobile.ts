import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools, assessRiskLevel } from '../../../lib/stacy-tools';

// Mobile-friendly API endpoints for Swift frontend
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    switch (req.method) {
      case 'POST': {
        const { action } = req.body;

        switch (action) {
          case 'quick_alert': {
            // Quick emergency alert for panic button
            const { location, message, emergency_contact } = req.body;
            
            const alertMessage = `🚨 PANIC BUTTON ACTIVATED 🚨\n${message}\nLocation: https://maps.google.com/?q=${location.lat},${location.lng}\nTime: ${new Date().toLocaleString()}\n\nThis is an automated alert from Stacy AI Safety Companion.`;
            
            const result = await stacyTools.sendContactSms(
              emergency_contact.phone,
              alertMessage,
              location
            );
            
            return res.json(result);
          }

          case 'check_in': {
            // Safety check-in with risk assessment
            const { message, location } = req.body;
            const riskLevel = assessRiskLevel(message);
            
            return res.json({
              success: true,
              riskLevel,
              recommendations: getRiskRecommendations(riskLevel),
              timestamp: new Date().toISOString(),
            });
          }

          case 'find_help': {
            // Find nearby safe locations
            const { location, type } = req.body;
            const safeLocations = await stacyTools.getSafeLocations(location);
            
            // Filter by type if specified
            const filteredLocations = type 
              ? safeLocations.filter(loc => loc.type === type)
              : safeLocations;
            
            return res.json({
              success: true,
              locations: filteredLocations,
              timestamp: new Date().toISOString(),
            });
          }

          case 'stealth_mode': {
            // Discrete emergency communication
            const { contact_phone, code_word, location } = req.body;
            
            const stealthMessage = `${code_word} - Location: https://maps.google.com/?q=${location.lat},${location.lng} - ${new Date().toLocaleString()}`;
            
            const result = await stacyTools.sendContactSms(
              contact_phone,
              stealthMessage,
              location
            );
            
            return res.json(result);
          }

          default:
            return res.status(400).json({ error: 'Invalid action' });
        }
      }

      case 'GET': {
        // Health check and status
        return res.json({
          status: 'active',
          service: 'Stacy AI Safety Companion',
          version: '1.0.0',
          features: [
            'quick_alert',
            'check_in', 
            'find_help',
            'stealth_mode',
            'voice_calls',
            'emergency_dispatch'
          ],
          timestamp: new Date().toISOString(),
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Stacy mobile API error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

function getRiskRecommendations(riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL'): string[] {
  switch (riskLevel) {
    case 'SAFE':
      return [
        'Stay aware of your surroundings',
        'Keep your phone charged',
        'Let someone know your location',
        'Trust your instincts'
      ];
    
    case 'ELEVATED':
      return [
        'Move to a well-lit, populated area',
        'Contact someone you trust',
        'Stay alert and avoid distractions',
        'Have emergency contacts ready',
        'Consider changing your route'
      ];
    
    case 'CRITICAL':
      return [
        'Call 911 immediately if safe to do so',
        'Move to the nearest safe location',
        'Alert emergency contacts',
        'Document evidence if possible',
        'Stay on the line with emergency services'
      ];
    
    default:
      return ['Stay safe and trust your instincts'];
  }
}
