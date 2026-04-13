import React, { useState, useRef } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import "./Login.css";

export default function Onboarding() {
  const navigate = useNavigate();
  const notify = useNotification();
  const fileInputRef = useRef(null);
  
  const [file, setFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);

  // Get the logged-in user's roll_no from local storage
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setExtractedData(null); // Clear any previous data
    }
  };

  const handleProfileSetup = async () => {
    if (!file) return;
    setUploadLoading(true);

    try {
      const formData = new FormData();
      formData.append("roll_no", user.roll_no);
      formData.append("file", file);

      const res = await axios.post("/user/upload-resume", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const parsed = res.data.extracted_data;

      // Show extracted data before navigating
      setExtractedData({
        skills: parsed?.skills || [],
        role: parsed?.job_role || "Developer",
        sector: parsed?.sector || "Information Technology"
      });

      // Use the updated user object from backend (has correct name from DB)
      const serverUser = res.data.user;
      if (serverUser) {
        // Merge server user with existing localStorage data
        const updatedUser = { ...user, ...serverUser };
        delete updatedUser.password; // Never store password
        localStorage.setItem("user", JSON.stringify(updatedUser));
      } else {
        // Fallback: update manually from parsed data
        const updatedUser = {
          ...user,
          first_name: parsed?.name || user.first_name,
          skills: parsed?.skills || [],
          mobile_number: parsed?.mobile_number || user.mobile_number,
        };
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }

      // Brief delay to show extracted data, then navigate
      setTimeout(() => navigate("/dashboard"), 1500);

    } catch (err) {
      console.error("Resume upload error:", err.response?.data || err.message);
      notify.error(err.response?.data?.message || "Resume upload failed. Please try again.");
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="onboarding-wrapper" style={{ justifyContent: "center" }}>
      <div className="v2-card onboarding-panel" style={{ padding: "3rem" }}>
        <h2 className="panel-title" style={{ textAlign: "center" }}>Set up your profile</h2>
        <p className="panel-subtitle" style={{ textAlign: "center" }}>Upload your resume to calibrate your AI Interviewer.</p>

        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.docx" style={{ display: "none" }} />

        {!file && !extractedData && (
          <div className="upload-zone" onClick={() => fileInputRef.current.click()} style={{ marginTop: "2rem" }}>
            <div className="upload-icon">↑</div>
            <span className="upload-text-main">Upload PDF or DOCX</span>
            <span className="upload-text-sub">Drag & drop or click to browse</span>
          </div>
        )}

        {file && !extractedData && (
          <div className="extracted-data-box" style={{ marginTop: "2rem", textAlign: "center" }}>
            <p>Selected: <strong>{file.name}</strong></p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Click below to analyze your resume</p>
          </div>
        )}

        {extractedData && (
          <div className="extracted-data-box" style={{ marginTop: "2rem" }}>
            <p>Extracted from <strong>{file?.name}</strong></p>
            {extractedData.role && <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Role: {extractedData.role} | Sector: {extractedData.sector}</p>}
            <div className="skills-container">
              {extractedData.skills.map(skill => (
                <span key={skill} className="skill-chip">{skill}</span>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={extractedData ? () => navigate("/dashboard") : handleProfileSetup}
          disabled={!file || uploadLoading}
          style={{ marginTop: "1.5rem" }}
        >
          {uploadLoading ? "Analyzing Resume..." : extractedData ? "Go to Dashboard" : "Analyze & Save Profile"}
        </button>
      </div>
    </div>
  );
}