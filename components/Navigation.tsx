interface NavigationProps {
  currentMode: 'voice' | 'text';
  onModeChange: (mode: 'voice' | 'text') => void;
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
    </div>
  );
}
