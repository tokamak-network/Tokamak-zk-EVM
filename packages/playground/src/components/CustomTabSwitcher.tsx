// CustomTabSwitcher.tsx
import React from 'react';

interface CustomTabSwitcherProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const CustomTabSwitcher: React.FC<CustomTabSwitcherProps> = ({ activeTab, setActiveTab }) => {
  // Helper function to render a single tab.
  const renderTab = (tabKey: string, label: string, isActive: boolean) => {
    if (isActive) {
      return (
        <div
          onClick={() => setActiveTab(tabKey)}
          style={{
            cursor: 'pointer',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            display: 'inline-flex',
          }}
        >
          <div
            style={{
              background: '#BDBDBD',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
            }}
          >
            <div style={{ alignSelf: 'stretch', height: 1, background: '#DFDFDF' }} />
            <div
              style={{
                height: 40,
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                display: 'inline-flex',
              }}
            >
              <div style={{ width: 1, alignSelf: 'stretch', background: '#DFDFDF' }} />
              <div
                style={{
                  paddingBottom: 2,
                  paddingLeft: 8,
                  paddingRight: 8,
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  display: 'flex',
                }}
              >
                <div
                  style={{
                    color: '#222222',
                    fontSize: 16,
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500',
                    wordWrap: 'break-word',
                  }}
                >
                  {label}
                </div>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: '#5F5F5F' }} />
            </div>
            <div style={{ alignSelf: 'stretch', height: 1, background: '#BDBDBD' }} />
            <div style={{ alignSelf: 'stretch', height: 1, background: '#BDBDBD' }} />
          </div>
        </div>
      );
    } else {
      return (
        <div
          onClick={() => setActiveTab(tabKey)}
          style={{
            cursor: 'pointer',
            borderTopLeftRadius: 2,
            overflow: 'hidden',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            display: 'inline-flex',
          }}
        >
          <div
            style={{
              background: '#BDBDBD',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
            }}
          >
            <div style={{ alignSelf: 'stretch', height: 1, background: '#DFDFDF' }} />
            <div
              style={{
                alignSelf: 'stretch',
                height: 36,
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                display: 'inline-flex',
              }}
            >
              <div style={{ width: 1, alignSelf: 'stretch', background: '#DFDFDF' }} />
              <div
                style={{
                  paddingBottom: 2,
                  paddingLeft: 8,
                  paddingRight: 8,
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                  display: 'flex',
                }}
              >
                <div
                  style={{
                    color: '#4A4A4A',
                    fontSize: 16,
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500',
                    wordWrap: 'break-word',
                  }}
                >
                  {label}
                </div>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: '#5F5F5F' }} />
            </div>
            <div style={{ alignSelf: 'stretch', height: 1, background: '#5F5F5F' }} />
            <div style={{ alignSelf: 'stretch', height: 1, background: '#DFDFDF' }} />
          </div>
        </div>
      );
    }
  };

  return (
    <div
      style={{
        width: '100%',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        display: 'inline-flex',
      }}
    >
      {renderTab('storageLoad', 'Storage Load', activeTab === 'storageLoad')}
      {renderTab('logs', 'Logs', activeTab === 'logs')}
      {renderTab('storageStore', 'Storage Store', activeTab === 'storageStore')}
    </div>
  );
};

export default CustomTabSwitcher;
