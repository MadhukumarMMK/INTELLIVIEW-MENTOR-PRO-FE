import React, { useEffect, useState } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import "./Dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const notify = useNotification();
  const [user] = useState(JSON.parse(localStorage.getItem("user") || "{}"));
  const [history, setHistory] = useState([]);
  const [activeInterviewsCount, setActiveInterviewsCount] = useState(0);
  const [realStats, setRealStats] = useState({
    totalInterviews: 0,
    avgAccuracy: 0,
    bestScore: 0,
    confidenceAvg: 0
  });
  const [maxSlots, setMaxSlots] = useState(6);

  useEffect(() => {
  const fetchDashboardData = async () => {
    try {
      // Fetch dynamic slot limit from admin settings
      try {
        const settingsRes = await axios.get("/admin/settings");
        if (settingsRes.data?.max_interviews) setMaxSlots(settingsRes.data.max_interviews);
      } catch (_) {}

      const res = await axios.get(`/interviews/history/${user.roll_no}`);
      const data = res.data;

      setHistory(data);
      // Only completed interviews (status=2) count toward the interview limit
      setActiveInterviewsCount(data.filter(i => i.status === 2).length);

      // Filter for completed interviews only (status 2) for stats
      const completed = data.filter(i => i.status === 2);

      if (completed.length > 0) {
        // 1. Average Accuracy — from overall_score of completed interviews
        const totalAcc = completed.reduce((acc, curr) => acc + (curr.overall_score || 0), 0);

        // 2. Best Score — only from completed interviews
        const best = Math.max(...completed.map(i => i.overall_score || 0));

        // 3. Average Confidence — from nested emotions.emotions.neutral
        const withEmotions = completed.filter(i => i.emotions?.emotions?.neutral != null);
        const totalConf = withEmotions.reduce((acc, curr) => acc + (curr.emotions.emotions.neutral * 100), 0);

        setRealStats({
          totalInterviews: completed.length,
          avgAccuracy: Math.round(totalAcc / completed.length),
          bestScore: Math.round(best),
          confidenceAvg: withEmotions.length > 0 ? Math.round(totalConf / withEmotions.length) : 0
        });
      }
    } catch (err) {
      console.error("Dashboard Sync Error:", err); //
    }
  };
  if (user.roll_no) fetchDashboardData(); //
}, [user.roll_no]);

  const handleStartInterview = (mode) => {
    // Goal #14: Enforce Admin Limits 
    if (activeInterviewsCount >= maxSlots) {
      notify.confirm("You have reached your interview limit. Delete an old interview from My Reports to free a spot.\n\nGo to My Reports now?", "Limit Reached").then(ok => {
        if (ok) navigate("/myreports");
      });
      return;
    }
    navigate("/interview-setup", { state: { mode } });
  };

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-header-row">
        <div>
          <h1 className="greeting-text">Good morning, {user.first_name || "Developer"}</h1>
          <p className="subtitle-text">Ready for your next mock interview?</p>
        </div>
        
        {/* Goal #14: Visual Slot Manager */}
        <div className="limits-container">
          <div className="limits-text">
            <span>Interviews completed</span>
            <span>{activeInterviewsCount} / {maxSlots}</span>
          </div>
          <div className="limits-bar-bg">
            <div 
              className={`limits-bar-fill ${activeInterviewsCount >= maxSlots ? 'danger' : ''}`}
              style={{ width: `${(activeInterviewsCount / maxSlots) * 100}%` }}
            ></div>
          </div>
          <small className="remaining-text">
            {maxSlots - activeInterviewsCount} interviews remaining
          </small>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total interviews</div>
          <div className="stat-value">{realStats.totalInterviews}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg accuracy</div>
          <div className="stat-value">{realStats.avgAccuracy}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best score</div>
          <div className="stat-value">{realStats.bestScore}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Confidence avg</div>
          <div className="stat-value">{realStats.confidenceAvg}%</div>
        </div>
      </div>

      <h2 className="section-title">Start a new interview</h2>
      <div className="actions-grid">
        <div className="action-card">
          <div className="action-icon">📄</div>
          <h3>Resume based</h3>
          <p>Questions generated from your extracted skills via GPT.</p>
          <button className="btn-action btn-blue" onClick={() => handleStartInterview("resume")}>Start</button>
        </div>

        <div className="action-card">
          <div className="action-icon">🎯</div>
          <h3>Your own selection</h3>
          <p>Custom technology, module, and topic technical round.</p>
          <button className="btn-action btn-green" onClick={() => handleStartInterview("custom")}>Start</button>
        </div>

        <div className="action-card">
          <div className="action-icon">🤝</div>
          <h3>HR round</h3>
          <p>Behavioral and soft-skill situational judgment questions.</p>
          <button className="btn-action btn-purple" onClick={() => handleStartInterview("hr")}>Start</button>
        </div>
      </div>
    </div>
  );
}