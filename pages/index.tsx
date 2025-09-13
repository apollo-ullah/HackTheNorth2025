import Head from 'next/head';
import CallForm from '../components/CallForm';
import AssistantForm from '../components/AssistantForm';
import ConfigStatus from '../components/ConfigStatus';
import StacyInterface from '../components/StacyInterface';

export default function Home() {
  const handleCallInitiated = (callId: string) => {
    console.log('Call initiated with ID:', callId);
    // You could add additional logic here, like tracking the call
  };

  const handleAssistantCreated = (assistantId: string) => {
    console.log('Assistant created with ID:', assistantId);
    // You could add additional logic here, like updating the UI
  };

  return (
    <>
      <Head>
        <title>VAPI Voice Agent</title>
        <meta name="description" content="Voice agent for calling humans using VAPI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="container">
        <h1>🎙️ VAPI Voice Agent</h1>
        
        <StacyInterface />
        <CallForm onCallInitiated={handleCallInitiated} />
        <AssistantForm onAssistantCreated={handleAssistantCreated} />
        <ConfigStatus />
      </div>

      <style jsx global>{`
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f5f5f5;
        }

        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        h1 {
          color: #333;
          text-align: center;
          margin-bottom: 30px;
        }

        .section {
          margin-bottom: 30px;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background-color: #fafafa;
        }

        .section h2 {
          color: #555;
          margin-top: 0;
        }

        input,
        textarea,
        button {
          width: 100%;
          padding: 12px;
          margin: 8px 0;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 16px;
          box-sizing: border-box;
        }

        button {
          background-color: #007bff;
          color: white;
          border: none;
          cursor: pointer;
          font-weight: bold;
        }

        button:hover:not(:disabled) {
          background-color: #0056b3;
        }

        button:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }

        .status {
          margin-top: 15px;
          padding: 10px;
          border-radius: 4px;
        }

        .status.success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .status.error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .status.warning {
          background-color: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
        }

        textarea {
          resize: vertical;
          min-height: 60px;
        }

        @media (max-width: 768px) {
          .container {
            padding: 15px;
            margin: 10px;
          }
          
          .section {
            padding: 15px;
          }
        }
      `}</style>
    </>
  );
}
