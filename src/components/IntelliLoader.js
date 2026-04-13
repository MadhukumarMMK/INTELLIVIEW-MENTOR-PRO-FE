import React from "react";
import "./IntelliLoader.css";

export default function IntelliLoader({ message = "Loading", size = "default" }) {
  return (
    <div className={`intelli-loader-wrapper ${size}`}>
      <div className="intelli-loader-content">
        <div className="intelli-logo-pulse">
          <span className="intelli-logo-text">IV</span>
          <div className="intelli-ring"></div>
        </div>
        <div className="intelli-wave-bar">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <p className="intelli-loader-msg">{message}</p>
      </div>
    </div>
  );
}
