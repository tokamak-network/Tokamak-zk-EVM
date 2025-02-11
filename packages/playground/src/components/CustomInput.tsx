import { FunctionComponent, useState } from 'react';
import styles from './CustomInput.module.css';

interface CustomInputProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}

const CustomInput: FunctionComponent<CustomInputProps> = ({
  value = '',
  onChange = () => {},
  disabled = false,
  error = false,
}) => {
  const [active, setActive] = useState(false);

  // Determine container classes based on state
  const containerClasses = [
    styles.property1hover,
    disabled
      ? styles.property1disable
      : error
      ? styles.property1error
      : active
      ? styles.property1active
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses}>
      <div className={styles.borderTop} />
      <div className={styles.horizontalAl}>
        <div className={styles.borderLeft} />
        <div className={styles.labelWrapper}>
          <input
            type="text"
            className={styles.inputText}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={active ? "" : "Enter Transaction ID"}
            disabled={disabled}
            onFocus={() => setActive(true)}
            onBlur={() => setActive(false)}
          />
        </div>
        <div className={styles.borderRight} />
      </div>
      <div className={styles.borderBottom} />
    </div>
  );
};

export default CustomInput;
