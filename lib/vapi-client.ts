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
          provider: '11labs',
          voiceId: '21m00Tcm4TlvDq8ikWAM', // Default voice
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
                    updates: {
                      type: 'object',
                      properties: {
                        riskLevel: { type: 'string', enum: ['SAFE', 'ELEVATED', 'CRITICAL'] },
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
                        }
                      }
                    }
                  },
                  required: ['caseId', 'updates']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'notify_emergency_contact',
                description: 'Send comprehensive emergency report to emergency contact',
                parameters: {
                  type: 'object',
                  properties: {
                    contact: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        phone: { type: 'string' },
                        relationship: { type: 'string' }
                      },
                      required: ['name', 'phone', 'relationship']
                    },
                    urgentMessage: { type: 'string', description: 'Urgent message to include in the report' }
                  },
                  required: ['contact', 'urgentMessage']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'call_demo_emergency',
                description: 'Place emergency briefing call to demonstrate emergency services communication',
                parameters: {
                  type: 'object',
                  properties: {
                    briefingScript: { type: 'string', description: 'Professional briefing script for emergency services' }
                  },
                  required: ['briefingScript']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'send_contact_sms',
                description: 'Send direct SMS to any phone number with optional location',
                parameters: {
                  type: 'object',
                  properties: {
                    phoneNumber: { type: 'string', description: 'Phone number in E.164 format' },
                    message: { type: 'string', description: 'SMS message content' },
                    includeLocation: { type: 'boolean', description: 'Whether to include current location' }
                  },
                  required: ['phoneNumber', 'message']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'get_safe_locations',
                description: 'Find nearby safe locations like police stations, hospitals',
                parameters: {
                  type: 'object',
                  properties: {
                    radius: { type: 'number', description: 'Search radius in meters', default: 5000 }
                  }
                }
              }
            }
          ]
        },
        voice: {
          provider: '11labs',
          voiceId: 'pNInz6obpgDQGcFmaJgB', // Professional female voice for safety contexts
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
          provider: '11labs',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
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
