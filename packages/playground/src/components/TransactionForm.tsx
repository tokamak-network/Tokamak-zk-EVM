// TransactionForm.tsx
import React from 'react';
import CustomInput from './CustomInput';
import saveIcon from '/save.svg'; // Adjust path if necessary

type TransactionFormProps = {
  transactionId: string;
  setTransactionId: (value: string) => void;
  handleSubmit: () => void;
  isProcessing: boolean;
  error?: boolean;
};

const TransactionForm: React.FC<TransactionFormProps> = ({
  transactionId,
  setTransactionId,
  handleSubmit,
  isProcessing,
  error = false,
}) => {
  return (
    <div className="input-button-container">
      <CustomInput
        value={transactionId}
        onChange={setTransactionId}
        disabled={isProcessing}
        error={error}
      />
      <button
        onClick={handleSubmit}
        className={`btn-process ${isProcessing ? 'disabled' : ''} ${error ? 'error' : ''}`}
        disabled={isProcessing}
      >
        <span className="btn-icon">
          <img src={saveIcon} alt="icon" />
        </span>
        <span className="btn-text">Process</span>
      </button>
    </div>
  );
};

export default TransactionForm;
