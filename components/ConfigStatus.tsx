import { useState, useEffect } from 'react';
import axios from 'axios';

interface ConfigStatusData {
  api_key_configured: boolean;
  assistant_id_configured: boolean;
  phone_number_id_configured: boolean;
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
          <strong>API Key:</strong>{' '}
          <span>
            {status?.api_key_configured ? 'Configured ✅' : 'Not configured ❌'}
          </span>
        </p>
        <p>
          <strong>Assistant ID:</strong>{' '}
          <span>
            {status?.assistant_id_configured ? 'Configured ✅' : 'Not configured ❌'}
          </span>
        </p>
        <p>
          <strong>Phone Number ID:</strong>{' '}
          <span>
            {status?.phone_number_id_configured ? 'Configured ✅' : 'Not configured ❌'}
          </span>
        </p>
      </div>
      {(!status?.api_key_configured || !status?.assistant_id_configured || !status?.phone_number_id_configured) && (
        <div className="status warning">
          <p>⚠️ Some configuration is missing. Please check your .env.local file.</p>
        </div>
      )}
    </div>
  );
}
