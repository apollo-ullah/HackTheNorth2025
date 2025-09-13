import { useState, useEffect } from 'react';
import axios from 'axios';

interface ConfigStatusData {
  vapi_backend_key_configured: boolean;
  vapi_frontend_key_configured: boolean;
  twilio_configured: boolean;
}

export default function ConfigStatus() {
  const [status, setStatus] = useState<ConfigStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await axios.get('/api/status');
        setStatus(response.data);
      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, []);

  if (isLoading) {
    return (
      <div className="section">
        <h2>📋 Configuration Status</h2>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="section">
      <h2>📋 Configuration Status</h2>
      <div>
        <p>
          <strong>VAPI Backend Key:</strong>{' '}
          <span>
            {status?.vapi_backend_key_configured ? 'Configured ✅' : 'Not configured ❌'}
          </span>
        </p>
        <p>
          <strong>VAPI Frontend Key:</strong>{' '}
          <span>
            {status?.vapi_frontend_key_configured ? 'Configured ✅' : 'Not configured ❌'}
          </span>
        </p>
        <p>
          <strong>Twilio Configuration:</strong>{' '}
          <span>
            {status?.twilio_configured ? 'Configured ✅' : 'Not configured ❌'}
          </span>
        </p>
      </div>
      {(!status?.vapi_backend_key_configured || !status?.vapi_frontend_key_configured || !status?.twilio_configured) && (
        <div className="status warning">
          <p>⚠️ Some configuration is missing. Please check your .env.local file.</p>
        </div>
      )}
    </div>
  );
}
