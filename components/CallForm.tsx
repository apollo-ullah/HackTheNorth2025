import { useState } from 'react';
import axios from 'axios';

interface CallFormProps {
  onCallInitiated?: (callId: string) => void;
}

export default function CallForm({ onCallInitiated }: CallFormProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus({ type: 'warning', message: 'Initiating call...' });

    try {
      const response = await axios.post('/api/call', {
        phone_number: phoneNumber,
        message: customMessage,
        assistant_name: assistantName,
        system_prompt: systemPrompt,
      });

      setStatus({
        type: 'success',
        message: `Call initiated successfully! Call ID: ${response.data.id}`,
      });

      if (onCallInitiated) {
        onCallInitiated(response.data.id);
      }

      // Clear form
      setPhoneNumber('');
      setCustomMessage('');
      setAssistantName('');
      setSystemPrompt('');
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: `Error: ${error.response?.data?.detail || error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="section">
      <h2>📞 Make Outbound Call</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Phone number (e.g., +1234567890)"
          required
          disabled={isLoading}
        />
        <input
          type="text"
          value={assistantName}
          onChange={(e) => setAssistantName(e.target.value)}
          placeholder="Assistant name (optional, defaults to 'Voice Agent')"
          disabled={isLoading}
        />
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="System prompt (optional, e.g., 'You are a helpful customer service agent')"
          rows={3}
          disabled={isLoading}
        />
        <textarea
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="Custom message (optional)"
          rows={2}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Making Call...' : 'Make Call'}
        </button>
      </form>
      {status && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}
