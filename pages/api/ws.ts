import { NextApiRequest, NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

// WebSocket handler for real-time voice communication
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (res.socket.server.io) {
    console.log('Socket.IO already initialized');
    res.end();
    return;
  }

  console.log('Initializing Socket.IO for Stacy real-time voice...');

  const httpServer: HTTPServer = res.socket.server as any;
  const io = new SocketIOServer(httpServer, {
    path: '/api/socketio',
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log('New Stacy client connected:', socket.id);

    socket.on('start_conversation', async (data) => {
      console.log('Starting conversation for:', socket.id);
      
      // Initialize OpenAI Realtime connection
      // This would connect to your existing OpenAI Realtime API setup
      socket.emit('conversation_started', {
        message: 'Connected to Stacy AI. Voice mode active.',
        sessionId: socket.id
      });
    });

    socket.on('audio_data', async (data) => {
      // Process audio data with OpenAI Realtime API
      // This would integrate with your existing audio processing
      console.log('Received audio data from:', socket.id);
      
      // For now, simulate processing
      setTimeout(() => {
        socket.emit('transcription', {
          transcript: 'I think someone is following me'
        });
        
        setTimeout(() => {
          socket.emit('ai_response', {
            message: "I understand you're concerned about someone following you. That's important to report. Are you in a safe place where you can speak freely right now?",
            audioResponse: null // Would include audio data from OpenAI
          });
        }, 500);
      }, 1000);
    });

    socket.on('text_message', async (data) => {
      console.log('Text message from:', socket.id, data.message);
      
      // Process with your existing chat API
      try {
        const response = await fetch(`http://localhost:3000/api/stacy/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: data.message,
            caseFile: data.caseFile,
            location: data.location,
            mode: 'text'
          })
        });
        
        const result = await response.json();
        
        socket.emit('ai_response', {
          message: result.reply,
          caseFile: result.newCaseFile,
          actions: result.actions,
          quickReplies: result.quickReplies
        });
        
      } catch (error) {
        console.error('Error processing text message:', error);
        socket.emit('error', { message: 'Failed to process message' });
      }
    });

    socket.on('disconnect', () => {
      console.log('Stacy client disconnected:', socket.id);
    });
  });

  res.end();
}
