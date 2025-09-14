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

          case 'panic_alert': {
            // Streamlined panic button - same as quick_alert but more intuitive name
            const { location, emergency_contact } = req.body.data || req.body;
            
            if (!emergency_contact?.phone) {
              return res.status(400).json({ error: 'Emergency contact phone number required' });
            }
            
            const alertMessage = `🚨 EMERGENCY ALERT 🚨\n\nPanic button activated - immediate assistance needed\n\nLocation: https://maps.google.com/?q=${location.lat},${location.lng}\nTime: ${new Date().toLocaleString()}\n\nThis is an automated alert from Stacy AI Safety Companion.`;
            
            const result = await stacyTools.sendContactSms(
              emergency_contact.phone,
              alertMessage,
              location
            );
            
            return res.json({ 
              ...result, 
              message: 'Emergency alert sent successfully',
              timestamp: new Date().toISOString()
            });
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
            'panic_alert',
            'quick_alert',  // Legacy support
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
