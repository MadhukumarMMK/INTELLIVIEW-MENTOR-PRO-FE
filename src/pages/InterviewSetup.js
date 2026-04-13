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
  const [aiPacing, setAiPacing] = useState("Adaptive");

  // --- Hardware State (Goal #16) ---
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
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

  const canLaunch = baseMode === "custom" 
    ? (isReady && selectedTech && selectedModule) 
    : isReady;

  const handleLaunch = async () => {
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
        questions_count: 3 
      });

      const interviewId = res.data.data._id;

      navigate("/interview/active", {
        state: { 
          baseMode, 
          difficulty, 
          aiPacing,
          technology: selectedTech,
          module: selectedModule,
          topic: selectedTopic,
          interviewId: interviewId // Pass the newly generated ID to the Arena
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
        <button className="back-btn" onClick={() => navigate("/dashboard")}>← Dashboard</button>
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
                <select className="v2-input" value={selectedTech} onChange={(e) => setSelectedTech(e.target.value)}>
                  <option value="">Choose Technology...</option>
                  {techList.map(t => (
                    <option key={t._id} value={t._id}>{t.technology_name}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>Module</label>
                <select className="v2-input" disabled={!selectedTech} value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)}>
                  <option value="">Choose Module...</option>
                  {moduleList.map(m => (
                    <option key={m._id} value={m._id}>{m.module_name}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>Topic</label>
                <select className="v2-input" disabled={!selectedModule} value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
                  <option value="">Choose Topic...</option>
                  {topicList.map(tp => (
                    <option key={tp._id} value={tp._id}>{tp.topic_name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="config-section mode-info">
              <h3>Mode: {baseMode === 'resume' ? 'Resume-Based AI' : 'HR Behavioral'}</h3>
              <p>
                {baseMode === 'resume' 
                  ? "Questions will be automatically generated based on your parsed resume skills."
                  : "Focus will be on situational judgment and behavioral soft-skills."}
              </p>
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
            <div className="status-item">
              <span>Camera Status</span>
              <div className={`status-indicator ${camStatus === "Ready" ? "green" : "red"}`}></div>
            </div>
            <div className="status-item">
              <span>Microphone Status</span>
              <div className={`status-indicator ${micStatus === "Ready" ? "green" : "red"}`}></div>
            </div>
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