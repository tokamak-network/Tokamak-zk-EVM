import React, { useEffect, useState } from 'react';

const CustomLoading: React.FC = () => {
  const [activeBoxes, setActiveBoxes] = useState(0);
  const totalBoxes = 24;

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBoxes((prev) => (prev < totalBoxes ? prev + 1 : 0));
    }, 75);
    return () => clearInterval(interval);
  }, []);

  const styles = {
    loadingContainer: {
      position: 'absolute' as const,
      top: '512px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2,
    },
    horizontalAl: {
      position: 'relative' as const,
      width: '100%',
      display: 'flex',
      flexDirection: 'row' as const,
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'left' as const,
      fontSize: '12px',
      color: '#fff',
      fontFamily: 'IBM Plex Mono',
    },
    borderLeft: {
      alignSelf: 'stretch',
      width: '1px',
      position: 'relative' as const,
      backgroundColor: '#dfdfdf',
    },
    vertialAl: {
      alignSelf: 'stretch',
      width: '400px',
      backgroundColor: '#bdbdbd',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    },
    modalHeader: {
      alignSelf: 'stretch',
      height: '23px',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    },
    borderTop: {
      alignSelf: 'stretch',
      position: 'relative' as const,
      backgroundColor: '#dfdfdf',
      height: '1px',
    },
    headerAl: {
      width: '400px',
      backgroundColor: '#0f2058',
      height: '22px',
      display: 'flex',
      flexDirection: 'row' as const,
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '0px 8px 2px',
      boxSizing: 'border-box' as const,
    },
    modalTitle: {
      position: 'relative' as const,
    },
    modalBody: {
      alignSelf: 'stretch',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      padding: '16px 8px',
      gap: '12px',
      fontSize: '14px',
      color: '#222',
    },
    progressBar: {
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0px 1px 1px 0px',
    },
    progressBarInner: {
      backgroundColor: '#f2f2f2',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
    },
    borderTop1: {
      alignSelf: 'stretch',
      position: 'relative' as const,
      backgroundColor: '#5f5f5f',
      height: '1px',
    },
    horizontalAl1: {
      alignSelf: 'stretch',
      height: '31px',
      display: 'flex',
      flexDirection: 'row' as const,
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      width: '385px',
      margin: '0 auto',
    },
    borderLeft1: {
      alignSelf: 'stretch',
      width: '1px',
      position: 'relative' as const,
      backgroundColor: '#5f5f5f',
    },
    labelWrapper: {
      display: 'flex',
      flexDirection: 'row' as const,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: '4px',
    },
    progressBox: {
      width: '12px',
      position: 'relative' as const,
      height: '24px',
    },
    progressBoxInner: (isActive: boolean) => ({
      position: 'absolute' as const,
      height: '100%',
      width: '100%',
      top: '0%',
      right: '0%',
      bottom: '0%',
      left: '0%',
      backgroundColor: isActive ? '#2a72e5' : '#a5a5a5',
    }),
    bodyTextAl: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: '16px',
    },
    processText: {
      alignSelf: 'stretch',
      position: 'relative' as const,
      lineHeight: '23px',
      margin: 0,
    },
  };

  return (
    <div style={styles.loadingContainer}>
      <div style={styles.horizontalAl}>
        <div style={styles.borderLeft} />
        <div style={styles.vertialAl}>
          <div style={styles.modalHeader}>
            <div style={styles.borderTop} />
            <div style={styles.headerAl}>
              <div style={styles.modalTitle}>Loading...</div>
            </div>
          </div>
          <div style={styles.modalBody}>
            <div style={styles.progressBar}>
              <div style={styles.progressBarInner}>
                <div style={styles.borderTop1} />
                <div style={styles.horizontalAl1}>
                  <div style={styles.borderLeft1} />
                  <div style={styles.labelWrapper}>
                    {Array.from({ length: totalBoxes }).map((_, idx) => (
                      <div key={idx} style={styles.progressBox}>
                        <div style={styles.progressBoxInner(idx < activeBoxes)} />
                      </div>
                    ))}
                  </div>
                  <div style={styles.borderLeft} />
                </div>
                <div style={styles.borderTop} />
              </div>
            </div>
            <div style={styles.bodyTextAl}>
              <p style={styles.processText}>Loading, please wait...</p>
            </div>
          </div>
          <div style={styles.borderTop1} />
        </div>
        <div style={styles.borderLeft1} />
      </div>
    </div>
  );
};

export default CustomLoading;

