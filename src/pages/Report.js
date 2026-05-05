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

  // Emotion-specific palette — each emotion maps to a hue that intuitively
  // communicates that feeling (joy=gold, calm=blue, anger=red, etc.). Two
  // shade families: lighter for dark mode, deeper for light mode.
  const EMOTION_COLORS = useMemo(() => (isDarkMode ? {
    happy:    '#fbbf24',   // amber  — joy
    neutral:  '#94a3b8',   // slate  — calm baseline
    sad:      '#60a5fa',   // sky    — melancholy
    angry:    '#f87171',   // red    — frustration
    fear:     '#a78bfa',   // violet — anxiety
    surprise: '#34d399',   // emerald — alert
    disgust:  '#84cc16',   // lime   — aversion
    fallback: '#cbd5e1',
  } : {
    happy:    '#d97706',
    neutral:  '#475569',
    sad:      '#1d4ed8',
    angry:    '#b91c1c',
    fear:     '#6d28d9',
    surprise: '#047857',
    disgust:  '#65a30d',
    fallback: '#64748b',
  }), [isDarkMode]);

  // Theme-aware colors — Chart.js can't parse CSS variables, so we resolve
  // them to actual hex values based on the current theme.
  const chartTheme = useMemo(() => {
    return {
      legend: isDarkMode ? '#94a3b8' : '#4a6fa5',
      sliceBorder: isDarkMode ? '#121a2e' : '#ffffff',
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
      // html2canvas 1.4 can't parse modern CSS like color-mix(), oklch(),
      // lab(), etc. — encountering one throws and aborts the whole capture.
      // We patch the cloned document via onclone to strip those out before
      // html2canvas reads computed styles. We don't touch the live DOM so
      // the on-screen UI keeps its modern colors.
      // Replace any color-mix()/oklch()/lab()/etc. function calls in the
      // given string with a fallback color, while correctly skipping over
      // nested parens (e.g., color-mix(in srgb, rgb(255,0,0) 30%, transparent)).
      const FUNC_OPEN = /(color-mix|oklch|oklab|lab|lch)\(/i;
      const replaceColorFns = (input, fallback) => {
        if (!input || typeof input !== 'string') return input;
        let result = input;
        while (true) {
          const m = result.match(FUNC_OPEN);
          if (!m) break;
          const start = m.index;
          let depth = 1;
          let i = start + m[0].length;
          while (i < result.length && depth > 0) {
            const ch = result[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            i++;
          }
          if (depth !== 0) break; // unbalanced — bail to avoid infinite loop
          result = result.slice(0, start) + fallback + result.slice(i);
        }
        return result;
      };
      const containsUnsupported = (s) => typeof s === 'string' && FUNC_OPEN.test(s);

      const stripUnsupportedColors = (root) => {
        // Inline-style attribute scrub
        root.querySelectorAll('[style]').forEach((el) => {
          const s = el.getAttribute('style');
          if (containsUnsupported(s)) {
            el.setAttribute('style', replaceColorFns(s, 'transparent'));
          }
        });
        // Walk the cloned document's stylesheets and rewrite any cssText
        // that contains color-mix / oklch / etc. This catches stylesheet
        // rules (not just inline styles) so html2canvas never sees them.
        try {
          const sheets = root.styleSheets;
          for (let i = 0; i < sheets.length; i++) {
            let rules;
            try { rules = sheets[i].cssRules; } catch (_) { continue; } // CORS-blocked sheet
            if (!rules) continue;
            for (let j = 0; j < rules.length; j++) {
              const rule = rules[j];
              if (!rule || !rule.style) continue;
              for (let k = 0; k < rule.style.length; k++) {
                const prop = rule.style[k];
                const val = rule.style.getPropertyValue(prop);
                if (containsUnsupported(val)) {
                  // Replace problem function with a flat fallback color.
                  // Borders/box-shadows lose tint but the layout is preserved.
                  rule.style.setProperty(prop, replaceColorFns(val, 'rgba(148,163,184,0.25)'));
                }
              }
            }
          }
        } catch (_) { /* best-effort */ }
        // Inject explicit overrides for the rules we know about — covers
        // any stylesheet we couldn't reach (cross-origin) and gives nicer
        // tints than the generic fallback above.
        const style = root.ownerDocument.createElement('style');
        style.textContent = `
          .completed-badge { border-color: rgba(34, 197, 94, 0.3) !important; }
          .emotion-swatch { box-shadow: none !important; }
          .emotion-bar-track { background: rgba(148, 163, 184, 0.22) !important; }
          .q-diff-easy   { border-color: rgba(16, 185, 129, 0.35) !important; }
          .q-diff-medium { border-color: rgba(245, 158, 11, 0.35) !important; }
          .q-diff-hard   { border-color: rgba(239, 68, 68, 0.35) !important; }
          .q-score-good { background: rgba(16, 185, 129, 0.15) !important; }
          .q-score-fair { background: rgba(245, 158, 11, 0.15) !important; }
          .q-score-poor { background: rgba(239, 68, 68, 0.15) !important; }
        `;
        root.head?.appendChild(style);
      };

      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0a0f1a',
        scrollY: -window.scrollY,
        windowHeight: reportRef.current.scrollHeight,
        onclone: (clonedDoc) => stripUnsupportedColors(clonedDoc),
        // Don't kill the whole capture if a single image fails to load.
        imageTimeout: 8000,
        logging: false,
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

  // Each emotion gets its own meaningful hue (joy=gold, calm=blue, anger=red, …).
  // Sort by value so the dominant emotion takes the prime spot in the legend.
  const emotionLabels = Object.keys(emotions).length > 0 ? Object.keys(emotions) : ["neutral"];
  const emotionRaw = Object.keys(emotions).length > 0
    ? emotionLabels.map(k => ({ key: k, value: Math.round((emotions[k] || 0) * 100) }))
    : [{ key: "neutral", value: 100 }];
  const emotionSorted = [...emotionRaw].sort((a, b) => b.value - a.value);
  const topEmotion = emotionSorted[0];

  const emotionData = {
    labels: emotionSorted.map(e => e.key.charAt(0).toUpperCase() + e.key.slice(1)),
    datasets: [{
      data: emotionSorted.map(e => e.value),
      backgroundColor: emotionSorted.map(e => EMOTION_COLORS[e.key] || EMOTION_COLORS.fallback),
      borderColor: chartTheme.sliceBorder,
      borderWidth: 3,
      hoverOffset: 10,
      hoverBorderWidth: 3,
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

  // Time stats — prefer the totals computed at interview-end and stored on
  // the interview doc; otherwise sum from question_details for older interviews
  // that didn't have timing.
  const totalTimeTaken = data.total_time_taken
    ?? safeQuestions.reduce((sum, q) => sum + (Number(q.time_taken) || 0), 0);
  const avgTimePerQuestion = data.avg_time_per_question
    ?? (safeQuestions.length > 0 ? Math.round(totalTimeTaken / safeQuestions.length) : 0);

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

      {/* --- Time Stats — total interview duration + average per question --- */}
      {(totalTimeTaken > 0 || avgTimePerQuestion > 0) && (
        <div className="time-stats-row">
          <div className="time-stat">
            <span className="time-stat-label">Total time taken</span>
            <span className="time-stat-value">{formatDuration(totalTimeTaken)}</span>
          </div>
          <div className="time-stat-sep" aria-hidden="true">·</div>
          <div className="time-stat">
            <span className="time-stat-label">Avg per question</span>
            <span className="time-stat-value">{formatDuration(avgTimePerQuestion)}</span>
          </div>
        </div>
      )}

      <div className="report-grid">
        {/* --- Left: Charts --- */}
        <div className="report-left">
          <div className="report-card emotion-card">
            <div className="emotion-header">
              <h3 className="card-title">Emotion Analysis</h3>
              {topEmotion && topEmotion.value > 0 && (
                <div
                  className="emotion-top-chip"
                  style={{
                    background: hexToRgba(EMOTION_COLORS[topEmotion.key] || EMOTION_COLORS.fallback, 0.18),
                    borderColor: hexToRgba(EMOTION_COLORS[topEmotion.key] || EMOTION_COLORS.fallback, 0.5),
                    color: EMOTION_COLORS[topEmotion.key] || EMOTION_COLORS.fallback,
                  }}
                  title="Dominant emotion across the interview"
                >
                  <span className="emotion-top-label">Dominant</span>
                  <span className="emotion-top-name">
                    {topEmotion.key.charAt(0).toUpperCase() + topEmotion.key.slice(1)}
                  </span>
                  <span className="emotion-top-pct">{topEmotion.value}%</span>
                </div>
              )}
            </div>

            <div className="chart-container">
              <Pie data={emotionData} options={{
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: chartTheme.sliceBorder === '#ffffff' ? '#0a1628' : '#0f172a',
                    titleColor: '#f1f5f9',
                    bodyColor: '#e2e8f0',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                      label: (ctx) => `${ctx.label}: ${ctx.parsed}%`
                    }
                  }
                }
              }} />
            </div>

            {/* Custom legend — colored swatches with values, more readable
                than Chart.js's default and theme-aware. */}
            <div className="emotion-legend">
              {emotionSorted.map(e => (
                <div key={e.key} className="emotion-legend-row">
                  <span
                    className="emotion-swatch"
                    style={{ background: EMOTION_COLORS[e.key] || EMOTION_COLORS.fallback }}
                    aria-hidden="true"
                  />
                  <span className="emotion-name">
                    {e.key.charAt(0).toUpperCase() + e.key.slice(1)}
                  </span>
                  <div className="emotion-bar-track">
                    <div
                      className="emotion-bar-fill"
                      style={{
                        width: `${e.value}%`,
                        background: EMOTION_COLORS[e.key] || EMOTION_COLORS.fallback
                      }}
                    />
                  </div>
                  <span className="emotion-value">{e.value}%</span>
                </div>
              ))}
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

// Convert "#rrggbb" to "rgba(r, g, b, a)" — used for inline-style tints in
// the emotion chip. We avoid color-mix() here because html2canvas (1.4) used
// for PDF export can't parse it and the download fails.
function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(100, 116, 139, ${alpha})`;
  const v = hex.replace('#', '').trim();
  if (v.length !== 6) return `rgba(100, 116, 139, ${alpha})`;
  const r = parseInt(v.substring(0, 2), 16);
  const g = parseInt(v.substring(2, 4), 16);
  const b = parseInt(v.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Pretty-print a duration in seconds: 45s, 1m, 2m 30s
function formatDuration(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
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
                {(q.time_taken != null || q.time_limit != null) && (
                  <Metric
                    label="Time taken"
                    value={
                      q.time_limit
                        ? `${formatDuration(q.time_taken || 0)} / ${formatDuration(q.time_limit)}`
                        : formatDuration(q.time_taken || 0)
                    }
                  />
                )}
                {(q.auto_submitted || q.auto_skipped) && (
                  <Metric label="Submission" value="Auto-submitted (time expired)" highlight />
                )}
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
