import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface Location {
  lat: number;
  lng: number;
  accuracy: number;
}

interface Message {
  id: string;
  sender: 'user' | 'stacy' | 'system';
  content: string;
  timestamp: Date;
  type?: 'text' | 'voice' | 'action' | 'location';
}

interface CaseFile {
  id: string;
  riskLevel: 'SAFE' | 'ELEVATED' | 'CRITICAL';
  timeline: Array<{ timestamp: string; event: string; source: string }>;
  location?: Location;
  threat?: {
    description: string;
    type: string;
    immediacy: string;
  };
  userStatus: {
    canSpeak: boolean;
    canText: boolean;
    isHidden: boolean;
  };
}

export default function StacyMainInterface() {
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  const [location, setLocation] = useState<Location | null>(null);
  const [caseFile, setCaseFile] = useState<CaseFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [riskLevel, setRiskLevel] = useState<'SAFE' | 'ELEVATED' | 'CRITICAL'>('SAFE');
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Initialize location tracking
    requestLocationPermission();
    
    // Add welcome message
    addMessage('stacy', "Hi, I'm Stacy, your AI safety companion. I'm here to help keep you safe. How are you feeling right now?", 'text');
    
    // Initialize case file
    initializeCaseFile();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeCaseFile = async () => {
    const newCaseFile: CaseFile = {
      id: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      riskLevel: 'SAFE',
      timeline: [{
        timestamp: new Date().toISOString(),
        event: 'Session started',
        source: 'system'
      }],
      userStatus: {
        canSpeak: true,
        canText: true,
        isHidden: false,
      },
    };
    setCaseFile(newCaseFile);
  };

  const requestLocationPermission = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setLocation(newLocation);
          addMessage('system', `📍 Location tracking enabled (±${Math.round(position.coords.accuracy)}m)`, 'location');
          
          // Watch position for continuous updates
          navigator.geolocation.watchPosition(
            (pos) => {
              setLocation({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            },
            (error) => console.error('Location error:', error),
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 5000 }
          );
        },
        (error) => {
          console.error('Location permission denied:', error);
          addMessage('system', '⚠️ Location access denied. Some safety features may be limited.', 'text');
        }
      );
    }
  };

  const addMessage = (sender: 'user' | 'stacy' | 'system', content: string, type: 'text' | 'voice' | 'action' | 'location' = 'text') => {
    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender,
      content,
      timestamp: new Date(),
      type,
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const sendTextMessage = async (message: string = textInput.trim()) => {
    if (!message) return;

    addMessage('user', message, 'text');
    setTextInput('');
    setIsLoading(true);

    try {
      // Send to Stacy AI for processing
      const response = await axios.post('/api/stacy/chat', {
        message,
        caseFile,
        location,
        mode: 'text'
      });

      const { reply, newCaseFile, actions, quickReplies: newQuickReplies } = response.data;

      // Update case file
      if (newCaseFile) {
        setCaseFile(newCaseFile);
        setRiskLevel(newCaseFile.riskLevel);
      }

      // Add Stacy's response
      addMessage('stacy', reply, 'text');

      // Show quick replies if provided
      if (newQuickReplies && newQuickReplies.length > 0) {
        setQuickReplies(newQuickReplies);
      }

      // Execute any actions
      if (actions && actions.length > 0) {
        for (const action of actions) {
          await executeAction(action);
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      addMessage('system', 'Sorry, I had trouble processing that. Please try again.', 'text');
    } finally {
      setIsLoading(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        await sendVoiceMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      addMessage('system', '🎤 Recording... Release to send', 'voice');

    } catch (error) {
      console.error('Error starting recording:', error);
      addMessage('system', 'Unable to access microphone. Please check permissions.', 'text');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob) => {
    setIsLoading(true);
    addMessage('user', '🎤 Voice message sent', 'voice');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('caseFile', JSON.stringify(caseFile));
      formData.append('location', JSON.stringify(location));

      const response = await axios.post('/api/stacy/voice', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { transcript, reply, newCaseFile, actions, quickReplies: newQuickReplies } = response.data;

      // Show transcript
      if (transcript) {
        addMessage('user', `"${transcript}"`, 'voice');
      }

      // Update case file
      if (newCaseFile) {
        setCaseFile(newCaseFile);
        setRiskLevel(newCaseFile.riskLevel);
      }

      // Add Stacy's response
      addMessage('stacy', reply, 'text');

      // Show quick replies
      if (newQuickReplies && newQuickReplies.length > 0) {
        setQuickReplies(newQuickReplies);
      }

      // Execute actions
      if (actions && actions.length > 0) {
        for (const action of actions) {
          await executeAction(action);
        }
      }

    } catch (error) {
      console.error('Error processing voice message:', error);
      addMessage('system', 'Sorry, I had trouble processing your voice message.', 'text');
    } finally {
      setIsLoading(false);
    }
  };

  const executeAction = async (action: any) => {
    switch (action.type) {
      case 'send_emergency_sms':
        addMessage('stacy', `📱 Sending emergency alert to ${action.contact.name}...`, 'action');
        try {
          const response = await axios.post('/api/stacy/emergency', {
            action: 'notify_emergency_contact',
            data: {
              contact: action.contact,
              caseFile,
              message: action.message,
            },
          });
          
          if (response.data.success) {
            addMessage('stacy', `✅ Emergency alert sent to ${action.contact.name}. Message ID: ${response.data.messageId}`, 'action');
          }
        } catch (error) {
          addMessage('system', `❌ Failed to send emergency alert: ${error}`, 'action');
        }
        break;

      case 'navigate_to_safety':
        addMessage('stacy', '🧭 Finding the safest route to help...', 'action');
        try {
          const response = await axios.post('/api/stacy/emergency', {
            action: 'get_safe_locations',
            data: { location, radius: 1000 },
          });
          
          if (response.data.success && response.data.safeLocations.length > 0) {
            const nearest = response.data.safeLocations[0];
            addMessage('stacy', `🏥 Nearest safe location: ${nearest.name} at ${nearest.address}. It's ${nearest.distance}km away. I'm opening navigation now.`, 'action');
            
            // Open navigation
            const navUrl = `https://www.google.com/maps/dir/${location?.lat},${location?.lng}/${nearest.address.replace(/ /g, '+')}`;
            window.open(navUrl, '_blank');
          }
        } catch (error) {
          addMessage('system', 'Unable to find safe locations right now.', 'action');
        }
        break;

      case 'call_police':
        addMessage('stacy', '🚨 Contacting emergency services with your case information...', 'action');
        try {
          const briefingScript = `Emergency situation reported via Stacy AI. Case ID ${caseFile?.id}. User reports being followed and feels unsafe. Location: ${location?.lat}, ${location?.lng}. User can speak and is requesting immediate assistance.`;
          
          const response = await axios.post('/api/stacy/emergency', {
            action: 'call_demo_emergency',
            data: {
              caseFile,
              briefingScript,
            },
          });
          
          if (response.data.success) {
            addMessage('stacy', `📞 Emergency services briefed. Call ID: ${response.data.callId}. They have your complete case file and location. I'm now connecting you directly to speak with them.`, 'action');
            addMessage('system', '🔄 Warm handoff in progress... You will be connected to emergency services momentarily.', 'action');
          }
        } catch (error) {
          addMessage('system', 'Emergency call system unavailable. Please call 911 directly.', 'action');
        }
        break;

      case 'update_case_file':
        // Silent case file update
        if (action.updates) {
          setCaseFile(prev => ({ ...prev, ...action.updates }));
        }
        break;
    }
  };

  const handleQuickReply = (reply: string) => {
    sendTextMessage(reply);
    setQuickReplies([]);
  };

  const triggerPanicButton = async () => {
    addMessage('user', '🚨 PANIC BUTTON ACTIVATED', 'action');
    setRiskLevel('CRITICAL');
    
    try {
      const response = await axios.post('/api/swift/stacy-mobile', {
        action: 'panic_alert',
        data: {
          location,
          emergencyContact: {
            name: 'Emergency Contact',
            phone: '+15146605707'
          },
          context: 'PANIC BUTTON - Immediate assistance needed'
        }
      });

      if (response.data.success) {
        addMessage('stacy', '🚨 PANIC ALERT SENT. Emergency contact has been notified with your location. I\'m here to help you through this. Are you in immediate physical danger right now?', 'action');
        setQuickReplies(['Yes, immediate danger', 'No, but scared', 'Cannot speak safely']);
      }
    } catch (error) {
      addMessage('system', 'Panic alert failed. Please try calling 911 directly.', 'action');
    }
  };

  const getRiskLevelColor = () => {
    switch (riskLevel) {
      case 'SAFE': return '#10b981';
      case 'ELEVATED': return '#f59e0b';
      case 'CRITICAL': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getRiskLevelText = () => {
    switch (riskLevel) {
      case 'SAFE': return 'Safe - General monitoring';
      case 'ELEVATED': return 'Elevated - Active assessment';
      case 'CRITICAL': return 'Critical - Emergency protocols active';
      default: return 'Unknown';
    }
  };

  return (
    <div className="stacy-interface">
      {/* Header with Status */}
      <div className="stacy-header">
        <div className="logo-section">
          <div className="logo-icon">🛡️</div>
          <h1>Stacy</h1>
          <div className="tagline">AI Safety Companion</div>
        </div>
        
        <div className="status-section">
          <div className="connection-status">
            <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
            <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
          
          <div className="location-status">
            <div className={`location-dot ${location ? 'active' : 'inactive'}`}></div>
            <span>{location ? `±${Math.round(location.accuracy)}m` : 'No location'}</span>
          </div>
        </div>
      </div>

      {/* Risk Level Banner */}
      <div className="risk-banner" style={{ backgroundColor: getRiskLevelColor() }}>
        <div className="risk-text">
          <strong>{riskLevel}</strong> - {getRiskLevelText()}
        </div>
        <div className="case-id">Case: {caseFile?.id?.split('_')[1] || 'Initializing...'}</div>
      </div>

      {/* Messages Area */}
      <div className="messages-area">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.sender}-message`}>
            <div className="message-avatar">
              {message.sender === 'stacy' ? '🤖' : message.sender === 'user' ? '👤' : '⚠️'}
            </div>
            <div className="message-content">
              <div className="message-text">{message.content}</div>
              <div className="message-time">
                {message.timestamp.toLocaleTimeString()} 
                {message.type && message.type !== 'text' && (
                  <span className="message-type">• {message.type}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message stacy-message">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {quickReplies.length > 0 && (
        <div className="quick-replies">
          {quickReplies.map((reply, index) => (
            <button
              key={index}
              className="quick-reply-btn"
              onClick={() => handleQuickReply(reply)}
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input Controls */}
      <div className="input-controls">
        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'text' ? 'active' : ''}`}
            onClick={() => setMode('text')}
          >
            💬 Text
          </button>
          <button
            className={`mode-btn ${mode === 'voice' ? 'active' : ''}`}
            onClick={() => setMode('voice')}
          >
            🎤 Voice
          </button>
        </div>

        {/* Text Input */}
        {mode === 'text' && (
          <div className="text-input-section">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendTextMessage()}
              placeholder="Tell Stacy about your situation..."
              disabled={isLoading}
              className="text-input"
            />
            <button
              onClick={() => sendTextMessage()}
              disabled={isLoading || !textInput.trim()}
              className="send-btn"
            >
              Send
            </button>
          </div>
        )}

        {/* Voice Input */}
        {mode === 'voice' && (
          <div className="voice-input-section">
            <button
              className={`voice-btn ${isRecording ? 'recording' : ''}`}
              onMouseDown={startVoiceRecording}
              onMouseUp={stopVoiceRecording}
              onTouchStart={startVoiceRecording}
              onTouchEnd={stopVoiceRecording}
              disabled={isLoading}
            >
              <div className="voice-icon">🎤</div>
              <div className="voice-status">
                {isRecording ? 'Recording... Release to send' : 'Press & Hold to Talk to Stacy'}
              </div>
            </button>
            
            {isRecording && (
              <div className="audio-visualizer">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }}></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Emergency Controls */}
      <div className="emergency-controls">
        <button className="panic-btn" onClick={triggerPanicButton}>
          🚨 PANIC BUTTON
        </button>
        
        <button className="location-btn" onClick={() => {
          if (location) {
            const locationText = `📍 My location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
            sendTextMessage(locationText);
          } else {
            addMessage('system', 'Location not available', 'text');
          }
        }}>
          📍 Share Location
        </button>
      </div>

      <style jsx>{`
        .stacy-interface {
          max-width: 480px;
          margin: 0 auto;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .stacy-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .logo-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          font-size: 28px;
        }

        .logo-section h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
        }

        .tagline {
          font-size: 12px;
          opacity: 0.9;
          margin-left: -12px;
        }

        .status-section {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
        }

        .connection-status, .location-status {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-dot, .location-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffd700;
        }

        .status-dot.connected, .location-dot.active {
          background: #00ff88;
        }

        .status-dot.disconnected, .location-dot.inactive {
          background: #ff4444;
        }

        .risk-banner {
          padding: 12px 20px;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 600;
          font-size: 14px;
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #f8f9ff;
        }

        .message {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          animation: slideIn 0.3s ease-out;
        }

        .user-message {
          flex-direction: row-reverse;
          margin-left: 40px;
        }

        .message-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
          background: rgba(102, 126, 234, 0.1);
        }

        .user-message .message-avatar {
          background: #667eea;
          color: white;
        }

        .message-content {
          flex: 1;
          background: white;
          padding: 12px 16px;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .user-message .message-content {
          background: #667eea;
          color: white;
        }

        .message-text {
          line-height: 1.5;
          margin-bottom: 4px;
        }

        .message-time {
          font-size: 11px;
          opacity: 0.7;
        }

        .message-type {
          font-style: italic;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #667eea;
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-10px); }
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .quick-replies {
          padding: 0 20px 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .quick-reply-btn {
          padding: 8px 16px;
          border: 1px solid #667eea;
          border-radius: 20px;
          background: white;
          color: #667eea;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .quick-reply-btn:hover {
          background: #667eea;
          color: white;
        }

        .input-controls {
          background: white;
          border-top: 1px solid #e1e5f2;
          padding: 20px;
        }

        .mode-toggle {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          background: #f1f5f9;
          border-radius: 12px;
          padding: 4px;
        }

        .mode-btn {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 8px;
          background: transparent;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .mode-btn.active {
          background: #667eea;
          color: white;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .text-input-section {
          display: flex;
          gap: 12px;
        }

        .text-input {
          flex: 1;
          padding: 14px 16px;
          border: 1px solid #e1e5f2;
          border-radius: 12px;
          font-size: 16px;
          outline: none;
        }

        .text-input:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
        }

        .send-btn {
          padding: 14px 20px;
          border: none;
          border-radius: 12px;
          background: #667eea;
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .send-btn:hover:not(:disabled) {
          background: #5a67d8;
          transform: translateY(-1px);
        }

        .send-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .voice-input-section {
          text-align: center;
        }

        .voice-btn {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
        }

        .voice-btn:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 6px 25px rgba(102, 126, 234, 0.4);
        }

        .voice-btn.recording {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          animation: pulse 1s infinite;
        }

        .voice-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .voice-status {
          font-size: 12px;
          font-weight: 500;
          text-align: center;
        }

        .audio-visualizer {
          display: flex;
          justify-content: center;
          gap: 4px;
          height: 30px;
          align-items: end;
        }

        .wave-bar {
          width: 4px;
          background: #667eea;
          border-radius: 2px;
          animation: wave 1s infinite ease-in-out;
        }

        @keyframes wave {
          0%, 100% { height: 8px; }
          50% { height: 24px; }
        }

        @keyframes pulse {
          0% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 4px 30px rgba(239, 68, 68, 0.6); }
          100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3); }
        }

        .emergency-controls {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }

        .panic-btn {
          flex: 1;
          padding: 16px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 16px;
        }

        .panic-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
        }

        .location-btn {
          flex: 1;
          padding: 16px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .location-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        }

        @media (max-width: 480px) {
          .stacy-interface {
            height: 100vh;
          }
          
          .stacy-header {
            padding: 12px 16px;
          }
          
          .messages-area {
            padding: 16px;
          }
          
          .input-controls {
            padding: 16px;
          }
          
          .voice-btn {
            width: 100px;
            height: 100px;
          }
        }
      `}</style>
    </div>
  );
}
