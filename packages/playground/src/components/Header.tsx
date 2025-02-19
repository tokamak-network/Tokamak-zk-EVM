import React from 'react';

type HeaderProps = {
  logo: string;
  onLogoClick: () => void;
};

const Header: React.FC<HeaderProps> = ({ logo, onLogoClick }) => {
  const styles = {
    logoContainer: {
      position: 'fixed' as const,
      top: '40px',
      left: '40px',
      width: '334px',
      height: '29.1px',
    },
    logoImage: {
      cursor: 'pointer',
      transition: 'transform 0.2s ease, opacity 0.2s ease',
      height: '29.1px',
      width: '334px',
      ':hover': {
        opacity: 0.8,
      },
    },
    titleContainer: {
      position: 'absolute' as const,
      zIndex: 2,
      top: '280px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '736px',
    },
    mainTitle: {
      fontSize: '96px',
      lineHeight: '60px',
      marginTop: '-60px',
      textShadow: '0 1px 0 #a17510, 0 2px 0 #a17510',
      color: 'yellow',
    },
    subtitle: {
      fontSize: '96px',
      lineHeight: '60px',
      margin: 0,
      color: 'white',
      textShadow: '0 1px 0 #a17510, 0 2px 0 #a17510',
    },
  };

  return (
    <div>
      <div style={styles.logoContainer}>
        <img
          src={logo}
          alt="Synthesizer Logo"
          style={styles.logoImage}
          onClick={onLogoClick}
          onMouseOver={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseOut={e => (e.currentTarget.style.opacity = '1')}
        />
      </div>
      <div style={styles.titleContainer}>
        <h1 style={styles.mainTitle}>Synthesizer</h1>
        <h2 style={styles.subtitle}>Developer Playground</h2>
      </div>
    </div>
  );
};

export default Header;
