import React from 'react';
import styles from './Header.module.css';

type HeaderProps = {
  logo: string;
  onLogoClick: () => void;
};

const Header: React.FC<HeaderProps> = ({ logo, onLogoClick }) => {
  return (
    <div>
      <div className={styles["logo-container"]}>
        <img
          src={logo}
          alt="Synthesizer Logo"
          className={styles["logo-image"]}
          onClick={onLogoClick}
        />
      </div>
      <div className={styles["title-container"]}>
        <h1 className={styles["main-title"]}>Synthesizer</h1>
        <h2 className={styles["subtitle"]}>Developer Playground</h2>
      </div>
    </div>
  );
};

export default Header;
