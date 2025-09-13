import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../../lib/vapi-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_BACKEND_KEY, VAPI_PHONE_NUMBER_ID } = process.env;

  if (!VAPI_BACKEND_KEY) {
    return res.status(500).json({ error: 'VAPI Backend key not configured' });
  }
  
  console.log('📞 VAPI_PHONE_NUMBER_ID available:', !!VAPI_PHONE_NUMBER_ID);

  try {
    const { emergency_contact_phone = '+15146605707', case_summary, location } = req.body;

    console.log(`📞 Emergency call to ${emergency_contact_phone}`);
    console.log(`📋 Case summary: ${case_summary}`);
    console.log(`📍 Location: ${JSON.stringify(location)}`);

    const vapiClient = new VAPIClient(VAPI_BACKEND_KEY);

    // Simple emergency briefing
    const locationText = location ? 
      `Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} with ${Math.round(location.accuracy)} meter accuracy` :
      'Location: Not available';

    const briefingScript = `Hello, I am Stacy, a voice agent reporting a safety emergency.

EMERGENCY REPORT:
- Time: ${new Date().toLocaleString()}
- ${locationText}
- Situation: ${case_summary || 'Emergency button activated from safety app'}
- This is an automated emergency call from Stacy AI Safety Companion

The user has activated emergency protocols. This call is to inform you of their situation.`;

    // Create simple assistant for emergency briefing
    const assistantConfig = {
      name: 'Stacy Emergency Briefing',
      system_prompt: `You are Stacy calling to brief an emergency contact about a safety situation.

You must start by delivering this exact briefing:
${briefingScript}

After delivering the briefing:
1. Stay on the line to answer any questions
2. Only provide information that was given to you - do not speculate
3. If asked about details you don't have, say "I don't have that information"
4. Remain calm and professional throughout the call

Start immediately with the briefing.`,
      first_message: briefingScript
    };

    const result = await vapiClient.makeOutboundCall(
      emergency_contact_phone,
      assistantConfig,
      VAPI_PHONE_NUMBER_ID || undefined
    );

    console.log(`📞 Emergency call successful: ${result.id}`);

    res.status(200).json({
      success: true,
      callId: result.id,
      message: 'Emergency call initiated successfully',
      briefing: briefingScript
    });

  } catch (error) {
    console.error('📞 Emergency call error:', error);
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
        hasVapiKey: !!VAPI_BACKEND_KEY,
        hasPhoneNumberId: !!VAPI_PHONE_NUMBER_ID
      }
    });
  }
}
