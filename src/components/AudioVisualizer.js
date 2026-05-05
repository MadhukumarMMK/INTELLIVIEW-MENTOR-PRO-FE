import React, { useEffect, useRef } from "react";
import "./AudioVisualizer.css";

/**
 * Voice-reactive flowing-wave visualizer.
 *
 * Renders three overlapping smooth bezier waves on a canvas. Each wave has
 * its own phase, frequency, and amplitude modulator, so they appear to flow
 * across each other instead of moving in lockstep. When the user speaks,
 * the AnalyserNode FFT bins drive the per-segment amplitudes — bass tones
 * pump the back wave, mids/treble drive the foreground waves — giving the
 * recording a Siri-style organic feel rather than a flat oscilloscope.
 *
 * Props:
 *   stream      MediaStream — live audio from getUserMedia
 *   listening   boolean     — true while recording (full amplitude + glow)
 *   canRecord   boolean     — true after TTS finishes (brighter idle tone)
 */
export default function AudioVisualizer({ stream, listening, canRecord }) {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);
    const analyserRef = useRef(null);
    const audioCtxRef = useRef(null);
    const phaseRef = useRef(0);
    // Smoothed per-band energy so the waves don't snap between frames.
    const energyRef = useRef({ bass: 0, mid: 0, treble: 0, peak: 0 });
    const listeningRef = useRef(listening);
    const canRecordRef = useRef(canRecord);
    useEffect(() => { listeningRef.current = listening; }, [listening]);
    useEffect(() => { canRecordRef.current = canRecord; }, [canRecord]);

    // Set up Web Audio + Analyser once we have a stream.
    useEffect(() => {
        if (!stream) return;
        const tracks = stream.getAudioTracks?.() || [];
        if (tracks.length === 0) return;

        let audioCtx;
        let source;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;             // 256 frequency bins → finer detail
            analyser.smoothingTimeConstant = 0.82;
            source.connect(analyser);
            audioCtxRef.current = audioCtx;
            analyserRef.current = analyser;
        } catch (_) { /* fall back to ambient-only mode */ }

        return () => {
            try { source?.disconnect(); } catch (_) {}
            try { audioCtx?.close(); } catch (_) {}
            audioCtxRef.current = null;
            analyserRef.current = null;
        };
    }, [stream]);

    // Render loop.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // HiDPI + responsive sizing
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width * dpr));
            canvas.height = Math.max(1, Math.floor(rect.height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        const POINTS = 96;       // segments along each wave; more = smoother
        const buf = new Uint8Array(256);

        // Resolve theme colors once per frame so the visualizer follows
        // light/dark theme switches without remounting.
        const themeColor = (varName, fallback) => {
            const v = getComputedStyle(document.documentElement)
                .getPropertyValue(varName).trim();
            return v || fallback;
        };

        const draw = () => {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            const cy = h / 2;
            ctx.clearRect(0, 0, w, h);

            const isListening = listeningRef.current;
            const ready = canRecordRef.current;
            const analyser = analyserRef.current;

            // ---- 1. Read FFT and bucket into low/mid/high energy ----
            let bass = 0, mid = 0, treble = 0, peak = 0;
            if (isListening && analyser) {
                analyser.getByteFrequencyData(buf);
                const n = analyser.frequencyBinCount;
                const bassEnd = Math.floor(n * 0.10);
                const midEnd = Math.floor(n * 0.45);
                let bassSum = 0, midSum = 0, trebleSum = 0;
                for (let i = 0; i < bassEnd; i++) bassSum += buf[i];
                for (let i = bassEnd; i < midEnd; i++) midSum += buf[i];
                for (let i = midEnd; i < n; i++) trebleSum += buf[i];
                bass = bassSum / (bassEnd * 255);
                mid = midSum / ((midEnd - bassEnd) * 255);
                treble = trebleSum / ((n - midEnd) * 255);
                for (let i = 0; i < n; i++) if (buf[i] > peak) peak = buf[i];
                peak = peak / 255;
            }

            // Smooth energies (asymmetric: fast attack, slow decay)
            const e = energyRef.current;
            const lerp = (cur, tgt) => tgt > cur ? cur + (tgt - cur) * 0.45 : cur + (tgt - cur) * 0.16;
            e.bass = lerp(e.bass, bass);
            e.mid = lerp(e.mid, mid);
            e.treble = lerp(e.treble, treble);
            e.peak = lerp(e.peak, peak);

            // ---- 2. Drive phase ----
            // Tempo speeds up with overall energy so the visualizer feels alive.
            const baseSpeed = isListening ? 0.05 : 0.022;
            const energySpeed = e.peak * 0.07;
            phaseRef.current += baseSpeed + energySpeed;
            const phase = phaseRef.current;

            // ---- 3. Resolve theme color ----
            const primary = themeColor('--primary', '#3b82f6');
            const primaryRGB = hexToRgb(primary);

            // ---- 4. Draw three waves: back, middle, front ----
            // Each wave has its own phase offset, frequency, and amplitude band.
            // Back wave is bass-driven, mid is mids, front is treble — gives
            // the impression of layered audio coming alive.
            const waveSpec = [
                { freq: 1.6, phase: phase * 0.6,        ampBase: 0.18, ampScale: e.bass * 1.2 + e.peak * 0.4, color: primaryRGB, opacity: 0.35, blur: 18, lineWidth: 2 },
                { freq: 2.2, phase: phase * 0.95 + 1.2, ampBase: 0.15, ampScale: e.mid * 1.3 + e.peak * 0.3,  color: primaryRGB, opacity: 0.55, blur: 12, lineWidth: 2.5 },
                { freq: 2.8, phase: phase * 1.25 + 2.4, ampBase: 0.12, ampScale: e.treble * 1.4 + e.peak * 0.2, color: primaryRGB, opacity: 0.95, blur: 6,  lineWidth: 2.5 },
            ];

            // Idle baseline so the waves never go totally flat.
            const idleAmp = ready ? 0.08 : 0.045;
            const liveBoost = isListening ? 1 : 0;

            for (const spec of waveSpec) {
                const amp = (spec.ampBase * 0.4 + idleAmp + spec.ampScale * liveBoost) * h * 0.5;
                drawWave(ctx, w, cy, POINTS, amp, spec.freq, spec.phase, spec, e);
            }

            // ---- 5. Center reference glow when listening — adds drama ----
            if (isListening && e.peak > 0.05) {
                const r = Math.min(w, h) * (0.18 + e.peak * 0.4);
                const grad = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, r);
                grad.addColorStop(0, rgba(primaryRGB, 0.25 * e.peak));
                grad.addColorStop(1, rgba(primaryRGB, 0));
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(w / 2, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }

            rafRef.current = requestAnimationFrame(draw);
        };

        rafRef.current = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(rafRef.current);
            ro.disconnect();
        };
    }, []);

    return (
        <div className={`audio-viz-wrap ${listening ? 'is-live' : ''} ${canRecord && !listening ? 'is-ready' : ''}`}>
            <canvas ref={canvasRef} className="audio-viz-canvas" />
        </div>
    );
}

/* ---------- helpers ---------- */

// Draw a single smooth bezier wave from left edge to right edge.
// Per-point amplitude is modulated by a moving sine envelope, plus a
// secondary harmonic for organic asymmetry. Edge points are anchored at
// the centerline so the wave fades smoothly into the surface.
function drawWave(ctx, w, cy, points, amp, freq, phase, spec, energy) {
    const pts = new Array(points + 1);
    for (let i = 0; i <= points; i++) {
        const t = i / points;            // 0..1
        const x = t * w;
        // edge fade so the wave smoothly meets the canvas border
        const edgeFade = Math.sin(t * Math.PI);
        // primary sine + a secondary harmonic for asymmetry
        const a1 = Math.sin(t * freq * Math.PI * 2 + phase);
        const a2 = Math.sin(t * (freq * 1.7) * Math.PI * 2 + phase * 0.8) * 0.5;
        // peak energy injects spikes near the middle when audio is loud
        const peakInfluence = energy.peak * Math.exp(-Math.pow((t - 0.5) * 4, 2)) * 0.5;
        const y = cy - (a1 + a2 + peakInfluence) * amp * edgeFade;
        pts[i] = { x, y };
    }

    // Cardinal-ish smooth curve via quadratic curves between midpoints.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.quadraticCurveTo(
        pts[pts.length - 2].x, pts[pts.length - 2].y,
        pts[pts.length - 1].x, pts[pts.length - 1].y
    );

    // Stroke gradient — fades brighter towards the center horizontally.
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,   rgba(spec.color, spec.opacity * 0.2));
    grad.addColorStop(0.5, rgba(spec.color, spec.opacity));
    grad.addColorStop(1,   rgba(spec.color, spec.opacity * 0.2));
    ctx.strokeStyle = grad;
    ctx.lineWidth = spec.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = rgba(spec.color, spec.opacity * 0.7);
    ctx.shadowBlur = spec.blur;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function hexToRgb(hex) {
    if (!hex) return { r: 59, g: 130, b: 246 };
    const v = hex.replace('#', '').trim();
    if (v.length !== 6) return { r: 59, g: 130, b: 246 };
    return {
        r: parseInt(v.substring(0, 2), 16),
        g: parseInt(v.substring(2, 4), 16),
        b: parseInt(v.substring(4, 6), 16),
    };
}

function rgba({ r, g, b }, a) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
