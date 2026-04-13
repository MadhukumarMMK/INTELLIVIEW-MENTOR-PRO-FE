import React, { useState, useEffect, useRef } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import IntelliLoader from "../components/IntelliLoader";
import { SERVER_URL } from "../api/config";
import "./Profile.css";

export default function Profile() {
  const navigate = useNavigate();
  const notify = useNotification();
  const fileInputRef = useRef(null);
  const resumeInputRef = useRef(null);
  const certInputRef = useRef(null);

  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const [user, setUser] = useState(storedUser);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [bestInterview, setBestInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pwdData, setPwdData] = useState({ current: '', newPwd: '', confirm: '' });
  const [pwdChanging, setPwdChanging] = useState(false);

  const handleChangePassword = async () => {
    if (!pwdData.current || !pwdData.newPwd || !pwdData.confirm) return notify.warning("All fields are required");
    if (pwdData.newPwd.length < 6) return notify.warning("Password must be at least 6 characters");
    if (pwdData.newPwd !== pwdData.confirm) return notify.error("New passwords don't match");
    setPwdChanging(true);
    try {
      await axios.put("/user/change-password", { roll_no: user.roll_no, current_password: pwdData.current, new_password: pwdData.newPwd });
      notify.success("Password changed successfully!");
      setPwdData({ current: '', newPwd: '', confirm: '' });
    } catch (err) {
      notify.error(err.response?.data?.message || "Failed to change password");
    } finally {
      setPwdChanging(false);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const [profileRes, historyRes] = await Promise.all([
          axios.get(`/user/profile/${storedUser.roll_no}`),
          axios.get(`/interviews/history/${storedUser.roll_no}`)
        ]);
        setUser(profileRes.data);
        setEditData(profileRes.data);

        const completed = (historyRes.data || []).filter(i => i.status === 2);
        if (completed.length > 0) {
          const best = completed.reduce((b, i) => (i.overall_score || 0) > (b.overall_score || 0) ? i : b, completed[0]);
          setBestInterview(best);
        }
      } catch (err) {
        console.error("Profile fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [storedUser.roll_no]);

  const handleSave = async () => {
    try {
      const res = await axios.put(`/user/profile/${user.roll_no}`, editData);
      setUser(res.data.user);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      setEditing(false);
    } catch (err) {
      notify.error("Failed to update profile");
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("avatar", file);
    formData.append("roll_no", user.roll_no);
    try {
      const res = await axios.post("/user/upload-avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setUser(res.data.user);
      localStorage.setItem("user", JSON.stringify(res.data.user));
    } catch (err) {
      notify.error("Failed to upload avatar");
    }
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("roll_no", user.roll_no);
    try {
      await axios.post("/user/upload-resume-file", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      notify.success("Resume uploaded successfully!");
      const res = await axios.get(`/user/profile/${user.roll_no}`);
      setUser(res.data);
    } catch (err) {
      notify.error("Failed to upload resume");
    }
  };

  const handleResumeDownload = async () => {
    try {
      const response = await axios.get(`/user/download-resume/${user.roll_no}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `resume_${user.roll_no}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      notify.warning("No resume found. Upload one first.");
    }
  };

  const [certName, setCertName] = useState('');
  const [certUploading, setCertUploading] = useState(false);

  const handleCertUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCertUploading(true);
    const formData = new FormData();
    formData.append("certificate", file);
    formData.append("roll_no", user.roll_no);
    formData.append("cert_name", certName || file.name);
    try {
      const res = await axios.post("/user/upload-certification", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setUser(prev => ({ ...prev, certifications: res.data.certifications }));
      setCertName('');
      notify.success("Certificate uploaded to DigiLocker!");
    } catch (err) {
      notify.error("Failed to upload certificate. Please try again.");
    } finally {
      setCertUploading(false);
      if (certInputRef.current) certInputRef.current.value = '';
    }
  };

  const handleCertDelete = async (certId) => {
    const ok = await notify.confirm("Remove this certificate from your DigiLocker?", "Delete Certificate");
    if (!ok) return;
    try {
      const res = await axios.delete(`/user/certification/${user.roll_no}/${certId}`);
      setUser(prev => ({ ...prev, certifications: res.data.certifications }));
      notify.success("Certificate removed.");
    } catch (err) {
      notify.error("Failed to delete certificate.");
    }
  };

  const viewCertificate = (cert) => {
    const url = `${SERVER_URL}${cert.url}`;
    window.open(url, '_blank');
  };

  if (loading) return <div className="profile-wrapper"><IntelliLoader message="Loading profile" /></div>;

  const avatarUrl = user.profile_picture ? `${SERVER_URL}${user.profile_picture}` : null;
  const isAdmin = user.role === "admin";

  return (
    <div className="profile-wrapper">
      <div className="profile-header-bar">
        <h1>My Profile</h1>
        <button className="btn-back" onClick={() => navigate(isAdmin ? "/admin" : "/dashboard")}>
          {isAdmin ? "Back to Admin Panel" : "Back to Dashboard"}
        </button>
      </div>

      <div className="profile-grid">
        {/* Left: Avatar + Info */}
        <div className="profile-card profile-main">
          <div className="avatar-section" onClick={() => fileInputRef.current?.click()}>
            <div className="avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" />
              ) : (
                <span className="avatar-letter">{(user.first_name || "U")[0].toUpperCase()}</span>
              )}
              <div className="avatar-hover">Change Photo</div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
          </div>

          {editing ? (
            <div className="edit-form">
              <FormRow label="Name" value={editData.first_name} onChange={v => setEditData({ ...editData, first_name: v })} />
              <FormRow label="Email" value={editData.email} onChange={v => setEditData({ ...editData, email: v })} />
              <FormRow label="Mobile" value={editData.mobile_number} onChange={v => setEditData({ ...editData, mobile_number: v })} />
              <FormRow label="College" value={editData.college} onChange={v => setEditData({ ...editData, college: v })} />
              <FormRow label="Branch" value={editData.branch} onChange={v => setEditData({ ...editData, branch: v })} />
              <FormRow label="Passout Year" value={editData.passout_year} onChange={v => setEditData({ ...editData, passout_year: v })} type="number" />
              <FormRow label="GitHub URL" value={editData.github_url} onChange={v => setEditData({ ...editData, github_url: v })} type="text" placeholder="https://github.com/username" />
              <FormRow label="LinkedIn URL" value={editData.linkedin_url} onChange={v => setEditData({ ...editData, linkedin_url: v })} type="text" placeholder="https://linkedin.com/in/username" />
              <div className="form-btns">
                <button className="btn-save" onClick={handleSave}>Save Changes</button>
                <button className="btn-cancel" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="profile-details">
              <h2>{user.first_name || "User"}</h2>
              <p className="subtitle">{user.roll_no} | {user.role || "student"}</p>
              <div className="detail-grid">
                <Detail label="Email" value={user.email} />
                <Detail label="Mobile" value={user.mobile_number} />
                <Detail label="College" value={user.college} />
                <Detail label="Branch" value={user.branch} />
                <Detail label="Passout Year" value={user.passout_year} />
              </div>
              {/* Social Links */}
              <div className="social-links">
                {user.github_url && (
                  <a href={user.github_url} target="_blank" rel="noopener noreferrer" className="social-btn github">
                    GitHub
                  </a>
                )}
                {user.linkedin_url && (
                  <a href={user.linkedin_url} target="_blank" rel="noopener noreferrer" className="social-btn linkedin">
                    LinkedIn
                  </a>
                )}
                {!user.github_url && !user.linkedin_url && (
                  <p className="muted" style={{ fontSize: '0.8rem' }}>Add your GitHub and LinkedIn links by editing your profile.</p>
                )}
              </div>
              <button className="btn-edit" onClick={() => { setEditData(user); setEditing(true); }}>Edit Profile</button>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="profile-right">
          {/* Admin Quick Access Panel */}
          {isAdmin && (
            <div className="profile-card admin-access-card">
              <h3>Admin Quick Access</h3>
              <div className="admin-access-list">
                <div className="access-item" onClick={() => navigate("/admin")}>
                  <span className="access-icon">📊</span>
                  <div className="access-info">
                    <span className="access-title">Dashboard Overview</span>
                    <span className="access-desc">View stats, charts, and activity</span>
                  </div>
                  <span className="access-arrow">→</span>
                </div>
                <div className="access-item" onClick={() => navigate("/admin")}>
                  <span className="access-icon">❓</span>
                  <div className="access-info">
                    <span className="access-title">Question Limits</span>
                    <span className="access-desc">Resume, Custom, HR question counts</span>
                  </div>
                  <span className="access-arrow">→</span>
                </div>
                <div className="access-item" onClick={() => navigate("/admin")}>
                  <span className="access-icon">🔒</span>
                  <div className="access-info">
                    <span className="access-title">Interview Limits</span>
                    <span className="access-desc">Max slots and time limits</span>
                  </div>
                  <span className="access-arrow">→</span>
                </div>
                <div className="access-item" onClick={() => navigate("/admin")}>
                  <span className="access-icon">🗂</span>
                  <div className="access-info">
                    <span className="access-title">Hierarchy Management</span>
                    <span className="access-desc">Tech → Module → Topic CRUD</span>
                  </div>
                  <span className="access-arrow">→</span>
                </div>
                <div className="access-item" onClick={() => navigate("/admin")}>
                  <span className="access-icon">📈</span>
                  <div className="access-info">
                    <span className="access-title">Statistics & Reports</span>
                    <span className="access-desc">All interviews, scores, analytics</span>
                  </div>
                  <span className="access-arrow">→</span>
                </div>
              </div>
            </div>
          )}

          {/* Admin Role Info */}
          {isAdmin && (
            <div className="profile-card admin-role-card">
              <h3>Role Permissions</h3>
              <div className="perm-list">
                <div className="perm-item granted"><span>Manage question limits</span></div>
                <div className="perm-item granted"><span>Manage interview slots</span></div>
                <div className="perm-item granted"><span>CRUD hierarchy (Tech/Module/Topic)</span></div>
                <div className="perm-item granted"><span>View all user statistics</span></div>
                <div className="perm-item granted"><span>Global settings control</span></div>
              </div>
            </div>
          )}

          {/* Skills — student only */}
          {!isAdmin && (
            <div className="profile-card">
              <h3>Skills</h3>
              <div className="tags-wrap">
                {(user.skills || []).length > 0
                  ? user.skills.map((s, i) => <span key={i} className="tag">{s}</span>)
                  : <p className="muted">No skills extracted. Upload your resume.</p>
                }
              </div>
            </div>
          )}

          {/* Best Performance — student only */}
          {!isAdmin && bestInterview && (
            <div className="profile-card best-card">
              <h3>Best Performance</h3>
              <div className="best-row">
                <div className="best-score">{Math.round(bestInterview.overall_score || 0)}%</div>
                <div>
                  <p className="best-tech">{bestInterview.technology_name}</p>
                  <p className="muted">{bestInterview.level} - {new Date(bestInterview.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <button className="btn-sm" onClick={() => navigate(`/report/${bestInterview._id}`)}>View Report</button>
            </div>
          )}

          {/* Resume — student only */}
          {!isAdmin && (
            <div className="profile-card">
              <h3>Resume</h3>
              <div className="action-btns">
                <button className="btn-action-profile" onClick={handleResumeDownload}>Download Resume</button>
                <button className="btn-action-profile upload" onClick={() => resumeInputRef.current?.click()}>Upload / Update</button>
                <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleResumeUpload} />
              </div>
            </div>
          )}

          {/* Change Password — all users */}
          <div className="profile-card">
            <h3>Change Password</h3>
            <div className="pwd-form">
              <input type="password" placeholder="Current password" value={pwdData.current} onChange={e => setPwdData({ ...pwdData, current: e.target.value })} className="pwd-input" />
              <input type="password" placeholder="New password (min 6 chars)" value={pwdData.newPwd} onChange={e => setPwdData({ ...pwdData, newPwd: e.target.value })} className="pwd-input" />
              <input type="password" placeholder="Confirm new password" value={pwdData.confirm} onChange={e => setPwdData({ ...pwdData, confirm: e.target.value })} className="pwd-input" />
              <button className="btn-action-profile upload" onClick={handleChangePassword} disabled={pwdChanging}>
                {pwdChanging ? "Changing..." : "Update Password"}
              </button>
            </div>
          </div>

          {/* DigiLocker — Certificates — student only */}
          {!isAdmin && (
            <div className="profile-card digilocker-card">
              <div className="digilocker-header">
                <div>
                  <h3>DigiLocker</h3>
                  <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                    {(user.certifications || []).length} certificate{(user.certifications || []).length !== 1 ? 's' : ''} stored
                    {' · '}<span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/digilocker')}>View All →</span>
                  </p>
                </div>
                <div className="digilocker-upload">
                  <input
                    placeholder="Certificate name (optional)"
                    value={certName}
                    onChange={e => setCertName(e.target.value)}
                    className="cert-name-input"
                  />
                  <button
                    className="btn-action-profile upload"
                    onClick={() => certInputRef.current?.click()}
                    disabled={certUploading}
                  >
                    {certUploading ? "Uploading..." : "Upload"}
                  </button>
                  <input ref={certInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" hidden onChange={handleCertUpload} />
                </div>
              </div>

              <div className="cert-grid">
                {(user.certifications || []).length > 0 ? (
                  user.certifications.map((cert, i) => {
                    const isObj = typeof cert === 'object';
                    const name = isObj ? cert.name : cert;
                    const isPDF = name?.toLowerCase().endsWith('.pdf');
                    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '');
                    const date = isObj && cert.uploadedAt ? new Date(cert.uploadedAt).toLocaleDateString() : '';
                    const sizeKB = isObj && cert.size ? Math.round(cert.size / 1024) : null;

                    return (
                      <div key={isObj ? cert.id || i : i} className="cert-card">
                        <div className="cert-icon">
                          {isPDF ? 'PDF' : isImage ? 'IMG' : 'FILE'}
                        </div>
                        <div className="cert-info">
                          <span className="cert-name">{name}</span>
                          <span className="cert-meta">
                            {date}{sizeKB ? ` · ${sizeKB} KB` : ''}
                          </span>
                        </div>
                        <div className="cert-actions-row">
                          {isObj && cert.url && (
                            <button className="cert-btn view" onClick={() => viewCertificate(cert)} title="View">View</button>
                          )}
                          {isObj && cert.id && (
                            <button className="cert-btn delete" onClick={() => handleCertDelete(cert.id)} title="Delete">Delete</button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="cert-empty">
                    <span className="cert-empty-icon" style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>No certificates</span>
                    <p>No certificates uploaded yet.</p>
                    <p className="muted" style={{ fontSize: '0.75rem' }}>Upload PDF, JPG, or PNG files to build your DigiLocker.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value || "-"}</span>
    </div>
  );
}
