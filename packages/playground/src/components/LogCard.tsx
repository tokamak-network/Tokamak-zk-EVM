// LogCard.tsx
import React from 'react';
import { summarizeHex, getValueDecimal, add0xPrefix } from '../../helpers/helpers';

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
}) => (
  <div className="log-card">
    {contractAddress && (
      <div>
        <strong>Contract Address:</strong>{' '}
        <span title={contractAddress}>
          {summarizeAddress ? summarizeHex(contractAddress) : contractAddress}
        </span>
      </div>
    )}
    {keyValue && (
      <div>
        <strong>Key:</strong>{' '}
        <span title={keyValue}>{summarizeHex(keyValue)}</span>
      </div>
    )}
    <div>
      <strong>Value (Decimal):</strong>{' '}
      <span>{valueDecimal || getValueDecimal(valueHex)}</span>
    </div>
    <div>
      <strong>Value (Hex):</strong>{' '}
      <span title={valueHex}>{valueHex}</span>
    </div>
  </div>
);

export default LogCard;
