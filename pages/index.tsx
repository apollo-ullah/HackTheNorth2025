import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ChevronDownIcon, MicrophoneIcon, PaperAirplaneIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { MicrophoneIcon as MicrophoneIconSolid } from '@heroicons/react/24/solid';

type Mode = "chat" | "voice";
type VAState = "idle" | "listening" | "thinking" | "speaking" | "error";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
  }
}

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
  const [mode, setMode] = useState<Mode>("chat");         // Default to Chat mode
  const [vaState, setVAState] = useState<VAState>("idle");
  const [isVoiceActive, setIsVoiceActive] = useState(false); // TOGGLE state for voice
  const [input, setInput] = useState("");
  const [log, setLog] = useState<Message[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('+15146605707');
  const [riskLevel, setRiskLevel] = useState('SAFE');
  const [isClient, setIsClient] = useState(false);

  const recognitionRef = useRef<SpeechRecognition|null>(null);
  const speakingRef = useRef(false);
  const autoRestartRef = useRef(false);                    // hard block auto-restarts
  const sessionId = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Safe SpeechRecognition getter
  const getRecognition = (): SpeechRecognition | null => {
    if (!isClient) return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec: SpeechRecognition = new SR();
    rec.lang = "en-US";
    rec.continuous = false;           // single utterance for TOGGLE mode
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    return rec;
  };

  // TTS helpers
  const stopSpeaking = () => {
    speakingRef.current = false;
    window.speechSynthesis?.cancel();
    if (mode === "voice") setVAState("idle");
  };

  const speak = (text: string) => {
    console.log('🔊 speak called, mode:', mode, 'text:', text.substring(0, 50));
    if (mode !== "voice") {
      console.log('❌ speak blocked - not in voice mode');
      return;     // never speak in Chat mode
    }
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    speakingRef.current = true;
    setVAState("speaking");
    console.log('🔊 Starting TTS...');
    u.onend = () => {
      console.log('🔊 TTS finished');
      speakingRef.current = false;
      if (isVoiceActive) {
        // In TOGGLE mode, restart listening after speaking
        console.log('🔁 Restarting listening after TTS...');
        setTimeout(() => startListening(), 500);
      } else {
        setVAState("idle");
      }
    };
    window.speechSynthesis?.speak(u);
  };

  // Initialize client-side only content
  useEffect(() => {
    setIsClient(true);
    sessionId.current = `unified_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize with first message
    setLog([{
      role: 'assistant',
      content: 'Hello! I\'m Stacy, your AI safety companion. I\'m here to help you stay safe. What\'s your current situation?',
      timestamp: Date.now()
    }]);
  }, []);

  // Voice: start/stop listening (TOGGLE MODE)
  const startListening = () => {
    console.log('🎤 startListening called, mode:', mode, 'isVoiceActive:', isVoiceActive);
    if (mode !== "voice" || !isVoiceActive) {
      console.log('❌ startListening blocked - wrong mode or voice inactive');
      return;
    }
    if (speakingRef.current) stopSpeaking();
    const rec = getRecognition();
    if (!rec) {
      console.log('❌ Speech recognition not supported');
      return; // browser not supported
    }
    console.log('✅ Starting speech recognition...');
    autoRestartRef.current = false;
    recognitionRef.current = rec;

    rec.onstart = () => setVAState("listening");
    rec.onerror = () => { setVAState("error"); };
    rec.onend = () => {
      if (isVoiceActive && !speakingRef.current) {
        // In TOGGLE mode, restart listening automatically unless speaking
        setTimeout(() => startListening(), 100);
      } else {
        setVAState("idle");
      }
    };
    rec.onresult = async (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript.trim();
      if (!text) return;
      setLog(l => [...l, {role:"user", content: text, timestamp: Date.now()}]);
      await handleQuery(text);
    };

    rec.start();
  };

  const stopListening = () => {
    autoRestartRef.current = false; // hard stop
    try {
      recognitionRef.current?.stop();
      recognitionRef.current?.abort();
    } catch {}
    setVAState("idle");
  };

  // TOGGLE voice mode
  const toggleVoice = () => {
    console.log('🎤 toggleVoice called, mode:', mode, 'isVoiceActive:', isVoiceActive);
    if (mode !== "voice") return;
    
    if (isVoiceActive) {
      // Turn OFF voice
      console.log('🔇 Turning voice OFF');
      setIsVoiceActive(false);
      stopListening();
      stopSpeaking();
    } else {
      // Turn ON voice  
      console.log('🎤 Turning voice ON');
      setIsVoiceActive(true);
      startListening();
    }
  };

  // Chat send
  const sendChat = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setLog(l => [...l, {role:"user", content: text, timestamp: Date.now()}]);
    await handleQuery(text);
  };

  // Shared query handler
  const handleQuery = async (text: string) => {
    setVAState("thinking");
    try {
      const res = await axios.post("/api/stacy/chat", {
        message: text,
        messages: log.slice(-10).map(m => ({role: m.role, content: m.content})),
        location: currentLocation,
        sessionId: sessionId.current,
        riskLevel: riskLevel,
        mode: mode
      });
      const data = res.data;
      const answer = data?.reply || "(no response)";
      setLog(l => [...l, {role:"assistant", content: answer, timestamp: Date.now()}]);
      
      // Update risk level if changed
      if (data.riskChanged && data.riskLevel) {
        setRiskLevel(data.riskLevel);
        if (data.riskLevel === 'CRITICAL') {
          setLog(l => [...l, {role:"system", content: "🚨 CRITICAL situation detected - emergency protocols activated", timestamp: Date.now()}]);
        }
      }
      
      if (mode === "voice") {
        speak(answer);  // TTS only in Voice mode
      } else {
        setVAState("idle");
      }
    } catch (error) {
      console.error('Query error:', error);
      setVAState("error");
      setLog(l => [...l, {role:"system", content: "❌ Error processing request", timestamp: Date.now()}]);
    }
  };

  // Mode switch: always stop listening and speaking on change
  useEffect(() => {
    stopSpeaking();
    stopListening();
    setIsVoiceActive(false);
    setVAState("idle");
  }, [mode]);

  // Get location on mount
  useEffect(() => {
    if (!isClient) return;
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
          console.log('✅ Location obtained');
        },
        (error) => {
          console.error('❌ Location error:', error);
        }
      );
    }
  }, [isClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  if (!isClient) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">🛡️ Stacy AI Safety Companion</h1>
        <p>Loading interface...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Stacy - AI Safety Companion</title>
        <meta name="description" content="AI Safety Companion with real-time voice and emergency response" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <main className="flex flex-col h-screen w-full text-white bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-black/30 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-2xl">🛡️</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Stacy AI</h1>
              <p className="text-sm text-gray-300">Your Safety Companion</p>
            </div>
          </div>
          </div>
          
          <div className="flex items-center space-x-6">
            {/* Mode Toggle */}
            <div className="flex bg-black/20 backdrop-blur rounded-xl p-1 border border-white/10">
              <button 
                onClick={() => setMode("chat")} 
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === "chat" 
                    ? "bg-blue-500 text-white shadow-lg transform scale-105" 
                    : "text-gray-300 hover:text-white hover:bg-white/10"
                }`}
              >
                💬 Chat
              </button>
              <button 
                onClick={() => setMode("voice")} 
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === "voice" 
                    ? "bg-purple-500 text-white shadow-lg transform scale-105" 
                    : "text-gray-300 hover:text-white hover:bg-white/10"
                }`}
              >
                🎤 Voice
              </button>
            </div>
            
            {/* Status & Risk Indicators */}
            <div className="flex items-center space-x-3">
              {/* Status Badge */}
              <div className="flex items-center space-x-2 bg-black/20 backdrop-blur px-3 py-1 rounded-full border border-white/10">
                <div className={`w-3 h-3 rounded-full animate-pulse shadow-sm ${
                  vaState === "listening" ? "bg-red-400 shadow-red-400/50" :
                  vaState === "thinking" ? "bg-yellow-400 shadow-yellow-400/50" :
                  vaState === "speaking" ? "bg-green-400 shadow-green-400/50" :
                  vaState === "error" ? "bg-red-600" :
                  "bg-gray-400"
                }`} />
                <span className="text-sm text-white font-medium capitalize">{vaState}</span>
              </div>
              
              {/* Risk Level */}
              <div className={`px-4 py-2 rounded-full text-sm font-bold shadow-lg ${
                riskLevel === 'CRITICAL' ? 'bg-red-500 text-white animate-pulse' :
                riskLevel === 'ELEVATED' ? 'bg-yellow-500 text-black' :
                'bg-green-500 text-white'
              }`}>
                {riskLevel}
              </div>
            </div>
          </div>
        </div>

        {/* Chat Messages - Main Content Area */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {log.length === 0 ? (
                <div className="text-center text-white/60 mt-32">
                  <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-400/20 to-purple-500/20 rounded-full flex items-center justify-center border border-white/10">
                    <span className="text-4xl">🤖</span>
                  </div>
                  <h3 className="text-2xl font-semibold mb-2 text-white">Hi, I'm Stacy!</h3>
                  <p className="text-lg mb-2">Your AI safety companion</p>
                  <p className="text-sm text-gray-300">I'm here to help keep you safe. Start a conversation below.</p>
                </div>
              ) : (
                log.map((message, index) => (
                  <div key={index} className={`flex items-end space-x-2 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}>
                    {/* Avatar */}
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 mb-1">
                        <span className="text-sm">🤖</span>
                      </div>
                    )}
                    
                    {/* Message Bubble */}
                    <div className={`max-w-md lg:max-w-lg px-5 py-3 rounded-2xl shadow-lg ${
                      message.role === 'user' 
                        ? 'bg-blue-500 text-white rounded-br-md' 
                        : message.role === 'assistant'
                        ? 'bg-white/10 backdrop-blur-md text-white rounded-bl-md border border-white/20'
                        : 'bg-yellow-500/20 text-yellow-100 border border-yellow-500/30 rounded-lg'
                    }`}>
                      {/* Message Header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold opacity-80">
                          {message.role === 'user' ? 'You' : 
                           message.role === 'assistant' ? 'Stacy AI' : 'System Alert'}
                        </span>
                        <span className="text-xs opacity-60">
                          {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      
                      {/* Message Content */}
                      <p className="text-sm leading-relaxed">{message.content}</p>
                    </div>
                    
                    {/* User Avatar */}
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center flex-shrink-0 mb-1">
                        <span className="text-sm">👤</span>
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {/* Typing Indicator */}
              {vaState === "thinking" && (
                <div className="flex items-end space-x-2 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 mb-1">
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl rounded-bl-md px-5 py-3 shadow-lg">
                    <div className="flex items-center space-x-1">
                      <span className="text-xs font-semibold opacity-80 mr-3">Stacy AI is thinking</span>
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-black/30 backdrop-blur-md border-t border-white/10">
              {mode === "chat" ? (
                <div className="flex items-center space-x-4">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                      placeholder="Message Stacy..."
                      className="w-full bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 backdrop-blur-md text-lg shadow-lg"
                      disabled={vaState === "thinking"}
                    />
                    {input && (
                      <button
                        onClick={() => setInput('')}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={sendChat}
                    disabled={vaState === "thinking" || !input.trim()}
                    className="p-4 bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                  >
                    {vaState === "thinking" ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <PaperAirplaneIcon className="w-6 h-6 text-white" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  {/* Animated Microphone Button */}
                  <div className="relative inline-block mb-8">
                    <button
                      onClick={toggleVoice}
                      disabled={vaState === "thinking"}
                      className={`relative w-32 h-32 rounded-full transition-all duration-300 transform shadow-2xl ${
                        isVoiceActive
                          ? 'bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 scale-110'
                          : 'bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 hover:border-white/50'
                      } ${
                        vaState === "listening" ? 'animate-pulse' : ''
                      } ${
                        vaState === "thinking" ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'
                      }`}
                    >
                      {/* Multiple breathing animation rings */}
                      {isVoiceActive && vaState === "listening" && (
                        <>
                          <div className="absolute inset-0 rounded-full border-2 border-red-300 animate-ping" />
                          <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-pulse" style={{animationDelay: '0.5s'}} />
                          <div className="absolute inset-0 rounded-full border-2 border-pink-300 animate-ping" style={{animationDelay: '1s'}} />
                        </>
                      )}
                      
                      {/* Microphone Icon */}
                      <div className="flex items-center justify-center h-full">
                        {vaState === "thinking" ? (
                          <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
                        ) : isVoiceActive ? (
                          <MicrophoneIconSolid className="w-12 h-12 text-white" />
                        ) : (
                          <MicrophoneIcon className="w-12 h-12 text-white" />
                        )}
                      </div>
                    </button>
                    
                    {/* Voice Status */}
                    <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2 text-center whitespace-nowrap">
                      <div className={`text-xl font-bold mb-2 ${
                        isVoiceActive ? 'text-red-300' : 'text-white'
                      }`}>
                        {vaState === "listening" ? "🎤 Listening..." :
                         vaState === "thinking" ? "🤔 Processing..." :
                         vaState === "speaking" ? "🔊 Speaking..." :
                         isVoiceActive ? "🔴 Active" : "🎤 Ready"}
                      </div>
                      <p className="text-sm text-gray-300">
                        {isVoiceActive ? "Tap to stop listening" : "Tap to start talking"}
                      </p>
                    </div>
                  </div>
                  
                  {/* Browser Support Warning */}
                  {!("SpeechRecognition" in window || "webkitSpeechRecognition" in window) && (
                    <div className="mt-16 p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-2xl text-yellow-200 text-sm backdrop-blur-md">
                      <ExclamationTriangleIcon className="w-5 h-5 inline mr-2" />
                      Voice features require Chrome or Edge browser for optimal experience
                    </div>
                  )}
                </div>
              )}
              
              {/* Quick Actions */}
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                <button
                  onClick={() => handleQuery('Someone is following me, I need help')}
                  className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 hover:border-red-400 rounded-2xl text-red-100 text-sm font-medium transition-all duration-200 backdrop-blur-md shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  🆘 Emergency Test
                </button>
                <button
                  onClick={() => handleQuery('Hi, I feel a bit nervous')}
                  className="px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 hover:border-blue-400 rounded-2xl text-blue-100 text-sm font-medium transition-all duration-200 backdrop-blur-md shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  💬 Normal Chat
                </button>
                <button
                  onClick={() => handleQuery('I\'m lost and it\'s getting dark')}
                  className="px-4 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/50 hover:border-yellow-400 rounded-2xl text-yellow-100 text-sm font-medium transition-all duration-200 backdrop-blur-md shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  🌆 Safety Concern
                </button>
                <button
                  onClick={() => handleQuery('Can you help me stay safe while walking home?')}
                  className="px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 hover:border-purple-400 rounded-2xl text-purple-100 text-sm font-medium transition-all duration-200 backdrop-blur-md shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  🛡️ Safety Tips
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}