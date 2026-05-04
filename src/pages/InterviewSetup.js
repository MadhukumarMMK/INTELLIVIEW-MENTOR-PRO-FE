import React, { useState, useEffect, useRef, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemeContext } from "../context/ThemeContext";
import axios from "../api/axiosInstance";
import { useNotification } from "../context/NotificationContext";
import "./InterviewSetup.css";

export default function InterviewSetup() {
  const { isDarkMode } = useContext(ThemeContext);
  const location = useLocation();
  const navigate = useNavigate();
  const notify = useNotification();
  const baseMode = location.state?.mode || "resume";

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // --- Metadata State (Goal #2) ---
  const [techList, setTechList] = useState([]);
  const [moduleList, setModuleList] = useState([]);
  const [topicList, setTopicList] = useState([]);

  // --- Selection State ---
  const [selectedTech, setSelectedTech] = useState("");
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [aiPacing] = useState("Adaptive"); // eslint-disable-line no-unused-vars

  // Pull the starting difficulty from admin settings on mount so the admin's
  // configured default actually takes effect (user can still override below).
  useEffect(() => {
    axios.get("/admin/settings")
      .then(res => {
        const sd = res.data?.starting_difficulty;
        if (sd && ["Easy", "Medium", "Hard"].includes(sd)) setDifficulty(sd);
      })
      .catch(() => { /* fall back to Medium default */ });
  }, []);

  // --- Hardware State (Goal #16) ---
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null); // eslint-disable-line no-unused-vars
  const [camStatus, setCamStatus] = useState("Checking...");
  const [micStatus, setMicStatus] = useState("Checking...");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // 1. Fetch Technologies (Match TechnologyController.js)
  useEffect(() => {
    if (baseMode === "custom") {
      const loadTech = async () => {
        try {
          const res = await axios.get("/general/technologies");
          setTechList(res.data || []);
        } catch (err) { console.error("Tech API Error", err); }
      };
      loadTech();
    }
  }, [baseMode]);

  // 2. Fetch Modules by Tech ID (Match ModuleController.js - uses technology_id in body)
  useEffect(() => {
    if (selectedTech && baseMode === "custom") {
      const loadModules = async () => {
        try {
          const res = await axios.post(`/general/modules-by-tech`, { 
            technology_id: selectedTech 
          });
          setModuleList(res.data || []);
          setSelectedModule(""); // Reset children
          setTopicList([]);
        } catch (err) { console.error("Module API Error", err); }
      };
      loadModules();
    }
  }, [selectedTech, baseMode]);

  // 3. Fetch Topics by Module ID (Match TopicController.js - uses module_id in body)
  useEffect(() => {
    if (selectedModule && baseMode === "custom") {
      const loadTopics = async () => {
        try {
          const res = await axios.post("/general/topics-by-module", { 
            module_id: selectedModule 
          });
          setTopicList(res.data || []);
          setSelectedTopic("");
        } catch (err) { console.error("Topic API Error", err); }
      };
      loadTopics();
    }
  }, [selectedModule, baseMode]);

  // Hardware Diagnostics (Goal #16)
  useEffect(() => {
    let audioContext, analyser, microphone, javascriptNode;
    let activeStream = null; // Local reference for proper cleanup closure

    const initHardware = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Media devices not supported. Please use a modern browser and ensure you are on HTTPS.");
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
        setCamStatus("Ready");

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error("Audio analysis is not supported in this browser.");
        }

        audioContext = new AudioContextClass();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(mediaStream);
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);

        javascriptNode.onaudioprocess = () => {
          const array = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(array);
          let average = array.reduce((a, b) => a + b, 0) / array.length;
          setAudioLevel(average);
          if (average > 5) { setMicStatus("Ready"); setIsReady(true); }
        };
      } catch (err) {
        console.error("Hardware Init Error:", err);
        setCamStatus("Unavailable");
        setMicStatus("Unavailable");
        
        let errorMsg = "Could not access your camera/microphone. ";
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          errorMsg += "Please grant permissions in your browser settings and reload.";
        } else if (err.name === "NotFoundError") {
          errorMsg += "No camera or microphone was found on this device.";
        } else {
          errorMsg += err.message || "Ensure you are using a secure connection (HTTPS).";
        }
        notify.warning(errorMsg);
      }
    };
    initHardware();
    return () => {
      // Use the local activeStream variable to ensure hardware is turned off
      if (activeStream) activeStream.getTracks().forEach(track => track.stop());
      if (audioContext && audioContext.state !== "closed") audioContext.close();
    };
  }, []);

  const hasResume = baseMode === "resume"
    && user.resume_path && user.resume_path.length > 0
    && Array.isArray(user.skills) && user.skills.length > 0;

  // Auto-redirect when user lands here via direct URL / back button
  // without meeting the resume prerequisite
  useEffect(() => {
    if (baseMode === "resume" && !hasResume) {
      notify.warning("Upload your resume to start Resume interviews");
      navigate("/profile?focus=resume", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canLaunch = baseMode === "custom"
    ? (isReady && selectedTech && selectedModule)
    : baseMode === "resume"
    ? (isReady && hasResume)
    : isReady;

  const handleLaunch = async () => {
    // Defense-in-depth: block resume mode without resume even if canLaunch slipped
    if (baseMode === "resume" && !hasResume) {
      notify.warning("Upload your resume to start Resume interviews");
      navigate("/profile?focus=resume", { replace: true });
      return;
    }
    setIsStarting(true);
    try {
      // Determine a readable technology name for the report history
      let techName = baseMode;
      if (baseMode === "custom" && selectedTech) {
        const t = techList.find(tech => tech._id === selectedTech);
        techName = t ? t.technology_name : "Custom";
      } else if (baseMode === "resume") {
        techName = "Resume Technical";
      } else if (baseMode === "hr") {
        techName = "HR Behavioral";
      }

      // Goal #6 & #7: Create the interview record so Interview.js has an ID to update
      const res = await axios.post("/interviews/create", {
        roll_no: user.roll_no,
        technology_name: techName,
        level: difficulty,
        mode: baseMode,
        questions_count: 3 
      });

      const interviewId = res.data.data._id;

      // Resolve readable names for backend/LLM (not the MongoDB ObjectIds)
      const moduleObj = moduleList.find(m => m._id === selectedModule);
      const topicObj = topicList.find(t => t._id === selectedTopic);
      const moduleName = moduleObj?.module_name || moduleObj?.name || "General";
      const topicName = topicObj?.topic_name || topicObj?.name || "General";

      navigate("/interview/active", {
        state: {
          baseMode,
          difficulty,
          aiPacing,
          technology: selectedTech,          // _id (kept for any DB ops)
          technologyName: techName,          // readable name for LLM
          module: selectedModule,
          moduleName,
          topic: selectedTopic,
          topicName,
          interviewId
        }
      });
    } catch (err) {
      console.error("Failed to setup interview:", err);
      notify.error(err.response?.data?.message || "Failed to start session. Please check your connection.");
      setIsStarting(false);
    }
  };

  return (
    <div className={`setup-wrapper ${isDarkMode ? "dark-theme" : "light-theme"}`}>
      <div className="setup-header">
        <button className="back-btn" onClick={() => navigate("/interviews")}>← Interview Modes</button>
        <h1 className="setup-title">
          {baseMode.toUpperCase()} Interview Setup
        </h1>
      </div>

      <div className="setup-grid">
        <div className="v2-card config-panel">
          
          {/* SECTION: Custom Selection - Only for Custom Mode */}
          {baseMode === "custom" ? (
            <div className="config-section">
              <h3>Select Your Topic</h3>
              
              <div className="input-group">
                <label>Technology</label>
                <Dropdown
                  value={selectedTech}
                  onChange={setSelectedTech}
                  placeholder="Choose Technology..."
                  options={techList.map(t => ({ value: t._id, label: t.technology_name }))}
                />
              </div>

              <div className="input-group">
                <label>Module</label>
                <Dropdown
                  value={selectedModule}
                  onChange={setSelectedModule}
                  placeholder={selectedTech ? "Choose Module..." : "Select a technology first"}
                  disabled={!selectedTech}
                  options={moduleList.map(m => ({ value: m._id, label: m.module_name }))}
                />
              </div>

              <div className="input-group">
                <label>Topic</label>
                <Dropdown
                  value={selectedTopic}
                  onChange={setSelectedTopic}
                  placeholder={selectedModule ? "Choose Topic..." : "Select a module first"}
                  disabled={!selectedModule}
                  options={topicList.map(tp => ({ value: tp._id, label: tp.topic_name }))}
                />
              </div>
            </div>
          ) : (
            <div className="config-section mode-info">
              <h3>Mode: {baseMode === 'resume' ? 'Resume-Based Interview' : 'HR Behavioral Round'}</h3>
              <p>
                {baseMode === 'resume'
                  ? "AI-driven technical questions tailored to the skills parsed from your uploaded resume."
                  : "Situational and behavioral prompts assessing communication, leadership, and decision-making."}
              </p>
              {baseMode === 'resume' && hasResume && (
                <p style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                  Detected {user.skills.length} skill{user.skills.length === 1 ? "" : "s"} from your resume: {user.skills.slice(0, 5).join(", ")}{user.skills.length > 5 ? "…" : ""}
                </p>
              )}
            </div>
          )}

          <div className="config-section">
            <h3>Difficulty & Pacing</h3>
            <div className="selection-grid">
              {["Easy", "Medium", "Hard"].map((lvl) => (
                <div key={lvl} className={`option-card ${difficulty === lvl ? "active" : ""}`} onClick={() => setDifficulty(lvl)}>
                  {lvl}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="v2-card system-check-panel">
          <h3>System Check</h3>
          <div className="video-container">
            <video ref={videoRef} autoPlay playsInline muted className="video-feed" />
            <div className="audio-meter">
              <div className="audio-meter-fill" style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}></div>
            </div>
          </div>
          <div className="system-status">
            <StatusChip label="Camera" status={camStatus} />
            <StatusChip label="Microphone" status={micStatus} />
          </div>
          
          <button
            className="setup-launch-btn"
            onClick={handleLaunch}
            disabled={!canLaunch || isStarting}
          >
            {isStarting ? (
              <span className="launch-loading">
                <span className="launch-spinner"></span>
                Preparing Interview...
              </span>
            ) : isReady ? (
              <span className="launch-ready">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Start Interview
              </span>
            ) : (
              <span className="launch-waiting">Checking Hardware...</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact, inline hardware status indicator. Tone reflects state:
//   Ready       → success (steady)
//   Checking... → muted   (pulsing)
//   Unavailable → danger
function StatusChip({ label, status }) {
  const tone = status === "Ready" ? "ready" : status === "Unavailable" ? "error" : "checking";
  return (
    <div className={`status-chip status-chip-${tone}`}>
      <span className="status-dot" aria-hidden="true"></span>
      <span className="status-chip-label">{label}</span>
      <span className="status-chip-state">{status}</span>
    </div>
  );
}

// Custom Dropdown — replaces native <select> so options are reliably visible
// in both light and dark themes regardless of OS settings. The native <option>
// popup is OS-rendered and not consistently themable; this is fully ours.
function Dropdown({ value, onChange, options, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div
      className={`dropdown ${open ? 'open' : ''} ${disabled ? 'is-disabled' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`dropdown-value ${selected ? '' : 'is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="dropdown-caret" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && (
        <ul className="dropdown-panel" role="listbox">
          {options.length === 0 ? (
            <li className="dropdown-empty">No options available</li>
          ) : (
            options.map(opt => (
              <li
                key={opt.value}
                className={`dropdown-option ${opt.value === value ? 'is-selected' : ''}`}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}