import { FunctionComponent, CSSProperties } from 'react';

const Group: FunctionComponent = () => {
  const styles: CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    width: '100%',
    maxWidth: '100%',
    objectFit: 'contain',
    zIndex: 1000,
    pointerEvents: 'none',
  };

  return <img style={styles} alt="" src="./src/assets/Stars.svg" />;
};

export default Group;
