import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./GreetPage.css";

/**
 * Voice-led name capture for Expo Mode.
 *
 * Flow on mount:
 *   1. AI speaks "Hello! Please tell us your name." via TTS.
 *   2. Once TTS ends, we automatically start single-utterance speech
 *      recognition. A pulsing ring animation runs while listening.
 *   3. The transcript is title-cased and dropped into an editable text
 *      input. The user can edit it, click "Listen again" to retry, or
 *      click "Start Interview" to proceed to the standard setup → instructions
 *      flow with the name carried in router state.
 *
 * The name is also captured if the user just types directly — voice is
 * the headline path, but typing always works as the fallback.
 */
export default function GreetPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const incomingMode = location.state?.mode || "resume";

    // 'idle' before TTS finishes, 'listening' while mic is open,
    // 'ready' once a transcript is in the input (or user typed)
    const [phase, setPhase] = useState('idle');
    const [name, setName] = useState("");
    const recognitionRef = useRef(null);
    const heardRef = useRef("");
    const ttsRef = useRef(null);
    const startedRef = useRef(false);  // guard against React StrictMode double-mount

    const speechSupported = typeof window !== 'undefined' &&
        (window.SpeechRecognition || window.webkitSpeechRecognition);
    const ttsSupported = typeof window !== 'undefined' && !!window.speechSynthesis;

    // If a visitor lands here without picking a mode (refresh / direct URL),
    // bounce them back to the interview-modes selector.
    useEffect(() => {
        if (!location.state?.mode) navigate("/interviews", { replace: true });
    }, [location.state?.mode, navigate]);

    const startListening = useCallback(() => {
        if (!speechSupported) {
            // No mic-recognition support — let them just type.
            setPhase('ready');
            return;
        }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
        recognition.lang = 'en-IN';

        heardRef.current = "";

        recognition.onresult = (e) => {
            let final = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) final += e.results[i][0].transcript;
            }
            if (final) heardRef.current += final;
        };

        recognition.onspeechend = () => {
            try { recognition.stop(); } catch (_) {}
        };

        recognition.onend = () => {
            const cleaned = (heardRef.current || "").trim();
            if (cleaned) {
                const titleCased = cleaned
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
                setName(titleCased);
            }
            setPhase('ready');
        };

        recognition.onerror = (e) => {
            console.warn("Greet mic error:", e.error);
            // Always fall through to the editable input so the user can type.
            setPhase('ready');
        };

        recognitionRef.current = recognition;
        setPhase('listening');
        try { recognition.start(); } catch (_) {
            setPhase('ready');
        }

        // Hard timeout in case the browser doesn't auto-end
        setTimeout(() => {
            try { recognitionRef.current?.stop(); } catch (_) {}
        }, 6000);
    }, [speechSupported]);

    // On mount: speak the prompt, then start listening when TTS finishes.
    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        const beginAfterSpeech = () => {
            // Tiny delay so the mic doesn't pick up tail-end of the TTS audio
            setTimeout(startListening, 300);
        };

        if (!ttsSupported) {
            beginAfterSpeech();
            return;
        }

        const synth = window.speechSynthesis;
        try { synth.cancel(); } catch (_) {}

        const speak = () => {
            const utt = new SpeechSynthesisUtterance("Hello! Please tell us your name.");
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
            ttsRef.current = utt;
            synth.speak(utt);
            // Watchdog — if TTS doesn't fire onend within 4s, advance anyway
            setTimeout(() => {
                if (phase === 'idle') beginAfterSpeech();
            }, 4000);
        };

        if (synth.getVoices().length > 0) {
            speak();
        } else {
            // Voices load asynchronously on Chrome — wait once
            const onVoices = () => { synth.onvoiceschanged = null; speak(); };
            synth.onvoiceschanged = onVoices;
            // Fallback in case the event never fires
            setTimeout(() => { if (phase === 'idle') speak(); }, 1000);
        }

        return () => {
            try { synth.cancel(); } catch (_) {}
            try { recognitionRef.current?.stop(); } catch (_) {}
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleConfirm = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        // Stop any in-flight TTS / recognition before navigating
        try { window.speechSynthesis?.cancel(); } catch (_) {}
        try { recognitionRef.current?.stop(); } catch (_) {}
        navigate("/interview-setup", {
            state: { mode: incomingMode, candidateName: trimmed },
            replace: true
        });
    };

    return (
        <div className="greet-page">
            <div className="greet-card">
                <h1 className="greet-prompt">Hello! Please tell us your name.</h1>

                <div className="greet-stage">
                    {phase === 'listening' && (
                        <div className="greet-rings" aria-hidden="true">
                            <span className="greet-ring greet-ring-1" />
                            <span className="greet-ring greet-ring-2" />
                            <span className="greet-ring greet-ring-3" />
                            <span className="greet-mic-dot" />
                        </div>
                    )}
                    {phase === 'idle' && (
                        <div className="greet-status">Listening shortly…</div>
                    )}
                </div>

                <div className="greet-input-wrap">
                    <label className="greet-input-label">Your name</label>
                    <input
                        type="text"
                        className="greet-input"
                        value={name}
                        maxLength={40}
                        placeholder="Your name"
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                        disabled={phase === 'listening'}
                    />
                </div>

                <div className="greet-actions">
                    <button
                        type="button"
                        className="greet-btn greet-btn-primary"
                        onClick={handleConfirm}
                        disabled={!name.trim() || phase === 'listening'}
                    >
                        Start Interview
                    </button>
                    {speechSupported && (
                        <button
                            type="button"
                            className="greet-btn greet-btn-secondary"
                            onClick={startListening}
                            disabled={phase === 'listening'}
                        >
                            Listen again
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
