import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../lib/vapi-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_BACKEND_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER, VAPI_SERVER_URL, DEMO_EMERGENCY_NUMBER, DEMO_EMERGENCY_CONTACT } = process.env;

  if (!VAPI_BACKEND_KEY) {
    return res.status(500).json({ detail: 'VAPI Backend key not configured' });
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ detail: 'Twilio credentials not fully configured' });
  }

  if (!VAPI_SERVER_URL) {
    return res.status(500).json({ detail: 'VAPI_SERVER_URL not configured (set to your public https domain, e.g. https://<ngrok>.ngrok.io)' });
  }

  const { phone_number, assistant_name, system_prompt, location } = req.body;

  if (!phone_number) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  try {
    const vapiClient = new VAPIClient(VAPI_BACKEND_KEY, {
      accountSid: TWILIO_ACCOUNT_SID,
      authToken: TWILIO_AUTH_TOKEN,
      phoneNumber: TWILIO_NUMBER,
    });
    
    console.log('🎤 Initiating VAPI call');
    
    // Require VAPI phone number ID from env (no hardcoded fallback)
    const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    if (!vapiPhoneNumberId) {
      return res.status(500).json({ detail: 'VAPI phone number ID not configured' });
    }
    
    const callPayload: any = {
      customer: {
        number: phone_number,
      },
      phoneNumberId: vapiPhoneNumberId
    };
    
    console.log('✅ Using VAPI phone number ID: [configured]');

    // Create inline assistant with tools and webhook server
    // Compose a stricter voice system prompt so the agent uses our webhook tools without asking for phone numbers
    const emergencyNumber = DEMO_EMERGENCY_NUMBER || '+14383761217';
    const emergencyContact = DEMO_EMERGENCY_CONTACT || '+15146605707';
    const voiceSystemPrompt = `You are Stacy, a professional AI safety companion and dispatcher.

TOOLS VIA WEBHOOK:
- send_contact_sms: Send safety SMS. If phone is omitted, default to ${emergencyContact}.
- call_demo_police: Place a demo dispatcher call to ${emergencyNumber} with a short script.

STRICT RULES:
- Never ask the user for contact numbers; use the defaults above unless the user provides a different one explicitly.
- Do not say you contacted anyone without actually calling a tool.
- Before calling a tool, ask for a quick yes/no confirmation unless the user says "call now" or a hard trigger is present.
- Include location coordinates in tool parameters if available from metadata.
` + (system_prompt ? `\nADDITIONAL CONTEXT FROM UI:\n${system_prompt}` : '');

    callPayload.assistant = {
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: voiceSystemPrompt
          }
        ]
      },
      voice: {
        provider: 'openai',
        voiceId: 'nova'
      },
      firstMessage: 'Hi, this is Stacy. How can I help you stay safe today?',
      serverUrl: `${VAPI_SERVER_URL}/api/vapi/webhook`,
      metadata: location ? { location } : undefined
    };
    console.log('✅ Using inline assistant');

    console.log('Making VAPI call with payload:', JSON.stringify(callPayload, null, 2));

    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_BACKEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(callPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('VAPI call failed:', response.status, error);
      throw new Error(`Failed to make call: ${error}`);
    }

    const result = await response.json();

    console.log('✅ VAPI call initiated:', result.id);
    res.status(200).json(result);
  } catch (error) {
    console.error('❌ VAPI call error:', error);
    res.status(500).json({ 
      detail: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
