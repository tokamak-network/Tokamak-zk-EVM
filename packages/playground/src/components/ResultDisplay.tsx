// ResultDisplay.tsx
import React from 'react';
import CustomTabSwitcher from './CustomTabSwitcher';
import LogCard from './LogCard';
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
  const renderActiveTab = () => {
    if (activeTab === 'storageLoad') {
      return storageLoad.length ? (
        storageLoad.map((item, index) => (
          <div key={index} className="log-card-inside">
            <div className="data-label">Data #{index + 1}</div>
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
          <div key={index} className="log-card-inside">
            <div className="data-label">Data #{index + 1}</div>
            <div className="log-card">
              <div>
                <strong>Topics:</strong>
                {log.topics.map((topic: string, idx: number) => (
                  <span
                    key={idx}
                    title={add0xPrefix(topic)}
                    style={{ display: 'block', marginBottom: '4px' }}
                  >
                    {`${idx}: ${add0xPrefix(summarizeHex(topic))}`}
                  </span>
                ))}
              </div>
              <div>
                <strong>Value (Decimal):</strong>
                <span>{log.valueDec.toString()}</span>
              </div>
              <div>
                <strong>Value (Hex):</strong>
                <span title={add0xPrefix(log.valueHex)}>
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
            <div key={index} className="log-card-inside">
              <div className="data-label">Data #{index + 1}</div>
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
    <div className="big-box">
      <CustomTabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="fixed-box">{renderActiveTab()}</div>
      {serverData && (
        <div className="download-buttons-container">
          {serverData.permutation && (
            <button
              onClick={() => handleDownload(serverData.permutation, 'permutation.json')}
              className="btn-download btn-permutation"
            >
              Download Permutation
            </button>
          )}
          {serverData.placementInstance && (
            <button
              onClick={() =>
                handleDownload(serverData.placementInstance, 'placementInstance.json')
              }
              className="btn-download btn-placement"
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
