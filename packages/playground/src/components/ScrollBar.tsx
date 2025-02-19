import { CSSProperties, ReactNode } from 'react';

interface ScrollBarProps {
  children: ReactNode;
  maxHeight?: string;
}

const ScrollBar: React.FC<ScrollBarProps> = ({ children, maxHeight = '655px' }) => {
  const styles: Record<string, CSSProperties> = {
    container: {
      position: 'relative',
      width: '708px',
      background: '#bdbdbd',
      height: 'calc(100% - 40px)',
      maxHeight,
      border: '9px solid #bdbdbd',
      overflowY: 'auto',
      left: 0,
      top: 0,
    },
  };

  return (
    <>
      <style>
        {`
          .custom-scrollbar::-webkit-scrollbar {
            width: 16px;
          }

          .custom-scrollbar::-webkit-scrollbar-track {
            background: #DFDFDF;
            border: 1px solid #919B9C;
          }

          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #BDBDBD;
            border: 1px solid #919B9C;
          }

          .custom-scrollbar::-webkit-scrollbar-button:vertical:decrement {
            background-image: url("/src/assets/Top.svg");
            background-repeat: no-repeat;
            background-position: center;
            height: 16px;
            width: 16px;
            border: 1px solid #a8a8a8;
          }

          .custom-scrollbar::-webkit-scrollbar-button:vertical:increment {
            background-image: url("/src/assets/Bottom.svg");
            background-repeat: no-repeat;
            background-position: center;
            height: 16px;
            width: 16px;
            border: 1px solid #a8a8a8;
          }
        `}
      </style>
      <div style={styles.container} className="custom-scrollbar">
        {children}
      </div>
    </>
  );
};

export default ScrollBar; 