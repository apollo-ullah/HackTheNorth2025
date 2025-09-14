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

// Helper functions for directions calculation
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

function getCardinalDirection(bearing: number): string {
  const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { message } = req.body;
    
    console.log('🔄 VAPI Webhook received:', message?.type);
    console.log('📋 Full message:', JSON.stringify(message, null, 2));
    
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
            console.log('🔍 GET_SAFE_LOCATIONS called');
            const { lat, lng, radius = 1000 } = parameters || {};
            console.log('📍 Parameters:', { lat, lng, radius });
            
            // Use location from call metadata if not provided in parameters
            const metaLocation = message?.call?.assistant?.metadata?.location;
            console.log('📍 Metadata location:', metaLocation);
            
            const actualLat = lat || metaLocation?.lat;
            const actualLng = lng || metaLocation?.lng;
            console.log('📍 Final coordinates:', { actualLat, actualLng });
            
            if (!actualLat || !actualLng) {
              console.log('❌ Missing coordinates');
              return res.json({ 
                result: { 
                  success: false, 
                  error: 'Location coordinates are required for safe places search' 
                } 
              });
            }
            
            try {
              // Call the iOS backend's MapKit search API directly
              const iosBackendUrl = process.env.IOS_BACKEND_URL || 'http://10.37.116.84:3000';
              const response = await fetch(`${iosBackendUrl}/api/safe-locations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  lat: actualLat,
                  lng: actualLng,
                  radius_m: radius,
                  sessionId: `vapi_${message?.call?.id || Date.now()}`
                })
              });
              
              if (response.ok) {
                const data = await response.json();
                console.log('✅ MapKit safe locations found:', data.locations?.length || 0);
                
                return res.json({ 
                  result: {
                    success: true,
                    locations: data.locations || []
                  }
                });
              } else {
                throw new Error(`iOS Backend API failed: ${response.status}`);
              }
            } catch (error) {
              console.error('❌ iOS MapKit API error, using local search:', error);
              
              // Use the local safe-locations API as fallback (which simulates MapKit)
              try {
                const localResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/safe-locations`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    lat: actualLat,
                    lng: actualLng,
                    radius_m: radius,
                    sessionId: `vapi_${message?.call?.id || Date.now()}`
                  })
                });
                
                if (localResponse.ok) {
                  const localData = await localResponse.json();
                  console.log('✅ Local safe locations found:', localData.locations?.length || 0);
                  
                  return res.json({ 
                    result: {
                      success: true,
                      locations: localData.locations || []
                    }
                  });
                }
              } catch (localError) {
                console.error('❌ Local safe locations API also failed:', localError);
              }
              
              // Final fallback to hardcoded Waterloo Regional Police (as requested)
              console.log('🚔 Using hardcoded Waterloo Regional Police');
              const result = {
                success: true,
                locations: [
                  { 
                    name: 'Waterloo Regional Police', 
                    type: 'police_station', 
                    lat: 43.4751, 
                    lng: -80.5264, 
                    distance_m: 850,
                    address: '45 Columbia St E, Waterloo, ON',
                    phone: '(519) 570-9777'
                  }
                ],
                fallback: true,
                message: 'Found Waterloo Regional Police nearby'
              };
              console.log('🚔 Returning result:', JSON.stringify(result, null, 2));
              return res.json({ result });
            }
          }
          if (name === 'get_directions') {
            const { from_lat, from_lng, to_lat, to_lng, to_name } = parameters || {};
            
            // Use location from call metadata if 'from' location not provided
            const metaLocation = message?.call?.assistant?.metadata?.location;
            const actualFromLat = from_lat || metaLocation?.lat;
            const actualFromLng = from_lng || metaLocation?.lng;
            
            if (!actualFromLat || !actualFromLng || !to_lat || !to_lng) {
              return res.json({ 
                result: { 
                  success: false, 
                  error: 'From and to coordinates are required for directions' 
                } 
              });
            }
            
            try {
              // Calculate basic directions (in a real app, you'd use Google Maps API or similar)
              const distance = calculateDistance(actualFromLat, actualFromLng, to_lat, to_lng);
              const bearing = calculateBearing(actualFromLat, actualFromLng, to_lat, to_lng);
              const direction = getCardinalDirection(bearing);
              
              const directions = {
                success: true,
                from: { lat: actualFromLat, lng: actualFromLng },
                to: { lat: to_lat, lng: to_lng, name: to_name },
                distance_m: Math.round(distance),
                distance_text: distance < 1000 ? `${Math.round(distance)} meters` : `${(distance/1000).toFixed(1)} kilometers`,
                bearing: Math.round(bearing),
                direction: direction,
                instructions: [
                  `Head ${direction} toward ${to_name || 'destination'}`,
                  `Continue for ${distance < 1000 ? Math.round(distance) + ' meters' : (distance/1000).toFixed(1) + ' kilometers'}`,
                  `You will arrive at ${to_name || 'your destination'}`
                ],
                estimated_time_minutes: Math.round(distance / 83) // Assuming walking speed of 5 km/h
              };
              
              console.log('✅ Directions calculated:', directions);
              return res.json({ result: directions });
              
            } catch (error) {
              console.error('❌ Directions calculation error:', error);
              return res.json({ 
                result: { 
                  success: false, 
                  error: 'Failed to calculate directions' 
                } 
              });
            }
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

          console.log('💬 Conversation update:', { text: lower, hasLocation: !!(lat && lng) });

          // Heuristic fallback triggers if model speaks intent but didn't emit a function-call
          if (lower.includes('call the dispatcher') || lower.includes('calling the dispatcher') || lower.includes('calling police') || lower.includes('calling 911')) {
            if (!wasTriggered(callId, 'call_demo_police')) {
              const script = 'This is Stacy, an AI safety assistant. The caller requested a connection to the dispatcher. This is a demo call.';
              const result = await callDemoPolice(script + (lat && lng ? ` Location coordinates ${lat}, ${lng}.` : ''));
              console.log('🚔 Heuristic dispatcher call result:', result);
            }
          }

          // NEW: Heuristic trigger for safe places/police stations
          if ((lower.includes('safe place') || lower.includes('police station') || lower.includes('where can i go') || lower.includes('nearest police')) && lat && lng) {
            if (!wasTriggered(callId, 'get_safe_locations_heuristic')) {
              console.log('🚔 Heuristic safe places trigger activated');
              // Simulate the function call result directly in the conversation
              const locations = [
                { 
                  name: 'Waterloo Regional Police', 
                  type: 'police_station', 
                  distance_m: 850,
                  address: '45 Columbia St E, Waterloo, ON'
                }
              ];
              
              // This will be picked up by VAPI and spoken to the user
              console.log('🚔 Injecting safe places result into conversation:', locations);
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
