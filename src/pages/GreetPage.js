import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./GreetPage.css";

/**
 * Voice-led name capture for Expo Mode.
 *
 * Phases:
 *   speaking  — AI is reading the welcome prompt aloud (TTS)
 *   listening — mic is open, waiting for the visitor to say their name
 *   ready     — captured a transcript (or user typed) → review + Continue
 *
 * Visitor can type at any phase as a fallback. If the user types while we're
 * speaking or listening, voice capture is gracefully aborted.
 *
 * Listening loop has a 30-second total cap before it auto-falls back to typing,
 * so a broken / muted mic never traps the page.
 */
export default function GreetPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const incomingMode = location.state?.mode || "resume";

    const [phase, setPhase] = useState('speaking');
    const [name, setName] = useState("");
    const recognitionRef = useRef(null);
    const heardRef = useRef("");
    const startedRef = useRef(false);  // guards against React StrictMode double-mount
    const listenStartTimeRef = useRef(null);
    // Listening loops while true. Set false when speech captured, user types,
    // user manually opts out, or the 30s wall-clock cap is reached.
    const keepListeningRef = useRef(false);

    const speechSupported = typeof window !== 'undefined' &&
        (window.SpeechRecognition || window.webkitSpeechRecognition);
    const ttsSupported = typeof window !== 'undefined' && !!window.speechSynthesis;

    const MAX_LISTEN_MS = 30000;  // cap so a silent mic never hangs the page

    // If a visitor lands here without picking a mode (refresh / direct URL),
    // bounce them back to the interview-modes selector.
    useEffect(() => {
        if (!location.state?.mode) navigate("/interviews", { replace: true });
    }, [location.state?.mode, navigate]);

    const startListening = useCallback(() => {
        if (!speechSupported) {
            setPhase('ready');
            return;
        }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SR();
        // continuous=true keeps the recognizer running across natural pauses
        // ("Sai... Gangadhar... Tilak"). We decide when the user is done by
        // watching for silence instead of letting the browser auto-stop after
        // the first phoneme break — that was the source of the "asks again
        // too quickly" bug.
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
        recognition.lang = 'en-IN';

        heardRef.current = "";
        listenStartTimeRef.current = Date.now();

        // Silence-based stop: once we've heard SOMETHING, give the user
        // ~2 seconds of quiet before we accept the transcript. Resets on any
        // new partial result so multi-word names with brief pauses work.
        let silenceTimer = null;
        const SILENCE_MS = 2000;
        const armSilenceTimer = () => {
            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
                try { recognition.stop(); } catch (_) {}
            }, SILENCE_MS);
        };

        recognition.onresult = (e) => {
            let newFinal = "";
            let hasInterim = false;
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) {
                    newFinal += e.results[i][0].transcript;
                } else {
                    hasInterim = true;
                }
            }
            if (newFinal) heardRef.current += newFinal;
            // Reset the silence countdown on ANY new activity (interim or
            // final) so the user can pause briefly without us cutting them off.
            if (newFinal || hasInterim) armSilenceTimer();
        };

        recognition.onend = () => {
            clearTimeout(silenceTimer);
            const cleaned = (heardRef.current || "").trim();
            const looksValid = cleaned.length >= 2;

            if (looksValid) {
                const titleCased = cleaned
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
                setName(titleCased);
                keepListeningRef.current = false;
                setPhase('ready');
                return;
            }

            // No valid speech yet. Wait a beat then restart so the visitor
            // has space to think — 1 second is generous without feeling slow.
            const elapsed = Date.now() - (listenStartTimeRef.current || Date.now());
            if (keepListeningRef.current && elapsed < MAX_LISTEN_MS) {
                setTimeout(() => {
                    if (keepListeningRef.current && recognitionRef.current === recognition) {
                        try { recognition.start(); } catch (_) {}
                    }
                }, 1000);
            } else {
                keepListeningRef.current = false;
                setPhase('ready');
            }
        };

        recognition.onerror = (e) => {
            console.warn("Greet mic error:", e.error);
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
                clearTimeout(silenceTimer);
                keepListeningRef.current = false;
                setPhase('ready');
            }
            // Other errors (no-speech, aborted, network) → onend will restart
            // if we're still under the wall-clock cap.
        };

        keepListeningRef.current = true;
        recognitionRef.current = recognition;
        setPhase('listening');
        try { recognition.start(); } catch (_) {
            keepListeningRef.current = false;
            setPhase('ready');
        }
    }, [speechSupported]);

    // Manually stop listening — used by the "Type instead" button so the
    // visitor can opt out of voice without waiting for it to time out.
    const stopListeningAndType = () => {
        keepListeningRef.current = false;
        try { recognitionRef.current?.stop(); } catch (_) {}
        setPhase('ready');
    };

    // Called when the user starts typing in the input. Cancels any active
    // listening so the typed input wins.
    const handleNameChange = (e) => {
        setName(e.target.value);
        if (phase !== 'ready') {
            keepListeningRef.current = false;
            try { recognitionRef.current?.stop(); } catch (_) {}
            try { window.speechSynthesis?.cancel(); } catch (_) {}
            setPhase('ready');
        }
    };

    // On mount: speak the welcome prompt, then start listening when TTS finishes.
    // Both the speak() call AND the begin-listening transition are guarded by
    // single-use flags so the watchdog timers can't double-fire.
    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        // Single-use guard: prevent the TTS-end handler, the watchdog, AND
        // the no-TTS fallback from each independently kicking off listening.
        let didProceed = false;
        const beginAfterSpeech = () => {
            if (didProceed) return;
            didProceed = true;
            // 600ms post-TTS pause so the kiosk speakers' tail audio fully
            // decays before the mic opens (300ms wasn't enough on speakers
            // with reverb — the mic was picking up the end of the prompt).
            setTimeout(startListening, 600);
        };

        if (!ttsSupported) {
            beginAfterSpeech();
            return;
        }

        const synth = window.speechSynthesis;
        try { synth.cancel(); } catch (_) {}

        // Single-use guard so onvoiceschanged + the 1s fallback can't BOTH
        // queue the same utterance.
        let didSpeak = false;
        const speak = () => {
            if (didSpeak) return;
            didSpeak = true;

            const utt = new SpeechSynthesisUtterance(
                "Welcome to IntelliView. May we know your name?"
            );
            utt.rate = 0.95;
            utt.pitch = 1;
            utt.volume = 1;
            utt.lang = 'en-US';
            const voices = synth.getVoices();
            const preferred =
                voices.find(v => v.lang.startsWith('en') && /google/i.test(v.name)) ||
                voices.find(v => v.lang.startsWith('en') && /microsoft/i.test(v.name)) ||
                voices.find(v => v.lang.startsWith('en'));
            if (preferred) utt.voice = preferred;
            utt.onend = beginAfterSpeech;
            utt.onerror = beginAfterSpeech;
            synth.speak(utt);

            // Watchdog: if TTS never fires onend (some browsers silently drop
            // utterances after a tab focus change), proceed anyway after 6s.
            // beginAfterSpeech is guarded so this can't double-fire with onend.
            setTimeout(() => beginAfterSpeech(), 6000);
        };

        if (synth.getVoices().length > 0) {
            speak();
        } else {
            // Voices haven't loaded yet — listen for them. If the event never
            // fires (rare), the 1s fallback kicks speak() instead. didSpeak
            // ensures only one of these wins.
            const onVoices = () => {
                synth.onvoiceschanged = null;
                speak();
            };
            synth.onvoiceschanged = onVoices;
            setTimeout(speak, 1000);
        }

        return () => {
            try { synth.cancel(); } catch (_) {}
            try { recognitionRef.current?.stop(); } catch (_) {}
            keepListeningRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleConfirm = () => {
        const trimmed = name.trim();
        if (trimmed.length < 2) return;
        try { window.speechSynthesis?.cancel(); } catch (_) {}
        keepListeningRef.current = false;
        try { recognitionRef.current?.stop(); } catch (_) {}
        navigate("/interview-setup", {
            state: { mode: incomingMode, candidateName: trimmed },
            replace: true
        });
    };

    return (
        <div className="greet-page">
            <div className="greet-card">
                {/* Branded intro shown ONLY while the AI welcomes the visitor.
                    Once we transition to listening / ready, the compact
                    eyebrow + name prompt take over. */}
                {phase === 'speaking' ? (
                    <div className="greet-brand-intro" aria-live="polite">
                        <div className="greet-brand-rings" aria-hidden="true">
                            <span className="greet-brand-ring greet-brand-ring-1" />
                            <span className="greet-brand-ring greet-brand-ring-2" />
                            <span className="greet-brand-ring greet-brand-ring-3" />
                            <div className="greet-brand-mark">IV</div>
                        </div>
                        <div className="greet-brand-wordmark">IntelliView</div>
                        <div className="greet-brand-tag">Welcome</div>
                    </div>
                ) : (
                    <>
                        <div className="greet-eyebrow">IntelliView</div>
                        <h1 className="greet-prompt">Welcome.</h1>
                        <p className="greet-subtitle">May we know your name?</p>
                    </>
                )}

                <div className="greet-stage">
                    {phase === 'listening' && (
                        <>
                            <div className="greet-rings" aria-hidden="true">
                                <span className="greet-ring greet-ring-1" />
                                <span className="greet-ring greet-ring-2" />
                                <span className="greet-ring greet-ring-3" />
                                <span className="greet-mic-dot" />
                            </div>
                            <div className="greet-listening-label">Listening — please say your name</div>
                            <button
                                type="button"
                                className="greet-link-btn"
                                onClick={stopListeningAndType}
                            >
                                I'll type instead
                            </button>
                        </>
                    )}

                    {phase === 'ready' && (
                        <div className="greet-ready-hint">
                            Please confirm or edit your name below.
                        </div>
                    )}
                </div>

                <div className="greet-input-wrap">
                    <label className="greet-input-label" htmlFor="greet-name">Your name</label>
                    <input
                        id="greet-name"
                        type="text"
                        className="greet-input"
                        value={name}
                        maxLength={40}
                        placeholder="Type your name"
                        onChange={handleNameChange}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                        autoComplete="off"
                        spellCheck="false"
                    />
                </div>

                <div className="greet-actions">
                    <button
                        type="button"
                        className="greet-btn greet-btn-primary"
                        onClick={handleConfirm}
                        disabled={name.trim().length < 2}
                    >
                        Continue
                    </button>
                    {speechSupported && phase === 'ready' && (
                        <button
                            type="button"
                            className="greet-btn greet-btn-secondary"
                            onClick={startListening}
                        >
                            Try voice again
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
