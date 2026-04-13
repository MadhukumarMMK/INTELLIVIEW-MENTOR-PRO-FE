import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './InterviewModeSelection.css';

export default function InterviewModeSelection() {
    const navigate = useNavigate();
    const location = useLocation();
    const interview = location.state?.usr;

    if (!interview) {
        navigate('/dashboard');
        return null;
    }

    const startInterview = (isAdaptive) => {
        navigate(`/interview/${interview._id}/rules`, { state: { usr: interview, isAdaptive } });
    };

    return (
        <div className="mode-selection-wrapper">
            <div className="card mode-selection-card">
                <div className="card-header">
                    <h2>Choose Your Interview Experience</h2>
                    <p>Select the type of interview you would like to practice.</p>
                </div>

                <div className="mode-options">
                    <div className="mode-option">
                        <h3>Interactive Experience Mode</h3>
                        <p>The AI acts as an intelligent tutor, dynamically choosing the next question based on your performance and confidence to create a personalized training session.</p>
                        <button className="btn btn-primary" onClick={() => startInterview(true)}>
                            Start Interactive Interview
                        </button>
                    </div>
                    <div className="mode-option">
                        <h3>General Mode</h3>
                        <p>A standard mock interview where you will be asked a pre-set number of questions in sequence. This mode is great for practicing your flow and timing.</p>
                        <button className="btn btn-secondary" onClick={() => startInterview(false)}>
                            Start General Interview
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

