// CustomErrorTab.tsx
import React from 'react';

type CustomErrorTabProps = {
  errorMessage?: string;
  onRetry?: () => void;
};

const CustomErrorTab: React.FC<CustomErrorTabProps> = ({
  // Changed default message to use \n for line breaks.
  errorMessage = "Failed to fetch transaction bytecode.\nPlease check the transaction ID and try again.",
  onRetry,
}) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        display: 'inline-flex',
      }}
    >
      {/* Left vertical border */}
      <div style={{ width: 1, alignSelf: 'stretch', background: '#DFDFDF' }} />

      {/* Main error container */}
      <div
        style={{
          width: 500, // Wider error box
          alignSelf: 'stretch',
          background: '#BDBDBD',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          display: 'inline-flex',
        }}
      >
        {/* Header */}
        <div
          style={{
            alignSelf: 'stretch',
            height: 23,
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            display: 'flex',
          }}
        >
          <div style={{ alignSelf: 'stretch', height: 1, background: '#DFDFDF' }} />
          <div
            style={{
              width: 500,
              height: 22,
              paddingBottom: 2,
              paddingLeft: 8,
              paddingRight: 8,
              background: '#0F2058',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: 12,
              display: 'inline-flex',
            }}
          >
            <div
              style={{
                color: 'white',
                fontSize: 12,
                fontFamily: 'IBM Plex Mono',
                fontWeight: '400',
                wordWrap: 'break-word',
              }}
            >
              Error
            </div>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            alignSelf: 'stretch',
            height: 140, // Reduced height
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 16,
            paddingBottom: 16,
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: 12,
            display: 'flex',
          }}
        >
          {/* Decorative error indicator */}
          <div
            style={{
              paddingBottom: 1,
              paddingRight: 1,
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
            }}
          >
            <div
              style={{
                background: '#F2F2F2',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                display: 'flex',
              }}
            >
              <div style={{ alignSelf: 'stretch', height: 1, background: '#5F5F5F' }} />
              <div
                style={{
                  alignSelf: 'stretch',
                  height: 31,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'inline-flex',
                }}
              >
                <div style={{ width: 1, alignSelf: 'stretch', background: '#5F5F5F' }} />
                <div
                  style={{
                    justifyContent: 'flex-start',
                    alignItems: 'flex-start',
                    gap: 4,
                    display: 'flex',
                  }}
                >
                  {/* Render a series of 25 red blocks */}
                  {Array.from({ length: 25 }).map((_, idx) => (
                    <div key={`red-${idx}`} style={{ width: 12, height: 24, position: 'relative' }}>
                      <div
                        style={{
                          width: 12,
                          height: 24,
                          left: 0,
                          top: 0,
                          position: 'absolute',
                          background: '#BC2828',
                        }}
                      />
                    </div>
                  ))}
                  {/* Render 4 grey blocks */}
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`grey-${idx}`} style={{ width: 12, height: 24, position: 'relative' }}>
                      <div
                        style={{
                          width: 12,
                          height: 24,
                          left: 0,
                          top: 0,
                          position: 'absolute',
                          background: '#A5A5A5',
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: '#DFDFDF' }} />
              </div>
              <div style={{ alignSelf: 'stretch', height: 1, background: '#DFDFDF' }} />
            </div>
          </div>

          {/* Error message and retry button */}
          <div
            style={{
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              gap: 16,
              display: 'flex',
            }}
          >
            {/* Error message */}
            <div
              style={{
                alignSelf: 'stretch',
                color: '#222222',
                fontSize: 14,
                fontFamily: 'IBM Plex Mono',
                fontWeight: '400',
                lineHeight: '23px',
                wordWrap: 'break-word',
                whiteSpace: 'pre-line' // This ensures \n creates line breaks
              }}
            >
              {errorMessage}
            </div>

            {/* Retry button */}
            <div
              style={{
                alignSelf: 'stretch',
                height: 31,
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-start',
                gap: 8,
                display: 'flex',
              }}
            >
              <div
                style={{
                  alignSelf: 'stretch',
                  height: 31,
                  paddingRight: 1,
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  display: 'flex',
                }}
              >
                <div
                  style={{
                    alignSelf: 'stretch',
                    height: 31,
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    display: 'flex',
                  }}
                >
                  <div style={{ alignSelf: 'stretch', height: 1, background: '#A8A8A8' }} />
                  <div
                    style={{
                      alignSelf: 'stretch',
                      height: 28,
                      background: '#BDBDBD',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      display: 'inline-flex',
                      cursor: 'pointer',
                    }}
                    onClick={onRetry}
                  >
                    <div style={{ width: 1, alignSelf: 'stretch', background: '#A8A8A8' }} />
                    <div
                      style={{
                        flex: '1 1 0',
                        height: 19,
                        paddingTop: 2,
                        paddingLeft: 4,
                        paddingRight: 4,
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 12,
                        display: 'flex',
                      }}
                    >
                      <div
                        style={{
                          color: '#222222',
                          fontSize: 13,
                          fontFamily: 'IBM Plex Mono',
                          fontWeight: '400',
                          wordWrap: 'break-word',
                        }}
                      >
                        Retry
                      </div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: '#5F5F5F' }} />
                  </div>
                  <div style={{ alignSelf: 'stretch', height: 1, background: '#5F5F5F' }} />
                  <div style={{ alignSelf: 'stretch', height: 1 }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom border of the main container */}
        <div style={{ alignSelf: 'stretch', height: 1, background: '#5F5F5F' }} />
      </div>

      {/* Right vertical border */}
      <div style={{ width: 1, alignSelf: 'stretch', background: '#5F5F5F' }} />
    </div>
  );
};

export default CustomErrorTab;
