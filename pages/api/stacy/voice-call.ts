import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../../lib/vapi-client';

// Creates a comprehensive briefing for emergency dispatch
function createDispatcherBriefing(conversationContext: any, userLocation: any, emergencyContacts: any[]) {
  const timestamp = new Date().toLocaleString();
  const locationText = userLocation ? 
    `Location: ${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)} (±${Math.round(userLocation.accuracy)}m accuracy)` :
    'Location: Not available';

  // Extract key incident details from conversation
  const messages = conversationContext?.messages || [];
  const userMessages = messages.filter((m: any) => m.role === 'user').slice(-5);
  const incidentSummary = userMessages.length > 0 ? 
    userMessages.map((m: any) => m.content).join('. ') :
    'Emergency escalation requested from Stacy AI Safety Companion';

  const riskLevel = conversationContext?.riskLevel || 'UNKNOWN';
  const sessionId = conversationContext?.sessionId || 'Unknown';

  return `Hello, this is Stacy, an artificial intelligence safety agent. I am calling to report an incident and complete a handoff to emergency dispatch.

INCIDENT BRIEFING:
- Time: ${timestamp}
- Session ID: ${sessionId}
- Risk Level: ${riskLevel}
- ${locationText}

INCIDENT SUMMARY:
${incidentSummary}

EMERGENCY CONTACTS:
${emergencyContacts && emergencyContacts.length > 0 ? 
  emergencyContacts.map(c => `- ${c.name} (${c.relationship}): ${c.phone}`).join('\n') :
  'No emergency contacts provided'}

This individual has been assessed as requiring emergency assistance. They have requested connection to emergency dispatch through our AI safety platform. I am now completing the handoff to you.

The person you will be speaking with next is the individual who requested emergency assistance. Please take over from here.`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_BACKEND_KEY, VAPI_PHONE_NUMBER_ID, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER } = process.env;

  if (!VAPI_BACKEND_KEY) {
    return res.status(500).json({ error: 'VAPI Backend key not configured' });
  }

  // Check if we have either VAPI phone number ID OR Twilio credentials
  const hasVapiPhone = !!VAPI_PHONE_NUMBER_ID;
  const hasTwilioConfig = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_NUMBER);
  
  if (!hasVapiPhone && !hasTwilioConfig) {
    return res.status(500).json({ 
      error: 'Either VAPI_PHONE_NUMBER_ID or Twilio credentials must be configured',
      debug: { hasVapiPhone, hasTwilioConfig }
    });
  }

  const { phone_number, user_location, emergency_contacts, conversation_context } = req.body;

  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    console.log('📞 Police escalation call initiated');
    console.log('📞 Phone number:', phone_number);
    console.log('📞 Location:', user_location);
    console.log('📞 Conversation context:', conversation_context);
    console.log('📞 VAPI_PHONE_NUMBER_ID:', VAPI_PHONE_NUMBER_ID);
    console.log('📞 TWILIO_NUMBER:', TWILIO_NUMBER);
    console.log('📞 Using VAPI Phone ID:', hasVapiPhone);
    console.log('📞 Using Twilio Config:', hasTwilioConfig);

    const vapiClient = hasTwilioConfig ? 
      new VAPIClient(VAPI_BACKEND_KEY, {
        accountSid: TWILIO_ACCOUNT_SID!,
        authToken: TWILIO_AUTH_TOKEN!,
        phoneNumber: TWILIO_NUMBER!,
      }) : 
      new VAPIClient(VAPI_BACKEND_KEY);

    // Create comprehensive dispatcher briefing
    const briefingScript = createDispatcherBriefing(conversation_context, user_location, emergency_contacts || []);
    
    console.log('📞 Briefing script:', briefingScript);

    // Create VAPI assistant that delivers the briefing and then transfers
    const assistantConfig = {
      name: 'Stacy AI Emergency Dispatcher',
      system_prompt: `You are Stacy, an AI emergency dispatcher calling to brief emergency services and complete a handoff.

You must start by delivering this exact briefing:
${briefingScript}

After delivering the briefing, follow this protocol:
1. Say: "I am now transferring the individual to you. Please stand by."
2. Wait for acknowledgment from dispatcher
3. Complete the handoff by saying: "Transferring now. The individual is on the line."
4. Then stay silent to allow the dispatcher to take over

CRITICAL RULES:
- Start with the briefing immediately
- Only provide information that was given to you
- If asked about details you don't have, say "I don't have that information"
- Stay professional and calm throughout
- Complete the handoff clearly

This is a real emergency situation. Be professional and efficient.`,
      first_message: briefingScript
    };

    const result = await vapiClient.makeOutboundCall(
      phone_number,
      assistantConfig,
      hasVapiPhone ? VAPI_PHONE_NUMBER_ID : undefined
    );

    // Generate unique case ID for this call
    const caseId = `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('📞 Police call successful:', result.id);
    
    res.status(200).json({
      success: true,
      callId: result.id,
      caseId: caseId,
      message: 'Emergency dispatch call initiated with full briefing',
      stacyNumber: TWILIO_NUMBER,
      briefing: briefingScript
    });

  } catch (error) {
    console.error('📞 VAPI call error:', error);
    console.error('📞 Error details:', error instanceof Error ? error.message : error);
    
    // Parse VAPI error for better debugging
    let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    if (errorMessage.includes('Failed to make call:')) {
      try {
        const vapiError = JSON.parse(errorMessage.replace('Failed to make call: ', ''));
        console.error('📞 VAPI API Error:', vapiError);
        errorMessage = `VAPI Error: ${vapiError.message || vapiError.error || errorMessage}`;
      } catch (parseError) {
        console.error('📞 Could not parse VAPI error:', parseError);
      }
    }
    
    res.status(500).json({ 
      error: errorMessage,
      debug: {
        phoneNumber: phone_number,
        hasPhoneNumberId: !!VAPI_PHONE_NUMBER_ID,
        hasTwilioConfig: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_NUMBER)
      }
    });
  }
}
