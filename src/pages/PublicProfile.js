import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "../api/axiosInstance";
import IntelliLoader from "../components/IntelliLoader";
import { SERVER_URL, buildShareUrl } from "../api/config";
import {
  UserRound, Award, Target, FileText, Users as UsersIcon,
  ExternalLink, Share2
} from "lucide-react";
import ShareMenu from "../components/ShareMenu";
import "./PublicProfile.css";

// Inline brand SVGs — lucide-react dropped brand-name icons in newer versions
const GithubIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.73.5.68 5.5.68 11.77c0 5 3.25 9.25 7.77 10.75.57.1.78-.25.78-.55v-1.93c-3.16.69-3.83-1.53-3.83-1.53-.52-1.33-1.26-1.68-1.26-1.68-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.73 2.66 1.23 3.31.94.1-.74.4-1.23.72-1.51-2.52-.29-5.17-1.26-5.17-5.62 0-1.24.45-2.26 1.17-3.05-.12-.29-.51-1.45.11-3.02 0 0 .95-.31 3.12 1.16.91-.25 1.87-.38 2.84-.38s1.93.13 2.84.38c2.17-1.47 3.11-1.16 3.11-1.16.62 1.57.23 2.73.11 3.02.73.79 1.17 1.81 1.17 3.05 0 4.37-2.66 5.33-5.19 5.61.41.35.78 1.05.78 2.12v3.13c0 .3.21.66.79.55 4.51-1.5 7.77-5.76 7.77-10.75C23.32 5.5 18.27.5 12 .5z"/>
  </svg>
);
const LinkedinIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.05-1.86-3.05-1.86 0-2.14 1.45-2.14 2.95v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.86 3.36-1.86 3.59 0 4.25 2.36 4.25 5.44v6.31zM5.34 7.43a2.06 2.06 0 11.01-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.23 0z"/>
  </svg>
);

const modeIcons = {
  resume: FileText,
  custom: Target,
  hr: UsersIcon
};

export default function PublicProfile() {
  const { roll_no } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`/user/public-profile/${roll_no}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || "Profile not found"))
      .finally(() => setLoading(false));
  }, [roll_no]);

  if (loading) return <div className="public-profile-wrapper"><IntelliLoader message="Loading profile" /></div>;

  if (error) {
    return (
      <div className="public-profile-wrapper">
        <div className="pp-error">
          <h2>Profile Unavailable</h2>
          <p>{error}</p>
          <button onClick={() => navigate("/login")}>Go to IntelliView</button>
        </div>
      </div>
    );
  }

  const { user, interviews } = data;
  const avatar = user.profile_picture ? `${SERVER_URL}${user.profile_picture}` : null;
  const best = interviews.length > 0 ? Math.max(...interviews.map(i => i.overall_score || 0)) : 0;
  const avg = interviews.length > 0
    ? Math.round(interviews.reduce((s, i) => s + (i.overall_score || 0), 0) / interviews.length)
    : 0;
  const shareUrl = buildShareUrl(user.roll_no);
  const shareText = `Check out ${user.first_name}'s interview report on IntelliView — Best score: ${Math.round(best)}%`;

  return (
    <div className="public-profile-wrapper">
      <div className="pp-header">
        <div className="pp-avatar">
          {avatar ? <img src={avatar} alt="" /> : <UserRound size={42} strokeWidth={1.5} />}
        </div>
        <div className="pp-identity">
          <h1>{user.first_name}</h1>
          <p className="pp-sub">{user.roll_no} · {user.college || '—'} · {user.branch || '—'}</p>
          {user.passout_year && <p className="pp-year">Class of {user.passout_year}</p>}
          <div className="pp-social">
            {user.github_url && (
              <a href={user.github_url} target="_blank" rel="noopener noreferrer" className="pp-social-link">
                <GithubIcon size={16} /> GitHub
              </a>
            )}
            {user.linkedin_url && (
              <a href={user.linkedin_url} target="_blank" rel="noopener noreferrer" className="pp-social-link">
                <LinkedinIcon size={16} /> LinkedIn
              </a>
            )}
          </div>
        </div>
        <div className="pp-share-wrap">
          <ShareMenu url={shareUrl} text={shareText} title={`${user.first_name} on IntelliView`} />
        </div>
      </div>

      <div className="pp-stats">
        <div className="pp-stat"><span className="pp-stat-label">Interviews</span><span className="pp-stat-val">{interviews.length}</span></div>
        <div className="pp-stat"><span className="pp-stat-label">Best Score</span><span className="pp-stat-val pp-stat-primary"><Award size={18} strokeWidth={2} /> {Math.round(best)}%</span></div>
        <div className="pp-stat"><span className="pp-stat-label">Average</span><span className="pp-stat-val">{avg}%</span></div>
        <div className="pp-stat"><span className="pp-stat-label">Skills</span><span className="pp-stat-val">{user.skills.length}</span></div>
      </div>

      {user.skills.length > 0 && (
        <div className="pp-section">
          <h2>Skills</h2>
          <div className="pp-chips">
            {user.skills.map(s => <span key={s} className="pp-chip">{s}</span>)}
          </div>
        </div>
      )}

      <div className="pp-section">
        <h2>Interview Reports <span className="pp-count">{interviews.length}</span></h2>
        {interviews.length === 0 ? (
          <p className="pp-empty">No public interview reports yet.</p>
        ) : (
          <div className="pp-reports">
            {interviews.map(i => {
              const ModeIcon = modeIcons[i.mode] || FileText;
              const score = Math.round(i.overall_score || 0);
              return (
                <div key={i._id} className="pp-report-card">
                  <div className="pp-report-icon"><ModeIcon size={20} strokeWidth={2} /></div>
                  <div className="pp-report-body">
                    <div className="pp-report-tech">{i.technology_name || "General"}</div>
                    <div className="pp-report-meta">
                      {i.level} · {i.questions_count} question{i.questions_count === 1 ? "" : "s"} · {new Date(i.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="pp-report-score">{score}<small>%</small></div>
                  <button
                    className="pp-report-open"
                    onClick={() => navigate(`/report/${i._id}`)}
                    title="Open full report"
                  ><ExternalLink size={14} strokeWidth={2} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="pp-footer">
        <Share2 size={14} strokeWidth={2} />
        <span>Powered by IntelliView — AI-driven mock interviews</span>
      </footer>
    </div>
  );
}
