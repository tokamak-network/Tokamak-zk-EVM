// LogCard.tsx
import React from 'react';
import { summarizeHex, getValueDecimal } from '../../helpers/helpers';

type LogCardProps = {
  contractAddress: string;
  keyValue: string;
  valueDecimal: string;
  valueHex: string;
  summarizeAddress?: boolean;
};

const LogCard: React.FC<LogCardProps> = ({
  contractAddress,
  keyValue,
  valueDecimal,
  valueHex,
  summarizeAddress = false,
}) => {
  const styles = {
    logCard: {
      position: 'relative' as const,
      color: 'black',
      fontFamily: "'Tahoma', sans-serif",
      fontSize: '12px',
    },
    section: {
      marginBottom: '12px',
      textAlign: 'left' as const,
    },
    label: {
      display: 'block',
      marginBottom: '4px',
      fontSize: '14px',
      fontFamily: 'IBM Plex Mono',
      color: '#222',
      fontWeight: 500,
    },
    value: {
      display: 'block',
      padding: '5px 8px',
      background: '#F2F2F2',
      borderTop: '1px solid #5f5f5f',
      borderLeft: '1px solid #5f5f5f',
      borderRight: '1px solid #dfdfdf',
      borderBottom: '1px solid #dfdfdf',
      minHeight: '16px',
      wordBreak: 'break-all' as const,
      fontFamily: 'IBM Plex Mono',
    },
  };

  return (
    <div style={styles.logCard}>
      {contractAddress && (
        <div style={styles.section}>
          <strong style={styles.label}>Contract Address:</strong>{' '}
          <span style={styles.value} title={contractAddress}>
            {summarizeAddress ? summarizeHex(contractAddress) : contractAddress}
          </span>
        </div>
      )}
      {keyValue && (
        <div style={styles.section}>
          <strong style={styles.label}>Key:</strong>{' '}
          <span style={styles.value} title={keyValue}>
            {summarizeHex(keyValue)}
          </span>
        </div>
      )}
      <div style={styles.section}>
        <strong style={styles.label}>Value (Decimal):</strong>{' '}
        <span style={styles.value}>
          {valueDecimal || getValueDecimal(valueHex)}
        </span>
      </div>
      <div style={styles.section}>
        <strong style={styles.label}>Value (Hex):</strong>{' '}
        <span style={styles.value} title={valueHex}>
          {valueHex}
        </span>
      </div>
    </div>
  );
};

export default LogCard;
