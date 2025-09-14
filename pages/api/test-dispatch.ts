import { NextApiRequest, NextApiResponse } from 'next';

async function callDemoPolice(script: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_NUMBER;
  const toNumber = process.env.DEMO_EMERGENCY_NUMBER || '+14383761217';
  if (!accountSid || !authToken || !fromNumber) return { success: false, error: 'Twilio not configured' };
  
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  
  const twiml = `<Response>
    <Say voice="alice" rate="slow">
      This is Stacy AI emergency dispatch system. 
      ${script}
      Now completing handoff, hold on the line.
    </Say>
    <Pause length="1"/>
  </Response>`;
  
  const body = new URLSearchParams({ From: fromNumber, To: toNumber, Twiml: twiml });
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  
  const data = await resp.json();
  if (!resp.ok) return { success: false, error: data?.message || 'Dispatch call failed' };
  
  console.log('🚔 Test dispatch call successful:', data.sid);
  return { success: true, sid: data.sid, message: 'Test dispatch call made' };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🧪 TEST DISPATCH ENDPOINT CALLED');
  
  try {
    const result = await callDemoPolice('This is a test emergency call from Stacy AI system.');
    console.log('🧪 Test result:', result);
    
    return res.json({
      success: true,
      message: 'Test dispatch call completed',
      result
    });
  } catch (error) {
    console.error('🧪 Test dispatch error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Test failed'
    });
  }
}
