interface NavigationProps {
  currentMode: 'voice' | 'text' | 'stealth';
  onModeChange: (mode: 'voice' | 'text' | 'stealth') => void;
}

export default function Navigation({ currentMode, onModeChange }: NavigationProps) {
  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '20px',
      display: 'flex',
      gap: '10px',
      zIndex: 1000
    }}>
      <button 
        onClick={() => onModeChange('voice')}
        style={{
          padding: '8px 16px',
          background: currentMode === 'voice' ? '#007aff' : 'rgba(255, 255, 255, 0.1)',
          border: `1px solid ${currentMode === 'voice' ? '#007aff' : 'rgba(255, 255, 255, 0.2)'}`,
          borderRadius: '20px',
          color: 'white',
          fontSize: '12px',
          fontWeight: 500,
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s ease',
          cursor: 'pointer'
        }}
      >
        🎤 Voice
      </button>
      
      <button 
        onClick={() => onModeChange('text')}
        style={{
          padding: '8px 16px',
          background: currentMode === 'text' ? '#007aff' : 'rgba(255, 255, 255, 0.1)',
          border: `1px solid ${currentMode === 'text' ? '#007aff' : 'rgba(255, 255, 255, 0.2)'}`,
          borderRadius: '20px',
          color: 'white',
          fontSize: '12px',
          fontWeight: 500,
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s ease',
          cursor: 'pointer'
        }}
      >
        💬 Text
      </button>
      
      <button 
        onClick={() => onModeChange('stealth')}
        style={{
          padding: '8px 16px',
          background: currentMode === 'stealth' ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
          border: `1px solid ${currentMode === 'stealth' ? '#ef4444' : '#ef4444'}`,
          borderRadius: '20px',
          color: currentMode === 'stealth' ? 'white' : '#ef4444',
          fontSize: '12px',
          fontWeight: 500,
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s ease',
          cursor: 'pointer'
        }}
      >
        🤫 Stealth
      </button>
    </div>
  );
}
