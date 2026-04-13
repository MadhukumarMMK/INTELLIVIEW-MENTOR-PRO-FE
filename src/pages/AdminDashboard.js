import React, { useState, useEffect } from "react";
import axios from "../api/axiosInstance";
import { useNotification } from "../context/NotificationContext";

export default function AdminDashboard() {
  const notify = useNotification();
  const [config, setConfig] = useState({ max_interview_limit: 6, ai_model: "llama-3.3-70b" });
  const [stats, setStats] = useState({ total_users: 0, total_interviews: 0 });

  const handleSave = async () => {
    await axios.put("/admin/settings", config);
    notify.success("System settings updated!");
  };

  return (
    <div className="admin-wrapper" style={{ padding: '2rem' }}>
      <h1>System Control Center</h1>
      <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="v2-card">
          <h3>Interview Constraints</h3>
          <label>Max Interviews per User:</label>
          <input type="number" value={config.max_interview_limit} 
                 onChange={(e) => setConfig({...config, max_interview_limit: e.target.value})} />
          <button onClick={handleSave} className="btn-primary">Save Changes</button>
        </div>
        <div className="v2-card">
          <h3>System Stats</h3>
          <p>Total Completed Interviews: {stats.total_interviews}</p>
        </div>
      </div>
    </div>
  );
}