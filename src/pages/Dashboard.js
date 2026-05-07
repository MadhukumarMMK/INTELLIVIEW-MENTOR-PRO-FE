import React, { useEffect, useMemo, useState, useContext } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { ThemeContext } from "../context/ThemeContext";
import Skeleton, { SkeletonText } from "../components/Skeleton";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import { Award, Star, TrendingUp, PieChart } from "lucide-react";
import "./Dashboard.css";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement,
  Title, Tooltip, Legend, Filler
);

export default function Dashboard() {
  const navigate = useNavigate();
  const { isDarkMode } = useContext(ThemeContext);
  const [user] = useState(JSON.parse(localStorage.getItem("user") || "{}"));
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeInterviewsCount, setActiveInterviewsCount] = useState(0);
  const [realStats, setRealStats] = useState({
    totalInterviews: 0,
    avgAccuracy: 0,
    bestScore: 0,
    confidenceAvg: 0
  });
  const [maxSlots, setMaxSlots] = useState(6);
  // Expo Mode flag + leaderboard preview shown only when expo mode is on.
  // Polls every 15s so it stays in sync with new completions during the expo.
  const [expoMode, setExpoMode] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        try {
          const settingsRes = await axios.get("/admin/settings");
          if (settingsRes.data?.max_interviews) setMaxSlots(settingsRes.data.max_interviews);
          setExpoMode(!!settingsRes.data?.expo_mode);
        } catch (_) {}

        const res = await axios.get(`/interviews/history/${user.roll_no}`);
        const data = res.data || [];

        setHistory(data);
        // Only completed + NON-archived interviews count toward the slot limit.
        setActiveInterviewsCount(data.filter(i => i.status === 2 && !i.archived).length);

        const completed = data.filter(i => i.status === 2);
        if (completed.length > 0) {
          const totalAcc = completed.reduce((a, c) => a + (c.overall_score || 0), 0);
          const best = Math.max(...completed.map(i => i.overall_score || 0));
          const withEmotions = completed.filter(i => i.emotions?.emotions?.neutral != null);
          const totalConf = withEmotions.reduce((a, c) => a + (c.emotions.emotions.neutral * 100), 0);

          setRealStats({
            totalInterviews: completed.length,
            avgAccuracy: Math.round(totalAcc / completed.length),
            bestScore: Math.round(best),
            confidenceAvg: withEmotions.length > 0 ? Math.round(totalConf / withEmotions.length) : 0
          });
        }
      } catch (err) {
        console.error("Dashboard Sync Error:", err);
      } finally {
        setLoading(false);
      }
    };
    if (user.roll_no) fetchDashboardData();
    else setLoading(false);
  }, [user.roll_no]);

  // Expo Mode leaderboard: pull top scorers + auto-refresh every 15s while
  // the dashboard is open. Skipped entirely when expo mode is off.
  useEffect(() => {
    if (!expoMode) return;
    let alive = true;
    const fetchBoard = async () => {
      try {
        const res = await axios.get("/admin/leaderboard?limit=8");
        if (!alive) return;
        setLeaderboard(res.data?.leaderboard || []);
      } catch (err) {
        console.error("Leaderboard fetch error:", err);
      }
    };
    fetchBoard();
    const t = setInterval(fetchBoard, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [expoMode]);

  // ── Derived widgets: Strongest Skills (top 3 avg score per tech) ──
  const strongestSkills = useMemo(() => {
    const completed = history.filter(i => i.status === 2 && i.technology_name);
    const byTech = {};
    completed.forEach(i => {
      const t = i.technology_name;
      if (!byTech[t]) byTech[t] = { sum: 0, count: 0 };
      byTech[t].sum += (i.overall_score || 0);
      byTech[t].count += 1;
    });
    return Object.entries(byTech)
      .map(([tech, v]) => ({ tech, avg: v.sum / v.count, n: v.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
  }, [history]);

  // ── Favorite Skills (most frequently chosen tech) ──
  const favoriteSkills = useMemo(() => {
    const freq = {};
    history.forEach(i => {
      const t = i.technology_name;
      if (!t) return;
      freq[t] = (freq[t] || 0) + 1;
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 3).map(([tech, count]) => ({ tech, count }));
  }, [history]);

  // ── Adaptive nudge based on performance in the top-favorite tech ──
  const favoriteNudge = useMemo(() => {
    const top = favoriteSkills[0]?.tech;
    if (!top) return null;
    const lower = top.toLowerCase();
    const isBehavioral = lower.includes("hr") || lower.includes("behavioral") || lower.includes("resume technical");
    const completedOnTop = history.filter(i => i.status === 2 && i.technology_name === top);
    if (completedOnTop.length === 0) return null;
    const avg = Math.round(
      completedOnTop.reduce((s, i) => s + (i.overall_score || 0), 0) / completedOnTop.length
    );

    if (isBehavioral) {
      if (avg >= 75) return `You're averaging ${avg}% on ${top} — strong communicator profile.`;
      if (avg >= 50) return `${avg}% avg on ${top}. Try an HR round with tougher conflict scenarios.`;
      return `${avg}% on ${top}. Practice STAR-format answers to lift your behavioral score.`;
    }
    if (avg >= 80) return `${avg}% avg in ${top} — solid. Try a harder difficulty or pair it with another stack.`;
    if (avg >= 60) return `${avg}% avg in ${top}. One more focused round could push you past the 80% mark.`;
    if (avg >= 40) return `${avg}% avg in ${top}. Revisit the fundamentals before the next round.`;
    return `${avg}% avg in ${top}. Start with Easy difficulty and build back up.`;
  }, [favoriteSkills, history]);

  // ── Performance trend (line chart: score over time, last 10) ──
  const perfData = useMemo(() => {
    const completed = history
      .filter(i => i.status === 2)
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-10);
    return {
      labels: completed.map((i, idx) => {
        const d = new Date(i.createdAt);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }),
      datasets: [{
        label: "Score (%)",
        data: completed.map(i => Math.round(i.overall_score || 0)),
        fill: true,
        backgroundColor: "rgba(99, 102, 241, 0.18)",
        borderColor: "#6366f1",
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#6366f1"
      }]
    };
  }, [history]);

  // ── Difficulty distribution (doughnut) ──
  const diffData = useMemo(() => {
    const counts = { Easy: 0, Medium: 0, Hard: 0 };
    history.filter(i => i.status === 2).forEach(i => {
      if (counts[i.level] !== undefined) counts[i.level] += 1;
    });
    return {
      labels: ["Easy", "Medium", "Hard"],
      datasets: [{
        data: [counts.Easy, counts.Medium, counts.Hard],
        backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
        borderWidth: 0
      }]
    };
  }, [history]);

  // Chart.js can't resolve CSS variables, so compute concrete colors from current theme
  const tickColor = isDarkMode ? "#94a3b8" : "#4a6fa5";
  const labelColor = isDarkMode ? "#e2e8f0" : "#0a1628";
  const gridColor = isDarkMode ? "rgba(148, 163, 184, 0.12)" : "rgba(74, 111, 165, 0.15)";

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, max: 100, ticks: { color: tickColor }, grid: { color: gridColor } },
      x: { ticks: { color: tickColor }, grid: { display: false } }
    }
  };

  const doughnutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { color: labelColor } } }
  };

  const hasData = history.filter(i => i.status === 2).length > 0;
  const topFavorite = favoriteSkills[0]?.tech;

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-header-row">
        <div>
          <h1 className="greeting-text">Welcome back, {user.first_name || "Developer"}</h1>
          <p className="subtitle-text">Here's how you're progressing.</p>
        </div>

        <div className="limits-container">
          <div className="limits-text">
            <span>Interviews completed</span>
            <span>{activeInterviewsCount} / {maxSlots}</span>
          </div>
          <div className="limits-bar-bg">
            <div
              className={`limits-bar-fill ${activeInterviewsCount >= maxSlots ? 'danger' : ''}`}
              style={{ width: `${(activeInterviewsCount / maxSlots) * 100}%` }}
            ></div>
          </div>
          <small className="remaining-text">
            {maxSlots - activeInterviewsCount} interviews remaining
          </small>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total interviews</div>
          <div className="stat-value">
            {loading ? <Skeleton width={60} height={32} /> : realStats.totalInterviews}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg accuracy</div>
          <div className="stat-value">
            {loading ? <Skeleton width={80} height={32} /> : `${realStats.avgAccuracy}%`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best score</div>
          <div className="stat-value">
            {loading ? <Skeleton width={80} height={32} /> : `${realStats.bestScore}%`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Confidence avg</div>
          <div className="stat-value">
            {loading ? <Skeleton width={80} height={32} /> : `${realStats.confidenceAvg}%`}
          </div>
        </div>
      </div>

      {/* Expo Mode leaderboard preview — top 8 scorers ranked by combined
          accuracy + confidence. Polls every 15s. Hidden when expo_mode is off. */}
      {expoMode && (
        <section className="dash-leaderboard">
          <div className="dash-lb-head">
            <div>
              <div className="dash-lb-eyebrow">
                <span className="dash-lb-live-dot" />
                Live · Expo Leaderboard
              </div>
              <h2 className="dash-lb-title">Top Scorers</h2>
            </div>
            <button className="dash-lb-cta" onClick={() => navigate('/leaderboard')}>
              Open full board
            </button>
          </div>

          {leaderboard.length === 0 ? (
            <div className="dash-lb-empty">No interviews on the board yet — be the first.</div>
          ) : (
            <ol className="dash-lb-list">
              {leaderboard.map((r, i) => {
                const acc = Math.round(r.overall_score || 0);
                const conf = Math.round(r.avg_confidence || 0);
                const combined = Math.round(r.combined_score || 0);
                return (
                  <li key={r._id} className={`dash-lb-row ${i === 0 ? 'is-top' : ''}`}>
                    <span className="dash-lb-rank">#{i + 1}</span>
                    <span className="dash-lb-name">{r.candidate_name || 'Anonymous'}</span>
                    <span className="dash-lb-tech">{r.technology_name || 'Interview'}</span>
                    <span className="dash-lb-metrics">
                      <span>Acc {acc}%</span>
                      <span className="dash-lb-sep">·</span>
                      <span>Conf {conf}%</span>
                    </span>
                    <span className="dash-lb-score">{combined}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {loading ? (
        // Skeleton layout that mirrors the real analytics grid — gives users
        // a preview of the page shape so they don't feel like they're staring
        // at a blank screen / generic spinner. Modern UX pattern.
        <div className="analytics-grid">
          <div className="analytics-card span-2">
            <div className="analytics-head">
              <Skeleton width={44} height={44} radius={12} />
              <div style={{ flex: 1 }}>
                <Skeleton width="40%" height={18} block />
                <div style={{ height: 8 }} />
                <Skeleton width="80%" height={12} block />
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Skeleton width="20%" height={12} />
                  <Skeleton width="100%" height={8} radius={4} style={{ flex: 1 }} />
                  <Skeleton width={40} height={12} />
                </div>
              ))}
            </div>
          </div>
          <div className="analytics-card">
            <div className="analytics-head">
              <Skeleton width={44} height={44} radius={12} />
              <Skeleton width="55%" height={18} />
            </div>
            <div style={{ marginTop: 16 }}>
              <SkeletonText lines={4} lineHeight={12} />
            </div>
          </div>
          <div className="analytics-card span-2">
            <div className="analytics-head">
              <Skeleton width={44} height={44} radius={12} />
              <div style={{ flex: 1 }}>
                <Skeleton width="50%" height={18} block />
                <div style={{ height: 8 }} />
                <Skeleton width="70%" height={12} block />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Skeleton width="100%" height={180} radius={8} block />
            </div>
          </div>
          <div className="analytics-card">
            <div className="analytics-head">
              <Skeleton width={44} height={44} radius={12} />
              <Skeleton width="55%" height={18} />
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
              <Skeleton width={140} height={140} radius="50%" />
            </div>
          </div>
        </div>
      ) : !hasData ? (
        <div className="empty-analytics">
          <h3>No interview data yet</h3>
          <p>Complete your first interview to start seeing analytics here.</p>
          <button className="btn-action btn-blue" onClick={() => navigate("/interviews")}>
            Start your first interview
          </button>
        </div>
      ) : (
        <>
          <div className="analytics-grid">
            {/* Strongest Skills */}
            <div className="analytics-card span-2">
              <div className="analytics-head">
                <div className="analytics-icon icon-strongest"><Award size={22} strokeWidth={2} /></div>
                <div>
                  <h3>Strongest Skills</h3>
                  <p>Top-performing technologies based on your interview scores. Keep honing your expertise to stay ahead!</p>
                </div>
              </div>
              <div className="analytics-skill-bars">
                {strongestSkills.length > 0 ? strongestSkills.map(s => (
                  <div key={s.tech} className="analytics-skill-row">
                    <span className="analytics-skill-label">{s.tech}</span>
                    <div className="analytics-skill-track">
                      <div className="analytics-skill-fill" style={{ width: `${Math.round(s.avg)}%` }}></div>
                    </div>
                    <span className="analytics-skill-pct">{s.avg.toFixed(1)}%</span>
                  </div>
                )) : <p className="analytics-skill-empty muted">Complete a few interviews to rank your strongest skills.</p>}
              </div>
            </div>

            {/* Favorite Skills */}
            <div className="analytics-card">
              <div className="analytics-head">
                <div className="analytics-icon icon-favorite"><Star size={22} strokeWidth={2} /></div>
                <div>
                  <h3>Your Favorite Skills</h3>
                </div>
              </div>
              <div className="favorite-body">
                {topFavorite ? (
                  <>
                    <p className="favorite-lead">
                      You've chosen <span className="accent-name">{topFavorite}</span> the most!
                    </p>
                    <p className="favorite-sub">Top selections by frequency</p>
                    <ul>
                      {favoriteSkills.map(f => (
                        <li key={f.tech}>
                          {f.tech} <span className="favorite-count">· {f.count} time{f.count === 1 ? "" : "s"}</span>
                        </li>
                      ))}
                    </ul>
                    {favoriteNudge && <p className="favorite-nudge">{favoriteNudge}</p>}
                  </>
                ) : (
                  <p className="favorite-sub">No selections yet.</p>
                )}
              </div>
            </div>

            {/* Performance trend */}
            <div className="analytics-card span-2">
              <div className="analytics-head">
                <div className="analytics-icon icon-chart"><TrendingUp size={22} strokeWidth={2} /></div>
                <div>
                  <h3>Performance Trend</h3>
                  <p>Your score across the last 10 interviews.</p>
                </div>
              </div>
              <div className="chart-area">
                <Line data={perfData} options={chartOpts} />
              </div>
            </div>

            {/* Difficulty distribution */}
            <div className="analytics-card">
              <div className="analytics-head">
                <div className="analytics-icon icon-doughnut"><PieChart size={22} strokeWidth={2} /></div>
                <div>
                  <h3>Difficulty Mix</h3>
                </div>
              </div>
              <div className="chart-area chart-area-small">
                <Doughnut data={diffData} options={doughnutOpts} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
