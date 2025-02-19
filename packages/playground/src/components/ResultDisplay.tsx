// ResultDisplay.tsx
import React, { CSSProperties, useState } from 'react';
import CustomTabSwitcher from './CustomTabSwitcher';
import LogCard from './LogCard';
import ScrollBar from './ScrollBar';
import { add0xPrefix, summarizeHex } from '../../helpers/helpers';

type ResultDisplayProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  storageLoad: any[];
  placementLogs: any[];
  storageStore: any[];
  evmContractAddress: string;
  handleDownload: (fileContent: string | null, fileName: string) => void;
  serverData: { permutation: string | null; placementInstance: string | null } | null;
};

const ResultDisplay: React.FC<ResultDisplayProps> = ({
  activeTab,
  setActiveTab,
  storageLoad,
  placementLogs,
  storageStore,
  evmContractAddress,
  handleDownload,
  serverData,
}) => {
  const [permutationHovered, setPermutationHovered] = useState(false);
  const [placementHovered, setPlacementHovered] = useState(false);

  const styles: Record<string, CSSProperties> = {
    container: {
      position: 'absolute',
      width: '728px',
      height: 'auto',
      overflow: 'visible',
      display: 'flex',
      flexDirection: 'column',
      left: '50%',
      transform: 'translateX(-50%)',
      top: '512px',
      flexGrow: 0,
      paddingBottom: '150px',
    },
    downloadButtonsContainer: {
      width: '710px',
      height: '31px',
      display: 'flex',
      justifyContent: 'flex-start',
      gap: '8px',
      padding: '8px',
      paddingTop: '3px',
      background: '#bdbdbd',
      fontFamily: 'IBM Plex Mono',
    },
    logCardInside: {
      position: 'relative',
      marginTop: '30px',
      background: '#ffffff',
      border: '1px solid #5f5f5f',
      padding: '15px',
      color: 'black',
      fontFamily: 'Tahoma, sans-serif',
      fontSize: '11px',
    },
    dataLabel: {
      position: 'absolute',
      top: '-25px',
      left: '-1px',
      fontFamily: 'IBM Plex Mono',
      backgroundColor: '#ffffff',
      letterSpacing: '0.15px',
      color: '#3b48ff',
      textAlign: 'left',
      fontWeight: 500,
      fontSize: '11px',
      padding: '4px 8px',
      borderTop: '1px solid #5f5f5f',
      borderLeft: '1px solid #5f5f5f',
      borderRight: '1px solid #5f5f5f',
      borderTopLeftRadius: '2px',
      borderTopRightRadius: '2px',
    },
    btnDownload: {
      fontFamily: 'IBM Plex Mono',
      fontSize: '13px',
      fontWeight: 'normal',
      width: '350px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      borderRadius: 0,
      borderLeft: '1px solid #a8a8a8',
      borderTop: '1px solid #a8a8a8',
      borderRight: '1px solid #5f5f5f',
      borderBottom: '1px solid #5f5f5f',
    },
    btnPermutation: {
      background: permutationHovered ? '#6600b3' : '#55008A',
      color: '#F8F8F8',
      transition: 'background 0.2s ease',
    },
    btnPlacement: {
      background: placementHovered ? '#008080' : '#008A4C',
      color: '#F8F8F8',
      transition: 'background 0.2s ease',
    },
    logCard: {
      position: 'relative',
      color: 'black',
      fontFamily: 'Tahoma, sans-serif',
      fontSize: '12px',
    },
    logDiv: {
      marginBottom: '12px',
      textAlign: 'left',
    },
    logStrong: {
      display: 'block',
      marginBottom: '4px',
      fontSize: '14px',
      fontFamily: 'IBM Plex Mono',
      color: '#222',
      fontWeight: 500,
    },
    logSpan: {
      display: 'block',
      padding: '5px 8px',
      background: '#F2F2F2',
      borderTop: '1px solid #5f5f5f',
      borderLeft: '1px solid #5f5f5f',
      borderRight: '1px solid #dfdfdf',
      borderBottom: '1px solid #dfdfdf',
      minHeight: '16px',
      wordBreak: 'break-all',
      fontFamily: 'IBM Plex Mono',
    },
  };

  const renderActiveTab = () => {
    if (activeTab === 'storageLoad') {
      return storageLoad.length ? (
        storageLoad.map((item, index) => (
          <div key={index} style={styles.logCardInside}>
            <div style={styles.dataLabel}>Data #{index + 1}</div>
            <LogCard
              contractAddress={item.contractAddress || evmContractAddress}
              keyValue={add0xPrefix(item.key)}
              valueDecimal={item.valueDecimal}
              valueHex={add0xPrefix(item.valueHex)}
            />
          </div>
        ))
      ) : (
        <p>No storage load data.</p>
      );
    } else if (activeTab === 'logs') {
      return placementLogs.length ? (
        placementLogs.map((log, index) => (
          <div key={index} style={styles.logCardInside}>
            <div style={styles.dataLabel}>Data #{index + 1}</div>
            <div style={styles.logCard}>
              <div style={styles.logDiv}>
                <strong style={styles.logStrong}>Topics:</strong>
                {log.topics.map((topic: string, idx: number) => (
                  <span
                    key={idx}
                    title={add0xPrefix(topic)}
                    style={styles.logSpan}
                  >
                    {`${idx}: ${add0xPrefix(summarizeHex(topic))}`}
                  </span>
                ))}
              </div>
              <div style={styles.logDiv}>
                <strong style={styles.logStrong}>Value (Decimal):</strong>
                <span style={styles.logSpan}>{log.valueDec.toString()}</span>
              </div>
              <div style={styles.logDiv}>
                <strong style={styles.logStrong}>Value (Hex):</strong>
                <span style={styles.logSpan} title={add0xPrefix(log.valueHex)}>
                  {add0xPrefix(log.valueHex)}
                </span>
              </div>
            </div>
          </div>
        ))
      ) : (
        <p>No logs data.</p>
      );
    } else if (activeTab === 'storageStore') {
      return storageStore.length ? (
        storageStore.map((item, index) => {
          const contractAddress = Array.isArray(item)
            ? item[0] || evmContractAddress
            : item.contractAddress || evmContractAddress;
          const key = Array.isArray(item) ? item[1] : item.key;
          const valueDecimal = item.value !== undefined ? item.value.toString() : '0';
          const valueHex = item.valueHex || '0x0';

          return (
            <div key={index} style={styles.logCardInside}>
              <div style={styles.dataLabel}>Data #{index + 1}</div>
              <LogCard
                contractAddress={contractAddress}
                keyValue={add0xPrefix(key)}
                valueDecimal={valueDecimal}
                valueHex={add0xPrefix(valueHex)}
                summarizeAddress={true}
              />
            </div>
          );
        })
      ) : (
        <p>No storage store data.</p>
      );
    }
    return null;
  };

  return (
    <div style={styles.container}>
      <CustomTabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} />
      <ScrollBar>
        {renderActiveTab()}
      </ScrollBar>
      {serverData && (
        <div style={styles.downloadButtonsContainer}>
          {serverData.permutation && (
            <button
              onClick={() => handleDownload(serverData.permutation, 'permutation.json')}
              style={{ ...styles.btnDownload, ...styles.btnPermutation }}
              onMouseEnter={() => setPermutationHovered(true)}
              onMouseLeave={() => setPermutationHovered(false)}
            >
              Download Permutation
            </button>
          )}
          {serverData.placementInstance && (
            <button
              onClick={() =>
                handleDownload(serverData.placementInstance, 'placementInstance.json')
              }
              style={{ ...styles.btnDownload, ...styles.btnPlacement }}
              onMouseEnter={() => setPlacementHovered(true)}
              onMouseLeave={() => setPlacementHovered(false)}
            >
              Download Placement Instance
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultDisplay;
