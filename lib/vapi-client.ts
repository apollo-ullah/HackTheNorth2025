// VAPI Client for Next.js
export interface VAPICallRequest {
  phone_number: string;
  message?: string;
  assistant_config?: {
    name?: string;
    system_prompt?: string;
  };
}

export interface VAPIAssistantRequest {
  name: string;
  system_prompt: string;
}

export interface VAPIResponse {
  id: string;
  status?: string;
  [key: string]: any;
}

export class VAPIClient {
  private apiKey: string;
  private baseUrl = 'https://api.vapi.ai';
  private twilioConfig?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };

  constructor(apiKey: string, twilioConfig?: { accountSid: string; authToken: string; phoneNumber: string }) {
    this.apiKey = apiKey;
    this.twilioConfig = twilioConfig;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createAssistant(name: string, systemPrompt: string): Promise<VAPIResponse> {
    const response = await fetch(`${this.baseUrl}/assistant`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        name,
        model: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
          ],
        },
        voice: {
          provider: 'openai',
          model: 'tts-1-hd',
          voice: 'nova'
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create assistant: ${error}`);
    }

    return response.json();
  }

  async makeOutboundCall(
    phoneNumber: string,
    assistantConfig?: { name?: string; system_prompt?: string; first_message?: string },
    phoneNumberId?: string
  ): Promise<VAPIResponse> {
    // Based on official VAPI documentation: https://docs.vapi.ai/api-reference/calls/create
    const callPayload: any = {
      customer: {
        number: phoneNumber,
      },
    };

    // Use phoneNumberId if provided, otherwise use Twilio config
    if (phoneNumberId) {
      callPayload.phoneNumberId = phoneNumberId;
    } else if (this.twilioConfig) {
      callPayload.phoneNumber = {
        twilioPhoneNumber: this.twilioConfig.phoneNumber,
        twilioAccountSid: this.twilioConfig.accountSid,
        twilioAuthToken: this.twilioConfig.authToken,
      };
    }

    // Create inline assistant if config provided
    if (assistantConfig && assistantConfig.system_prompt) {
      callPayload.assistant = {
        model: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
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
              type: 'transferCall',
              destinations: [
                {
                  type: 'number',
                  number: '+15146605707',
                  description: 'Emergency services - police dispatcher',
                  transferPlan: {
                    mode: 'warm-transfer-with-summary',
                    summaryPlan: {
                      enabled: true,
                      messages: [
                        {
                          role: 'system',
                          content: 'You are Stacy AI Emergency Dispatcher providing a professional emergency briefing to police. Provide a concise summary including: risk level, location, threat description, and user status.'
                        },
                        {
                          role: 'user',
                          content: 'Emergency briefing:\n\nCall Transcript:\n{{transcript}}\n\nProvide a professional emergency dispatch summary.'
                        }
                      ]
                    }
                  }
                }
              ],
              messages: [
                {
                  type: 'request-start',
                  content: 'I\'m connecting you with emergency services now. I\'ll brief them about your situation first, then you can speak directly with them. Stay on the line.'
                }
              ],
              function: {
                name: 'transfer_to_emergency_services',
                description: 'Transfer the call to emergency services when the situation is CRITICAL. Use this when immediate police response is needed.',
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
            }
          ]
        },
        voice: {
          provider: 'openai',
          model: 'tts-1-hd',
          voice: 'nova'
        },
        firstMessage: assistantConfig.first_message || 'This is Stacy, your AI safety companion. I\'m here to help you stay safe. What\'s your situation?',
      };

      // Add assistant name if provided
      if (assistantConfig.name) {
        callPayload.name = assistantConfig.name;
      }
    } else {
      // Create a simple default assistant
      callPayload.assistant = {
        model: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful voice assistant. Be friendly and concise.',
            },
          ],
        },
        voice: {
          provider: 'openai',
          model: 'tts-1-hd',
          voice: 'nova'
        },
        firstMessage: 'Hello! How can I help you today?',
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
