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

  try {
    const { emergency_contact_phone, user_name, briefing_script, case_file } = req.body;

    if (!emergency_contact_phone || !briefing_script) {
      return res.status(400).json({ error: 'Emergency contact phone and briefing script required' });
    }

    console.log(`📞 Initiating emergency briefing call to ${emergency_contact_phone}`);
    console.log(`📋 Case file: ${JSON.stringify(case_file, null, 2)}`);

    const vapiClient = new VAPIClient(VAPI_BACKEND_KEY);

    // Create assistant configuration for emergency briefing
    const assistantConfig = {
      name: 'Stacy Emergency Briefing Agent',
      system_prompt: `You are Stacy, an AI safety agent calling to brief an emergency contact about a safety situation.

EMERGENCY BRIEFING SCRIPT:
${briefing_script}

CASE FILE DATA (VERIFIED FACTS ONLY):
${JSON.stringify(case_file, null, 2)}

CRITICAL INSTRUCTIONS:
1. Start with the briefing script exactly as provided
2. ONLY provide information that is verified in the case file
3. If asked questions you cannot answer from the case file, say "I don't have that information verified"
4. DO NOT speculate or assume anything beyond the documented facts
5. Keep responses professional and factual
6. If asked about the user's current status, refer to the communication mode and timestamp
7. Provide the session ID if requested for reference

CONVERSATION FLOW:
1. Deliver the briefing script
2. Answer questions using ONLY verified case file data
3. Do not hang up - stay available for questions
4. If they want to speak to the user directly, explain the communication limitations

Remember: You are representing verified facts only. No speculation.`
    };

    const result = await vapiClient.makeOutboundCall(
      emergency_contact_phone,
      assistantConfig,
      VAPI_PHONE_NUMBER_ID
    );

    console.log(`📞 Emergency briefing call initiated: ${result.id}`);

    res.status(200).json({
      success: true,
      callId: result.id,
      message: 'Emergency briefing call initiated successfully',
      briefingScript: briefing_script,
      caseFile: case_file
    });

  } catch (error) {
    console.error('Emergency briefing call error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
