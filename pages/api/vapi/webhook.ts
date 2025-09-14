import { NextApiRequest, NextApiResponse } from 'next';

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

async function callDemoPolice(script: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_NUMBER;
  const toNumber = process.env.DEMO_EMERGENCY_NUMBER || process.env.DEMO_POLICE_NUMBER || '+14383761217';
  if (!accountSid || !authToken || !fromNumber) return { success: false, error: 'Twilio not configured' };
  const twiml = `<Response><Say voice="alice" rate="slow">${script}</Say></Response>`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = new URLSearchParams({ From: fromNumber, To: toNumber, Twiml: twiml });
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await resp.json();
  if (!resp.ok) return { success: false, error: data?.message || 'Twilio call failed' };
  return { success: true, sid: data.sid };
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
            const result = await callDemoPolice(full);
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
          const callId = req.body?.message?.call?.id;
          const messages = req.body?.message?.conversation?.messages || [];
          const last = messages[messages.length - 1];
          const text: string = last?.content || '';
          const lower = (text || '').toLowerCase();
          const metaLocation = req.body?.message?.call?.assistant?.metadata?.location;
          const lat = metaLocation?.lat;
          const lng = metaLocation?.lng;

          // Heuristic fallback triggers if model speaks intent but didn't emit a function-call
          if (lower.includes('call the dispatcher') || lower.includes('calling the dispatcher') || lower.includes('calling police') || lower.includes('calling 911')) {
            if (!wasTriggered(callId, 'call_demo_police')) {
              const script = 'This is Stacy, an AI safety assistant. The caller requested a connection to the dispatcher. This is a demo call.';
              const result = await callDemoPolice(script + (lat && lng ? ` Location coordinates ${lat}, ${lng}.` : ''));
              console.log('🚔 Heuristic dispatcher call result:', result);
            }
          }

          if (lower.includes('text') && (lower.includes('contact') || lower.includes('emergency contact') || lower.includes('notify'))) {
            if (!wasTriggered(callId, 'send_contact_sms')) {
              const toPhone = process.env.DEMO_EMERGENCY_CONTACT || '+15146605707';
              const msg = 'Automated safety alert from Stacy AI. The user requested assistance.' + (lat && lng ? `\n\nLocation: https://maps.google.com/maps?q=${lat},${lng}` : '');
              const result = await sendSms(toPhone, msg);
              console.log('📱 Heuristic SMS result:', result);
            }
          }
        } catch (err) {
          console.warn('Conversation-update heuristic failed:', err);
        }
        return res.json({ received: true });
        
      case 'hang':
        console.log('📞 Call ended');
        return res.json({ received: true });
        
      default:
        console.log('ℹ️ Other message type:', message?.type);
        return res.json({ received: true });
    }

  } catch (error) {
    console.error('VAPI webhook error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
