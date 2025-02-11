import React, { useEffect, useState } from 'react';
import styles from './CustomLoading.module.css';

const CustomLoading: React.FC = () => {
  const [activeBoxes, setActiveBoxes] = useState(0);
  const totalBoxes = 24;

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBoxes((prev) => (prev < totalBoxes ? prev + 1 : 0));
    }, 75);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.horizontalAl}>
      <div className={styles.borderLeft} />
      <div className={styles.vertialAl}>
        <div className={styles.modalHeader}>
          <div className={styles.borderTop} />
          <div className={styles.headerAl}>
            <div className={styles.modalTitle}>Loading...</div>
          </div>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.progressbarprogressbar}>
            <div className={styles.vertialAl1}>
              <div className={styles.borderTop1} />
              <div className={styles.horizontalAl1}>
                <div className={styles.borderLeft1} />
                <div className={styles.labelWrapper}>
                  {Array.from({ length: totalBoxes }).map((_, idx) => (
                    <div key={idx} className={styles.elementsprogressBarlink}>
                      <div className={idx < activeBoxes ? styles.rect : styles.rect19} />
                    </div>
                  ))}
                </div>
                <div className={styles.borderLeft} />
              </div>
              <div className={styles.borderTop} />
            </div>
          </div>
          <div className={styles.bodyTextAl}>
            <div className={styles.processCompleteFilesContainer}>
              <p className={styles.processComplete}>Loading, please wait...</p>
            </div>
            <b className={styles.modalHeading}>Loading</b>
          </div>
        </div>
        <div className={styles.borderTop1} />
      </div>
      <div className={styles.borderLeft1} />
    </div>
  );
};

export default CustomLoading;
