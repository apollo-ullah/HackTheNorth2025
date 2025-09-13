import { useState, useEffect } from 'react';
import axios from 'axios';

interface Location {
  lat: number;
  lng: number;
  accuracy: number;
}

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export default function StacyInterface() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState<Location | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([
    { name: 'Emergency Contact', phone: '+15146605707', relationship: 'Primary' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          console.error('Location error:', error);
          setStatus({ type: 'warning', message: 'Location access denied. Some features may be limited.' });
        }
      );
    }
  }, []);

  const initiateStacyCall = async () => {
    if (!phoneNumber) {
      setStatus({ type: 'error', message: 'Phone number is required' });
      return;
    }

    setIsLoading(true);
    setStatus({ type: 'info', message: 'Initiating Stacy safety call...' });

    try {
      const response = await axios.post('/api/stacy/voice-call', {
        phone_number: phoneNumber,
        user_location: location,
        emergency_contacts: emergencyContacts,
      });

      setStatus({
        type: 'success',
        message: `Stacy call initiated! Call ID: ${response.data.callId}. You should receive a call from ${response.data.stacyNumber} shortly.`,
      });
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: `Error: ${error.response?.data?.error || error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendQuickAlert = async () => {
    if (!location) {
      setStatus({ type: 'error', message: 'Location required for quick alert' });
      return;
    }

    setIsLoading(true);
    setStatus({ type: 'info', message: 'Sending quick alert...' });

    try {
      const response = await axios.post('/api/stacy/mobile', {
        action: 'quick_alert',
        location: location,
        message: 'EMERGENCY: Quick alert activated from Stacy web interface',
        emergency_contact: emergencyContacts[0],
      });

      if (response.data.success) {
        setStatus({
          type: 'success',
          message: `Emergency alert sent to ${emergencyContacts[0].name}! Message ID: ${response.data.messageId}`,
        });
      } else {
        setStatus({
          type: 'error',
          message: `Failed to send alert: ${response.data.error}`,
        });
      }
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: `Error: ${error.response?.data?.error || error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const findSafeLocations = async () => {
    if (!location) {
      setStatus({ type: 'error', message: 'Location required to find safe places' });
      return;
    }

    setIsLoading(true);
    setStatus({ type: 'info', message: 'Finding nearby safe locations...' });

    try {
      const response = await axios.post('/api/stacy/mobile', {
        action: 'find_help',
        location: location,
      });

      if (response.data.success) {
        const locations = response.data.locations;
        const locationList = locations.map((loc: any) => 
          `${loc.name} (${loc.type}) - ${loc.distance}km away`
        ).join('\n');
        
        setStatus({
          type: 'success',
          message: `Found ${locations.length} safe locations:\n${locationList}`,
        });
      }
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: `Error: ${error.response?.data?.error || error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testEmergencyTools = async () => {
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Testing emergency tools...' });

    try {
      const response = await axios.post('/api/stacy/emergency', {
        action: 'assess_risk',
        data: { message: 'Someone is following me and I feel unsafe' },
      });

      setStatus({
        type: 'success',
        message: `Risk assessment: ${response.data.riskLevel} - Emergency protocols would be activated.`,
      });
    } catch (error: any) {
      setStatus({
        type: 'error',
        message: `Error: ${error.response?.data?.error || error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="section">
      <h2>🚨 Stacy AI Safety Companion</h2>
      
      <div className="stacy-controls">
        <div className="input-group">
          <label>Your Phone Number (to receive Stacy's call):</label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+15146605707"
            disabled={isLoading}
          />
        </div>

        <div className="input-group">
          <label>Emergency Contact:</label>
          <input
            type="text"
            value={`${emergencyContacts[0]?.name} (${emergencyContacts[0]?.phone})`}
            readOnly
            style={{ backgroundColor: '#f5f5f5' }}
          />
        </div>

        <div className="input-group">
          <label>Location Status:</label>
          <input
            type="text"
            value={location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)}m)` : 'Location not available'}
            readOnly
            style={{ backgroundColor: '#f5f5f5' }}
          />
        </div>

        <div className="button-grid">
          <button 
            onClick={initiateStacyCall} 
            disabled={isLoading}
            className="primary-button"
          >
            {isLoading ? 'Calling...' : '📞 Call Stacy (Voice Mode)'}
          </button>

          <button 
            onClick={sendQuickAlert} 
            disabled={isLoading}
            className="emergency-button"
          >
            {isLoading ? 'Sending...' : '🚨 Quick Emergency Alert'}
          </button>

          <button 
            onClick={findSafeLocations} 
            disabled={isLoading}
            className="secondary-button"
          >
            {isLoading ? 'Searching...' : '🏥 Find Safe Locations'}
          </button>

          <button 
            onClick={testEmergencyTools} 
            disabled={isLoading}
            className="secondary-button"
          >
            {isLoading ? 'Testing...' : '🧪 Test Risk Assessment'}
          </button>
        </div>
      </div>

      {status && (
        <div className={`status ${status.type}`}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {status.message}
          </pre>
        </div>
      )}

      <div className="stacy-info">
        <h3>🛡️ Stacy Features:</h3>
        <ul>
          <li><strong>Professional Dispatcher AI:</strong> Trained like a 911 operator with strict protocols</li>
          <li><strong>Real Emergency Actions:</strong> Sends actual SMS, makes calls, builds case files</li>
          <li><strong>Voice Safety Calls:</strong> AI companion calls you for immediate support</li>
          <li><strong>Risk Assessment:</strong> Analyzes distress levels (SAFE/ELEVATED/CRITICAL)</li>
          <li><strong>Emergency Communication:</strong> Comprehensive reports to emergency contacts</li>
          <li><strong>Safe Location Finding:</strong> Locates nearby police, hospitals, safe places</li>
        </ul>
      </div>

      <style jsx>{`
        .stacy-controls {
          margin-bottom: 20px;
        }

        .input-group {
          margin-bottom: 15px;
        }

        .input-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
          color: #333;
        }

        .button-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 20px;
        }

        .primary-button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
        }

        .primary-button:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .emergency-button {
          background-color: #dc3545;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
        }

        .emergency-button:hover:not(:disabled) {
          background-color: #c82333;
        }

        .secondary-button {
          background-color: #6c757d;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
        }

        .secondary-button:hover:not(:disabled) {
          background-color: #545b62;
        }

        .stacy-info {
          margin-top: 20px;
          padding: 15px;
          background-color: #e3f2fd;
          border-radius: 4px;
          border-left: 4px solid #2196f3;
        }

        .stacy-info h3 {
          margin-top: 0;
          color: #1976d2;
        }

        .stacy-info ul {
          margin: 10px 0;
          padding-left: 20px;
        }

        .stacy-info li {
          margin-bottom: 8px;
          line-height: 1.4;
        }

        @media (max-width: 768px) {
          .button-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
