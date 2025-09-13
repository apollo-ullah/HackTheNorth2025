import Head from 'next/head';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Redirect to the static Stacy interface to avoid hydration issues
    window.location.href = '/index.html';
  }, []);

  return (
    <>
      <Head>
        <title>Stacy - AI Safety Companion</title>
        <meta name="description" content="AI Safety Companion with real-time voice and emergency response" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🛡️</div>
          <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Stacy AI Safety Companion</h1>
          <p style={{ fontSize: '18px', opacity: 0.9 }}>Redirecting to Stacy interface...</p>
        </div>
      </div>
    </>
  );
}
