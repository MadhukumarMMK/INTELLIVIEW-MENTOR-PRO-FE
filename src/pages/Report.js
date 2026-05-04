import React, { useEffect, useState, useRef, useContext, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "../api/axiosInstance";
import { useNotification } from "../context/NotificationContext";
import { ThemeContext } from "../context/ThemeContext";
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
import ShareMenu from "../components/ShareMenu";
import { buildShareUrl } from "../api/config";
import "./Report.css";

ChartJS.register(Tooltip, Legend, ArcElement);

export default function Report() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const { isDarkMode } = useContext(ThemeContext);
  const reportRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Theme-aware colors — Chart.js can't parse CSS variables, so we resolve
  // them to actual hex values based on the current theme.
  const chartTheme = useMemo(() => {
    if (isDarkMode) {
      return {
        legend: '#94a3b8',                 // --text-secondary (dark)
        sliceBorder: '#121a2e',            // --bg-surface (dark) — separates slices
        // Lighter blues read well on dark navy
        palette: ['#60a5fa', '#3b82f6', '#2563eb', '#7c3aed', '#a78bfa', '#c4b5fd', '#dbeafe'],
      };
    }
    return {
      legend: '#4a6fa5',                  // --text-secondary (light)
      sliceBorder: '#ffffff',             // --bg-surface (light) — white between slices
      // Saturated, deeper blues read well on white
      palette: ['#1e40af', '#2563eb', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#c084fc'],
    };
  }, [isDarkMode]);

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
    ? `I scored ${Math.round(data.overall_score || 0)}% on my ${data.technology_name || "Interview"} mock interview on IntelliView!`
    : "";

  const shareUrl = data?.roll_no
    ? buildShareUrl(data.roll_no)
    : window.location.href;
  const shareTitle = data
    ? `${data.technology_name || "Interview"} Report · IntelliView`
    : "IntelliView Report";

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

  const safeQuestions = Array.isArray(data.question_details) ? data.question_details : [];
  const emotions = data.emotions?.emotions || {};

  // Real-interview semantics: a skipped question counts as a performance
  // miss, not an "exclude from grading" pass. Average over ALL questions
  // (including skipped, which contribute 0). Mirrors what an actual interviewer
  // would do — you can't game your score by skipping the hard ones.
  const totalCount = safeQuestions.length;
  const avgAccuracy = totalCount > 0
    ? Math.round(safeQuestions.reduce((sum, q) => sum + (q.was_skipped ? 0 : (q.accuracy || 0)), 0) / totalCount)
    : 0;
  const avgConfidence = totalCount > 0
    ? Math.round(safeQuestions.reduce((sum, q) => sum + (q.was_skipped ? 0 : (q.fused_confidence || 0)), 0) / totalCount)
    : 0;
  const avgClarity = totalCount > 0
    ? Math.round(safeQuestions.reduce((sum, q) => sum + (q.was_skipped ? 0 : (q.audio_confidence || 0)), 0) / totalCount)
    : 0;

  // Theme-aware emotion palette — single hue family, adapts to light/dark
  const emotionLabels = Object.keys(emotions).length > 0 ? Object.keys(emotions) : ["Neutral"];
  const emotionValues = Object.keys(emotions).length > 0
    ? Object.values(emotions).map(v => Math.round(v * 100))
    : [100];

  const emotionData = {
    labels: emotionLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
    datasets: [{
      data: emotionValues,
      backgroundColor: chartTheme.palette,
      borderColor: chartTheme.sliceBorder,
      borderWidth: 2,
      hoverOffset: 6,
    }],
  };

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
      {/* --- Header --- */}
      <div className="report-header">
        <div className="report-title-block">
          <h1>{data.technology_name || "Interview"} Report</h1>
          <p className="report-meta">
            <span>{new Date(data.start_date_time).toLocaleDateString("en-GB", { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="meta-sep">·</span>
            <span>{safeQuestions.length} {safeQuestions.length === 1 ? "question" : "questions"}</span>
            <span className="meta-sep">·</span>
            <span className="completed-badge">Completed</span>
          </p>
        </div>
        <div className="report-actions">
          <button className="action-btn download-btn" onClick={handleDownloadPDF} disabled={downloading}>
            {downloading ? "Generating..." : "Download PDF"}
          </button>
          <ShareMenu url={shareUrl} text={shareText} title={shareTitle} />
          <button className="back-btn" onClick={() => navigate("/myreports")}>← My Reports</button>
        </div>
      </div>

      {/* --- Top Stats --- */}
      <div className="stats-row">
        <StatBox label="Accuracy" value={avgAccuracy} />
        <StatBox label="Confidence" value={avgConfidence} />
        <StatBox label="Clarity" value={avgClarity} />
      </div>

      <div className="report-grid">
        {/* --- Left: Charts --- */}
        <div className="report-left">
          <div className="report-card">
            <h3 className="card-title">Emotion Analysis</h3>
            <div className="chart-container">
              <Pie data={emotionData} options={{
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      color: chartTheme.legend,
                      font: { size: 12, family: "'Inter', sans-serif" },
                      padding: 12,
                      usePointStyle: true,
                      pointStyle: 'circle'
                    }
                  }
                }
              }} />
            </div>
          </div>

          {Object.keys(skillMap).length > 0 && (
            <div className="report-card">
              <h3 className="card-title">Difficulty Breakdown</h3>
              <div className="skill-bars">
                {Object.entries(skillMap).map(([skill, d]) => {
                  const avg = Math.round(d.total / d.count);
                  return (
                    <div key={skill} className="skill-row">
                      <span className="skill-name">{skill}</span>
                      <div className="skill-bar-track">
                        <div className="skill-bar-fill" style={{ width: `${avg}%` }}></div>
                      </div>
                      <span className="skill-pct">{avg}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* --- Right: Question Analysis --- */}
        <div className="report-right">
          <div className="report-card">
            <h3 className="card-title">Question Analysis</h3>
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

function StatBox({ label, value }) {
  const tone = value >= 70 ? "good" : value >= 40 ? "fair" : "poor";
  return (
    <div className={`stat-box stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}<span className="stat-unit">%</span></div>
    </div>
  );
}

function scoreTone(value) {
  if (value >= 70) return "good";
  if (value >= 40) return "fair";
  return "poor";
}

function AccordionItem({ index, question: q }) {
  const [open, setOpen] = useState(index === 0);
  const bodyRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (open) {
      const height = innerRef.current?.scrollHeight || 0;
      body.style.height = '0px';
      body.offsetHeight; // eslint-disable-line no-unused-expressions
      body.style.height = height + 'px';
      body.style.opacity = '1';
      const onEnd = () => { body.style.height = 'auto'; };
      body.addEventListener('transitionend', onEnd, { once: true });
    } else {
      const height = body.scrollHeight;
      body.style.height = height + 'px';
      body.offsetHeight; // eslint-disable-line no-unused-expressions
      body.style.height = '0px';
      body.style.opacity = '0';
    }
  }, [open]);

  const tone = q.was_skipped ? "skipped" : scoreTone(q.accuracy || 0);
  const difficulty = (q.difficulty || 'medium').toLowerCase();

  return (
    <div className={`accordion-item ${open ? 'open' : ''}`}>
      <button className="accordion-header" onClick={() => setOpen(!open)} type="button">
        <div className="accordion-left">
          <span className="q-number">Q{index + 1}</span>
          <span className={`q-diff q-diff-${difficulty}`}>{q.difficulty}</span>
          {q.was_skipped ? (
            <span className="q-score q-score-skipped">Skipped</span>
          ) : (
            <span className={`q-score q-score-${tone}`}>{q.accuracy || 0}%</span>
          )}
        </div>
        <span className={`accordion-arrow ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
      </button>

      <div className="accordion-body" ref={bodyRef} style={{ height: index === 0 ? 'auto' : '0px', opacity: index === 0 ? 1 : 0 }}>
        <div ref={innerRef} className="accordion-inner">
          <section className="qa-section">
            <h4 className="qa-label">Question</h4>
            <p className="qa-text">{q.question}</p>
          </section>

          {!q.was_skipped && (
            <>
              <section className="qa-section">
                <h4 className="qa-label">Your Answer</h4>
                <p className="qa-text">{q.answer || <em className="qa-empty">No answer recorded</em>}</p>
              </section>

              <section className="qa-section">
                <h4 className="qa-label">AI Feedback</h4>
                <p className="qa-text qa-feedback">{q.feedback}</p>
              </section>

              <div className="qa-metrics">
                <Metric label="Accuracy" value={`${q.accuracy || 0}%`} />
                <Metric label="Confidence" value={`${q.fused_confidence || 0}%`} />
                {q.audio_confidence != null && <Metric label="Audio" value={`${q.audio_confidence}%`} />}
                {q.new_difficulty && q.new_difficulty !== q.difficulty && (
                  <Metric label="Next level" value={`${q.difficulty} → ${q.new_difficulty}`} highlight />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }) {
  return (
    <div className={`metric ${highlight ? 'metric-highlight' : ''}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
