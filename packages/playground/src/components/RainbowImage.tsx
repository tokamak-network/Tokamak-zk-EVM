import { FunctionComponent, CSSProperties } from 'react';

const RainbowImage: FunctionComponent = () => {
  const styles: CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    objectFit: 'contain',
    zIndex: 1000,
    pointerEvents: 'none',
    marginBottom: '44px',
  };

  return <img style={styles} alt="" src="./src/assets/rainbow.svg" />;
};

export default RainbowImage;
