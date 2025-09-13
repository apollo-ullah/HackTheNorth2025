import { NextApiRequest, NextApiResponse } from 'next';
import { StacyTools } from '../../../lib/stacy-tools';

// Production VAPI Webhook Handler for Stacy AI Safety Companion
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Log all incoming webhooks for debugging
  console.log('VAPI Webhook received:', {
    headers: req.headers,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER, VAPI_WEBHOOK_SECRET } = process.env;

  // Webhook verification (optional but recommended for production)
  if (VAPI_WEBHOOK_SECRET) {
    const signature = req.headers['x-vapi-signature'];
    if (!signature || signature !== VAPI_WEBHOOK_SECRET) {
      console.warn('Invalid webhook signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    console.error('Twilio credentials not configured');
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  const stacyTools = new StacyTools({
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    phoneNumber: TWILIO_NUMBER,
  });

  try {
    const { message } = req.body;
    
    // Handle different VAPI message types
    switch (message.type) {
      case 'conversation-update': {
        // Log conversation progress
        console.log('Conversation update:', {
          callId: message.call?.id,
          status: message.call?.status,
          timestamp: new Date().toISOString()
        });
        
        // Return empty response to continue conversation
        return res.json({ 
          success: true,
          timestamp: new Date().toISOString()
        });
      }

      case 'function-call': {
        const { functionCall, call } = message;
        const { name, parameters } = functionCall;
        const callId = call?.id || 'unknown';

        console.log(`Executing Stacy tool: ${name} for call ${callId}`, parameters);

        let result;
        
        switch (name) {
          case 'update_casefile': {
            const { caseId, riskLevel, threat, userStatus, location } = parameters;
            
            // Create case file update
            const caseFile = await stacyTools.updateCaseFile(caseId || callId, {
              riskLevel,
              threat,
              userStatus,
              location,
              timeline: [{
                timestamp: new Date().toISOString(),
                event: `Case file updated via VAPI call`,
                source: 'system'
              }]
            });
            
            result = {
              success: true,
              caseFile,
              message: `Case file ${caseId || callId} updated. Risk level: ${riskLevel || 'ELEVATED'}`
            };
            break;
          }

          case 'notify_emergency_contact': {
            const { contactName, contactPhone, urgentMessage, includeLocation } = parameters;
            
            const contact = {
              name: contactName,
              phone: contactPhone,
              relationship: 'Emergency Contact'
            };

            // Create emergency case file
            const emergencyCaseFile = {
              id: `emergency_${callId}_${Date.now()}`,
              timestamp: new Date().toISOString(),
              riskLevel: 'CRITICAL',
              location: includeLocation ? {
                lat: 37.7749, // Would get from call context in production
                lng: -122.4194,
                accuracy: 100
              } : null,
              timeline: [{
                timestamp: new Date().toISOString(),
                event: urgentMessage,
                source: 'user'
              }],
              evidence: [],
              userStatus: {
                canSpeak: true,
                canText: true,
                isHidden: false
              }
            };

            result = await stacyTools.notifyEmergencyContact(contact, emergencyCaseFile, urgentMessage);
            break;
          }

          case 'call_demo_emergency': {
            const { briefingScript, caseId } = parameters;
            
            const emergencyCaseFile = {
              id: caseId || `demo_emergency_${callId}`,
              timestamp: new Date().toISOString(),
              riskLevel: 'CRITICAL',
              timeline: [],
              evidence: [],
              userStatus: { canSpeak: false, canText: true, isHidden: true }
            };

            result = await stacyTools.callDemoEmergency(emergencyCaseFile, briefingScript);
            break;
          }

          case 'send_location_sms': {
            const { phoneNumber, message, urgent } = parameters;
            
            // Mock location for demo
            const location = { lat: 37.7749, lng: -122.4194 };
            
            const fullMessage = urgent ? `🚨 URGENT: ${message}` : message;
            result = await stacyTools.sendContactSms(phoneNumber, fullMessage, location);
            break;
          }

          case 'get_safe_locations': {
            const { radius = 5000 } = parameters;
            
            // Mock user location
            const userLocation = { lat: 37.7749, lng: -122.4194 };
            
            const safeLocations = await stacyTools.getSafeLocations(userLocation, radius);
            
            result = {
              success: true,
              locations: safeLocations,
              message: `Found ${safeLocations.length} safe locations within ${radius/1000}km. Nearest is ${safeLocations[0]?.name} at ${safeLocations[0]?.distance}km away.`
            };
            break;
          }

          default:
            result = {
              success: false,
              error: `Unknown function: ${name}`
            };
        }

        // Log tool execution result
        console.log(`Tool ${name} result:`, result);

        // Return result to VAPI
        return res.json({
          result: {
            success: result.success,
            data: result,
            message: result.message || (result.success ? `${name} executed successfully` : `${name} failed`)
          }
        });
      }

      case 'hang': {
        // Call ended - finalize case file
        console.log('Call ended:', message.call?.id);
        
        // Log call completion
        const callSummary = {
          callId: message.call?.id,
          endedAt: new Date().toISOString(),
          duration: message.call?.duration || 0,
          endReason: message.call?.endedReason || 'unknown'
        };
        
        console.log('Call summary:', callSummary);
        
        return res.json({ 
          success: true,
          message: 'Call ended, case file finalized'
        });
      }

      case 'speech-update': {
        // Handle speech detection updates
        const { status, transcript } = message;
        
        if (transcript) {
          console.log('Speech transcript:', transcript);
          
          // Analyze for distress keywords
          const distressKeywords = ['help', 'emergency', 'danger', 'scared', 'following', 'unsafe'];
          const detectedKeywords = distressKeywords.filter(keyword => 
            transcript.toLowerCase().includes(keyword)
          );
          
          if (detectedKeywords.length > 0) {
            console.log('Distress keywords detected:', detectedKeywords);
          }
        }
        
        return res.json({ success: true });
      }

      default: {
        console.log('Unhandled VAPI message type:', message.type);
        return res.json({ 
          success: true,
          message: 'Message received'
        });
      }
    }

  } catch (error) {
    console.error('VAPI webhook error:', error);
    
    // Return error response that VAPI can handle
    return res.status(500).json({ 
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }
    });
  }
}
