import Head from 'next/head';
import StacyInterface from '../components/StacyInterface';

export default function Home() {
  return (
    <>
      <Head>
        <title>Stacy - AI Safety Companion</title>
        <meta name="description" content="AI Safety Companion with real-time voice and emergency response" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '30px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            textAlign: 'center',
            marginBottom: '30px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>🛡️</div>
            <h1 style={{ 
              fontSize: '32px', 
              marginBottom: '10px',
              color: '#333',
              fontFamily: 'Inter, sans-serif'
            }}>
              Stacy AI Safety Companion
            </h1>
            <p style={{ 
              fontSize: '16px', 
              color: '#666',
              fontFamily: 'Inter, sans-serif'
            }}>
              Professional emergency response and safety assistance
            </p>
          </div>

          <StacyInterface />
        </div>
      </div>
    </>
  );
}
