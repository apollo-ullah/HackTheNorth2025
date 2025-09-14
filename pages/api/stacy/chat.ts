import { STACY_INSTRUCTIONS } from '../../../lib/stacy-brain';
import { NextApiRequest, NextApiResponse } from 'next';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

    // Use fetch instead of OpenAI SDK to avoid dependency issues
    const conversationHistory = messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }));

    const systemPrompt = `${STACY_INSTRUCTIONS}

CURRENT CONTEXT:
- Session: ${sessionId}
- Risk Level: ${riskLevel}
- Location: ${location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Unknown'}
- Mode: ${mode}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API failed: ${error}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    // Simple risk analysis
    const riskAnalysis = analyzeRisk(message, aiResponse, riskLevel);

    console.log(`🤖 Stacy AI Response for session ${sessionId}:`);
    console.log(`📊 Risk: ${riskLevel} → ${riskAnalysis.riskLevel}`);
    console.log(`💬 Response: ${aiResponse.substring(0, 100)}...`);

    return res.status(200).json({
      reply: aiResponse,
      mode: mode,
      riskLevel: riskAnalysis.riskLevel,
      riskChanged: riskAnalysis.riskLevel !== riskLevel,
      confidence: riskAnalysis.confidence,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Stacy AI error:', error);
    
    return res.status(500).json({
      error: 'AI processing error',
      reply: "I'm experiencing technical difficulties. Please try again, or use the emergency call if this is urgent.",
      riskLevel: 'SAFE'
    });
  }
}

function analyzeRisk(
  userMessage: string, 
  aiResponse: string, 
  currentRisk: string
): { riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL', confidence: number } {
  
  const message = userMessage.toLowerCase();
  
  // Critical keywords
  const criticalKeywords = [
    'help', 'emergency', 'danger', 'attacked', 'following me', 
    'scared', 'unsafe', 'threat', 'weapon', 'hurt', 'trapped'
  ];
  
  // Elevated keywords  
  const elevatedKeywords = [
    'suspicious', 'uncomfortable', 'worried', 'alone', 
    'dark', 'lost', 'nervous', 'strange', 'uneasy'
  ];

  const criticalCount = criticalKeywords.filter(keyword => message.includes(keyword)).length;
  const elevatedCount = elevatedKeywords.filter(keyword => message.includes(keyword)).length;

  if (criticalCount >= 1) {
    return { riskLevel: 'CRITICAL', confidence: 0.9 };
  } else if (elevatedCount >= 1) {
    return { riskLevel: 'ELEVATED', confidence: 0.7 };
  } else if (currentRisk === 'CRITICAL') {
    // Don't downgrade from CRITICAL without explicit safety confirmation
    return { riskLevel: 'CRITICAL', confidence: 0.6 };
  }

  return { riskLevel: 'SAFE', confidence: 0.5 };
}
