import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axiosInstance";
import "./Leaderboard.css";

/**
 * Expo Leaderboard.
 * Polls /admin/leaderboard every 10s while the page is open. Top entry is
 * shown as a champion spotlight; ranks 2–N flow into a list below.
 *
 * Ranking metric (computed server-side):
 *   combined = 0.7 × overall_score + 0.3 × avg_confidence
 */
export default function Leaderboard() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [enabled, setEnabled] = useState(true);
    const intervalRef = useRef(null);

    useEffect(() => {
        // Quickly check if expo mode is on. If off, show a friendly notice
        // instead of the board (the route is still reachable, just empty).
        axios.get("/admin/settings")
            .then(res => setEnabled(!!res.data?.expo_mode))
            .catch(() => setEnabled(true)); // fail open — still try to load
    }, []);

    useEffect(() => {
        let alive = true;
        const fetchBoard = async () => {
            try {
                const res = await axios.get("/admin/leaderboard?limit=20");
                if (!alive) return;
                setRows(res.data?.leaderboard || []);
            } catch (err) {
                console.error("Leaderboard fetch error:", err);
            } finally {
                if (alive) setLoading(false);
            }
        };
        fetchBoard();
        // Poll every 10 seconds for live updates
        intervalRef.current = setInterval(fetchBoard, 10000);
        return () => {
            alive = false;
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const champion = useMemo(() => rows[0], [rows]);
    const rest = useMemo(() => rows.slice(1), [rows]);

    if (!enabled) {
        return (
            <div className="lb-page">
                <div className="lb-content">
                    <div className="lb-disabled-card">
                        <h1>Leaderboard</h1>
                        <p>The leaderboard is only available when Expo Mode is active. Ask an administrator to enable it.</p>
                        <button className="lb-cta" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="lb-page">
            <div className="lb-bg-orb lb-bg-orb-a" aria-hidden="true" />
            <div className="lb-bg-orb lb-bg-orb-b" aria-hidden="true" />

            <div className="lb-content">
                <div className="lb-hero">
                    <div className="lb-eyebrow">
                        <span className="lb-live-dot" />
                        Live · IntelliView Expo
                    </div>
                    <h1 className="lb-title">LEADERBOARD</h1>
                    <p className="lb-sub">
                        Top scorers ranked by accuracy and confidence combined.
                    </p>
                    <button className="lb-cta" onClick={() => navigate('/interviews')}>
                        Take an Interview
                    </button>
                </div>

                {loading ? (
                    <div className="lb-empty">Loading…</div>
                ) : rows.length === 0 ? (
                    <div className="lb-empty">
                        <div className="lb-empty-num">0</div>
                        <div className="lb-empty-msg">Be the first on the board.</div>
                    </div>
                ) : (
                    <>
                        {/* ===== Champion spotlight ===== */}
                        <div className="lb-champion">
                            <div className="lb-champion-rank">#1</div>
                            <div className="lb-champion-body">
                                <div className="lb-champion-label">Current Top Scorer</div>
                                <div className="lb-champion-name">
                                    {champion.candidate_name || "Anonymous"}
                                </div>
                                <div className="lb-champion-meta">
                                    <span>{champion.technology_name || "Interview"}</span>
                                    <span className="lb-dot">·</span>
                                    <span>{(champion.mode || '').toUpperCase()}</span>
                                </div>
                                <div className="lb-champion-breakdown">
                                    <div className="lb-bd">
                                        <div className="lb-bd-label">Accuracy</div>
                                        <div className="lb-bd-val">{Math.round(champion.overall_score || 0)}%</div>
                                    </div>
                                    <div className="lb-bd">
                                        <div className="lb-bd-label">Confidence</div>
                                        <div className="lb-bd-val">{Math.round(champion.avg_confidence || 0)}%</div>
                                    </div>
                                </div>
                            </div>
                            <div className="lb-champion-score">
                                <div className="lb-champion-score-num">
                                    {Math.round(champion.combined_score || 0)}
                                </div>
                                <div className="lb-champion-score-unit">combined</div>
                            </div>
                        </div>

                        {/* ===== Rest of the board ===== */}
                        {rest.length > 0 && (
                            <div className="lb-rest-card">
                                <div className="lb-rest-head">
                                    <span>Top scorers</span>
                                    <span className="lb-rest-count">{rows.length} on the board</span>
                                </div>
                                <ol className="lb-rest-list">
                                    {rest.map((r, i) => (
                                        <li
                                            key={r._id}
                                            className="lb-rest-row"
                                            style={{ animationDelay: `${i * 50}ms` }}
                                        >
                                            <span className="lb-rest-rank">#{i + 2}</span>
                                            <span className="lb-rest-name">
                                                {r.candidate_name || "Anonymous"}
                                            </span>
                                            <span className="lb-rest-tech">
                                                {r.technology_name || "Interview"}
                                            </span>
                                            <span className="lb-rest-metrics">
                                                <span>Acc {Math.round(r.overall_score || 0)}%</span>
                                                <span className="lb-rest-sep">·</span>
                                                <span>Conf {Math.round(r.avg_confidence || 0)}%</span>
                                            </span>
                                            <span className="lb-rest-score">
                                                {Math.round(r.combined_score || 0)}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
