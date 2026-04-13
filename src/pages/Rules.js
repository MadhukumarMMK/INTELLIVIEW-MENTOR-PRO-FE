import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./Rules.css"; // Import the new stylesheet

export default function Rules() {
  const location = useLocation();
  const navigate = useNavigate();
  const interview = location.state?.usr;
  const isAdaptive = location.state?.isAdaptive ?? true; // default to adaptive if not from mode
  const [loading, setLoading] = useState(true);

  // Redirect if no interview state is passed from the dashboard
  useEffect(() => {
    if (!interview) {
      navigate("/dashboard");
    } else {
      setLoading(false);
    }
  }, [interview, navigate]);

  if (loading) {
    return (
      <div className="rules-wrapper status-container">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="rules-wrapper">
      <div className="card rules-card">
        <div className="card-header">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
          </svg>
          <h2>Before You Begin</h2>
          <p>Please review the interview details and instructions below.</p>
        </div>

        <div className="details-box">
          <h4>Interview Details</h4>
          <div className="details-grid">
            <p><strong>Technology:</strong> {interview.technology_name || interview.technology}</p>
            <p><strong>Level:</strong> <span className={`level-badge level-${interview.level}`}>{interview.level}</span></p>
            <div className="details-tags">
                <strong>Modules:</strong>
                <div className="tags-container">
                    {(interview.module_names && interview.module_names.length > 0) ? interview.module_names.map((name, i) => <span key={i} className="tag">{name}</span>) : <span className="tag">General</span>}
                </div>
            </div>
            <div className="details-tags">
                <strong>Topics:</strong>
                <div className="tags-container">
                    {(interview.topic_names && interview.topic_names.length > 0) ? interview.topic_names.map((name, i) => <span key={i} className="tag">{name}</span>) : <span className="tag">General</span>}
                </div>
            </div>
          </div>
        </div>

        <div className="rules-list">
          <h4>Instructions</h4>
          <ul>
            <li>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M7 4a1 1 0 011-1h4a1 1 0 011 1v2h-1V5H9v1H7V4zM6 8a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H7z" /></svg>
              <span>Ensure your microphone is enabled and working correctly.</span>
            </li>
            <li>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.49 2.54a.75.75 0 01.444.92l-.123.492a.75.75 0 01-.92.445l-.493-.123a.75.75 0 01-.444-.92l.123-.492a.75.75 0 01.92-.445zM12.96 4.04a.75.75 0 01.92-.445l.493.123a.75.75 0 01.444.92l-.123.492a.75.75 0 01-.92.445l-.493-.123a.75.75 0 01-.444-.92zM10 2.25a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.04 4.04a.75.75 0 01.445.92l-.123.492a.75.75 0 01-.92.445l-.493-.123a.75.75 0 01-.444-.92l.123-.492a.75.75 0 01.92-.445zM5.54 6.96a.75.75 0 01.92.445l.123.492a.75.75 0 01-.444.92l-.493.123a.75.75 0 01-.92-.445l-.123-.492a.75.75 0 01.444-.92zM15.96 7.04a.75.75 0 01.445-.92l.493-.123a.75.75 0 01.92.445l.123.492a.75.75 0 01-.444.92l-.493.123a.75.75 0 01-.92-.445zM4.75 9.25a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75zM15.25 9.25a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75zM8.25 12.25a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75zM11.75 12.25a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75z" clipRule="evenodd" /></svg>
              <span>Find a quiet and distraction-free environment.</span>
            </li>
            <li>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" /></svg>
              <span>Each question is timed. The interview will proceed automatically.</span>
            </li>
            <li>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0V8.5a.75.75 0 00-1.5 0v4.75zM10 6a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
              <span>Once started, the interview cannot be paused. Ensure you are ready.</span>
            </li>
          </ul>
        </div>
        <div className="cta-section">
          <p>All the best!</p>
          <button
            onClick={() => navigate(`/interview/${interview._id}`, { state: { usr: interview, isAdaptive } })}
            className="btn-start-interview"
          >
            Start Interview
          </button>
        </div>
      </div>
    </div>
  );
}

