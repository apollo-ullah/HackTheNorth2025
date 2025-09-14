import Head from 'next/head'
import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface Location {
  lat: number
  lng: number
  accuracy: number
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('+15146605707')
  const [isInitiatingCall, setIsInitiatingCall] = useState(false)
  const [callStatus, setCallStatus] = useState('')
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null)
  const [riskLevel, setRiskLevel] = useState('SAFE')
  const [isTyping, setIsTyping] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connected')
  const [sessionId] = useState(`session_${Date.now()}`)
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: 'Hi, I\'m Stacy, your AI safety companion. I\'m here to help keep you safe. You can chat with me or request a VAPI voice call for emergencies.',
      timestamp: Date.now()
    }])

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          })
          setMessages(prev => [...prev, {
            role: 'system',
            content: '📍 Location detected and ready for emergency services',
            timestamp: Date.now()
          }])
        },
        (error) => {
          console.error('Location error:', error)
          setMessages(prev => [...prev, {
            role: 'system',
            content: '⚠️ Location access denied. Emergency features may be limited.',
            timestamp: Date.now()
          }])
        }
      )
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim()
    if (!messageText) return

    if (!text) setInput('')
    
    const userMessage: Message = { role: 'user', content: messageText, timestamp: Date.now() }
    setMessages(prev => [...prev, userMessage])
    setIsTyping(true)

    try {
      const response = await axios.post('/api/stacy/chat', {
        message: messageText,
        messages: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        location: currentLocation,
        sessionId: sessionId,
        riskLevel: riskLevel,
        mode: 'chat'
      })

      const aiMessage: Message = {
        role: 'assistant',
        content: response.data.reply || 'I\'m here to help you stay safe.',
        timestamp: Date.now()
      }

      setMessages(prev => [...prev, aiMessage])

      if (response.data.riskLevel && response.data.riskLevel !== riskLevel) {
        setRiskLevel(response.data.riskLevel)
        if (response.data.riskLevel === 'CRITICAL') {
          setMessages(prev => [...prev, {
            role: 'system',
            content: '🚨 CRITICAL situation detected - emergency protocols activated',
            timestamp: Date.now()
          }])
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        role: 'system',
        content: '❌ Error connecting to Stacy AI',
        timestamp: Date.now()
      }])
    }

    setIsTyping(false)
  }

  const initiateVAPICall = async () => {
    if (!phoneNumber.trim()) {
      setCallStatus('❌ Please enter a valid phone number')
      return
    }

    setIsInitiatingCall(true)
    setCallStatus('📞 Initiating VAPI voice call...')

    setMessages(prev => [...prev, {
      role: 'system',
      content: `🎤 Starting VAPI voice call to ${phoneNumber}. Stacy will call you from +16693292501`,
      timestamp: Date.now()
    }])

    try {
      const response = await axios.post('/api/call', {
        phone_number: phoneNumber.trim(),
        assistant_name: 'Stacy AI Safety Companion',
        location: currentLocation, // Pass the actual location object
        system_prompt: `You are Stacy, a professional AI safety companion and emergency dispatcher. 

CURRENT CONTEXT:
- User initiated call from web interface
- Location: ${currentLocation ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}` : 'Unknown'}
- Risk Level: ${riskLevel}
- Session: ${sessionId}

GUIDELINES:
- Be professional but warm and supportive
- Ask specific questions to assess their safety situation
- Use emergency tools if situation is critical
- Keep responses concise for voice calls
- Escalate to emergency services if needed

You have access to emergency tools for SMS alerts, case file management, and emergency service transfers.`
      })

      if (response.data.id) {
        setCallStatus(`✅ VAPI call initiated! Answer the call from +16693292501`)
        setMessages(prev => [...prev, {
          role: 'system',
          content: `✅ VAPI emergency call started. Call ID: ${response.data.id}. You should receive a call shortly.`,
          timestamp: Date.now()
        }])
      }
    } catch (error) {
      console.error('VAPI call error:', error)
      setCallStatus('❌ Failed to initiate VAPI call')
      setMessages(prev => [...prev, {
        role: 'system',
        content: '❌ VAPI call failed. Please check your configuration.',
        timestamp: Date.now()
      }])
    }

    setIsInitiatingCall(false)
    setTimeout(() => setCallStatus(''), 15000)
  }

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
    },
    appContainer: {
      maxWidth: '480px',
      margin: '0 auto',
      minHeight: '100vh',
      background: '#ffffff',
      boxShadow: '0 0 20px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column' as const
    },
    header: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    logoIcon: {
      fontSize: '28px'
    },
    logoText: {
      fontSize: '24px',
      fontWeight: 700,
      margin: 0
    },
    statusIndicator: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px'
    },
    statusDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: connectionStatus === 'connected' ? '#00ff88' : '#ffd700'
    },
    messagesContainer: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '20px',
      maxHeight: '400px'
    },
    message: {
      display: 'flex',
      gap: '12px',
      marginBottom: '16px',
      padding: '16px',
      borderRadius: '16px'
    },
    aiMessage: {
      background: '#f8f9ff',
      border: '1px solid #e1e5f2'
    },
    userMessage: {
      background: '#667eea',
      color: 'white',
      marginLeft: '40px',
      flexDirection: 'row-reverse' as const
    },
    systemMessage: {
      background: '#fff7e6',
      border: '1px solid #ffe2a8',
      color: '#7a4d00'
    },
    avatar: {
      fontSize: '24px',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    },
    messageContent: {
      flex: 1
    },
    controls: {
      background: '#f8f9ff',
      borderRadius: '20px',
      padding: '24px',
      border: '1px solid #e1e5f2',
      margin: '20px'
    },
    inputRow: {
      display: 'flex',
      gap: '10px',
      marginBottom: '16px'
    },
    textInput: {
      flex: 1,
      padding: '14px 12px',
      borderRadius: '12px',
      border: '1px solid #e1e5f2',
      fontSize: '14px',
      outline: 'none'
    },
    sendButton: {
      padding: '12px 16px',
      border: 'none',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      fontWeight: 600,
      cursor: 'pointer'
    },
    emergencyControls: {
      display: 'flex',
      gap: '12px',
      marginTop: '16px'
    },
    emergencyButton: {
      flex: 1,
      padding: '16px',
      border: 'none',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #ff4757 0%, #ff3742 100%)',
      color: 'white',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px'
    },
    vapiButton: {
      flex: 1,
      padding: '16px',
      border: 'none',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #2ed573 0%, #1e90ff 100%)',
      color: 'white',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px'
    },
    modal: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    modalContent: {
      background: 'white',
      borderRadius: '20px',
      maxWidth: '400px',
      width: '90%',
      maxHeight: '80vh',
      overflowY: 'auto' as const
    },
    modalHeader: {
      padding: '24px 24px 16px',
      borderBottom: '1px solid #e1e5f2',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    modalBody: {
      padding: '24px'
    }
  }

  return (
    <div style={styles.container}>
      <Head>
        <title>Stacy - AI Safety Companion</title>
        <meta name="description" content="AI Safety Companion with VAPI voice and OpenAI chat" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={styles.appContainer}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>🛡️</div>
            <h1 style={styles.logoText}>Stacy</h1>
          </div>
          <div style={styles.statusIndicator}>
            <div style={styles.statusDot}></div>
            <span>{connectionStatus === 'connected' ? 'Connected' : 'Connecting...'}</span>
          </div>
        </header>

        {/* Safety Banner */}
        {riskLevel !== 'SAFE' && (
          <div style={{
            background: riskLevel === 'CRITICAL' ? '#fee2e2' : '#fef3c7',
            color: riskLevel === 'CRITICAL' ? '#dc2626' : '#d97706',
            padding: '12px 20px',
            textAlign: 'center' as const,
            fontWeight: 600
          }}>
            ⚠️ Risk Level: {riskLevel}
          </div>
        )}

        {/* Messages */}
        <div style={styles.messagesContainer}>
          {messages.map((message, index) => (
            <div 
              key={index} 
              style={{
                ...styles.message,
                ...(message.role === 'user' ? styles.userMessage : 
                    message.role === 'assistant' ? styles.aiMessage : styles.systemMessage)
              }}
            >
              <div style={styles.avatar}>
                {message.role === 'user' ? '👤' : 
                 message.role === 'assistant' ? '🤖' : '⚠️'}
              </div>
              <div style={styles.messageContent}>
                <p style={{ margin: 0, lineHeight: 1.5 }}>{message.content}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.6 }}>
                  {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div style={{ ...styles.message, ...styles.aiMessage }}>
              <div style={styles.avatar}>🤖</div>
              <div style={styles.messageContent}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', background: '#667eea', borderRadius: '50%', animation: 'bounce 1s infinite' }}></div>
                  <div style={{ width: '8px', height: '8px', background: '#667eea', borderRadius: '50%', animation: 'bounce 1s infinite 0.2s' }}></div>
                  <div style={{ width: '8px', height: '8px', background: '#667eea', borderRadius: '50%', animation: 'bounce 1s infinite 0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          {/* VAPI Call Section */}
          <div style={{ marginBottom: '20px', textAlign: 'center' as const }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>📞 VAPI Emergency Call</h3>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Your phone number"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e1e5f2',
                borderRadius: '12px',
                fontSize: '14px',
                marginBottom: '12px',
                outline: 'none'
              }}
            />
            <button
              onClick={initiateVAPICall}
              disabled={isInitiatingCall || !phoneNumber.trim()}
              style={{
                ...styles.vapiButton,
                opacity: (isInitiatingCall || !phoneNumber.trim()) ? 0.5 : 1,
                cursor: (isInitiatingCall || !phoneNumber.trim()) ? 'not-allowed' : 'pointer'
              }}
            >
              <span>🎤</span>
              <span>{isInitiatingCall ? 'Calling...' : 'Call Stacy (VAPI)'}</span>
            </button>
            
            {callStatus && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#0369a1'
              }}>
                {callStatus}
              </div>
            )}
          </div>

          {/* Text Input */}
          <div style={styles.inputRow}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message to Stacy..."
              style={styles.textInput}
              disabled={isTyping}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isTyping || !input.trim()}
              style={{
                ...styles.sendButton,
                opacity: (isTyping || !input.trim()) ? 0.5 : 1,
                cursor: (isTyping || !input.trim()) ? 'not-allowed' : 'pointer'
              }}
            >
              Send
            </button>
          </div>

          {/* Emergency Controls */}
          <div style={styles.emergencyControls}>
            <button
              onClick={() => setShowEmergencyModal(true)}
              style={styles.emergencyButton}
            >
              <span>🚨</span>
              <span>Emergency</span>
            </button>
            
            <button
              onClick={() => {
                if (currentLocation) {
                  setMessages(prev => [...prev, {
                    role: 'system',
                    content: `📍 Location: ${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)} (±${Math.round(currentLocation.accuracy)}m)`,
                    timestamp: Date.now()
                  }])
                } else {
                  setMessages(prev => [...prev, {
                    role: 'system',
                    content: '❌ Location not available',
                    timestamp: Date.now()
                  }])
                }
              }}
              style={styles.vapiButton}
            >
              <span>📍</span>
              <span>Share Location</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer style={{
          background: '#f8f9ff',
          padding: '16px 20px',
          borderTop: '1px solid #e1e5f2',
          textAlign: 'center' as const
        }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
            <strong>Hybrid System:</strong> VAPI Voice + OpenAI Chat • No WebRTC Required
          </p>
        </footer>
      </div>

      {/* Emergency Modal */}
      {showEmergencyModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, color: '#ff4757', fontSize: '20px' }}>🚨 Emergency Options</h2>
              <button
                onClick={() => setShowEmergencyModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#333', marginBottom: '20px' }}>Choose your emergency response:</p>
              
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
                <button
                  onClick={() => {
                    setShowEmergencyModal(false)
                    initiateVAPICall()
                  }}
                  style={{
                    padding: '16px',
                    border: 'none',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <span>🎤</span>
                  <span>VAPI Voice Call</span>
                </button>
                
                <button
                  onClick={() => {
                    setShowEmergencyModal(false)
                    sendMessage("This is an emergency, I need immediate help")
                  }}
                  style={{
                    padding: '16px',
                    border: 'none',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #2ed573 0%, #1e90ff 100%)',
                    color: 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <span>💬</span>
                  <span>Emergency Chat</span>
                </button>
                
                <button
                  onClick={() => window.open('tel:911')}
                  style={{
                    padding: '16px',
                    border: 'none',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #ff4757 0%, #ff3742 100%)',
                    color: 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <span>🚨</span>
                  <span>Call 911 Direct</span>
                </button>
              </div>

              {currentLocation && (
                <div style={{
                  marginTop: '20px',
                  padding: '16px',
                  background: '#f8f9ff',
                  borderRadius: '12px',
                  border: '1px solid #e1e5f2'
                }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>
                    📍 Lat: {currentLocation.lat.toFixed(6)}, Lng: {currentLocation.lng.toFixed(6)}
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
                    Accuracy: ±{Math.round(currentLocation.accuracy)}m
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-10px); }
          60% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  )
}