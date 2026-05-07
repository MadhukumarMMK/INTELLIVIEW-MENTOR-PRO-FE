import React, { useEffect, useState } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import { FileText, Target, Users } from "lucide-react";
import "./Dashboard.css";

export default function Interviews() {
  const navigate = useNavigate();
  const notify = useNotification();
  const [user] = useState(JSON.parse(localStorage.getItem("user") || "{}"));
  const [activeInterviewsCount, setActiveInterviewsCount] = useState(0);
  const [maxSlots, setMaxSlots] = useState(6);
  const [expoMode, setExpoMode] = useState(false);

  useEffect(() => {
    const fetchSlotInfo = async () => {
      try {
        try {
          const s = await axios.get("/admin/settings");
          if (s.data?.max_interviews) setMaxSlots(s.data.max_interviews);
          setExpoMode(!!s.data?.expo_mode);
        } catch (_) {}

        const res = await axios.get(`/interviews/history/${user.roll_no}`);
        // Archived interviews don't count toward the slot limit
        setActiveInterviewsCount((res.data || []).filter(i => i.status === 2 && !i.archived).length);
      } catch (err) {
        console.error("Interviews page slot fetch error:", err);
      }
    };
    if (user.roll_no) fetchSlotInfo();
  }, [user.roll_no]);

  const handleStartInterview = (mode) => {
    if (activeInterviewsCount >= maxSlots) {
      notify.confirm(
        "You've reached your interview limit. Archive an old interview from My Interviews to free a slot.\n\nGo there now?",
        "Limit Reached"
      ).then(ok => {
        if (ok) navigate("/myreports");
      });
      return;
    }

    if (mode === "resume") {
      const hasResume = user.resume_path && user.resume_path.length > 0;
      const hasSkills = Array.isArray(user.skills) && user.skills.length > 0;
      if (!hasResume || !hasSkills) {
        notify.warning("Upload your resume to start Resume interviews");
        navigate("/profile?focus=resume");
        return;
      }
    }

    // Expo Mode: route through the voice-led name capture page first.
    // Real-user mode skips this and goes straight to setup.
    if (expoMode) {
      navigate("/interview/greet", { state: { mode } });
      return;
    }

    navigate("/interview-setup", { state: { mode } });
  };

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-header-row">
        <div>
          <h1 className="greeting-text">Start an Interview</h1>
          <p className="subtitle-text">Pick the mode that matches what you want to practice.</p>
        </div>

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

      <div className="actions-grid">
        <div className="action-card">
          <div className="action-icon action-icon-blue"><FileText size={26} strokeWidth={2} /></div>
          <h3>Resume-Based Interview</h3>
          <p>AI-driven technical questions tailored to the skills extracted from your resume — practice exactly what recruiters will ask you.</p>
          <button className="btn-action btn-blue" onClick={() => handleStartInterview("resume")}>Start</button>
        </div>

        <div className="action-card">
          <div className="action-icon action-icon-green"><Target size={26} strokeWidth={2} /></div>
          <h3>Custom Technical Interview</h3>
          <p>Choose a technology, module, and topic to drill into. Adaptive depth — questions get harder as you answer well.</p>
          <button className="btn-action btn-green" onClick={() => handleStartInterview("custom")}>Start</button>
        </div>

        <div className="action-card">
          <div className="action-icon action-icon-purple"><Users size={26} strokeWidth={2} /></div>
          <h3>HR Behavioral Round</h3>
          <p>Situational and behavioral prompts that assess your communication, leadership, and decision-making under pressure.</p>
          <button className="btn-action btn-purple" onClick={() => handleStartInterview("hr")}>Start</button>
        </div>
      </div>
    </div>
  );
}
