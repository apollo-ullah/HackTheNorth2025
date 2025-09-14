import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

async function sendSms(phone: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_NUMBER;
    if (!accountSid || !authToken || !fromNumber) return { success: false, error: 'Twilio not configured' };
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const body = new URLSearchParams({ From: fromNumber, To: phone, Body: message });
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: data?.message || 'Twilio SMS failed' };
    return { success: true, sid: data.sid };
  } catch (e: any) {
    return { success: false, error: e?.message || 'SMS error' };
  }
}

async function createEmergencyConference(script: string, userPhone: string, lat?: number, lng?: number) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_NUMBER;
  const dispatchNumber = process.env.DEMO_EMERGENCY_NUMBER || '+14383761217';
  
  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio not configured' };
  }
  
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const conferenceId = `emergency-${Date.now()}`;
  
  console.log('🎯 Creating 3-way emergency conference:', conferenceId);
  console.log('🎯 Connecting user:', userPhone, 'and dispatch:', dispatchNumber);
  
  try {
    // 1. Call the user and put them in conference
    const userTwiml = `<Response>
      <Say voice="alice">You are being connected to emergency dispatch. Please hold.</Say>
      <Dial>
        <Conference waitMusic="false" waitUrl="">${conferenceId}</Conference>
      </Dial>
    </Response>`;
    
    const userBody = new URLSearchParams({ 
      From: fromNumber, 
      To: userPhone, 
      Twiml: userTwiml 
    });
    
    const userCall = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: userBody
    });
    
    // 2. Call dispatch and put them in the same conference
    const dispatchTwiml = `<Response>
      <Say voice="alice" rate="slow">
        This is Stacy AI emergency dispatch system. 
        ${script}
        ${lat && lng ? `The caller's location is approximately latitude ${lat}, longitude ${lng}.` : 'Location data is not available.'}
        Connecting you to the emergency caller now.
      </Say>
      <Dial>
        <Conference waitMusic="false" waitUrl="">${conferenceId}</Conference>
      </Dial>
    </Response>`;
    
    const dispatchBody = new URLSearchParams({ 
      From: fromNumber, 
      To: dispatchNumber, 
      Twiml: dispatchTwiml 
    });
    
    const dispatchCall = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: dispatchBody
    });
    
    const userResult = await userCall.json();
    const dispatchResult = await dispatchCall.json();
    
    console.log('🎯 Conference calls initiated:', {
      user: userResult.sid,
      dispatch: dispatchResult.sid,
      conference: conferenceId
    });
    
    return { 
      success: true, 
      conferenceId,
      userCallSid: userResult.sid,
      dispatchCallSid: dispatchResult.sid,
      message: 'Emergency conference created - all parties will be connected'
    };
    
  } catch (error: any) {
    console.error('🚨 Conference creation failed:', error);
    return { success: false, error: error?.message || 'Conference creation failed' };
  }
}

// Basic in-memory de-dupe so we don't double-trigger actions per call
const triggeredByCallId = new Map<string, Set<string>>();

function wasTriggered(callId: string | undefined, action: string): boolean {
  if (!callId) return false;
  const set = triggeredByCallId.get(callId) || new Set<string>();
  const had = set.has(action);
  set.add(action);
  triggeredByCallId.set(callId, set);
  return had;
}

// 🧠 OpenAI BRAIN - Handles ALL thinking, responses, and tool calling
async function processWithOpenAIBrain(callId: string, conversation: any[], lat?: number, lng?: number) {
  try {
    console.log('🧠 OpenAI BRAIN processing conversation for call:', callId);
    
    // Rate limiting - don't process the same conversation multiple times
    const conversationHash = JSON.stringify(conversation);
    const lastProcessedKey = `${callId}:last_processed`;
    const lastProcessed = triggeredByCallId.get(lastProcessedKey);
    
    if (lastProcessed && lastProcessed.has(conversationHash)) {
      console.log('🧠 OpenAI BRAIN: Already processed this conversation, skipping');
      return { response: null };
    }
    
    // Mark this conversation as processed
    const processedSet = lastProcessed || new Set<string>();
    processedSet.add(conversationHash);
    triggeredByCallId.set(lastProcessedKey, processedSet);
    
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.warn('⚠️ OpenAI API key not configured');
      return { response: "I'm having trouble connecting to my brain. Please try again." };
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    
    // Get conversation history
    const messages = conversation.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content || msg.message || ''
    }));

    // Add Stacy's system prompt
    const systemPrompt = `You are Stacy, an AI safety companion and emergency dispatcher.

CONTEXT:
- This is a voice call via VAPI (you are the brain, VAPI is just voice I/O)
- Location: ${lat && lng ? `${lat}, ${lng}` : 'Unknown'}
- Call ID: ${callId}

TOOLS AVAILABLE:
- call_demo_police: Call demo dispatcher at +14383761217
- send_contact_sms: Send SMS to emergency contact +15146605707  
- transfer_call: Transfer user to emergency services
- get_safe_locations: Get nearby safe locations

INSTRUCTIONS:
- Be warm, professional, and supportive
- Ask assessment questions to understand the situation
- Use tools when appropriate (emergency dispatch, SMS alerts, etc.)
- Keep responses concise for voice calls
- Take immediate action for emergencies
- Remember: YOU control everything, VAPI just does voice I/O

Respond naturally as Stacy would, and use function calls when needed.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      functions: [
        {
          name: 'call_demo_police',
          description: 'Call emergency dispatch with briefing',
          parameters: {
            type: 'object',
            properties: {
              script: { type: 'string', description: 'Briefing for dispatch' },
              lat: { type: 'number', description: 'Latitude' },
              lng: { type: 'number', description: 'Longitude' }
            },
            required: ['script']
          }
        },
        {
          name: 'send_contact_sms',
          description: 'Send SMS to emergency contact',
          parameters: {
            type: 'object',
            properties: {
              phone: { type: 'string', description: 'Phone number' },
              message: { type: 'string', description: 'SMS message' },
              urgent: { type: 'boolean', description: 'Is urgent' }
            },
            required: ['message']
          }
        },
        {
          name: 'transfer_call',
          description: 'Transfer call to emergency services',
          parameters: {
            type: 'object',
            properties: {
              destination: { type: 'string', description: 'Phone number to transfer to' },
              message: { type: 'string', description: 'Transfer message' }
            },
            required: ['destination']
          }
        }
      ],
      function_call: 'auto',
      temperature: 0.7,
      max_tokens: 300
    });

    const response = completion.choices[0]?.message;
    console.log('🧠 OpenAI BRAIN response:', response);

    // Handle function calls
    if (response?.function_call) {
      const functionName = response.function_call.name;
      const functionArgs = JSON.parse(response.function_call.arguments || '{}');
      
      console.log('🧠 OpenAI BRAIN wants to call function:', functionName, functionArgs);
      
      let functionResult = null;
      
      // Prevent double calling - check if already triggered for this call
      if (functionName === 'call_demo_police' && wasTriggered(callId, 'emergency_conference')) {
        console.log('🚨 Emergency conference already created for this call, skipping');
        functionResult = { success: true, message: 'Emergency response already in progress' };
      } else {
        switch (functionName) {
          case 'call_demo_police':
            // Use the new 3-way conference system
            const userPhone = process.env.DEMO_USER_NUMBER || '+15146605707'; // Your phone number
            functionResult = await createEmergencyConference(
              functionArgs.script, 
              userPhone, 
              functionArgs.lat || lat, 
              functionArgs.lng || lng
            );
            // Mark as triggered to prevent duplicates
            const set = triggeredByCallId.get(callId) || new Set<string>();
            set.add('emergency_conference');
            triggeredByCallId.set(callId, set);
            break;
          case 'send_contact_sms':
            const phone = functionArgs.phone || process.env.DEMO_EMERGENCY_CONTACT || '+15146605707';
            functionResult = await sendSms(phone, functionArgs.message);
            break;
          case 'transfer_call':
            functionResult = {
              success: true,
              transfer: {
                destination: functionArgs.destination,
                message: functionArgs.message || 'Transferring your call now.'
              }
            };
            break;
        }
      }
      
      console.log('🧠 Function result:', functionResult);
      
      // Generate follow-up response after function call
      const followUpCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
          { role: 'assistant', content: response.content || '', function_call: response.function_call },
          { role: 'function', name: functionName, content: JSON.stringify(functionResult) }
        ],
        temperature: 0.7,
        max_tokens: 200
      });
      
      return {
        response: followUpCompletion.choices[0]?.message?.content || 'Action completed.',
        functionCall: { name: functionName, result: functionResult },
        transfer: functionResult?.transfer
      };
    }

    return {
      response: response?.content || "I'm here to help. How can I assist you with your safety today?"
    };

  } catch (error) {
    console.error('❌ OpenAI BRAIN error:', error);
    return {
      response: "I'm having trouble processing right now. If this is an emergency, please call 911 directly."
    };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { message } = req.body;
    
    console.log('🔄 VAPI Webhook received:', message?.type);
    
    // Handle different VAPI message types
    switch (message?.type) {
      case 'function-call':
        console.log('🛠️ Function call:', message.functionCall?.name);
        try {
          const { name, parameters } = message.functionCall || {};
          if (name === 'send_contact_sms') {
            const { phone, message: body, lat, lng, urgent } = parameters || {};
            const defaultContact = process.env.DEMO_EMERGENCY_CONTACT || '+15146605707';
            const toPhone = phone || defaultContact;
            const text = `${body}${lat && lng ? `\n\nLocation: https://maps.google.com/maps?q=${lat},${lng}` : ''}`;
            const result = await sendSms(toPhone, text);
            return res.json({ result });
          }
          if (name === 'call_demo_police') {
            const { script, lat, lng } = parameters || {};
            const full = `${script}${lat && lng ? ` Location coordinates ${lat}, ${lng}.` : ''}`;
            console.log('🚔 VAPI calling call_demo_police - creating 3-way conference');
            
            // Create 3-way conference call
            const userPhone = process.env.DEMO_USER_NUMBER || '+15146605707'; // Your phone
            const conferenceResult = await createEmergencyConference(full, userPhone, lat, lng);
            console.log('🎯 Conference creation result:', conferenceResult);
            
            const result = {
              success: conferenceResult.success,
              message: conferenceResult.message || "Emergency conference created",
              conferenceId: conferenceResult.conferenceId
            };
            
            return res.json({ result });
          }
          if (name === 'transfer_to_emergency_services') {
            const { destination, reason } = parameters || {};
            const script = `This is Stacy AI. Emergency transfer requested: ${reason}`;
            console.log('🚔 VAPI calling transfer_to_emergency_services - creating 3-way conference');
            
            // Create 3-way conference for emergency transfer
            const userPhone = process.env.DEMO_USER_NUMBER || '+15146605707';
            const conferenceResult = await createEmergencyConference(script, userPhone);
            console.log('🎯 Emergency transfer conference result:', conferenceResult);
            
            const result = {
              success: conferenceResult.success,
              message: conferenceResult.message || "Emergency transfer conference created",
              conferenceId: conferenceResult.conferenceId
            };
            
            return res.json({ result });
          }
          if (name === 'get_safe_locations') {
            const { lat = 43.4728, lng = -80.5419 } = parameters || {};
            return res.json({ result: {
              success: true,
              locations: [
                { name: 'Central Police Station', type: 'police_station', lat: lat + 0.004, lng: lng + 0.002, distance_m: 450 },
                { name: 'City Hospital Emergency', type: 'hospital', lat: lat - 0.003, lng: lng + 0.005, distance_m: 680 },
                { name: '24/7 Cafe Central', type: 'cafe', lat: lat + 0.002, lng: lng - 0.001, distance_m: 320 }
              ]
            }});
          }
          return res.json({ result: { success: false, error: 'Unknown function' } });
        } catch (err: any) {
          console.error('Function call error:', err);
          return res.json({ result: { success: false, error: err?.message || 'Function error' } });
        }
        
      case 'conversation-update':
        try {
          console.log('🔄 CONVERSATION UPDATE - OpenAI BRAIN taking over!');
          
          const callId = req.body?.message?.call?.id;
          const conversation = req.body?.message?.conversation || [];
          const metaLocation = req.body?.message?.call?.assistant?.metadata?.location;
          const lat = metaLocation?.lat;
          const lng = metaLocation?.lng;

          console.log('🔄 Sending to OpenAI BRAIN:', { callId, conversationLength: conversation.length });

          // 🧠 OpenAI BRAIN processes everything and decides what to do
          const brainResult = await processWithOpenAIBrain(callId, conversation, lat, lng);
          console.log('🧠 OpenAI BRAIN result:', brainResult);

          // If OpenAI wants to transfer the call, return transfer instruction
          if (brainResult.transfer) {
            console.log('🔄 OpenAI BRAIN requesting call transfer:', brainResult.transfer);
            return res.json({
              message: {
                type: 'transfer-call',
                destination: brainResult.transfer.destination,
                transferMessage: brainResult.transfer.message
              }
            });
          }

          // If OpenAI generated a response, we could send it back to VAPI
          // (In a full implementation, you'd send this back to VAPI to speak)
          if (brainResult.response) {
            console.log('🗣️ OpenAI BRAIN wants to say:', brainResult.response);
          }

          // OpenAI BRAIN handles everything now - no more heuristics needed!
          console.log('🧠 OpenAI BRAIN is in control - skipping old heuristic triggers');
        } catch (err) {
          console.warn('Conversation-update analysis failed:', err);
        }
        return res.json({ received: true });
        
      case 'hang':
        console.log('📞 Call ended');
        return res.json({ received: true });
        
      default:
        console.log('ℹ️ Other message type:', message?.type, '- OpenAI BRAIN handles all logic now');
        return res.json({ received: true });
    }

  } catch (error) {
    console.error('VAPI webhook error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
