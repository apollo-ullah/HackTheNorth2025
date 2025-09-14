import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ChatRequest {
  message: string;
  messages: Message[];
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  sessionId: string;
  riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL';
  mode: 'chat' | 'voice';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { message, messages, location, sessionId, riskLevel, mode }: ChatRequest = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    // Build conversation context
    const conversationHistory = messages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }));

    // Build system prompt with current context
    const systemPrompt = `You are Stacy, a professional AI safety companion and emergency dispatcher. Keep responses concise and helpful.

CURRENT CONTEXT:
- Session: ${sessionId}
- Risk Level: ${riskLevel}
- Location: ${location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Unknown'}
- Mode: ${mode}

GUIDELINES:
- For emergencies: Be direct, gather key details, prepare to escalate
- For general safety: Provide supportive guidance and check-ins  
- Always validate concerns and provide actionable advice
- Keep responses under 2 sentences for voice mode
- Ask ONE focused question at a time

Respond professionally and warmly. Help users feel safe and supported.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    // Analyze the response to determine risk level and actions
    const riskAnalysis = analyzeRiskLevel(message, aiResponse, riskLevel);
    const actions = determineActions(aiResponse, riskAnalysis.riskLevel, location);

    console.log(`🤖 Stacy AI Response for session ${sessionId} (${mode} mode):`);
    console.log(`📊 Risk: ${riskLevel} → ${riskAnalysis.riskLevel}`);
    console.log(`🎯 Actions: ${actions.join(', ') || 'None'}`);
    console.log(`💬 Response: ${aiResponse.substring(0, 100)}...`);

    // Never TTS here - client controls TTS based on mode
    return res.status(200).json({
      reply: aiResponse,
      mode: mode,
      riskLevel: riskAnalysis.riskLevel,
      riskChanged: riskAnalysis.riskLevel !== riskLevel,
      confidence: riskAnalysis.confidence,
      actions,
      reasoning: riskAnalysis.reasoning,
      timestamp: new Date().toISOString(),
      caseFile: riskAnalysis.riskLevel !== 'SAFE' ? {
        id: `case_${sessionId}_${Date.now()}`,
        sessionId,
        riskLevel: riskAnalysis.riskLevel,
        location,
        timeline: [{
          timestamp: new Date().toISOString(),
          event: `User reported: ${message}`,
          riskLevel: riskAnalysis.riskLevel,
          aiResponse: aiResponse
        }]
      } : null
    });

  } catch (error) {
    console.error('❌ Stacy AI error:', error);
    
    // Fallback response for critical situations
    const isCritical = req.body.message?.toLowerCase().match(/(help|emergency|danger|police|attacked|following)/);
    
    return res.status(500).json({
      error: 'AI processing error',
      fallback: true,
      reply: isCritical 
        ? "I'm having technical difficulties, but I understand this may be urgent. Please call 911 immediately if you're in immediate danger. I'm working to restore full service."
        : "I'm experiencing technical difficulties. Please try again, or use the emergency button if this is urgent.",
      riskLevel: isCritical ? 'CRITICAL' : 'ELEVATED',
      actions: isCritical ? ['emergency_handoff'] : []
    });
  }
}

function analyzeRiskLevel(
  userMessage: string, 
  aiResponse: string, 
  currentRisk: string
): { riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL', confidence: number, reasoning: string } {
  
  const message = userMessage.toLowerCase();
  const response = aiResponse.toLowerCase();
  
  // Critical indicators
  const criticalKeywords = [
    'help', 'emergency', 'danger', 'attacked', 'following me', 
    'scared', 'unsafe', 'call police', 'threat', 'weapon',
    'violence', 'hurt', 'stalking', 'chase', 'trapped'
  ];
  
  // Elevated indicators  
  const elevatedKeywords = [
    'suspicious', 'uncomfortable', 'worried', 'alone', 
    'dark', 'lost', 'nervous', 'strange', 'creepy',
    'uneasy', 'concerned', 'anxious'
  ];

  const criticalCount = criticalKeywords.filter(keyword => 
    message.includes(keyword) || response.includes(keyword)
  ).length;
  
  const elevatedCount = elevatedKeywords.filter(keyword => 
    message.includes(keyword) || response.includes(keyword)
  ).length;

  // AI response analysis - look for dispatcher language
  const dispatcherLanguage = [
    'emergency services', 'law enforcement', 'immediate', 'critical',
    'urgent', 'dispatch', 'officer', 'patrol', 'backup'
  ].some(term => response.includes(term));

  let riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL' = 'SAFE';
  let confidence = 0.5;
  let reasoning = 'Standard safety check';

  if (criticalCount >= 2 || dispatcherLanguage) {
    riskLevel = 'CRITICAL';
    confidence = 0.9;
    reasoning = `Critical keywords detected (${criticalCount}) or emergency response language identified`;
  } else if (criticalCount >= 1) {
    riskLevel = 'CRITICAL';
    confidence = 0.8;
    const detectedKeyword = criticalKeywords.find(k => message.includes(k) || response.includes(k));
    reasoning = `Critical safety keyword detected: ${detectedKeyword}`;
  } else if (elevatedCount >= 2) {
    riskLevel = 'ELEVATED';
    confidence = 0.7;
    reasoning = `Multiple concern indicators (${elevatedCount})`;
  } else if (elevatedCount >= 1) {
    riskLevel = 'ELEVATED';
    confidence = 0.6;
    const detectedKeyword = elevatedKeywords.find(k => message.includes(k) || response.includes(k));
    reasoning = `Safety concern detected: ${detectedKeyword}`;
  } else if (currentRisk === 'CRITICAL') {
    // Don't downgrade from CRITICAL without explicit safety confirmation
    riskLevel = 'CRITICAL';
    confidence = 0.7;
    reasoning = 'Maintaining CRITICAL status - no explicit safety confirmation';
  }

  return { riskLevel, confidence, reasoning };
}

function determineActions(
  aiResponse: string, 
  riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL',
  location?: { lat: number, lng: number, accuracy: number }
): string[] {
  
  const response = aiResponse.toLowerCase();
  const actions: string[] = [];

  // Look for tool calling language in AI response
  if (response.includes('emergency services') || response.includes('call police') || response.includes('dispatch')) {
    actions.push('emergency_handoff');
  }

  if (response.includes('alert') || response.includes('notify') || response.includes('contact')) {
    actions.push('send_sms');
  }

  if (response.includes('location') && !location) {
    actions.push('request_location');
  }

  // Risk-based automatic actions
  if (riskLevel === 'CRITICAL') {
    if (!actions.includes('emergency_handoff')) {
      actions.push('emergency_handoff');
    }
    if (location && !actions.includes('send_sms')) {
      actions.push('send_sms');
    }
  }

  if (riskLevel === 'ELEVATED' && location) {
    if (!actions.includes('send_sms')) {
      actions.push('send_sms');
    }
  }

  return actions;
}