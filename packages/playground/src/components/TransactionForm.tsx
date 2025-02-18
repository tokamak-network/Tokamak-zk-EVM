// TransactionForm.tsx
import React from 'react';
import CustomInput from './CustomInput';
import saveIcon from '../assets/save.svg';
import styles from './TransactionForm.module.css';

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
    <div className={styles.inputButtonContainer}>
      <CustomInput
        value={transactionId}
        onChange={setTransactionId}
        disabled={isProcessing}
        error={error}
      />
      <button
        onClick={handleSubmit}
        className={`${styles.btnProcess} ${isProcessing ? styles.disabled : ''} ${error ? styles.error : ''}`}
        disabled={isProcessing}
      >
        <span className={styles.btnIcon}>
          <img src={saveIcon} alt="icon" />
        </span>
        <span className={styles.btnText}>Process</span>
      </button>
    </div>
  );
};

export default TransactionForm;
