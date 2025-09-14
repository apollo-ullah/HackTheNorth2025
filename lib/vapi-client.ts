// VAPI Client for Next.js - Replaces WebRTC
export interface VAPICallRequest {
  phone_number: string;
  message?: string;
  assistant_config?: {
    name?: string;
    system_prompt?: string;
    first_message?: string;
  };
}

export interface VAPIResponse {
  id: string;
  status?: string;
  [key: string]: any;
}

export class VAPIClient {
  private apiKey: string;
  private baseUrl = 'https://api.vapi.ai';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async makeOutboundCall(
    phoneNumber: string,
    assistantConfig?: { name?: string; system_prompt?: string; first_message?: string },
    phoneNumberId?: string
  ): Promise<VAPIResponse> {
    const callPayload: any = {
      customer: {
        number: phoneNumber,
      },
    };

    // Use phoneNumberId if provided
    if (phoneNumberId) {
      callPayload.phoneNumberId = phoneNumberId;
    }

    // Create assistant configuration
    if (assistantConfig && assistantConfig.system_prompt) {
      callPayload.assistant = {
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: assistantConfig.system_prompt,
            },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'update_casefile',
                description: 'Update the emergency case file with new information',
                parameters: {
                  type: 'object',
                  properties: {
                    caseId: { type: 'string', description: 'Unique case identifier' },
                    riskLevel: { type: 'string', enum: ['SAFE', 'ELEVATED', 'CRITICAL'], description: 'Current risk assessment level' },
                    threat: {
                      type: 'object',
                      properties: {
                        description: { type: 'string' },
                        type: { type: 'string' },
                        immediacy: { type: 'string', enum: ['immediate', 'developing', 'potential'] }
                      }
                    },
                    userStatus: {
                      type: 'object',
                      properties: {
                        canSpeak: { type: 'boolean' },
                        canText: { type: 'boolean' },
                        isHidden: { type: 'boolean' }
                      }
                    },
                    location: {
                      type: 'object',
                      properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' },
                        accuracy: { type: 'number' }
                      }
                    }
                  },
                  required: ['caseId']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'send_location_sms',
                description: 'Send SMS with current location to any phone number',
                parameters: {
                  type: 'object',
                  properties: {
                    phoneNumber: { type: 'string' },
                    message: { type: 'string' },
                    urgent: { type: 'boolean', default: false }
                  },
                  required: ['phoneNumber', 'message']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'transfer_to_emergency_services',
                description: 'Transfer the call to emergency services when the situation is CRITICAL',
                parameters: {
                  type: 'object',
                  properties: {
                    destination: {
                      type: 'string',
                      enum: ['+15146605707'],
                      description: 'Emergency services number to transfer to'
                    },
                    reason: {
                      type: 'string',
                      description: 'Brief reason for the emergency transfer'
                    }
                  },
                  required: ['destination', 'reason']
                }
              }
            }
          ]
        },
        voice: {
          provider: 'openai',
          voiceId: 'nova'
        },
        firstMessage: assistantConfig.first_message || 'Hi, this is Stacy, your AI safety companion. I understand you may need help. Tell me what\'s happening right now.'
      };

      if (assistantConfig.name) {
        callPayload.name = assistantConfig.name;
      }
    } else {
      // Default Stacy assistant
      callPayload.assistant = {
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are Stacy, a professional AI safety companion. Be supportive and help assess emergency situations.',
            },
          ],
        },
        voice: {
          provider: 'openai',
          voiceId: 'nova'
        },
        firstMessage: 'Hi, this is Stacy. How can I help you stay safe?',
      };
    }

    console.log('Making VAPI call with payload:', JSON.stringify(callPayload, null, 2));

    const response = await fetch(`${this.baseUrl}/call`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(callPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('VAPI call failed:', response.status, error);
      throw new Error(`Failed to make call: ${error}`);
    }

    const result = await response.json();
    console.log('VAPI call success:', result);
    return result;
  }

  async getCallStatus(callId: string): Promise<VAPIResponse> {
    const response = await fetch(`${this.baseUrl}/call/${callId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get call status: ${error}`);
    }

    return response.json();
  }
}
