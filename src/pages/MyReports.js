import React, { useEffect, useState, useMemo } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import IntelliLoader from "../components/IntelliLoader";
import Pagination from "../components/Pagination";
import { Archive, ArchiveRestore, FileText, Target, Users } from "lucide-react";
import "./MyReports.css";

const REPORTS_PAGE_SIZE = 9;

const MODES = [
  { id: "resume", label: "Resume Based", Icon: FileText, color: "blue" },
  { id: "custom", label: "Your Selection", Icon: Target, color: "green" },
  { id: "hr", label: "HR Round", Icon: Users, color: "purple" }
];

// Heuristic: infer mode when a legacy interview has no mode field
const inferMode = (interview) => {
  if (interview.mode) return interview.mode;
  const tech = (interview.technology_name || "").toLowerCase();
  if (tech.includes("hr") || tech.includes("behavioral")) return "hr";
  if (tech.includes("resume")) return "resume";
  return "custom";
};

export default function MyReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxSlots, setMaxSlots] = useState(6);
  const [view, setView] = useState("active"); // "active" | "archived"
  const [archivedTab, setArchivedTab] = useState("resume"); // mode filter for archived view
  const [activePage, setActivePage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const navigate = useNavigate();
  const notify = useNotification();

  useEffect(() => {
    const fetchReports = async () => {
      if (!user?.roll_no) { navigate("/login"); return; }
      try {
        const [res, settingsRes] = await Promise.all([
          axios.get(`/interviews/history/${user.roll_no}`),
          axios.get('/admin/settings').catch(() => ({ data: {} }))
        ]);
        if (settingsRes.data?.max_interviews) setMaxSlots(settingsRes.data.max_interviews);
        const completed = (res.data || []).filter(r => r.status === 2);
        setReports(completed);
      } catch (err) {
        console.error("Failed to fetch reports:", err);
        setError("Could not load your reports. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [navigate, user?.roll_no]);

  // Split by archived flag
  const activeReports = useMemo(() => reports.filter(r => !r.archived), [reports]);
  const archivedReports = useMemo(() => reports.filter(r => r.archived), [reports]);

  // Group archived by mode for tabbed display
  const archivedByMode = useMemo(() => {
    const grouped = { resume: [], custom: [], hr: [] };
    archivedReports.forEach(r => {
      const m = inferMode(r);
      if (grouped[m]) grouped[m].push(r);
      else grouped.custom.push(r);
    });
    return grouped;
  }, [archivedReports]);

  // Reset paging when the user switches primary view or archived sub-tab
  useEffect(() => { setActivePage(1); }, [view]);
  useEffect(() => { setArchivedPage(1); }, [archivedTab]);

  // Slice the current list for the active page
  const pagedActive = useMemo(() => {
    const start = (activePage - 1) * REPORTS_PAGE_SIZE;
    return activeReports.slice(start, start + REPORTS_PAGE_SIZE);
  }, [activeReports, activePage]);

  const pagedArchived = useMemo(() => {
    const list = archivedByMode[archivedTab] || [];
    const start = (archivedPage - 1) * REPORTS_PAGE_SIZE;
    return list.slice(start, start + REPORTS_PAGE_SIZE);
  }, [archivedByMode, archivedTab, archivedPage]);

  const handleArchive = async (e, reportId) => {
    e.stopPropagation();
    const ok = await notify.confirm(
      "Archiving frees a slot for a new interview. You can unarchive later if you're under the limit.",
      "Archive Interview"
    );
    if (!ok) return;
    try {
      await axios.put(`/interviews/archive/${reportId}`);
      setReports(prev => prev.map(r => r._id === reportId ? { ...r, archived: true } : r));
      notify.success("Interview archived. Slot freed.");
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not archive.");
    }
  };

  const handleUnarchive = async (e, reportId) => {
    e.stopPropagation();
    try {
      await axios.put(`/interviews/unarchive/${reportId}`);
      setReports(prev => prev.map(r => r._id === reportId ? { ...r, archived: false } : r));
      notify.success("Interview restored to active.");
    } catch (err) {
      // Backend returns 403 when at limit — show that message directly
      notify.warning(err.response?.data?.message || "Could not restore.");
    }
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-GB", { day: 'numeric', month: 'long', year: 'numeric' });

  // ── RENDER ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="reports-wrapper">
        <div className="status-container"><IntelliLoader message="Loading your reports" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="reports-wrapper">
        <div className="status-container"><div className="error-message">{error}</div></div>
      </div>
    );
  }

  const activeCount = activeReports.length;
  const isAtLimit = activeCount >= maxSlots;

  // Identify the worst active interview (archive candidate)
  const worstActive = activeReports.length > 0
    ? activeReports.reduce((worst, r) => (r.overall_score || 0) < (worst.overall_score || 0) ? r : worst, activeReports[0])
    : null;
  const bestActive = activeReports.length > 0
    ? activeReports.reduce((best, r) => (r.overall_score || 0) > (best.overall_score || 0) ? r : best, activeReports[0])
    : null;

  return (
    <div className="reports-wrapper">
      <header className="reports-header">
        <div>
          <h1>My Interviews</h1>
          <p>Review, archive, and restore your past interviews.</p>
        </div>
        <button className="reports-back-btn" onClick={() => navigate("/dashboard")}>← Back to Dashboard</button>
      </header>

      {/* View tabs: Active / Archived */}
      <div className="reports-tabs">
        <button
          className={`reports-tab ${view === 'active' ? 'active' : ''}`}
          onClick={() => setView('active')}
        >
          Active <span className="tab-count">{activeReports.length}</span>
        </button>
        <button
          className={`reports-tab ${view === 'archived' ? 'active' : ''}`}
          onClick={() => setView('archived')}
        >
          Archived <span className="tab-count">{archivedReports.length}</span>
        </button>
      </div>

      {view === 'active' ? (
        <>
          <div className="slot-info">
            <span>{activeCount} of {maxSlots} slots used</span>
            {isAtLimit && worstActive && (
              <button className="delete-worst-btn" onClick={(e) => handleArchive(e, worstActive._id)}>
                <Archive size={14} strokeWidth={2} /> Archive worst to free a slot
              </button>
            )}
          </div>
          {activeReports.length === 0 ? (
            <div className="status-container">
              <div className="no-reports">
                <h3>No active interviews</h3>
                <p>Your completed interviews will appear here.</p>
                <button className="btn-start-first" onClick={() => navigate("/interviews")}>
                  Start your first interview →
                </button>
              </div>
            </div>
          ) : (
            <>
            <div className="reports-grid">
              {pagedActive.map((report) => {
                const score = Math.round(report.overall_score || 0);
                const isBest = report._id === bestActive?._id && activeReports.length > 1;
                const isWorst = report._id === worstActive?._id && activeReports.length > 1 && report._id !== bestActive?._id;
                return (
                  <div key={report._id} className={`card report-card ${isBest ? 'best-highlight' : ''}`} onClick={() => navigate(`/report/${report._id}`)}>
                    {isBest && <span className="badge-best-ribbon">Best</span>}
                    <div className="card-header">
                      <h3>{report.technology_name || "General Interview"}</h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {isWorst && <span className="badge-worst">Archive?</span>}
                        <span className={`level-badge level-${report.level}`}>{report.level}</span>
                        <button
                          onClick={(e) => handleArchive(e, report._id)}
                          className="archive-btn"
                          title="Archive this interview"
                        ><Archive size={16} strokeWidth={2} /></button>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="score-circle" style={{ background: `conic-gradient(var(--primary) ${score * 3.6}deg, var(--border-color) 0deg)` }}>
                        <span>{score}<small>%</small></span>
                      </div>
                      <div className="report-details">
                        <p><strong>Overall Score</strong></p>
                        <span>Questions: {(report.question_details?.length) || report.questions_count || '—'}</span>
                        <span>Date: {formatDate(report.createdAt)}</span>
                      </div>
                    </div>
                    <div className="card-footer">View Detailed Report →</div>
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={activePage}
              totalItems={activeReports.length}
              pageSize={REPORTS_PAGE_SIZE}
              onPageChange={setActivePage}
            />
            </>
          )}
          {activeReports.length > 0 && (
            <p className="slot-hint">Archive your worst interview to free a slot. You can restore it later if you're under the limit.</p>
          )}
        </>
      ) : (
        <>
          {/* Archived view — sub-tabs per mode */}
          <div className="archived-mode-tabs">
            {MODES.map(m => {
              const Icon = m.Icon;
              const count = archivedByMode[m.id].length;
              return (
                <button
                  key={m.id}
                  className={`mode-tab ${archivedTab === m.id ? 'active' : ''} mode-tab-${m.color}`}
                  onClick={() => setArchivedTab(m.id)}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span>{m.label}</span>
                  <span className="mode-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {archivedByMode[archivedTab].length === 0 ? (
            <div className="status-container">
              <div className="no-reports">
                <h3>No archived {MODES.find(m => m.id === archivedTab)?.label} interviews</h3>
                <p>Interviews you archive will appear here, grouped by type.</p>
              </div>
            </div>
          ) : (
            <>
            <div className="reports-grid">
              {pagedArchived.map((report) => {
                const score = Math.round(report.overall_score || 0);
                return (
                  <div key={report._id} className="card report-card archived-card" onClick={() => navigate(`/report/${report._id}`)}>
                    <div className="card-header">
                      <h3>{report.technology_name || "General Interview"}</h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={`level-badge level-${report.level}`}>{report.level}</span>
                        <button
                          onClick={(e) => handleUnarchive(e, report._id)}
                          className={`unarchive-btn ${isAtLimit ? 'disabled' : ''}`}
                          disabled={isAtLimit}
                          title={isAtLimit ? `At ${maxSlots}/${maxSlots} — archive another first` : "Restore this interview"}
                        ><ArchiveRestore size={16} strokeWidth={2} /></button>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="score-circle" style={{ background: `conic-gradient(var(--primary) ${score * 3.6}deg, var(--border-color) 0deg)` }}>
                        <span>{score}<small>%</small></span>
                      </div>
                      <div className="report-details">
                        <p><strong>Archived</strong></p>
                        <span>Questions: {(report.question_details?.length) || report.questions_count || '—'}</span>
                        <span>Date: {formatDate(report.createdAt)}</span>
                        {report.archived_at && <span className="archived-date">Archived: {formatDate(report.archived_at)}</span>}
                      </div>
                    </div>
                    <div className="card-footer">View Detailed Report →</div>
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={archivedPage}
              totalItems={(archivedByMode[archivedTab] || []).length}
              pageSize={REPORTS_PAGE_SIZE}
              onPageChange={setArchivedPage}
            />
            </>
          )}
          {archivedReports.length > 0 && (
            <p className="slot-hint">
              {isAtLimit
                ? `You're at ${activeCount}/${maxSlots} active slots. Archive an active interview to restore an archived one.`
                : `${maxSlots - activeCount} slot${maxSlots - activeCount === 1 ? '' : 's'} available — you can restore up to that many.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
