import { FunctionComponent, useState, CSSProperties } from 'react';

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
  const [isHovered, setIsHovered] = useState(false);

  // Base styles
  const styles: Record<string, CSSProperties> = {
    container: {
      position: 'relative' as const,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      textAlign: 'left',
      fontSize: '24px',
      fontFamily: 'IBM Plex Mono',
      color: error ? '#a01313' : disabled ? '#444' : '#999',
    },
    borderTop: {
      alignSelf: 'stretch',
      position: 'relative',
      backgroundColor: '#a8a8a8',
      height: '1px',
    },
    horizontalAl: {
      width: '550px',
      backgroundColor: disabled ? '#d0d0d7' : '#f7f7f7',
      height: isHovered && !disabled && !active ? '58px' : '57px',
      display: 'flex',
      flexDirection: 'row' as const,
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    },
    borderLeft: {
      alignSelf: 'stretch',
      width: '1px',
      position: 'relative',
      backgroundColor: '#a8a8a8',
    },
    labelWrapper: {
      flex: 1,
      display: 'flex',
      flexDirection: 'row' as const,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      padding: '0px 0px 2px',
    },
    input: {
      position: 'relative',
      width: '100%',
      height: '100%',
      border: 'none',
      background: 'transparent',
      padding: '0 16px',
      fontFamily: 'IBM Plex Mono',
      fontSize: '24px',
      outline: 'none',
      color: error ? '#a01313' : active || value ? '#222222' : '#999999',
    },
    borderRight: {
      alignSelf: 'stretch',
      width: '1px',
      position: 'relative',
      backgroundColor: '#5f5f5f',
    },
    borderBottom: {
      alignSelf: 'stretch',
      position: 'relative',
      backgroundColor: '#5f5f5f',
      height: '1px',
    },
  };

  return (
    <>
      <style>
        {`
          input::placeholder {
            color: ${error ? '#a01313' : '#999999'} !important;
            opacity: 1;
          }
        `}
      </style>
      <div 
        style={styles.container}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={styles.borderTop} />
        <div style={styles.horizontalAl}>
          <div style={styles.borderLeft} />
          <div style={styles.labelWrapper}>
            <input
              type="text"
              style={styles.input}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Enter Transaction ID"
              disabled={disabled}
              onFocus={() => setActive(true)}
              onBlur={() => setActive(false)}
            />
          </div>
          <div style={styles.borderRight} />
        </div>
        <div style={styles.borderBottom} />
      </div>
    </>
  );
};

export default CustomInput;
