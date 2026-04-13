import React, { useEffect } from 'react';
import './Splash.css';

export default function Splash({ onComplete }) {
  useEffect(() => {
    // Show the splash screen for exactly 1.5 seconds, then trigger the callback
    const timer = setTimeout(() => onComplete(), 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="splash-wrapper">
      <div className="splash-content">
        <div className="splash-logo">IV</div>
        <h1 className="splash-brand">IntelliView</h1>
        <div className="splash-loader"></div>
      </div>
    </div>
  );
}