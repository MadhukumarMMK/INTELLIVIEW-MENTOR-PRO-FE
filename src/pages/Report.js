import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "../api/axiosInstance";
import { useNotification } from "../context/NotificationContext";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import IntelliLoader from "../components/IntelliLoader";
import "./Report.css";

ChartJS.register(Tooltip, Legend, ArcElement);

export default function Report() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const reportRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      // 1. Expand all accordions before capture
      const accordionBodies = reportRef.current.querySelectorAll('.accordion-body');
      const originalStyles = [];
      accordionBodies.forEach(body => {
        originalStyles.push({ height: body.style.height, opacity: body.style.opacity, overflow: body.style.overflow, transition: body.style.transition });
        body.style.transition = 'none';
        body.style.height = 'auto';
        body.style.opacity = '1';
        body.style.overflow = 'visible';
      });

      // 2. Hide buttons that shouldn't appear in PDF
      const actions = reportRef.current.querySelector('.report-actions');
      if (actions) actions.style.display = 'none';

      // Small delay to let DOM settle
      await new Promise(r => setTimeout(r, 100));

      // 3. Capture
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0a0f1a',
        scrollY: -window.scrollY,
        windowHeight: reportRef.current.scrollHeight
      });

      // 4. Restore accordions
      accordionBodies.forEach((body, i) => {
        body.style.transition = originalStyles[i].transition;
        body.style.height = originalStyles[i].height;
        body.style.opacity = originalStyles[i].opacity;
        body.style.overflow = originalStyles[i].overflow;
      });
      if (actions) actions.style.display = '';

      // 5. Generate PDF with multi-page support
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let position = 0;
      let remaining = imgHeight;

      // First page
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
      remaining -= pdfPageHeight;

      // Additional pages if content overflows
      while (remaining > 0) {
        position -= pdfPageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
        remaining -= pdfPageHeight;
      }

      pdf.save(`IntelliView_Report_${data.technology_name || "Interview"}.pdf`);
      notify.success("Report downloaded as PDF!");
    } catch (err) {
      console.error("PDF Error:", err);
      notify.error("Failed to generate PDF. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const shareText = data
    ? `I scored ${data.overall_score || 0}% on my ${data.technology_name || "Interview"} mock interview on IntelliView!`
    : "";

  const shareUrl = window.location.href;

  const shareLinks = {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`,
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    notify.success("Link copied to clipboard!");
    setShareOpen(false);
  };

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await axios.get(`/interviews/report/${id}`);
        setData(res.data);
      } catch (err) {
        console.error("Error fetching report", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [id]);

  if (loading) return <IntelliLoader message="Loading report" size="fullscreen" />;
  if (!data) return <div className="error-container">Report not found.</div>;

  // Extract data safely
  const safeQuestions = Array.isArray(data.question_details) ? data.question_details : [];
  const emotions = data.emotions?.emotions || {};

  // Calculate stats
  const answered = safeQuestions.filter(q => !q.was_skipped);
  const avgAccuracy = answered.length > 0
    ? Math.round(answered.reduce((sum, q) => sum + (q.accuracy || 0), 0) / answered.length)
    : 0;
  const avgConfidence = answered.length > 0
    ? Math.round(answered.reduce((sum, q) => sum + (q.fused_confidence || 0), 0) / answered.length)
    : 0;
  const avgClarity = answered.length > 0
    ? Math.round(answered.reduce((sum, q) => sum + (q.audio_confidence || q.fused_confidence || 0), 0) / answered.length)
    : 0;

  // Emotion pie chart
  const emotionLabels = Object.keys(emotions).length > 0 ? Object.keys(emotions) : ["Neutral"];
  const emotionValues = Object.keys(emotions).length > 0
    ? Object.values(emotions).map(v => Math.round(v * 100))
    : [100];

  const emotionData = {
    labels: emotionLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
    datasets: [{
      data: emotionValues,
      backgroundColor: ["#f85149", "#8b949e", "#d29922", "#238636", "#58a6ff", "#bc8cff", "#4BC0C0"],
    }],
  };

  // Skill-wise breakdown (group questions by tech/difficulty)
  const skillMap = {};
  safeQuestions.forEach(q => {
    if (q.was_skipped) return;
    const skill = q.difficulty || "General";
    if (!skillMap[skill]) skillMap[skill] = { total: 0, count: 0 };
    skillMap[skill].total += q.accuracy || 0;
    skillMap[skill].count += 1;
  });

  return (
    <div className="report-wrapper" ref={reportRef}>
      <div className="report-header">
        <div>
          <h1>{data.technology_name || "Interview"} Report</h1>
          <p className="report-meta">
            {new Date(data.start_date_time).toLocaleDateString("en-GB", { day: 'numeric', month: 'long', year: 'numeric' })}
            {" - "}
            {safeQuestions.length} questions
            <span className="completed-badge">Completed</span>
          </p>
        </div>
        <div className="report-actions">
          {/* Download PDF */}
          <button className="action-btn download-btn" onClick={handleDownloadPDF} disabled={downloading}>
            {downloading ? "Generating..." : "Download PDF"}
          </button>

          {/* Share */}
          <div className="share-wrapper">
            <button className="action-btn share-btn" onClick={() => setShareOpen(!shareOpen)}>
              Share
            </button>
            {shareOpen && (
              <div className="share-dropdown">
                <a href={shareLinks.linkedin} target="_blank" rel="noopener noreferrer" className="share-item linkedin">LinkedIn</a>
                <a href={shareLinks.twitter} target="_blank" rel="noopener noreferrer" className="share-item twitter">Twitter / X</a>
                <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="share-item whatsapp">WhatsApp</a>
                <button className="share-item copy" onClick={handleCopyLink}>Copy Link</button>
              </div>
            )}
          </div>

          <button className="back-btn" onClick={() => navigate("/dashboard")}>Back</button>
        </div>
      </div>

      {/* --- Top Stats Row (per spec Screen 5) --- */}
      <div className="stats-row">
        <div className="stat-box">
          <div className="stat-label">Accuracy</div>
          <div className="stat-value" style={{ color: avgAccuracy >= 70 ? '#238636' : avgAccuracy >= 40 ? '#d29922' : '#f85149' }}>
            {avgAccuracy}%
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Confidence</div>
          <div className="stat-value" style={{ color: avgConfidence >= 70 ? '#238636' : avgConfidence >= 40 ? '#d29922' : '#f85149' }}>
            {avgConfidence}%
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Clarity</div>
          <div className="stat-value" style={{ color: avgClarity >= 70 ? '#238636' : avgClarity >= 40 ? '#d29922' : '#f85149' }}>
            {avgClarity}%
          </div>
        </div>
      </div>

      <div className="report-grid">
        {/* Left: Emotion Pie + Skill Breakdown */}
        <div className="report-left">
          <div className="report-card">
            <h3>Emotion Analysis</h3>
            <div className="chart-container">
              <Pie data={emotionData} options={{
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#8b949e' } } }
              }} />
            </div>
          </div>

          {Object.keys(skillMap).length > 0 && (
            <div className="report-card">
              <h3>Difficulty-wise Breakdown</h3>
              <div className="skill-bars">
                {Object.entries(skillMap).map(([skill, data]) => {
                  const avg = Math.round(data.total / data.count);
                  return (
                    <div key={skill} className="skill-row">
                      <span className="skill-name">{skill}</span>
                      <div className="skill-bar-track">
                        <div className="skill-bar-fill" style={{
                          width: `${avg}%`,
                          background: avg >= 70 ? '#238636' : avg >= 40 ? '#d29922' : '#f85149'
                        }}></div>
                      </div>
                      <span className="skill-pct">{avg}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Question-by-Question Accordion */}
        <div className="report-right">
          <div className="report-card">
            <h3>Question-by-Question Analysis</h3>
            <div className="questions-log">
              {safeQuestions.map((q, i) => (
                <AccordionItem key={i} index={i} question={q} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Unique accent colors per question
const qColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

function AccordionItem({ index, question: q }) {
  const [open, setOpen] = useState(index === 0);
  const bodyRef = useRef(null);
  const innerRef = useRef(null);
  const color = qColors[index % qColors.length];

  // Measure real content height and animate to exact pixel value
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (open) {
      const height = innerRef.current?.scrollHeight || 0;
      body.style.height = '0px';
      // Force reflow
      body.offsetHeight; // eslint-disable-line no-unused-expressions
      body.style.height = height + 'px';
      body.style.opacity = '1';
      // After transition, set auto so content can reflow
      const onEnd = () => { body.style.height = 'auto'; };
      body.addEventListener('transitionend', onEnd, { once: true });
    } else {
      // Collapse: set explicit height first, then animate to 0
      const height = body.scrollHeight;
      body.style.height = height + 'px';
      body.offsetHeight; // eslint-disable-line no-unused-expressions
      body.style.height = '0px';
      body.style.opacity = '0';
    }
  }, [open]);

  return (
    <div className={`accordion-item ${open ? 'open' : ''}`} style={{ borderLeftColor: color }}>
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <div className="accordion-left">
          <span className="q-badge" style={{ background: color }}>{`Q${index + 1}`}</span>
          <span className={`q-diff q-diff-${(q.difficulty || 'medium').toLowerCase()}`}>{q.difficulty}</span>
          {q.was_skipped ? (
            <span className="q-score-badge skipped-badge">Skipped</span>
          ) : (
            <span className="q-score-badge" style={{
              background: (q.accuracy || 0) >= 70 ? 'var(--success-light)' : (q.accuracy || 0) >= 40 ? 'var(--warning-light)' : 'var(--danger-light)',
              color: (q.accuracy || 0) >= 70 ? 'var(--success)' : (q.accuracy || 0) >= 40 ? 'var(--warning)' : 'var(--danger)'
            }}>
              {q.accuracy || 0}%
            </span>
          )}
        </div>
        <span className={`accordion-arrow ${open ? 'open' : ''}`}>&#9662;</span>
      </div>

      <div className="accordion-body" ref={bodyRef} style={{ height: index === 0 ? 'auto' : '0px', opacity: index === 0 ? 1 : 0 }}>
        <div ref={innerRef} className="accordion-inner">
          <div className="qa-block question-block" style={{ borderLeftColor: color }}>
            <span className="qa-label" style={{ color }}>Question</span>
            <p className="qa-text">{q.question}</p>
          </div>

          {!q.was_skipped && (
            <>
              <div className="qa-block answer-block">
                <span className="qa-label answer-label">Your Answer</span>
                <p className="qa-text">{q.answer}</p>
              </div>

              <div className="qa-block feedback-block">
                <span className="qa-label feedback-label">AI Feedback</span>
                <p className="qa-text feedback-text">{q.feedback}</p>
              </div>

              <div className="qa-metrics">
                <span>Accuracy: <strong>{q.accuracy || 0}%</strong></span>
                <span>Confidence: <strong>{q.fused_confidence || 0}%</strong></span>
                {q.audio_confidence != null && <span>Audio: <strong>{q.audio_confidence}%</strong></span>}
                {q.new_difficulty !== q.difficulty && (
                  <span className="diff-change">Level: {q.difficulty} → {q.new_difficulty}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
