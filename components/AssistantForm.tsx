import { useState } from 'react';
import axios from 'axios';

interface AssistantFormProps {
  onAssistantCreated?: (assistantId: string) => void;
}

export default function AssistantForm({ onAssistantCreated }: AssistantFormProps) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus({ type: 'warning', message: 'Creating assistant...' });

    try {
      const response = await axios.post('/api/assistant', {
        name,
        system_prompt: systemPrompt,
      });

      setStatus({
        type: 'success',
        message: `Assistant created successfully! ID: ${response.data.id}`,
      });

      if (onAssistantCreated) {
        onAssistantCreated(response.data.id);
      }

      // Clear form
      setName('');
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
      <h2>🤖 Create Assistant</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Assistant name"
          required
          disabled={isLoading}
        />
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="System prompt (how should the assistant behave?)"
          rows={4}
          required
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Assistant'}
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
