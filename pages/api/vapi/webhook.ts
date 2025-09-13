import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools } from '../../../lib/stacy-tools';

// VAPI Webhook handler for Stacy's emergency tools
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
    
    console.log('VAPI Webhook received:', JSON.stringify(message, null, 2));

    // Handle different VAPI message types
    switch (message.type) {
      case 'function-call': {
        const { functionCall } = message;
        const { name, parameters } = functionCall;

        console.log(`Executing Stacy tool: ${name}`, parameters);

        switch (name) {
          case 'update_casefile': {
            const { caseId, updates } = parameters;
            const caseFile = await stacyTools.updateCaseFile(caseId, updates);
            
            return res.json({
              result: {
                success: true,
                caseFile,
                message: `Case file ${caseId} updated successfully. Risk level: ${caseFile.riskLevel}`,
              },
            });
          }

          case 'notify_emergency_contact': {
            const { contact, urgentMessage } = parameters;
            
            // Create a mock case file for the emergency notification
            const mockCaseFile = {
              id: `emergency_${Date.now()}`,
              timestamp: new Date().toISOString(),
              riskLevel: 'CRITICAL' as const,
              timeline: [{
                timestamp: new Date().toISOString(),
                event: urgentMessage,
                source: 'user' as const,
              }],
              evidence: [],
              userStatus: {
                canSpeak: true,
                canText: true,
                isHidden: false,
              },
            };

            const result = await stacyTools.notifyEmergencyContact(contact, mockCaseFile, urgentMessage);
            
            return res.json({
              result: {
                ...result,
                message: result.success 
                  ? `Emergency alert sent to ${contact.name} at ${contact.phone}. Message ID: ${result.messageId}`
                  : `Failed to send emergency alert: ${result.error}`,
              },
            });
          }

          case 'call_demo_emergency': {
            const { briefingScript } = parameters;
            
            const mockCaseFile = {
              id: `demo_emergency_${Date.now()}`,
              timestamp: new Date().toISOString(),
              riskLevel: 'CRITICAL' as const,
              timeline: [],
              evidence: [],
              userStatus: { canSpeak: false, canText: true, isHidden: true },
            };

            const result = await stacyTools.callDemoEmergency(mockCaseFile, briefingScript);
            
            return res.json({
              result: {
                ...result,
                message: result.success 
                  ? `Demo emergency call placed. Call ID: ${result.callId}. Emergency services briefed.`
                  : `Failed to place emergency call: ${result.error}`,
              },
            });
          }

          case 'send_contact_sms': {
            const { phoneNumber, message, includeLocation } = parameters;
            
            // Mock location for demo (you'd get this from the call context in production)
            const mockLocation = includeLocation ? { lat: 37.7749, lng: -122.4194 } : undefined;
            
            const result = await stacyTools.sendContactSms(phoneNumber, message, mockLocation);
            
            return res.json({
              result: {
                ...result,
                message: result.success 
                  ? `SMS sent to ${phoneNumber}. Message ID: ${result.messageId}`
                  : `Failed to send SMS: ${result.error}`,
              },
            });
          }

          case 'get_safe_locations': {
            const { radius = 5000 } = parameters;
            
            // Mock user location (you'd get this from the call context in production)
            const mockLocation = { lat: 37.7749, lng: -122.4194 };
            
            const safeLocations = await stacyTools.getSafeLocations(mockLocation, radius);
            
            return res.json({
              result: {
                success: true,
                locations: safeLocations,
                message: `Found ${safeLocations.length} safe locations within ${radius/1000}km. Nearest is ${safeLocations[0]?.name} at ${safeLocations[0]?.distance}km away.`,
              },
            });
          }

          default:
            return res.json({
              result: {
                success: false,
                error: `Unknown function: ${name}`,
              },
            });
        }
      }

      case 'conversation-update': {
        // Log conversation updates for monitoring
        console.log('Conversation update:', message.conversation);
        break;
      }

      case 'call-ended': {
        // Handle call end - could trigger follow-up actions
        console.log('Call ended:', message.call);
        break;
      }

      default:
        console.log('Unhandled message type:', message.type);
    }

    // Default response for non-function-call messages
    return res.json({ received: true });

  } catch (error) {
    console.error('VAPI webhook error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
