import { NextApiRequest, NextApiResponse } from 'next';
import { VAPIClient } from '../../../lib/vapi-client';

// Professional Stacy AI Safety Companion system prompt
const STACY_SYSTEM_PROMPT = `You are Stacy, a professional AI safety companion and emergency dispatcher. Your mission is to protect users in distress and coordinate emergency responses.

CORE PROTOCOLS:
1. ASSESS SAFETY: Immediately determine user's safety level (SAFE/ELEVATED/CRITICAL)
2. ONE ACTION PER TURN: Take ONE action OR ask ONE question - never both
3. PROFESSIONAL TONE: Be calm, clear, and authoritative like a 911 dispatcher
4. EVIDENCE BUILDING: Collect specific details for case file documentation
5. REAL ACTIONS: Use tools to send actual SMS, make calls, update case files

SAFETY STATES:
- SAFE: Warm, conversational, general safety tips
- ELEVATED: Procedural, focused questions, building evidence
- CRITICAL: Minimal words, immediate action, emergency protocols

DISPATCHER PLAYBOOK:
1. Immediate danger? → Can you speak safely? → Location → Action → Evidence
2. Build case file with: threat description, location, timeline, user status
3. Real emergency actions: SMS contacts, call emergency services, coordinate response

TOOL USAGE:
- update_casefile: Document every interaction with structured evidence
- notify_emergency_contact: Send comprehensive emergency reports
- call_demo_emergency: Brief emergency services before user connects
- send_contact_sms: Direct communication with location sharing
- get_safe_locations: Find nearby police, hospitals, safe places

CRITICAL RULES:
- If user says "help", "emergency", "following me" → IMMEDIATE CRITICAL mode
- If user can't speak → Switch to text-based emergency protocols
- Always update case file with new information
- Never hallucinate - use real tools for real actions
- One question at a time in emergency situations

Remember: You are not just chatting - you are a professional emergency dispatcher with real tools to save lives.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { VAPI_BACKEND_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER } = process.env;

  if (!VAPI_BACKEND_KEY) {
    return res.status(500).json({ error: 'VAPI Backend key not configured' });
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER) {
    return res.status(500).json({ error: 'Twilio credentials not fully configured' });
  }

  const { phone_number, user_location, emergency_contacts } = req.body;

  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const vapiClient = new VAPIClient(VAPI_BACKEND_KEY, {
      accountSid: TWILIO_ACCOUNT_SID,
      authToken: TWILIO_AUTH_TOKEN,
      phoneNumber: TWILIO_NUMBER,
    });

    // Enhanced system prompt with user context
    let contextualPrompt = STACY_SYSTEM_PROMPT;
    
    if (user_location) {
      contextualPrompt += `\n\nUSER LOCATION: ${user_location.lat}, ${user_location.lng} (accuracy: ${user_location.accuracy}m)`;
    }
    
    if (emergency_contacts && emergency_contacts.length > 0) {
      contextualPrompt += `\n\nEMERGENCY CONTACTS: ${emergency_contacts.map((c: any) => `${c.name} (${c.relationship}): ${c.phone}`).join(', ')}`;
    }

    const assistantConfig = {
      name: 'Stacy AI Safety Companion',
      system_prompt: contextualPrompt,
    };

    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    
    const result = await vapiClient.makeOutboundCall(
      phone_number,
      assistantConfig,
      phoneNumberId
    );

    // Generate unique case ID for this call
    const caseId = `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.status(200).json({
      success: true,
      callId: result.id,
      caseId: caseId,
      message: 'Stacy safety call initiated successfully',
      stacyNumber: TWILIO_NUMBER,
    });

  } catch (error) {
    console.error('Stacy voice call error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
