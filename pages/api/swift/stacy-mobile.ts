import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../../lib/vapi-client';
import { StacyTools } from '../../../lib/stacy-tools';

// Swift Mobile App Integration API
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add CORS headers for mobile app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { VAPI_BACKEND_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER } = process.env;

  if (!VAPI_BACKEND_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ 
      error: 'Server configuration incomplete',
      details: {
        vapi: !!VAPI_BACKEND_KEY,
        twilio: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_NUMBER)
      }
    });
  }

  const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  const vapiClient = new VAPIClient(VAPI_BACKEND_KEY, {
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  try {
    switch (req.method) {
      case 'GET': {
        // Health check for Swift app
        return res.json({
          status: 'active',
          service: 'Stacy AI Safety Companion - Swift Integration',
          version: '1.0.0',
          capabilities: [
            'emergency_call',
            'panic_alert',
            'location_share', 
            'safe_locations',
            'risk_assessment',
            'emergency_contacts'
          ],
          timestamp: new Date().toISOString(),
        });
      }

      case 'POST': {
        const { action, data } = req.body;

        switch (action) {
          case 'emergency_call': {
            // Initiate emergency VAPI call
            const { userPhone, location, emergencyContacts } = data;
            
            if (!userPhone) {
              return res.status(400).json({ error: 'User phone number required' });
            }

            const assistantConfig = {
              name: 'Stacy Emergency Response',
              system_prompt: `EMERGENCY MODE: You are Stacy in CRITICAL emergency response mode. The user has triggered an emergency alert from their mobile app. 

IMMEDIATE PROTOCOL:
1. Confirm user safety status
2. Assess if they can speak safely  
3. Get location confirmation
4. Take appropriate emergency action

USER CONTEXT:
- Called from mobile emergency button
- Location: ${location ? `${location.lat}, ${location.lng}` : 'Unknown'}
- Emergency contacts available: ${emergencyContacts?.length || 0}

Keep responses under 15 words. Act fast.`
            };

            const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
            
            const result = await vapiClient.makeOutboundCall(
              userPhone,
              assistantConfig,
              phoneNumberId
            );

            return res.json({
              success: true,
              callId: result.id,
              message: 'Emergency call initiated',
              stacyNumber: TWILIO_NUMBER,
              estimatedCallTime: '30-60 seconds'
            });
          }

          case 'panic_alert': {
            // Immediate panic button response
            const { location, emergencyContact, context } = data;
            
            if (!emergencyContact?.phone) {
              return res.status(400).json({ error: 'Emergency contact required' });
            }

            const alertMessage = `🚨 PANIC ALERT 🚨
${context || 'Emergency button activated'}

Time: ${new Date().toLocaleString()}
${location ? `Location: https://maps.google.com/?q=${location.lat},${location.lng}` : 'Location: Unknown'}

This is an automated emergency alert from Stacy AI Safety Companion. The user may need immediate assistance.`;

            const result = await stacyTools.sendContactSms(
              emergencyContact.phone,
              alertMessage,
              location
            );

            return res.json({
              success: result.success,
              messageId: result.messageId,
              error: result.error,
              message: result.success ? 'Panic alert sent successfully' : 'Failed to send panic alert'
            });
          }

          case 'location_share': {
            // Share location with emergency contact
            const { location, recipient, message } = data;
            
            if (!location || !recipient?.phone) {
              return res.status(400).json({ error: 'Location and recipient required' });
            }

            const locationMessage = `📍 Location shared from Stacy AI:
${message || 'Current location update'}

Location: https://maps.google.com/?q=${location.lat},${location.lng}
Accuracy: ±${location.accuracy || 100}m
Time: ${new Date().toLocaleString()}`;

            const result = await stacyTools.sendContactSms(
              recipient.phone,
              locationMessage,
              location
            );

            return res.json(result);
          }

          case 'find_safe_locations': {
            // Find nearby safe places
            const { location, radius = 2000, types } = data;
            
            if (!location) {
              return res.status(400).json({ error: 'Location required' });
            }

            const safeLocations = await stacyTools.getSafeLocations(location, radius);
            
            // Filter by types if specified
            const filteredLocations = types 
              ? safeLocations.filter(loc => types.includes(loc.type))
              : safeLocations;

            return res.json({
              success: true,
              locations: filteredLocations,
              count: filteredLocations.length,
              searchRadius: radius,
              userLocation: location
            });
          }

          case 'risk_assessment': {
            // Assess risk level from user input
            const { message, context } = data;
            
            if (!message) {
              return res.status(400).json({ error: 'Message required for risk assessment' });
            }

            const riskLevel = assessRiskLevel(message);
            const recommendations = getRiskRecommendations(riskLevel);

            return res.json({
              success: true,
              riskLevel,
              recommendations,
              keywords: extractDistressKeywords(message),
              timestamp: new Date().toISOString()
            });
          }

          case 'check_in': {
            // Safety check-in
            const { message, location, previousRisk } = data;
            
            const riskLevel = assessRiskLevel(message || 'checking in');
            const escalated = previousRisk && riskLevel !== 'SAFE' && previousRisk === 'SAFE';

            return res.json({
              success: true,
              riskLevel,
              escalated,
              recommendations: getRiskRecommendations(riskLevel),
              followUpRequired: riskLevel !== 'SAFE',
              timestamp: new Date().toISOString()
            });
          }

          case 'emergency_contacts': {
            // Manage emergency contacts (for Swift app)
            const { contacts } = data;
            
            // In production, this would save to a database
            // For now, return validation
            const validatedContacts = contacts?.map((contact: any) => ({
              name: contact.name,
              phone: contact.phone,
              relationship: contact.relationship,
              validated: isValidPhoneNumber(contact.phone)
            }));

            return res.json({
              success: true,
              contacts: validatedContacts,
              message: 'Emergency contacts processed'
            });
          }

          default:
            return res.status(400).json({ error: `Unknown action: ${action}` });
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Swift API error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
}

// Helper functions
function assessRiskLevel(message: string): 'SAFE' | 'ELEVATED' | 'CRITICAL' {
  const lowerMessage = message.toLowerCase();
  
  const highPriorityKeywords = ['help', 'emergency', 'following me', 'danger', 'attacked', 'kidnapped', 'trapped'];
  const mediumPriorityKeywords = ['scared', 'unsafe', 'uncomfortable', 'suspicious', 'worried', 'threatened'];
  
  const highPriorityFound = highPriorityKeywords.some(keyword => lowerMessage.includes(keyword));
  if (highPriorityFound) return 'CRITICAL';
  
  const mediumPriorityFound = mediumPriorityKeywords.some(keyword => lowerMessage.includes(keyword));
  if (mediumPriorityFound) return 'ELEVATED';
  
  return 'SAFE';
}

function getRiskRecommendations(riskLevel: string): string[] {
  switch (riskLevel) {
    case 'SAFE':
      return [
        'Stay aware of your surroundings',
        'Keep your phone charged',
        'Let someone know your location'
      ];
    case 'ELEVATED':
      return [
        'Move to a well-lit, populated area',
        'Contact someone you trust',
        'Stay alert and avoid distractions',
        'Have emergency contacts ready'
      ];
    case 'CRITICAL':
      return [
        'Call 911 immediately if safe to do so',
        'Move to the nearest safe location',
        'Alert emergency contacts',
        'Stay on the line with emergency services'
      ];
    default:
      return ['Stay safe and trust your instincts'];
  }
}

function extractDistressKeywords(message: string): string[] {
  const allKeywords = ['help', 'emergency', 'following me', 'danger', 'scared', 'unsafe', 'uncomfortable', 'suspicious'];
  return allKeywords.filter(keyword => message.toLowerCase().includes(keyword));
}

function isValidPhoneNumber(phone: string): boolean {
  // Basic E.164 validation
  return /^\+[1-9]\d{1,14}$/.test(phone);
}
