import Head from 'next/head';
import StacyMainInterface from '../components/StacyMainInterface';

export default function Home() {

  return (
    <>
      <Head>
        <title>VAPI Voice Agent</title>
        <meta name="description" content="Voice agent for calling humans using VAPI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <StacyMainInterface />

      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: #333;
        }

        html, body, #__next {
          height: 100%;
        }
      `}</style>
    </>
  );
}
