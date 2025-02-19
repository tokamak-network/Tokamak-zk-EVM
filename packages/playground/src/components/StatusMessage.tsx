import React, { CSSProperties } from 'react';

interface StatusMessageProps {
  message: string;
  type: 'error' | 'loading';
}

const StatusMessage: React.FC<StatusMessageProps> = ({ message, type }) => {
  const styles: Record<string, CSSProperties> = {
    statusMessage: {
      width: '80%',
      maxWidth: '600px',
      margin: '20px auto',
      padding: 0,
      fontFamily: "'Press Start 2P', cursive",
      fontSize: '0.8rem',
      textAlign: 'center',
      position: 'relative',
      ...(type === 'error' && {
        background: '#000033',
        border: '4px solid #4466ff',
        color: '#99aaff',
        boxShadow: 'inset 0 0 10px rgba(68, 102, 255, 0.3), 0 0 20px rgba(68, 102, 255, 0.2)',
      }),
    },
    errorHeader: {
      background: 'linear-gradient(to bottom, #0000ac, #333344)',
      color: '#ff2727',
      padding: '10px',
      fontSize: '1rem',
      margin: 0,
      borderBottom: '4px solid #4466ff',
    },
    errorContent: {
      fontSize: '50px',
      padding: '10px',
      color: '#ccccdd',
      textShadow: '2px 2px 0px rgba(0, 0, 0, 0.5)',
      borderTop: '2px solid #333366',
    },
    loadingSpinnerContainer: {
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      margin: '20px 0',
    },
    loadingSpinner: {
      width: '64px',
      height: '64px',
      border: '8px solid #000033',
      borderTop: '8px solid #00ffff',
      animation: 'spin 1s steps(8) infinite',
      position: 'relative',
      '::before': {
        content: '""',
        position: 'absolute',
        top: '-8px',
        left: '-8px',
        right: '-8px',
        bottom: '-8px',
        border: '4px solid #00ffff',
        animation: 'glow 1.5s ease-in-out infinite',
      },
    },
  };

  return (
    <>
      <style>
        {`
          @keyframes spin {
            to { 
              transform: rotate(360deg);
            }
          }

          @keyframes glow {
            0%, 100% {
              box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
            }
            50% {
              box-shadow: 0 0 20px rgba(0, 255, 255, 0.6);
            }
          }
        `}
      </style>
      <div style={styles.statusMessage}>
        {type === 'error' ? (
          <>
            <div style={styles.errorHeader}>ERROR!</div>
            <div style={styles.errorContent}>{message}</div>
          </>
        ) : (
          <div style={styles.loadingSpinnerContainer}>
            <div style={styles.loadingSpinner} />
          </div>
        )}
      </div>
    </>
  );
};

export default StatusMessage; 