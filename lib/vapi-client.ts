// VAPI Client for Next.js
export interface VAPICallRequest {
  phone_number: string;
  message?: string;
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

  constructor(apiKey: string) {
    this.apiKey = apiKey;
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
    assistantId: string,
    phoneNumberId: string
  ): Promise<VAPIResponse> {
    const response = await fetch(`${this.baseUrl}/call`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        assistant: {
          assistantId,
        },
        phoneNumberId,
        customer: {
          number: phoneNumber,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to make call: ${error}`);
    }

    return response.json();
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
