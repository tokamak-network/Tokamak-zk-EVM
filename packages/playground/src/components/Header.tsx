// Header.tsx
import React from 'react';

type HeaderProps = {
  logo: string;
  onLogoClick: () => void;
};

const Header: React.FC<HeaderProps> = ({ logo, onLogoClick }) => {
  return (
    <div>
      <div className="logo-container">
        <img
          src={logo}
          alt="Synthesizer Logo"
          className="logo-image"
          onClick={onLogoClick}
        />
      </div>
      <div className="title-container">
        <h1 className="main-title">Synthesizer</h1>
        <h2 className="subtitle">Developer Playground</h2>
      </div>
    </div>
  );
};

export default Header;
