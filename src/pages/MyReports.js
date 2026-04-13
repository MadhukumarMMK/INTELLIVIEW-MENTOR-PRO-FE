import React, { useEffect, useState } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import IntelliLoader from "../components/IntelliLoader";
import "./MyReports.css"; // We will create this new CSS file

export default function MyReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxSlots, setMaxSlots] = useState(6);
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const navigate = useNavigate();
  const notify = useNotification();

  useEffect(() => {
    const fetchReports = async () => {
      if (!user?.roll_no) {
        navigate("/login");
        return;
      }
      try {
        const [res, settingsRes] = await Promise.all([
          axios.get(`/interviews/history/${user.roll_no}`),
          axios.get('/admin/settings').catch(() => ({ data: {} }))
        ]);
        if (settingsRes.data?.max_interviews) setMaxSlots(settingsRes.data.max_interviews);
        const completedReports = (res.data || []).filter(report => report.status === 2);
        setReports(completedReports);
      } catch (err) {
        console.error("Failed to fetch reports:", err);
        setError("Could not load your reports. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [navigate]);

  const handleDelete = async (e, reportId) => {
    e.stopPropagation();
    const ok = await notify.confirm("Are you sure you want to delete this report? This will free up one interview from your limit.", "Delete Report");
    if (!ok) return;

    try {
      await axios.delete(`/interviews/delete/${reportId}`);
      setReports(prev => prev.filter(r => r._id !== reportId));
      notify.success("Report deleted. Slot freed.");
    } catch (err) {
      console.error("Failed to delete report:", err);
      notify.error("Could not delete report. It may have already been removed.");
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="status-container">
          <IntelliLoader message="Loading your reports" />
        </div>
      );
    }
    if (error) {
        return (
            <div className="status-container">
                <div className="error-message">{error}</div>
            </div>
        );
    }
    if (reports.length === 0) {
      return (
        <div className="status-container">
          <div className="no-reports">
            <h3>No Reports Found</h3>
            <p>Your completed interview reports will appear here.</p>
          </div>
        </div>
      );
    }
    // Identify best and worst for badges (per spec Screen 6)
    const bestId = reports.reduce((best, r) => (r.overall_score || 0) > (best.overall_score || 0) ? r : best, reports[0])?._id;
    const worstId = reports.reduce((worst, r) => (r.overall_score || 0) < (worst.overall_score || 0) ? r : worst, reports[0])?._id;

    return (
      <>
        <div className="slot-info">
          <span>Your interviews - {reports.length} of {maxSlots} limit used</span>
          {reports.length >= maxSlots && worstId && (
            <button className="delete-worst-btn" onClick={(e) => handleDelete(e, worstId)}>
              Delete worst to free an interview
            </button>
          )}
        </div>
        <div className="reports-grid">
          {reports.map((report) => {
              const score = Math.round(report.overall_score || 0);
              const isBest = report._id === bestId && reports.length > 1;
              const isWorst = report._id === worstId && reports.length > 1 && report._id !== bestId;
              return (
                  <div key={report._id} className={`card report-card ${isBest ? 'best-highlight' : ''}`} onClick={() => navigate(`/report/${report._id}`)}>
                      {isBest && <span className="badge-best-ribbon">Best</span>}
                      <div className="card-header">
                          <h3>{report.technology_name || "General Interview"}</h3>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {isWorst && <span className="badge-worst">Delete</span>}
                              <span className={`level-badge level-${report.level}`}>{report.level}</span>
                              <button
                                  onClick={(e) => handleDelete(e, report._id)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0' }}
                                  title="Delete Report"
                              >🗑️</button>
                          </div>
                      </div>
                      <div className="card-body">
                          <div className="score-circle" style={{ background: `conic-gradient(var(--primary-color) ${score * 3.6}deg, var(--border-color) 0deg)` }}>
                              <span>{score}<small>%</small></span>
                          </div>
                          <div className="report-details">
                              <p><strong>Overall Score</strong></p>
                              <span>Questions: {report.questions_count}</span>
                              <span>Date: {formatDate(report.createdAt)}</span>
                          </div>
                      </div>
                       <div className="card-footer">
                          View Detailed Report →
                      </div>
                  </div>
              )
          })}
        </div>
        {reports.length > 0 && (
          <p className="slot-hint">Deleting your worst interview frees one from your limit. Best performance is always preserved.</p>
        )}
      </>
    );
  };
  
  return (
    <div className="reports-wrapper">
      <header className="reports-header">
        <h1>My Past Reports</h1>
        <p>Review your performance from previous interviews.</p>
      </header>
      <main className="reports-content">
        {renderContent()}
      </main>
    </div>
  );
}
