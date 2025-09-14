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

      <main className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-black/20 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              🛡️
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Stacy AI</h1>
              <p className="text-xs text-gray-300">Safety Companion</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Mode Toggle */}
            <div className="flex bg-gray-800/50 rounded-lg p-1">
              <button 
                onClick={() => setMode("chat")} 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === "chat" 
                    ? "bg-blue-600 text-white shadow-lg" 
                    : "text-gray-300 hover:text-white hover:bg-gray-700/50"
                }`}
              >
                💬 Chat
              </button>
              <button 
                onClick={() => setMode("voice")} 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === "voice" 
                    ? "bg-blue-600 text-white shadow-lg" 
                    : "text-gray-300 hover:text-white hover:bg-gray-700/50"
                }`}
              >
                🎤 Voice
              </button>
            </div>
            
            {/* Status Badge */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                vaState === "listening" ? "bg-red-400" :
                vaState === "thinking" ? "bg-yellow-400" :
                vaState === "speaking" ? "bg-green-400" :
                vaState === "error" ? "bg-red-600" :
                "bg-gray-400"
              }`} />
              <span className="text-xs text-gray-300 capitalize">{vaState}</span>
            </div>
            
            {/* Risk Level */}
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              riskLevel === 'CRITICAL' ? 'bg-red-600 text-white' :
              riskLevel === 'ELEVATED' ? 'bg-yellow-600 text-black' :
              'bg-green-600 text-white'
            }`}>
              {riskLevel}
            </div>
          </div>
        </div>

        {/* Chat Messages - Main Content Area */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {log.length === 0 ? (
                <div className="text-center text-gray-400 mt-20">
                  <div className="text-6xl mb-4">🔒</div>
                  <p className="text-lg">Start a conversation with Stacy</p>
                  <p className="text-sm">Your AI safety companion is ready to help</p>
                </div>
              ) : (
                log.map((message, index) => (
                  <div key={index} className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}>
                    <div className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-2xl ${
                      message.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-md' 
                        : message.role === 'assistant'
                        ? 'bg-white/10 backdrop-blur text-white rounded-bl-md border border-white/20'
                        : 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30 rounded-lg'
                    }`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-medium opacity-70">
                          {message.role === 'user' ? 'You' : 
                           message.role === 'assistant' ? 'Stacy AI' : 'System'}
                        </span>
                        <span className="text-xs opacity-50">
                          {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ))
              )}
              
              {/* Typing Indicator */}
              {vaState === "thinking" && (
                <div className="flex justify-start">
                  <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl rounded-bl-md px-4 py-2">
                    <div className="flex items-center space-x-1">
                      <span className="text-xs font-medium opacity-70 mr-2">Stacy AI</span>
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-black/20 backdrop-blur-sm border-t border-white/10">
              {mode === "chat" ? (
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                    placeholder="Type a message to Stacy..."
                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm"
                    disabled={vaState === "thinking"}
                  />
                  <button
                    onClick={sendChat}
                    disabled={vaState === "thinking" || !input.trim()}
                    className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded-full transition-all duration-200 shadow-lg"
                  >
                    {vaState === "thinking" ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <PaperAirplaneIcon className="w-5 h-5 text-white" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  {/* Animated Microphone Button */}
                  <div className="relative inline-block mb-4">
                    <button
                      onClick={toggleVoice}
                      disabled={vaState === "thinking"}
                      className={`relative w-20 h-20 rounded-full transition-all duration-300 transform ${
                        isVoiceActive
                          ? 'bg-red-500 hover:bg-red-600 scale-110 shadow-2xl'
                          : 'bg-white/10 hover:bg-white/20 backdrop-blur border border-white/30'
                      } ${
                        vaState === "listening" ? 'animate-pulse' : ''
                      } ${
                        vaState === "thinking" ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'
                      }`}
                    >
                      {/* Breathing animation ring */}
                      {isVoiceActive && vaState === "listening" && (
                        <div className="absolute inset-0 rounded-full border-2 border-red-300 animate-ping" />
                      )}
                      
                      {/* Microphone Icon */}
                      {vaState === "thinking" ? (
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                      ) : isVoiceActive ? (
                        <MicrophoneIconSolid className="w-8 h-8 text-white mx-auto" />
                      ) : (
                        <MicrophoneIcon className="w-8 h-8 text-white mx-auto" />
                      )}
                    </button>
                    
                    {/* Voice Status */}
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                      <span className={`text-sm font-medium ${
                        isVoiceActive ? 'text-red-300' : 'text-gray-300'
                      }`}>
                        {vaState === "listening" ? "Listening..." :
                         vaState === "thinking" ? "Processing..." :
                         vaState === "speaking" ? "Speaking..." :
                         isVoiceActive ? "Tap to stop" : "Tap to talk"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Browser Support Warning */}
                  {!("SpeechRecognition" in window || "webkitSpeechRecognition" in window) && (
                    <div className="mt-8 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-yellow-200 text-sm">
                      <ExclamationTriangleIcon className="w-4 h-4 inline mr-2" />
                      Voice features require Chrome or Edge browser
                    </div>
                  )}
                </div>
              )}
              
              {/* Quick Actions */}
              <div className="flex justify-center space-x-2 mt-4">
                <button
                  onClick={() => handleQuery('Someone is following me, I need help')}
                  className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 rounded-full text-red-200 text-xs transition-all duration-200"
                >
                  🆘 Emergency Test
                </button>
                <button
                  onClick={() => handleQuery('Hi, I feel a bit nervous')}
                  className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/50 rounded-full text-green-200 text-xs transition-all duration-200"
                >
                  💬 Normal Chat
                </button>
                <button
                  onClick={() => handleQuery('I\'m lost and it\'s getting dark')}
                  className="px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/50 rounded-full text-yellow-200 text-xs transition-all duration-200"
                >
                  🌆 Safety Concern
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}