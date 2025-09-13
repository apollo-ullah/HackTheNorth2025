import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Navigation from '../components/Navigation';

interface Location {
  lat: number;
  lng: number;
  accuracy: number;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export default function Home() {
  const [currentMode, setCurrentMode] = useState<'voice' | 'text' | 'stealth'>('voice');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+15146605707');
  const [riskLevel, setRiskLevel] = useState('SAFE');
  const [statusText, setStatusText] = useState('Click to enable open microphone');
  const [showTyping, setShowTyping] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const recognitionRef = useRef<any>(null);
  const sessionId = useRef<string>('');

  // Initialize client-side only content
  useEffect(() => {
    setIsClient(true);
    sessionId.current = `unified_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize with first message
    setMessages([{
      role: 'assistant',
      content: 'Hi, this is Stacy. Are you in immediate danger right now?',
      timestamp: Date.now()
    }]);
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (isClient && typeof window !== 'undefined') {
      console.log('🎤 Checking for speech recognition support...');
      
      // Check for speech recognition support
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        console.log('✅ Speech recognition supported');
        
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          
          recognition.onresult = (event: any) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript;
              } else {
                interimTranscript += transcript;
              }
            }
            
            if (interimTranscript) {
              setStatusText(`Listening: "${interimTranscript}"`);
            }
            
            if (finalTranscript.trim()) {
              console.log(`🗣️ User said: "${finalTranscript.trim()}"`);
              processUserSpeech(finalTranscript.trim());
            }
          };
          
          recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'no-speech' && isListening) {
              setTimeout(() => {
                if (isListening) {
                  try {
                    recognition.start();
                  } catch (e) {
                    console.error('Failed to restart after no-speech:', e);
                  }
                }
              }, 1000);
            }
          };
          
          recognition.onend = () => {
            console.log('🎤 Speech recognition ended');
            if (isListening && !isProcessing) {
              setTimeout(() => {
                try {
                  recognition.start();
                  console.log('🎤 Speech recognition restarted');
                } catch (e) {
                  console.error('Failed to restart recognition:', e);
                }
              }, 100);
            }
          };
          
          recognitionRef.current = recognition;
          console.log('✅ Speech recognition initialized successfully');
          
        } catch (error) {
          console.error('❌ Failed to initialize speech recognition:', error);
        }
      } else {
        console.error('❌ Speech recognition not supported in this browser');
        console.log('ℹ️ Try using Chrome, Edge, or Safari for voice features');
        setStatusText('Speech recognition not supported - use text mode or try Chrome/Edge');
        addMessage('system', '⚠️ Voice not supported in this browser. Try Chrome/Edge or use text mode below.');
      }
    }
  }, [isClient, isListening, isProcessing]);

  // Get location permission with comprehensive debugging
  useEffect(() => {
    if (!isClient) return;
    
    console.log('📍 Starting location request process...');
    console.log('📍 Window available:', typeof window !== 'undefined');
    console.log('📍 Navigator available:', typeof navigator !== 'undefined');
    console.log('📍 Geolocation available:', !!navigator.geolocation);
    console.log('📍 HTTPS:', location.protocol === 'https:');
    
    if (typeof window === 'undefined') {
      console.error('❌ Window not available');
      addMessage('system', '❌ Browser environment not ready');
      return;
    }
    
    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported in this browser');
      addMessage('system', '❌ Location services not supported in this browser');
      return;
    }

    console.log('📍 Requesting location permission...');
    addMessage('system', '📍 Requesting location permission...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setCurrentLocation(location);
        console.log(`✅ Location obtained successfully:`);
        console.log(`📍 Coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
        console.log(`📍 Accuracy: ±${Math.round(location.accuracy)}m`);
        console.log(`📍 Timestamp: ${new Date(position.timestamp).toLocaleString()}`);
        
        addMessage('system', `✅ Location obtained: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)} (±${Math.round(location.accuracy)}m)`);
      },
      (error) => {
        console.error('❌ Location error details:');
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error constants:', {
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3
        });
        
        let errorMessage = 'Location access failed';
        
        switch (error.code) {
          case 1: // PERMISSION_DENIED
            errorMessage = 'Location permission denied - please enable in browser settings';
            console.log('📍 User denied location permission');
            break;
          case 2: // POSITION_UNAVAILABLE
            errorMessage = 'Location unavailable - GPS/network issue';
            console.log('📍 Position unavailable - GPS or network issue');
            break;
          case 3: // TIMEOUT
            errorMessage = 'Location request timed out - try again';
            console.log('📍 Location request timed out');
            break;
          default:
            errorMessage = `Location error: ${error.message}`;
        }
        
        addMessage('system', `❌ ${errorMessage}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000, // 10 seconds
        maximumAge: 60000 // 1 minute cache
      }
    );
  }, [isClient]);

  const processUserSpeech = async (transcript: string) => {
    if (isProcessing || isSpeaking) return;
    
    console.log(`🗣️ User said: "${transcript}"`);
    addMessage('user', transcript);
    await getStacyResponse(transcript);
  };

  const sendTextMessage = async () => {
    if (!textInput.trim() || isProcessing) return;

    addMessage('user', textInput);
    const message = textInput;
    setTextInput('');
    
    await getStacyResponse(message);
  };

  const getStacyResponse = async (userMessage: string) => {
    try {
      setIsProcessing(true);
      setShowTyping(true);
      setStatusText('Stacy is thinking...');
      
      console.log('💬 Sending chat request:');
      console.log('💬 Message:', userMessage);
      console.log('💬 Location:', currentLocation);
      console.log('💬 Session ID:', sessionId.current);
      console.log('💬 Mode:', currentMode);
      
      const requestData = {
        message: userMessage,
        location: currentLocation,
        sessionId: sessionId.current,
        mode: currentMode
      };
      
      console.log('💬 Full request data:', JSON.stringify(requestData, null, 2));
      
      const response = await axios.post('/api/stacy/chat', requestData);

      const result = response.data;
      console.log('🤖 Stacy API response:', JSON.stringify(result, null, 2));
      
      setShowTyping(false);
      addMessage('assistant', result.reply);
      
      // Update risk level
      if (result.riskLevel) {
        console.log(`🔍 Risk level updated: ${riskLevel} → ${result.riskLevel}`);
        setRiskLevel(result.riskLevel);
      }
      
      // Handle tool results
      if (result.toolResult) {
        console.log('🔧 Tool result received:', result.action, result.toolResult);
        handleToolResult(result.action, result.toolResult);
      }
      
      // Speak response if in voice mode
      if (currentMode === 'voice') {
        console.log('🔊 Speaking response in voice mode');
        await speakResponse(result.reply);
      }
      
      // Handle escalation
      if (result.action === 'escalate_to_police') {
        console.log('🚨 Escalation detected - calling police');
        console.log('🚨 Conversation context from API:', result.conversation_context);
        await callPolice(result.conversation_context);
      }

    } catch (error: any) {
      setShowTyping(false);
      console.error('❌ Chat API error:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      console.error('❌ Full error object:', error);
      
      addMessage('system', `❌ Chat error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsProcessing(false);
      if (isListening) {
        setStatusText('Open mic active - Stacy is listening');
      } else {
        setStatusText('Click to enable microphone or type below');
      }
    }
  };

  const speakResponse = async (text: string) => {
    try {
      setIsSpeaking(true);
      setStatusText('🔊 Stacy is speaking...');
      
      // Use OpenAI TTS for high-quality voice
      const response = await axios.post('/api/stacy/voice', {
        text: text,
        voice: 'nova'
      });

      if (response.data.success) {
        const audioData = `data:audio/mp3;base64,${response.data.audio}`;
        const audio = new Audio(audioData);
        
        return new Promise<void>((resolve) => {
          audio.onended = () => {
            setIsSpeaking(false);
            resolve();
          };
          
          audio.onerror = () => {
            setIsSpeaking(false);
            resolve();
          };
          
          audio.play().catch(() => {
            setIsSpeaking(false);
            resolve();
          });
        });
      }
      
    } catch (error) {
      console.warn('OpenAI voice failed, using browser TTS:', error);
      
      // Fallback to browser TTS
      if ('speechSynthesis' in window) {
        return new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.9;
          utterance.pitch = 1.1;
          
          utterance.onend = () => {
            setIsSpeaking(false);
            resolve();
          };
          
          speechSynthesis.speak(utterance);
        });
      } else {
        setIsSpeaking(false);
      }
    }
  };

  const toggleVoice = () => {
    if (currentMode !== 'voice') {
      setCurrentMode('voice');
    }
    
    if (isProcessing || isSpeaking) return;

    if (!isListening) {
      startVoice();
    } else {
      stopVoice();
    }
  };

  const startVoice = () => {
    console.log('🎤 Attempting to start voice recognition...');
    console.log('🎤 Recognition available:', !!recognitionRef.current);
    
    if (!recognitionRef.current) {
      console.error('❌ No speech recognition available');
      setStatusText('Speech recognition not available - try text mode');
      return;
    }
    
    try {
      setIsListening(true);
      setStatusText('Starting microphone...');
      recognitionRef.current.start();
      console.log('✅ Voice recognition started successfully');
      setStatusText('Open mic active - Stacy is listening');
    } catch (error) {
      console.error('❌ Failed to start voice:', error);
      setStatusText('Failed to start microphone - try text mode');
      setIsListening(false);
    }
  };

  const stopVoice = () => {
    try {
      setIsListening(false);
      setStatusText('Click to enable open microphone');
      
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      
      console.log('🎤 Voice recognition stopped');
    } catch (error) {
      console.error('Error stopping voice:', error);
    }
  };

  const addMessage = (role: 'user' | 'assistant' | 'system', content: string) => {
    const newMessage: Message = {
      role,
      content,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev.slice(-49), newMessage]); // Keep last 50 messages
  };

  const handleToolResult = (action: string, toolResult: any) => {
    console.log(`🔧 Tool result for ${action}:`, toolResult);
    
    switch (action) {
      case 'notifyEmergencyContact':
      case 'contact_notified':
        if (toolResult.success) {
          addMessage('system', `✅ Emergency contact notified! SMS ID: ${toolResult.messageId}`);
        } else {
          addMessage('system', `❌ Failed to notify contact: ${toolResult.error}`);
        }
        break;
        
      case 'getSafeLocations':
      case 'safe_locations_found':
        if (toolResult.success && toolResult.locations) {
          const locationsList = toolResult.locations.slice(0, 3).map((loc: any) => 
            `📍 ${loc.name} - ${loc.distance}km`
          ).join('\n');
          addMessage('system', `Safe locations:\n${locationsList}`);
        }
        break;
    }
  };

  const triggerEmergency = async () => {
    console.log('🚨 Emergency button clicked');
    addMessage('system', '🚨 Emergency mode activated!');
    
    console.log('📍 Current location:', currentLocation);
    
    if (!currentLocation) {
      addMessage('system', '❌ Location needed for emergency features - requesting location...');
      console.log('📍 Requesting location for emergency...');
      
      // Try to request location again with more aggressive settings
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0 // Force fresh location
            });
          });
          
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          setCurrentLocation(location);
          console.log('✅ Emergency location obtained:', location);
          addMessage('system', `✅ Location obtained! Proceeding with emergency...`);
          
          // Continue with emergency flow
          await proceedWithEmergency(location);
          
        } catch (error: any) {
          console.error('❌ Emergency location failed:', error);
          addMessage('system', `❌ Location access denied. Proceeding without location...`);
          
          // Proceed without location (limited functionality)
          await proceedWithEmergency(null);
        }
      } else {
        addMessage('system', '❌ Geolocation not supported. Proceeding without location...');
        await proceedWithEmergency(null);
      }
      return;
    }

    await proceedWithEmergency(currentLocation);
  };

  const proceedWithEmergency = async (location: Location | null) => {
    try {
      console.log('🚨 Proceeding with emergency flow, location:', location);
      
      // Step 1: Send SMS alert if location available
      if (location) {
        console.log('📱 Sending emergency SMS...');
        
        const smsResponse = await axios.post('/api/stacy/mobile', {
          action: 'quick_alert',
          location: location,
          message: 'EMERGENCY: Alert activated from Stacy interface',
          emergency_contact: { 
            name: 'Emergency Contact', 
            phone: '+15146605707', 
            relationship: 'Primary' 
          }
        });

        console.log('📱 SMS response:', smsResponse.data);

        if (smsResponse.data.success) {
          addMessage('system', `✅ Emergency SMS sent! Message ID: ${smsResponse.data.messageId}`);
        } else {
          addMessage('system', `❌ Emergency SMS failed: ${smsResponse.data.error}`);
        }
      }
      
      // Step 2: Always initiate emergency briefing call
      console.log('📞 Initiating emergency briefing call...');
      await initiateEmergencyBriefingCall();

    } catch (error: any) {
      console.error('❌ Emergency procedure error:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      addMessage('system', `❌ Emergency system error: ${error.response?.data?.error || error.message}`);
    }
  };

  const initiateEmergencyBriefingCall = async () => {
    try {
      addMessage('system', '📞 Calling emergency contact with situation briefing...');
      
      // Build case summary from conversation
      const userMessages = messages.filter(m => m.role === 'user').slice(-3);
      const caseSummary = userMessages.length > 0 ? 
        userMessages.map(m => m.content).join('. ') :
        'Emergency button activated from Stacy interface';
      
      console.log('📞 Case summary for emergency call:', caseSummary);
      console.log('📞 Location for emergency call:', currentLocation);
      
      const response = await axios.post('/api/stacy/emergency-call', {
        emergency_contact_phone: '+15146605707',
        case_summary: caseSummary,
        location: currentLocation
      });

      console.log('📞 Emergency call API response:', response.data);

      if (response.data.success) {
        addMessage('system', `📞 Emergency call initiated! Call ID: ${response.data.callId}`);
        addMessage('assistant', 'I\'ve called your emergency contact and briefed them on your situation. They should receive the call shortly.');
      } else {
        addMessage('system', `❌ Emergency call failed: ${response.data.error}`);
      }

    } catch (error: any) {
      console.error('❌ Emergency call error:', error);
      console.error('❌ Full error:', error.response?.data || error);
      addMessage('system', `❌ Failed to initiate emergency call: ${error.response?.data?.error || error.message}`);
    }
  };

  const generateEmergencyBriefing = (caseFile: any) => {
    const location = caseFile.location ? 
      `Location: ${caseFile.location.lat.toFixed(6)}, ${caseFile.location.lng.toFixed(6)} with accuracy of ${Math.round(caseFile.location.accuracy)} meters` :
      'Location: Not available';
    
    const situation = caseFile.conversation.length > 0 ? 
      `User reported: ${caseFile.conversation.filter((m: any) => m.role === 'user').slice(-2).map((m: any) => m.content).join('. ')}` :
      'Emergency button activated from Stacy interface';
    
    const communicationStatus = caseFile.userStatus.canSpeak ? 
      'User can speak normally' : 
      caseFile.userStatus.isHidden ? 'User is in stealth mode - may not be able to speak safely' : 'User prefers text communication';

    return `Hello, I am Stacy, a voice agent reporting a safety concern for a user. 

EMERGENCY BRIEFING:
- Risk Level: ${caseFile.riskLevel}
- Time: ${new Date(caseFile.timestamp).toLocaleString()}
- ${location}
- Situation: ${situation}
- Communication: ${communicationStatus}
- Session ID: ${caseFile.sessionId}

This is an automated safety report from Stacy AI Safety Companion. The user has activated emergency protocols. Please respond accordingly.

I can answer questions about the verified information in this case file, but I cannot speculate beyond what has been documented.`;
  };

  const callPolice = async (apiConversationContext?: any) => {
    if (!phoneNumber.trim()) {
      addMessage('system', '❌ Phone number required for police call');
      return;
    }

    try {
      addMessage('system', '📞 Briefing emergency dispatcher and initiating handoff...');
      
      // Create conversation context for the briefing
      const conversationContext = apiConversationContext || {
        sessionId: sessionId.current,
        messages: messages,
        riskLevel: riskLevel,
        escalated: true,
        location: currentLocation,
        incident: {
          timestamp: Date.now(),
          notes: messages.filter(m => m.role === 'user').map(m => m.content)
        }
      };

      console.log('📞 Sending conversation context to police:', conversationContext);
      
      const response = await axios.post('/api/stacy/voice-call', {
        phone_number: phoneNumber,
        user_location: currentLocation,
        conversation_context: conversationContext,
        emergency_contacts: [{ 
          name: 'Emergency Contact', 
          phone: '+15146605707', 
          relationship: 'Primary' 
        }]
      });

      if (response.data.success) {
        addMessage('system', `📞 Emergency dispatcher briefed! You will receive a call from ${response.data.stacyNumber} to connect with the dispatcher.`);
        addMessage('system', `🔄 Briefing delivered: "${response.data.briefing?.substring(0, 100)}..."`);
        console.log('📞 Full briefing sent:', response.data.briefing);
      } else {
        addMessage('system', `❌ Emergency call failed: ${response.data.error}`);
      }

    } catch (error: any) {
      console.error('Police call error:', error);
      console.error('Police call error details:', error.response?.data);
      addMessage('system', '❌ Failed to contact emergency services');
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: 'Hi, this is Stacy. Are you in immediate danger right now?',
      timestamp: Date.now()
    }]);
    console.log('🗑️ Chat cleared');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const handleSpaceKey = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat && !isSpeaking && currentMode === 'voice') {
      e.preventDefault();
      toggleVoice();
    }
  };

  useEffect(() => {
    if (isClient) {
      document.addEventListener('keydown', handleSpaceKey);
      return () => document.removeEventListener('keydown', handleSpaceKey);
    }
  }, [currentMode, isSpeaking, isClient]);

  // Show loading state during hydration
  if (!isClient) {
    return (
      <>
        <Head>
          <title>Stacy - AI Safety Companion</title>
          <meta name="description" content="AI Safety Companion with real-time voice and emergency response" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <div className="loading-screen">
          <div className="loading-icon">🛡️</div>
          <h1 className="loading-title">Stacy AI Safety Companion</h1>
          <p className="loading-text">Loading interface...</p>
        </div>
        <style jsx>{`
          .loading-screen {
            font-family: Inter, sans-serif;
            background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
            color: white;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 20px;
          }
          .loading-icon {
            font-size: 48px;
          }
          .loading-title {
            font-size: 2rem;
            font-weight: 600;
          }
          .loading-text {
            opacity: 0.8;
          }
        `}</style>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Stacy - AI Safety Companion</title>
        <meta name="description" content="AI Safety Companion with real-time voice and emergency response" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%)',
        color: 'white',
        height: '100vh',
        overflow: 'hidden'
      }}>
        <Navigation currentMode={currentMode} onModeChange={setCurrentMode} />
        <div style={{ display: 'flex', height: '100vh' }}>
          {/* Left Panel: Chat Interface */}
          <div style={{
            flex: 1,
            maxWidth: '450px',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            gap: '20px'
          }}>
            {/* Chat Log */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.8)',
              borderRadius: '16px',
              padding: '24px',
              height: '60vh',
              display: 'flex',
              flexDirection: 'column',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{
                marginBottom: '20px',
                paddingBottom: '15px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                <h2 style={{ color: '#60a5fa', fontSize: '1.4rem', marginBottom: '5px' }}>
                  💬 Chat with Stacy
                </h2>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: currentMode === 'stealth' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  border: `1px solid ${currentMode === 'stealth' ? '#ef4444' : 'rgba(16, 185, 129, 0.5)'}`,
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: currentMode === 'stealth' ? '#ef4444' : 'white'
                }}>
                  {currentMode === 'voice' ? '🎤 Voice Mode' : 
                   currentMode === 'text' ? '💬 Text Mode' : '🤫 Stealth Mode'}
                </div>
              </div>
              
              <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                paddingRight: '10px'
              }}>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      maxWidth: '85%',
                      alignSelf: message.role === 'user' ? 'flex-end' : 
                                message.role === 'system' ? 'center' : 'flex-start',
                      alignItems: message.role === 'user' ? 'flex-end' : 
                                 message.role === 'system' ? 'center' : 'flex-start'
                    }}
                  >
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '18px',
                      fontSize: '14px',
                      lineHeight: '1.4',
                      wordWrap: 'break-word',
                      background: message.role === 'user' ? 'rgba(59, 130, 246, 0.3)' :
                                 message.role === 'assistant' ? 'rgba(16, 185, 129, 0.3)' :
                                 'rgba(255, 193, 7, 0.2)',
                      border: `1px solid ${
                        message.role === 'user' ? 'rgba(59, 130, 246, 0.5)' :
                        message.role === 'assistant' ? 'rgba(16, 185, 129, 0.5)' :
                        'rgba(255, 193, 7, 0.4)'
                      }`,
                      color: message.role === 'system' ? '#ffc107' : 'white',
                      textAlign: message.role === 'system' ? 'center' : 'left'
                    }}>
                      {message.content}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'rgba(255, 255, 255, 0.5)',
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      <span>{message.role === 'user' ? '👤 You' : message.role === 'assistant' ? '🤖 Stacy' : '⚙️ System'}</span>
                      <span>•</span>
                      <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              {showTyping && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#10b981',
                  fontSize: '13px',
                  marginTop: '10px'
                }}>
                  <span>Stacy is thinking</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <div style={{
                      width: '5px',
                      height: '5px',
                      background: '#10b981',
                      borderRadius: '50%',
                      animation: 'typing 1.4s infinite'
                    }}></div>
                    <div style={{
                      width: '5px',
                      height: '5px',
                      background: '#10b981',
                      borderRadius: '50%',
                      animation: 'typing 1.4s infinite 0.2s'
                    }}></div>
                    <div style={{
                      width: '5px',
                      height: '5px',
                      background: '#10b981',
                      borderRadius: '50%',
                      animation: 'typing 1.4s infinite 0.4s'
                    }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Text Input Area */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.6)',
              borderRadius: '16px',
              padding: '20px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                {['voice', 'text', 'stealth'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCurrentMode(mode as any)}
                    style={{
                      padding: '8px 16px',
                      background: currentMode === mode ? '#007aff' : 'rgba(255, 255, 255, 0.1)',
                      border: `1px solid ${currentMode === mode ? '#007aff' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: '20px',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {mode === 'voice' ? '🎤 Voice' : mode === 'text' ? '💬 Text' : '🤫 Stealth'}
                  </button>
                ))}
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    currentMode === 'voice' ? 'Type to Stacy or use voice...' :
                    currentMode === 'text' ? 'Type your message to Stacy...' :
                    'Type discretely (1=yes, 2=no, 3=help)...'
                  }
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '25px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={sendTextMessage}
                  disabled={isProcessing}
                  style={{
                    padding: '12px 20px',
                    background: '#007aff',
                    border: 'none',
                    borderRadius: '25px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Send
                </button>
              </div>
            </div>

            {/* Status Panel */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.6)',
              borderRadius: '12px',
              padding: '15px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span><strong>Session:</strong> {isClient ? sessionId.current.substr(-8) : 'Loading...'}</span>
                <span>
                  <strong>Risk:</strong> 
                  <span style={{
                    color: riskLevel === 'CRITICAL' ? '#ef4444' : 
                          riskLevel === 'ELEVATED' ? '#f59e0b' : '#10b981'
                  }}>
                    {riskLevel}
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <span style={{ color: currentLocation ? '#10b981' : '#ef4444' }}>●</span>
                  <span> Location: {
                    currentLocation ? 
                    `±${Math.round(currentLocation.accuracy)}m` : 
                    'Getting location...'
                  }</span>
                </span>
                {!currentLocation && (
                  <button
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setCurrentLocation({
                              lat: position.coords.latitude,
                              lng: position.coords.longitude,
                              accuracy: position.coords.accuracy
                            });
                            addMessage('system', '✅ Location access granted!');
                          },
                          (error) => {
                            addMessage('system', '❌ Location access denied. Please enable in browser settings.');
                          }
                        );
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      background: '#007aff',
                      border: 'none',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    Enable
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Voice Interface */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px',
            gap: '30px'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h1 style={{
                fontSize: '2.5rem',
                fontWeight: 700,
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
              }}>
                🛡️ Stacy
              </h1>
              <p style={{ fontSize: '1.1rem', opacity: 0.8 }}>
                Your AI Safety Companion
              </p>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '30px'
            }}>
              <div
                onClick={toggleVoice}
                style={{
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  border: '4px solid rgba(255, 255, 255, 0.3)',
                  background: isListening ? 'rgba(239, 68, 68, 0.2)' : 
                             isSpeaking ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  userSelect: 'none',
                  borderColor: isListening ? '#ef4444' : isSpeaking ? '#10b981' : 'rgba(255, 255, 255, 0.3)',
                  boxShadow: isListening ? '0 0 0 0 rgba(239, 68, 68, 0.4)' : 
                            isSpeaking ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none',
                  animation: isListening ? 'pulse 2s infinite' : isSpeaking ? 'glow 1s ease-in-out infinite alternate' : 'none'
                }}
              >
                <div style={{ fontSize: '3.5rem', transition: 'all 0.3s ease' }}>
                  {isListening ? '🔴' : isSpeaking ? '🔊' : '🎤'}
                </div>
              </div>
              
              <div style={{
                fontSize: '1.1rem',
                fontWeight: 500,
                textAlign: 'center',
                minHeight: '28px',
                opacity: 0.9
              }}>
                {statusText}
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Your phone number"
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '20px',
                  color: 'white',
                  fontSize: '13px',
                  width: '160px',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
              <button
                onClick={triggerEmergency}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #ef4444',
                  borderRadius: '20px',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                🚨 Emergency
              </button>
              <button
                onClick={callPolice}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '20px',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                📞 Call Police
              </button>
              <button
                onClick={clearChat}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '20px',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                🗑️ Clear
              </button>
              <button
                onClick={() => {
                  addMessage('user', 'Someone is following me, I need help');
                  getStacyResponse('Someone is following me, I need help');
                }}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255, 193, 7, 0.2)',
                  border: '1px solid rgba(255, 193, 7, 0.4)',
                  borderRadius: '20px',
                  color: '#ffc107',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                🧪 Test Emergency
              </button>
              <button
                onClick={() => {
                  addMessage('user', 'Call the police now');
                  getStacyResponse('Call the police now');
                }}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #ef4444',
                  borderRadius: '20px',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                🚨 Force Police Call
              </button>
              <button
                onClick={async () => {
                  try {
                    addMessage('system', '🔍 Testing API connectivity...');
                    const response = await axios.get('/api/status');
                    addMessage('system', `✅ API Status: ${JSON.stringify(response.data, null, 2)}`);
                  } catch (error: any) {
                    addMessage('system', `❌ API Test Failed: ${error.message}`);
                  }
                }}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  borderRadius: '20px',
                  color: '#10b981',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                🔍 Test APIs
              </button>
              {!currentLocation && (
                <button
                  onClick={async () => {
                    try {
                      addMessage('system', '📍 Manually requesting location...');
                      console.log('📍 Manual location request triggered');
                      
                      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                          enableHighAccuracy: true,
                          timeout: 5000,
                          maximumAge: 0
                        });
                      });
                      
                      const location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                      };
                      setCurrentLocation(location);
                      console.log('✅ Manual location obtained:', location);
                      addMessage('system', `✅ Location obtained: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
                      
                    } catch (error: any) {
                      console.error('❌ Manual location failed:', error);
                      addMessage('system', `❌ Location failed: ${error.message}`);
                    }
                  }}
                  style={{
                    padding: '10px 16px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    borderRadius: '20px',
                    color: '#3b82f6',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  📍 Get Location
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    // Create a sample conversation context
                    const sampleContext = {
                      sessionId: sessionId.current,
                      messages: messages,
                      riskLevel: riskLevel,
                      escalated: false,
                      location: currentLocation,
                      incident: {
                        timestamp: Date.now(),
                        notes: messages.filter(m => m.role === 'user').map(m => m.content)
                      }
                    };
                    
                    const briefingPreview = `SAMPLE DISPATCHER BRIEFING:
                    
Hello, this is Stacy, an artificial intelligence safety agent. I am calling to report an incident and complete a handoff to emergency dispatch.

INCIDENT BRIEFING:
- Time: ${new Date().toLocaleString()}
- Session ID: ${sessionId.current}
- Risk Level: ${riskLevel}
- ${currentLocation ? 
  `Location: ${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)} (±${Math.round(currentLocation.accuracy)}m accuracy)` :
  'Location: Not available'}

INCIDENT SUMMARY:
${messages.filter(m => m.role === 'user').slice(-3).map(m => m.content).join('. ') || 'No conversation yet'}

This individual has been assessed as requiring emergency assistance. I am now completing the handoff to you.`;
                    
                    addMessage('system', `📋 BRIEFING PREVIEW:\n${briefingPreview}`);
                  } catch (error: any) {
                    addMessage('system', `❌ Briefing preview failed: ${error.message}`);
                  }
                }}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(168, 85, 247, 0.2)',
                  border: '1px solid rgba(168, 85, 247, 0.5)',
                  borderRadius: '20px',
                  color: '#a855f7',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                📋 Preview Briefing
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        @keyframes glow {
          from { box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
          to { box-shadow: 0 0 30px rgba(16, 185, 129, 0.8); }
        }

        @keyframes typing {
          0%, 60%, 100% { opacity: 0.3; }
          30% { opacity: 1; }
        }

        @media (max-width: 768px) {
          .app-container {
            flex-direction: column !important;
          }
        }
      `}</style>
    </>
  );
}
