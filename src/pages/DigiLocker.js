import React, { useState, useEffect, useRef } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import IntelliLoader from "../components/IntelliLoader";
import { SERVER_URL } from "../api/config";
import { LayoutGrid, List, FileText, Image as ImageIcon, File, X as XIcon, Eye, Download, Trash2, FolderOpen } from "lucide-react";
import "./DigiLocker.css";

export default function DigiLocker() {
  const navigate = useNavigate();
  const notify = useNotification();
  const certInputRef = useRef(null);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [certName, setCertName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewCert, setPreviewCert] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  useEffect(() => {
    const fetchCerts = async () => {
      try {
        const res = await axios.get(`/user/profile/${user.roll_no}`);
        setCerts(res.data.certifications || []);
      } catch (err) {
        notify.error("Failed to load certificates");
      } finally {
        setLoading(false);
      }
    };
    if (user.roll_no) fetchCerts();
  }, [user.roll_no]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("certificate", file);
    formData.append("roll_no", user.roll_no);
    formData.append("cert_name", certName || file.name);
    try {
      const res = await axios.post("/user/upload-certification", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setCerts(res.data.certifications);
      setCertName('');
      notify.success("Certificate uploaded!");
    } catch (err) {
      notify.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (certInputRef.current) certInputRef.current.value = '';
    }
  };

  const handleDelete = async (certId) => {
    const ok = await notify.confirm("Remove this certificate permanently?", "Delete Certificate");
    if (!ok) return;
    try {
      const res = await axios.delete(`/user/certification/${user.roll_no}/${certId}`);
      setCerts(res.data.certifications);
      if (previewCert?.id === certId) setPreviewCert(null);
      notify.success("Certificate removed.");
    } catch (err) {
      notify.error("Failed to delete.");
    }
  };

  const openPreview = (cert) => {
    setPreviewCert(cert);
  };

  const downloadCert = (cert) => {
    const link = document.createElement('a');
    link.href = `${SERVER_URL}${cert.url}`;
    link.download = cert.name;
    link.click();
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const isImage = (name) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name || '');
  const isPDF = (name) => /\.pdf$/i.test(name || '');

  if (loading) return <div className="digi-wrapper"><IntelliLoader message="Loading DigiLocker" /></div>;

  return (
    <div className="digi-wrapper">
      {/* Header */}
      <div className="digi-header">
        <div>
          <h1>DigiLocker</h1>
          <p className="digi-subtitle">{certs.length} certificate{certs.length !== 1 ? 's' : ''} stored securely</p>
        </div>
        <div className="digi-header-actions">
          <div className="view-toggle-group" role="group" aria-label="View mode">
            <button
              className={`view-toggle ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              title="Grid view"
            ><LayoutGrid size={16} strokeWidth={2} /></button>
            <button
              className={`view-toggle ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
            ><List size={16} strokeWidth={2} /></button>
          </div>
          <button className="digi-back" onClick={() => navigate("/profile")}>Back to Profile</button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="digi-upload-bar">
        <input
          className="digi-name-input"
          placeholder="Certificate name (optional)"
          value={certName}
          onChange={e => setCertName(e.target.value)}
        />
        <button className="digi-upload-btn" onClick={() => certInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload Certificate"}
        </button>
        <input ref={certInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" hidden onChange={handleUpload} />
      </div>

      {/* Main Content — Split view when previewing */}
      <div className={`digi-content ${previewCert ? 'split' : ''}`}>
        {/* Certificate List/Grid */}
        <div className={`digi-certs ${viewMode}`}>
          {certs.length === 0 ? (
            <div className="digi-empty">
              <FolderOpen size={42} strokeWidth={1.5} className="digi-empty-icon" />
              <h3>Your DigiLocker is empty</h3>
              <p>Upload your certificates, achievements, and credentials. Supported formats: PDF, JPG, PNG.</p>
            </div>
          ) : (
            certs.map((cert, i) => {
              const isObj = typeof cert === 'object';
              const name = isObj ? cert.name : cert;
              const isImg = isImage(name);
              const isPdf = isPDF(name);
              const isActive = previewCert?.id === (isObj ? cert.id : i);

              return (
                <div
                  key={isObj ? cert.id || i : i}
                  className={`digi-cert-card ${isActive ? 'active' : ''}`}
                  onClick={() => isObj && openPreview(cert)}
                >
                  {/* Thumbnail */}
                  <div className={`cert-thumb ${isPdf ? 'thumb-pdf' : isImg ? 'thumb-img' : 'thumb-file'}`}>
                    {isObj && isImg && cert.url ? (
                      <img src={`${SERVER_URL}${cert.url}`} alt={name} className="cert-thumb-img" />
                    ) : (
                      <span className="cert-thumb-icon">
                        {isPdf ? <FileText size={28} strokeWidth={1.6} />
                          : isImg ? <ImageIcon size={28} strokeWidth={1.6} />
                            : <File size={28} strokeWidth={1.6} />}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="cert-card-info">
                    <span className="cert-card-name">{name}</span>
                    <span className="cert-card-meta">
                      {isObj ? `${formatDate(cert.uploadedAt)}${cert.size ? ' · ' + formatSize(cert.size) : ''}` : ''}
                    </span>
                  </div>

                  {/* Actions */}
                  {isObj && (
                    <div className="cert-card-actions" onClick={e => e.stopPropagation()}>
                      {cert.url && <button className="cert-action-btn view" onClick={() => openPreview(cert)} title="View"><Eye size={14} strokeWidth={2} /></button>}
                      {cert.url && <button className="cert-action-btn download" onClick={() => downloadCert(cert)} title="Download"><Download size={14} strokeWidth={2} /></button>}
                      {cert.id && <button className="cert-action-btn del" onClick={() => handleDelete(cert.id)} title="Delete"><Trash2 size={14} strokeWidth={2} /></button>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Preview Panel */}
        {previewCert && (
          <div className="digi-preview">
            <div className="preview-header">
              <h3>{previewCert.name}</h3>
              <button className="preview-close" onClick={() => setPreviewCert(null)} aria-label="Close preview"><XIcon size={18} strokeWidth={2} /></button>
            </div>
            <div className="preview-body">
              {isImage(previewCert.name) ? (
                <img src={`${SERVER_URL}${previewCert.url}`} alt={previewCert.name} className="preview-image" />
              ) : isPDF(previewCert.name) ? (
                <iframe
                  src={`${SERVER_URL}${previewCert.url}`}
                  title={previewCert.name}
                  className="preview-pdf"
                />
              ) : (
                <div className="preview-unsupported">
                  <File size={40} strokeWidth={1.5} />
                  <p>Preview not available for this file type.</p>
                </div>
              )}
            </div>
            <div className="preview-footer">
              <span className="preview-meta">
                {formatDate(previewCert.uploadedAt)} · {formatSize(previewCert.size)}
              </span>
              <div className="preview-actions">
                <button className="preview-btn preview-btn-primary" onClick={() => downloadCert(previewCert)}>
                  <Download size={15} strokeWidth={2} />
                  <span>Download</span>
                </button>
                <button className="preview-btn preview-btn-danger" onClick={() => handleDelete(previewCert.id)}>
                  <Trash2 size={15} strokeWidth={2} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
