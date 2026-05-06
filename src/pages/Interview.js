import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import { io } from "socket.io-client";
import axios from "../api/axiosInstance";
import { SOCKET_URL } from "../api/config";
import { useNotification } from "../context/NotificationContext";
import AIAvatar from "../components/AIAvatar";
import AudioVisualizer from "../components/AudioVisualizer";
import "./Interview.css";

export default function Interview() {
    const location = useLocation();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const recognitionRef = useRef(null);
    const socketRef = useRef(null);
    const detectionIntervalRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null); // Store stream directly for reliable cleanup

    const notify = useNotification();
    const { baseMode, difficulty, technology, technologyName, module, moduleName, topic, topicName, interviewId } = location.state || {};
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    // --- Instructions Screen ---
    // 20s countdown gives the user time to read the 10 instruction points,
    // then auto-advances into the interview. Fullscreen is engaged AFTER
    // instructions — either via the Skip button click (immediate gesture)
    // or, on auto-advance, via a one-shot listener that catches the user's
    // first interaction inside the interview.
    const INSTRUCTIONS_DURATION = 20;
    const [showInstructions, setShowInstructions] = useState(true);
    const [countdown, setCountdown] = useState(INSTRUCTIONS_DURATION);

    // Idempotent fullscreen request. Safe to call from any user gesture —
    // does nothing if we're already in fullscreen, swallows errors when
    // the browser refuses (no gesture / permissions). Also locks Esc + F11
    // via the Keyboard Lock API (Chrome/Edge only) so the user can't use
    // those shortcuts to exit fullscreen during the interview.
    const requestFullscreenSafe = useCallback(async () => {
        if (document.fullscreenElement) {
            // Already in fullscreen — still try to lock keys (idempotent)
            try { const _p = navigator.keyboard?.lock?.(['Escape', 'F11']); _p?.catch?.(() => {}); } catch (_) {}
            return;
        }
        const root = document.documentElement;
        const req = root.requestFullscreen
            || root.webkitRequestFullscreen
            || root.mozRequestFullScreen
            || root.msRequestFullscreen;
        if (!req) return;
        try {
            await req.call(root);
            // Block Esc/F11 inside fullscreen on supported browsers.
            try { const _p = navigator.keyboard?.lock?.(['Escape', 'F11']); _p?.catch?.(() => {}); } catch (_) {}
        } catch (_) { /* user denied or already entering */ }
    }, []);

    useEffect(() => {
        if (!showInstructions) return;
        if (countdown <= 0) {
            // Unlock TTS so the first question reads aloud
            const unlock = new SpeechSynthesisUtterance('');
            unlock.volume = 0;
            window.speechSynthesis.speak(unlock);
            setShowInstructions(false);
            return;
        }
        const t = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown, showInstructions]);

    // --- State ---
    const [maxQuestions, setMaxQuestions] = useState(3);
    // Per-question time limit in seconds. Default 60s, overridden by admin
    // setting on mount (per-mode: time_per_question_resume / _custom / _hr).
    const [timeLimit, setTimeLimit] = useState(60);
    const [timeRemaining, setTimeRemaining] = useState(60);
    // Wall-clock timestamp when the current question's timer started.
    // Used to compute time_taken when the user submits or skips.
    const questionStartedAtRef = useRef(null);
    const [questions, setQuestions] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [questionsAsked, setQuestionsAsked] = useState(0); // Total asked (including skips)
    const [loading, setLoading] = useState(true);
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const transcriptRef = useRef("");
    // Mic stream exposed to the AudioVisualizer. Set once getUserMedia
    // succeeds; lets the visualizer build its own AnalyserNode independently.
    const [audioStream, setAudioStream] = useState(null);
    const accumulatedFinalRef = useRef(""); // Survives browser auto-stop/restart on pauses
    const [currentDifficulty, setCurrentDifficulty] = useState(difficulty || "Medium");
    const [isEvaluating, setIsEvaluating] = useState(false);
    // Initial value 0 — honest. Was 100 (fake "full confidence" with no
    // detection running). Updated only when face-api actually detects a face.
    const [faceConfidence, setFaceConfidence] = useState(0);
    const [lastAccuracy, setLastAccuracy] = useState(0);   // Updated after each answer
    const [lastClarity, setLastClarity] = useState(0);     // From audio analysis
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [canRecord, setCanRecord] = useState(false);

    // --- Accumulated results for DB save ---
    const resultsRef = useRef([]);       // question_details array
    const emotionsSumRef = useRef({      // running emotion totals for averaging
        angry: 0, disgust: 0, fear: 0, happy: 0,
        sad: 0, surprise: 0, neutral: 0, count: 0
    });
    const pendingPayloadRef = useRef(null); // Stores last submitted payload for result pairing

    // --- Refs for socket listener access ---
    const currentIdxRef = useRef(currentIdx);
    const questionsAskedRef = useRef(questionsAsked);
    const maxQuestionsRef = useRef(maxQuestions);
    useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
    useEffect(() => { questionsAskedRef.current = questionsAsked; }, [questionsAsked]);
    useEffect(() => { maxQuestionsRef.current = maxQuestions; }, [maxQuestions]);

    // --- 1. Fetch Admin Settings (dynamic question count + time limit) ---
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get("/admin/settings");
                const s = res.data;
                // Per-mode question counts (per spec: Resume 10, Custom 10, HR 8)
                const countKey = { resume: 'questions_resume', custom: 'questions_custom', hr: 'questions_hr' };
                const count = s?.[countKey[baseMode]] || s?.questions_per_session || 3;
                setMaxQuestions(count);

                // Per-mode time limit (seconds). Default 60s.
                const timeKey = { resume: 'time_per_question_resume', custom: 'time_per_question_custom', hr: 'time_per_question_hr' };
                const t = Number(s?.[timeKey[baseMode]]) || 60;
                setTimeLimit(t);
                setTimeRemaining(t);
            } catch (err) {
                console.warn("Admin settings unavailable, using defaults");
            }
        };
        fetchSettings();
    }, [baseMode]);

    // --- 2. WebSocket Lifecycle (waits for instructions to finish) ---
    useEffect(() => {
        if (showInstructions) return;
        socketRef.current = io(SOCKET_URL);
        socketRef.current.emit("start_session", { roll_no: user.roll_no, mode: baseMode });

        socketRef.current.on("next_step_ready", (data) => {
            const nextText = typeof data.next_question === 'object'
                ? data.next_question.question
                : data.next_question;

            // Accumulate this question's result for DB save
            const pending = pendingPayloadRef.current;
            if (pending) {
                resultsRef.current.push({
                    question: pending.lastQuestion,
                    answer: pending.lastAnswer,
                    was_skipped: pending.was_skipped,
                    accuracy: data.accuracy || 0,
                    feedback: data.feedback || "",
                    difficulty: pending.difficulty,
                    new_difficulty: data.new_difficulty,
                    fused_confidence: data.fused_confidence || 0,
                    audio_confidence: data.audio_confidence || null,
                    // Per-question timing (seconds). Echoed back from backend.
                    time_taken: typeof data.time_taken === 'number' ? data.time_taken : (pending.time_taken || 0),
                    time_limit: data.time_limit || pending.time_limit || 60,
                    auto_skipped: !!data.auto_skipped,
                });
                pendingPayloadRef.current = null;
            }

            // Update live analysis bars.
            // Skipped questions have no answer to evaluate and no audio to analyze,
            // so accuracy and clarity must be 0 — not stale values from prior rounds
            // and not face-derived numbers that mislead the user.
            const justSkipped = pending?.was_skipped;
            setLastAccuracy(justSkipped ? 0 : (data.accuracy || 0));
            setLastClarity(justSkipped ? 0 : (data.audio_confidence || 0));

            // Check if interview is complete (all questions asked)
            if (questionsAskedRef.current >= maxQuestionsRef.current || data.is_complete) {
                // Calculate average emotions from accumulated face data
                const emo = emotionsSumRef.current;
                const avgEmotions = emo.count > 0 ? {
                    angry: +(emo.angry / emo.count).toFixed(3),
                    disgust: +(emo.disgust / emo.count).toFixed(3),
                    fear: +(emo.fear / emo.count).toFixed(3),
                    happy: +(emo.happy / emo.count).toFixed(3),
                    sad: +(emo.sad / emo.count).toFixed(3),
                    surprise: +(emo.surprise / emo.count).toFixed(3),
                    neutral: +(emo.neutral / emo.count).toFixed(3)
                } : {};

                // Real-interview semantics: skipped questions count as 0 in
                // the average, not "excluded". An interviewer doesn't waive
                // the question because you skipped — it's a performance miss.
                const all = resultsRef.current;
                const answered = all.filter(r => !r.was_skipped); // for the "answered" count metadata
                const overallScore = all.length > 0
                    ? Math.round(all.reduce((sum, r) => sum + (r.was_skipped ? 0 : (r.accuracy || 0)), 0) / all.length)
                    : 0;

                // Total time spent across all questions (seconds), and average
                // per question. Both stored on the interview for report stats.
                const totalTimeTaken = all.reduce((sum, r) => sum + (Number(r.time_taken) || 0), 0);
                const avgTimePerQuestion = all.length > 0
                    ? Math.round(totalTimeTaken / all.length)
                    : 0;

                // Suppress the fullscreen-lost overlay during clean end-of-interview
                endingInterviewRef.current = true;
                // Stop all media before saving results
                killAllMedia();

                // Save full results to DB
                axios.put(`/interviews/update/${interviewId}`, {
                    status: 2,
                    question_details: resultsRef.current,
                    emotions: { emotions: avgEmotions },
                    overall_analysis: [{
                        overall_score: overallScore,
                        total_questions: maxQuestionsRef.current,
                        answered: answered.length,
                        skipped: resultsRef.current.length - answered.length,
                        total_time_taken: totalTimeTaken,
                        avg_time_per_question: avgTimePerQuestion,
                    }],
                    overall_score: overallScore,
                    total_time_taken: totalTimeTaken,
                    avg_time_per_question: avgTimePerQuestion,
                })
                    .then(() => navigate(`/report/${interviewId}`))
                    .catch(() => navigate("/dashboard"));
            } else if (nextText) {
                setQuestions(prev => [...prev, nextText]);
                setCurrentDifficulty(data.new_difficulty);
                setCurrentIdx(prev => prev + 1);
                setQuestionsAsked(prev => prev + 1);
                // Next question begins — reset all transcript buffers so the
                // new answer starts clean. (Stop/Start recording mid-question
                // no longer clears — see startRecording below.)
                transcriptRef.current = "";
                accumulatedFinalRef.current = "";
                setTranscript("");
                setIsEvaluating(false);
                setIsListening(false);
                setCanRecord(false);
            }
        });

        socketRef.current.on("error", (data) => {
            console.error("Socket error:", data.message);
            setIsEvaluating(false);
        });

        return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }, [showInstructions, user.roll_no, baseMode, interviewId, navigate]);

    // --- 3. Multimodal Emotion Detection (waits for instructions) ---
    useEffect(() => {
        if (showInstructions) return;
        const loadModels = async () => {
            const MODEL_URL = "/models";
            try {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
                ]);
                startEmotionTracking();
            } catch (err) { console.error("Face-API Error:", err); }
        };
        loadModels();
        return () => clearInterval(detectionIntervalRef.current);
    }, [showInstructions]);

    const startEmotionTracking = () => {
        detectionIntervalRef.current = setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState === 4) {
                const detections = await faceapi.detectAllFaces(
                    videoRef.current, new faceapi.TinyFaceDetectorOptions()
                ).withFaceExpressions();

                if (detections.length > 0 && socketRef.current) {
                    const expressions = detections[0].expressions;
                    const confidence = Math.round((expressions.neutral + expressions.happy) * 100);
                    setFaceConfidence(confidence);
                    socketRef.current.emit("facial_data", { confidence, expressions });

                    // Accumulate emotions for session-level averaging
                    const emo = emotionsSumRef.current;
                    emo.angry += expressions.angry || 0;
                    emo.disgust += expressions.disgusted || 0;
                    emo.fear += expressions.fear || 0;
                    emo.happy += expressions.happy || 0;
                    emo.sad += expressions.sad || 0;
                    emo.surprise += expressions.surprised || 0;
                    emo.neutral += expressions.neutral || 0;
                    emo.count += 1;
                }
            }
        }, 2000);
    };

    // --- 4. Hardware Setup & Interview Init (waits for instructions) ---
    useEffect(() => {
        if (showInstructions) return;

        const setupHardware = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                streamRef.current = stream; // Save for reliable cleanup
                if (videoRef.current) videoRef.current.srcObject = stream;

                // Setup MediaRecorder with audio-only stream for Librosa/CNN-LSTM
                try {
                    const audioTracks = stream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        const recorderStream = new MediaStream(audioTracks);
                        // Expose the audio-only stream to the visualizer so its
                        // AnalyserNode can tap the same mic without conflicting
                        // with the MediaRecorder.
                        setAudioStream(recorderStream);
                        const audioMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', '']
                            .find(type => !type || MediaRecorder.isTypeSupported(type));
                        const opts = audioMime ? { mimeType: audioMime } : {};
                        mediaRecorderRef.current = new MediaRecorder(recorderStream, opts);
                        mediaRecorderRef.current.ondataavailable = (event) => {
                            if (event.data.size > 0 && socketRef.current) {
                                socketRef.current.emit("audio_chunk", event.data);
                            }
                        };
                        console.log("MediaRecorder ready:", audioMime || "browser default");
                    } else {
                        console.warn("No audio tracks found");
                        mediaRecorderRef.current = null;
                    }
                } catch (recErr) {
                    console.warn("MediaRecorder unavailable, audio analysis disabled:", recErr);
                    mediaRecorderRef.current = null;
                }

                setupSpeechRecognition();
                fetchInitialQuestion();
            } catch (e) {
                notify.error("Camera and microphone access required for IntelliView Arena.");
            }
        };
        setupHardware();

        return () => {
            killAllMedia();
        };
    }, [showInstructions]);

    // --- 4a. Per-question countdown timer + auto-submit ---
    // When the timer hits 0, the question is auto-submitted (NOT skipped) —
    // whatever transcript the user has at that moment goes through the normal
    // evaluation path. If the transcript is empty, Python's evaluator returns
    // score=0 with "answer too short" feedback. Either way, the next question
    // arrives and the user must attempt every question.
    //
    // Uses an absolute-timestamp pattern (not state-decrement) so it's
    // resilient to React batching and re-renders. The auto-submit checks the
    // current question index — critical to avoid an in-flight tick from one
    // question accidentally submitting the NEXT question.
    const autoSubmitRef = useRef(null); // points at handleSubmit (auto path)
    const autoSubmittedRef = useRef(false);
    useEffect(() => {
        if (showInstructions || loading || !canRecord || isEvaluating || isSpeaking) {
            return;
        }

        // Anchor start time on the first eligible tick for this question.
        // The reset effect (below) clears it whenever currentIdx changes.
        if (questionStartedAtRef.current == null) {
            questionStartedAtRef.current = Date.now();
            autoSubmittedRef.current = false;
        }
        const startTime = questionStartedAtRef.current;
        // Capture which question this timer belongs to. If the user advances
        // to a different question while a tick is queued, we DON'T submit.
        const myQuestionIdx = currentIdx;

        const tick = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const remaining = Math.max(0, Math.ceil(timeLimit - elapsed));
            setTimeRemaining(remaining);
            if (remaining <= 0 && !autoSubmittedRef.current) {
                autoSubmittedRef.current = true;
                clearInterval(interval);
                // Guard: only auto-submit if we are STILL on the same question.
                // Stops a stale tick from submitting the next question.
                if (currentIdxRef.current === myQuestionIdx) {
                    autoSubmitRef.current?.(true);
                }
            }
        };

        tick(); // run once immediately so display is accurate
        const interval = setInterval(tick, 250); // 4×/sec for smooth updates
        return () => clearInterval(interval);
    }, [showInstructions, loading, canRecord, isEvaluating, isSpeaking, timeLimit, currentIdx]);

    // Reset the per-question timer state whenever a NEW question arrives.
    useEffect(() => {
        questionStartedAtRef.current = null;
        autoSubmittedRef.current = false;
        setTimeRemaining(timeLimit);
    }, [currentIdx, timeLimit]);


    // --- 4b. Tab Switch Proctoring (Anti-Cheat) ---
    // First switch = warning. Second switch = auto-end interview.
    const tabSwitchCountRef = useRef(0);
    const [tabWarning, setTabWarning] = useState(false);
    const wasSpeakingRef = useRef(false);
    // Mirror currentQuestionText so the visibility handler always reads the
    // LATEST question, not a stale closure capture from effect mount time.
    const currentQuestionRef = useRef("");

    // --- 4c. Fullscreen Lock ---
    // Once the interview starts, the user must stay in fullscreen. Esc and
    // F11 are blocked via the Keyboard Lock API where supported (Chrome/Edge).
    // If the user STILL manages to exit fullscreen by any other means
    // (Firefox/Safari, dev tools, OS-level shortcut), we treat it as a
    // proctoring violation and immediately terminate the interview — the
    // record is deleted and they're sent back to the dashboard.
    const endingInterviewRef = useRef(false); // suppress termination during clean exit

    // When the interview phase begins, engage fullscreen + lock Esc/F11.
    //   - Normal flow: fullscreen was engaged on the InterviewSetup page's
    //     "Start Interview" click and carried across the same-origin nav,
    //     so by the time we reach this effect we're already in fullscreen
    //     (whether the user clicked Skip or waited for auto-advance).
    //   - Fallback: if the user landed here via refresh / direct URL / hot
    //     reload, fullscreen isn't active and we can't programmatically
    //     force it. We attach a one-shot capture-phase listener so the very
    //     first interaction (click anywhere, any keypress) silently engages
    //     fullscreen + lock.
    useEffect(() => {
        if (showInstructions) return;

        const lockKeyboard = () => {
            try { const _p = navigator.keyboard?.lock?.(['Escape', 'F11']); _p?.catch?.(() => {}); } catch (_) {}
        };

        if (document.fullscreenElement) {
            lockKeyboard();
            return () => {
                try { navigator.keyboard?.unlock?.(); } catch (_) {}
            };
        }

        // No fullscreen yet → wait for the next user interaction to engage it.
        const engageOnGesture = () => {
            document.removeEventListener('mousedown', engageOnGesture, true);
            document.removeEventListener('keydown', engageOnGesture, true);
            document.removeEventListener('touchstart', engageOnGesture, true);
            if (document.fullscreenElement || endingInterviewRef.current) {
                lockKeyboard();
                return;
            }
            const root = document.documentElement;
            const req = root.requestFullscreen
                || root.webkitRequestFullscreen
                || root.mozRequestFullScreen
                || root.msRequestFullscreen;
            if (!req) return;
            try {
                const p = req.call(root);
                if (p && typeof p.then === 'function') {
                    p.then(lockKeyboard).catch(() => {});
                }
            } catch (_) {}
        };
        document.addEventListener('mousedown', engageOnGesture, true);
        document.addEventListener('keydown', engageOnGesture, true);
        document.addEventListener('touchstart', engageOnGesture, true);

        return () => {
            document.removeEventListener('mousedown', engageOnGesture, true);
            document.removeEventListener('keydown', engageOnGesture, true);
            document.removeEventListener('touchstart', engageOnGesture, true);
            try { navigator.keyboard?.unlock?.(); } catch (_) {}
        };
    }, [showInstructions]);

    // If the user manages to exit fullscreen on a browser without Keyboard
    // Lock support (Firefox / Safari), silently re-enter on their very next
    // interaction. Any click / keypress / touch is a fresh user gesture, so
    // requestFullscreen() is allowed. No popup, no toast — just snap back.
    // On Chrome/Edge with the keyboard lock active, this branch is never
    // reached because Esc/F11 are intercepted at the browser level.
    useEffect(() => {
        if (showInstructions) return;
        const reengageOnNextGesture = () => {
            const handler = () => {
                document.removeEventListener('mousedown', handler, true);
                document.removeEventListener('keydown', handler, true);
                document.removeEventListener('touchstart', handler, true);
                if (document.fullscreenElement || endingInterviewRef.current) return;
                const root = document.documentElement;
                const req = root.requestFullscreen
                    || root.webkitRequestFullscreen
                    || root.mozRequestFullScreen
                    || root.msRequestFullscreen;
                if (req) {
                    try {
                        const p = req.call(root);
                        if (p && typeof p.then === 'function') {
                            p.then(() => {
                                try { const _p = navigator.keyboard?.lock?.(['Escape', 'F11']); _p?.catch?.(() => {}); } catch (_) {}
                            }).catch(() => {});
                        }
                    } catch (_) {}
                }
            };
            // capture-phase so we beat any other handlers that might
            // stopPropagation / preventDefault.
            document.addEventListener('mousedown', handler, true);
            document.addEventListener('keydown', handler, true);
            document.addEventListener('touchstart', handler, true);
        };

        const handleFsChange = () => {
            if (endingInterviewRef.current) return;
            if (!document.fullscreenElement) {
                reengageOnNextGesture();
            }
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
        };
    }, [showInstructions]);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && !loading) {
                tabSwitchCountRef.current += 1;
                const count = tabSwitchCountRef.current;

                // Remember if TTS was speaking so we can resume
                wasSpeakingRef.current = window.speechSynthesis.speaking;

                // Pause all sensors
                clearInterval(detectionIntervalRef.current);
                window.speechSynthesis.cancel();
                if (isListening) {
                    if (recognitionRef.current) recognitionRef.current._shouldRun = false;
        try { recognitionRef.current?.stop(); } catch (_) {}
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                        try { mediaRecorderRef.current.stop(); } catch (_) {}
                    }
                }
                if (videoRef.current?.srcObject) {
                    videoRef.current.srcObject.getVideoTracks().forEach(t => t.enabled = false);
                }

                if (count >= 2) {
                    // AUTO-END: Delete interview and redirect
                    endingInterviewRef.current = true;
                    killAllMedia();
                    try { axios.delete(`/interviews/delete/${interviewId}`); } catch (_) {}
                    notify.error("Interview terminated. You switched tabs multiple times.");
                    setTimeout(() => navigate("/dashboard"), 1500);
                }
            } else if (!document.hidden) {
                // Came back to tab
                if (videoRef.current?.srcObject) {
                    videoRef.current.srcObject.getVideoTracks().forEach(t => t.enabled = true);
                }
                startEmotionTracking();

                const count = tabSwitchCountRef.current;
                if (count === 1) {
                    setTabWarning(true);
                    notify.warning("Warning: Tab switch detected! One more switch will end your interview.");
                    setTimeout(() => setTabWarning(false), 5000);

                    // Always re-read the CURRENT question (via ref) so we don't
                    // fall back to the first-question closure after a tab switch.
                    const resumeText = currentQuestionRef.current;
                    if (resumeText) {
                        // Re-speak the current question so the user knows where
                        // they paused, regardless of whether TTS was mid-sentence.
                        setTimeout(() => speak(resumeText), 500);
                    }
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [isListening, loading, interviewId, navigate]);

    // --- 5. Speech Recognition Setup ---
    // Robust live transcription tuned for Indian-English speakers.
    // Key invariants:
    //   - lang = "en-IN"  → acoustic model tuned for Indian English (much better
    //                       recognition than "en-US" for Indian-accented speech).
    //   - continuous = true + auto-restart on browser-fired onend → keeps the
    //                       transcript live across natural pauses (Chrome silently
    //                       stops after ~60s; we restart it transparently).
    //   - interimResults = true → user sees their words as they speak.
    //   - accumulatedFinalRef → preserves all finalized speech across restart
    //                       cycles, so a browser auto-stop never loses prior text.
    //   - 200ms debounced restart → prevents InvalidStateError when start()
    //                       is called before the previous session has fully ended.
    const setupSpeechRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("SpeechRecognition not supported in this browser");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;       // give engine room for accented variants
        recognition.lang = 'en-IN';            // Indian English locale

        recognition.onresult = (e) => {
            let newFinal = "";
            let interim = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const chunk = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    newFinal += chunk + " ";
                } else {
                    interim += chunk;
                }
            }
            if (newFinal) {
                accumulatedFinalRef.current += newFinal;
            }
            // No auto-correction — we just join finalized + interim and clean whitespace.
            const fullText = (accumulatedFinalRef.current + interim).replace(/\s+/g, ' ').trim();
            transcriptRef.current = fullText;
            setTranscript(fullText);
        };

        // Auto-restart loop — Chrome auto-stops after silence or ~60s of audio.
        // Cap restarts so a hard mic failure doesn't hammer the browser.
        let restartTries = 0;
        recognition.onend = () => {
            if (!recognition._shouldRun) { restartTries = 0; return; }
            if (restartTries >= 50) {
                console.warn('Speech recognition restart cap hit — giving up.');
                restartTries = 0;
                return;
            }
            restartTries++;
            // Small delay avoids "InvalidStateError: already started"
            setTimeout(() => {
                if (recognition._shouldRun) {
                    try { recognition.start(); } catch (_) { /* may already be running */ }
                }
            }, 200);
        };

        // Reset retry counter once we're actually hearing audio — proves things work.
        recognition.onsoundstart = () => { restartTries = 0; };
        recognition.onspeechstart  = () => { restartTries = 0; };

        recognition.onerror = (e) => {
            // Fatal errors — stop trying, surface to user.
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                console.error('Mic permission denied — speech recognition stopped.');
                recognition._shouldRun = false;
                if (notify?.error) notify.error('Microphone access denied. Please allow mic permission and reload.');
                return;
            }
            if (e.error === 'audio-capture') {
                console.error('No microphone found — speech recognition stopped.');
                recognition._shouldRun = false;
                if (notify?.error) notify.error('No microphone detected on this device.');
                return;
            }
            // Benign — onend will restart. Don't spam console for these.
            if (e.error && e.error !== 'aborted' && e.error !== 'no-speech' && e.error !== 'network') {
                console.log('Speech recognition error:', e.error);
            }
        };

        recognitionRef.current = recognition;
    };

    // --- 6. Fetch first question from Groq ---
    const fetchInitialQuestion = async () => {
        try {
            const res = await axios.post("/interviews/generate-questions", {
                mode: baseMode,
                tech: baseMode === "hr" ? "Behavioral" : (technologyName || "General"),
                module: baseMode === "hr" ? "Situational" : (moduleName || "General"),
                topic: baseMode === "hr" ? "Soft Skills" : (topicName || "General"),
                difficulty: currentDifficulty,
                skills: baseMode === "resume" ? (user.skills || []) : []
            });
            const rawQuestions = res.data.data.questions || [];
            const firstQ = rawQuestions[0];
            const sanitized = typeof firstQ === 'object' ? firstQ.question : firstQ;
            setQuestions([sanitized]);
            setQuestionsAsked(1); // First question counts
            setLoading(false);
        } catch (err) {
            console.error("Fetch Error", err);
            setLoading(false);
        }
    };

    // --- 7. TTS — Read question aloud, then enable Record button ---
    // Three-part defensive setup:
    //   1. Wait for voices to load before speaking (Chrome/Edge load async).
    //   2. Small delay after cancel() so the browser's TTS queue clears
    //      before we enqueue a new utterance — otherwise speak() silently
    //      no-ops on a still-cancelling state.
    //   3. Explicit volume + rate + pitch (defaults sometimes fail on
    //      mobile or after long sessions).
    const speak = useCallback((text) => {
        if (!text) return;

        const synth = window.speechSynthesis;
        if (!synth) {
            // Browser doesn't support TTS — let the user record anyway
            setIsSpeaking(false);
            setCanRecord(true);
            return;
        }

        // Wait for voices to be available (Chrome/Edge load them async)
        const ensureVoicesAndSpeak = (retries = 8) => {
            const voices = synth.getVoices();
            if (!voices.length && retries > 0) {
                setTimeout(() => ensureVoicesAndSpeak(retries - 1), 150);
                return;
            }
            doSpeak(voices);
        };

        const doSpeak = (voices) => {
            // Cancel any pending utterance, then wait one tick before queuing
            // a new one — Chrome has a race where speak() fires while the
            // previous utterance is still cancelling, dropping the new one.
            synth.cancel();
            setIsSpeaking(true);
            setCanRecord(false);

            setTimeout(() => {
                const msg = new SpeechSynthesisUtterance(text);
                msg.rate = 0.95;          // slightly slower than default for clarity
                msg.pitch = 1;
                msg.volume = 1;           // explicit — default sometimes 0 on mobile
                msg.lang = 'en-US';

                // Pick a natural English voice — Google voices on desktop
                // sound best, fall back to any English voice, then default.
                const preferred =
                    voices.find(v => v.lang.startsWith('en') && /google/i.test(v.name)) ||
                    voices.find(v => v.lang.startsWith('en') && /microsoft/i.test(v.name)) ||
                    voices.find(v => v.lang.startsWith('en'));
                if (preferred) msg.voice = preferred;

                msg.onend = () => {
                    setIsSpeaking(false);
                    setCanRecord(true);
                };
                msg.onerror = (e) => {
                    console.warn('TTS error:', e?.error || e);
                    setIsSpeaking(false);
                    setCanRecord(true);
                };

                // Some browsers pause when the tab loses focus — make sure
                // we're resumed before queuing the new utterance.
                if (synth.paused) synth.resume();

                synth.speak(msg);

                // Watchdog: if after 2s the synth isn't actually speaking
                // (some browsers silently drop), unblock the user.
                setTimeout(() => {
                    if (!synth.speaking && !synth.pending) {
                        setIsSpeaking(false);
                        setCanRecord(true);
                    }
                }, 2000);
            }, 60);
        };

        ensureVoicesAndSpeak();
    }, []);

    // Preload voices (Chrome loads them async — without this, the FIRST
    // speak() call sees an empty voices array and uses the system default,
    // which on some setups is silent).
    useEffect(() => {
        const synth = window.speechSynthesis;
        if (!synth) return;
        synth.getVoices();
        synth.onvoiceschanged = () => synth.getVoices();
    }, []);

    useEffect(() => {
        if (showInstructions) return;
        if (questions[currentIdx] && !loading) {
            const textToSpeak = typeof questions[currentIdx] === 'object'
                ? questions[currentIdx].question
                : questions[currentIdx];
            speak(textToSpeak);
        }
    }, [questions, currentIdx, loading, speak, showInstructions]);

    // --- Kill all media — guaranteed camera/mic release ---
    const killAllMedia = useCallback(() => {
        clearInterval(detectionIntervalRef.current);
        window.speechSynthesis.cancel();
        if (recognitionRef.current) recognitionRef.current._shouldRun = false;
        try { recognitionRef.current?.stop(); } catch (_) {}
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            try { mediaRecorderRef.current.stop(); } catch (_) {}
        }
        // Exit fullscreen if we're still in it — interview ended cleanly
        if (document.fullscreenElement) {
            try { document.exitFullscreen?.()?.catch?.(() => {}); } catch (_) {}
        }
        // Stop stream directly — works even if videoRef is unmounted
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    // --- 8. Start/Stop Recording (mic + audio) ---
    const startRecording = () => {
        // DO NOT clear transcriptRef / accumulatedFinalRef here — Stop + Start
        // during one answer is a pause, not a restart. The buffer is cleared
        // when a NEW question arrives (see next_step_ready handler above).

        // Stop any previous session cleanly, then mark "should auto-restart"
        // before calling start(). Order matters: set flag AFTER stop() otherwise
        // the onend handler fires and sees shouldRun=true and races start().
        if (recognitionRef.current) recognitionRef.current._shouldRun = false;
        try { recognitionRef.current?.stop(); } catch (_) {}
        setTimeout(() => {
            if (recognitionRef.current) recognitionRef.current._shouldRun = true;
            try { recognitionRef.current?.start(); } catch (_) {}
        }, 100);

        // Start audio capture for Librosa/CNN-LSTM
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
                mediaRecorderRef.current.start(1000); // 1-second chunks streamed via socket
            }
        } catch (_) { mediaRecorderRef.current = null; }

        setIsListening(true);
    };

    const stopRecording = () => {
        // Tell onend handler NOT to auto-restart this time
        if (recognitionRef.current) recognitionRef.current._shouldRun = false;
        try { recognitionRef.current?.stop(); } catch (_) {}
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            try { mediaRecorderRef.current.stop(); } catch (_) {}
        }
        setIsListening(false);
    };

    // Build and emit the answer payload to backend.
    // Skipping has been removed — every question is submitted (manual or auto).
    // The `auto` flag distinguishes manual submission from time-expired
    // auto-submission, but in both cases the user's transcript is sent for
    // normal evaluation. If transcript is empty (silent), Python's evaluator
    // returns score=0 with "answer too short" feedback — same as before.
    const emitAnswer = useCallback((auto = false) => {
        const currentQuestion = typeof questions[currentIdx] === 'object'
            ? questions[currentIdx].question
            : questions[currentIdx];

        // Compute elapsed time. Round to whole seconds. Cap at the time
        // limit so a stray timer overrun can't produce a 70s on a 60s limit.
        const startedAt = questionStartedAtRef.current;
        const elapsed = startedAt
            ? Math.min(timeLimit, Math.max(0, Math.round((Date.now() - startedAt) / 1000)))
            : 0;

        const payload = {
            interviewId,
            lastQuestion: currentQuestion,
            lastAnswer: transcriptRef.current,
            was_skipped: false,                  // skipping no longer exists
            time_taken: elapsed,
            time_limit: timeLimit,
            auto_submitted: !!auto,              // true when timer expired
            // Legacy field kept for back-compat with existing report code that
            // shows a "Time expired" badge based on this flag.
            auto_skipped: !!auto,
            currentQuestionIndex: currentIdx,
            totalQuestions: maxQuestions,
            questionsAsked: questionsAsked,
            history: questions.map(q => typeof q === 'object' ? q.question : q),
            roll_no: user.roll_no,
            difficulty: currentDifficulty,
            tech: technologyName || "General",
            module: moduleName || "",
            topic: topicName || "",
            mode: baseMode,
            skills: baseMode === "resume" ? (user.skills || []) : []
        };

        pendingPayloadRef.current = payload;
        socketRef.current.emit("submit_multimodal_answer", payload);
    }, [questions, currentIdx, timeLimit, interviewId, maxQuestions, questionsAsked, user.roll_no, user.skills, currentDifficulty, technologyName, moduleName, topicName, baseMode]);

    // --- 9. Submit Answer (manual or auto) ---
    // `auto = true` means the timer hit zero. Same flow as a manual submit —
    // we just flag it for the report. No skipping concept anywhere.
    const handleSubmit = useCallback((auto = false) => {
        if (isEvaluating || loading) return;
        setIsEvaluating(true);
        if (recognitionRef.current) recognitionRef.current._shouldRun = false;
        try { recognitionRef.current?.stop(); } catch (_) {}

        // Stop MediaRecorder — wait for final ondataavailable before emitting
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.onstop = () => {
                setIsListening(false);
                // Small delay ensures the final audio_chunk socket event is sent
                setTimeout(() => emitAnswer(auto), 200);
            };
            try { mediaRecorderRef.current.stop(); } catch (_) {
                setIsListening(false);
                emitAnswer(auto);
            }
        } else {
            setIsListening(false);
            emitAnswer(auto);
        }
    }, [isEvaluating, loading, emitAnswer]);

    // Keep the ref pointing at the latest handleSubmit so the timer effect
    // (declared earlier in the component) can call it via the ref without
    // a temporal-dead-zone reference. Auto-submission on timer expiry uses
    // this — same flow as manual submit, just with auto=true.
    useEffect(() => {
        autoSubmitRef.current = (auto) => handleSubmit(auto);
    }, [handleSubmit]);

    // --- 10. Helpers ---
    const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const currentQuestionText = questions[currentIdx]
        ? (typeof questions[currentIdx] === 'object' ? questions[currentIdx].question : questions[currentIdx])
        : "";

    // Keep the ref in sync on every render — the tab-visibility handler reads
    // this to replay the CURRENT question (not a stale closure capture).
    currentQuestionRef.current = currentQuestionText;

    // --- Instructions content by mode ---
    const instructionsData = {
        resume: {
            title: "Resume-Based Interview",
            points: [
                "Questions are generated from your resume skills",
                "Focus on explaining concepts verbally — no code needed",
                "AI adapts difficulty based on your confidence and accuracy",
                "Speak clearly into your microphone",
                "Your camera must stay on for facial analysis",
                "Do NOT switch tabs — it may end your interview",
                "Click Record after the question is read to you",
                "Every question must be attempted — there is no skip option",
                "A per-question timer auto-submits your answer when it expires",
                "Your performance report will be available after completion"
            ]
        },
        hr: {
            title: "HR Behavioral Interview",
            points: [
                "You will be asked situational and behavioral questions",
                "Focus on real experiences — use the STAR method",
                "No technical or coding questions will be asked",
                "AI adapts based on your responses and confidence",
                "Speak clearly and maintain eye contact with the camera",
                "Do NOT switch tabs — it may end your interview",
                "Click Record after the AI finishes reading the question",
                "Every question must be attempted — there is no skip option",
                "A per-question timer auto-submits your answer when it expires",
                "Your emotional confidence is being analyzed in real-time"
            ]
        },
        custom: {
            title: "Custom Technical Interview",
            points: [
                "Questions are based on your selected technology and topic",
                "Focus on architecture, trade-offs, and design — not code syntax",
                "AI adapts difficulty based on your multimodal confidence",
                "Speak clearly into your microphone for speech analysis",
                "Your camera must stay on for facial emotion detection",
                "Do NOT switch tabs — it may terminate your interview",
                "Click Record only after the AI finishes reading",
                "Every question must be attempted — there is no skip option",
                "A per-question timer auto-submits your answer when it expires",
                "A detailed report with scores will be generated after"
            ]
        }
    };

    const modeInstructions = instructionsData[baseMode] || instructionsData.custom;

    if (showInstructions) {
        return (
            <div className="instructions-screen">
                <div className="instructions-card">
                    <div className="instructions-header">
                        <div className="instructions-icon">IV</div>
                        <h1>{modeInstructions.title}</h1>
                        <p className="instructions-subtitle">Please read before starting</p>
                    </div>
                    <div className="instructions-list">
                        {modeInstructions.points.map((point, i) => (
                            <div key={i} className="instruction-item">
                                <span className="instruction-num">{i + 1}</span>
                                <span>{point}</span>
                            </div>
                        ))}
                    </div>
                    <div className="instructions-footer">
                        <div className="countdown-ring">
                            <svg viewBox="0 0 40 40">
                                <circle cx="20" cy="20" r="18" className="countdown-bg" />
                                <circle cx="20" cy="20" r="18" className="countdown-progress"
                                    strokeDasharray={`${(countdown / INSTRUCTIONS_DURATION) * 113} 113`} />
                            </svg>
                            <span className="countdown-num">{countdown}</span>
                        </div>
                        <button
                            className="instructions-skip"
                            onClick={() => {
                                // Unlock browser TTS with a tiny utterance on user click
                                window.speechSynthesis.cancel();
                                const unlock = new SpeechSynthesisUtterance('.');
                                unlock.volume = 0.01;
                                window.speechSynthesis.speak(unlock);
                                // Belt-and-braces: if fullscreen wasn't engaged on
                                // the previous page (e.g., user landed here via
                                // refresh/direct URL), this click is a fresh gesture
                                // we can use to enter fullscreen.
                                requestFullscreenSafe();
                                setShowInstructions(false);
                            }}>
                            {countdown > 0 ? `Skip (${countdown}s)` : "Start Now"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="arena-wrapper">
            {/* Tab Switch Warning Banner */}
            {tabWarning && (
                <div className="tab-warning-banner">
                    <span className="tab-warning-icon">!</span>
                    <span>Tab switch detected! One more will <strong>terminate</strong> your interview.</span>
                    <span className="tab-warning-count">Warnings: {tabSwitchCountRef.current}/2</span>
                </div>
            )}


            {/* ===== TOP BAR ===== */}
            <div className="arena-header">
                <div className="arena-title">IntelliView AI Arena</div>
                <div className="header-center">
                    <div className="progress-dots">
                        {Array.from({ length: maxQuestions }, (_, i) => {
                            let dotClass = "progress-dot";
                            if (i < resultsRef.current.length) {
                                dotClass += resultsRef.current[i]?.was_skipped ? " skipped" : " completed";
                            } else if (i === currentIdx) {
                                dotClass += " current";
                            }
                            return <div key={i} className={dotClass} />;
                        })}
                    </div>
                    <span className="header-q-count">Q{questionsAsked}/{maxQuestions}</span>
                </div>
                <div className="header-right">
                    {/* Per-question countdown — turns red in the last 10s.
                        Pauses while AI is reading the question or while
                        we're evaluating the previous answer. */}
                    <div
                        className={`q-timer ${timeRemaining <= 10 ? 'q-timer-warn' : ''} ${!canRecord || isEvaluating ? 'q-timer-paused' : ''}`}
                        title={`Time per question: ${timeLimit}s — auto-submits at 0`}
                    >
                        <span className="q-timer-icon" aria-hidden="true">⏱</span>
                        <span className="q-timer-value">{formatTime(timeRemaining)}</span>
                    </div>
                    <div className="difficulty-badge">{currentDifficulty}</div>
                </div>
            </div>

            {/* ===== MAIN CONTENT — 2 columns ===== */}
            <div className="arena-main">
                {/* LEFT: AI Interviewer */}
                <div className="interviewer-panel">
                    {/* AI Mentor avatar (animated SVG portrait) */}
                    <div className="avatar-area">
                        <AIAvatar
                            speaking={isSpeaking}
                            listening={isListening}
                            evaluating={isEvaluating}
                            loading={loading}
                        />
                    </div>

                    {/* Question Card */}
                    <div className="question-card">
                        {loading ? (
                            <div className="question-loading">
                                <div className="q-loader"></div>
                                <span>Preparing your first question...</span>
                            </div>
                        ) : (
                            <>
                                <div className="question-label">Question {questionsAsked}</div>
                                <p className="question-text">{currentQuestionText}</p>
                            </>
                        )}
                    </div>

                    {/* Audio Spectrogram — shows live mic activity instead of
                        the raw transcript. The transcript is still being
                        captured silently and used for evaluation; the user
                        just doesn't see it, which lets them focus on the
                        question rather than worrying about transcription. */}
                    <div className="transcript-card">
                        <div className="transcript-header">
                            <span className="transcript-label">
                                {isListening ? "Listening to your answer" : canRecord ? "Ready to record" : "Wait for the question"}
                            </span>
                            {isListening && <span className="recording-indicator">Recording</span>}
                        </div>
                        <AudioVisualizer
                            stream={audioStream}
                            listening={isListening}
                            canRecord={canRecord}
                        />
                    </div>
                </div>

                {/* RIGHT: Camera + Analysis */}
                <div className="sidebar-panel">
                    {/* Camera */}
                    <div className="camera-card">
                        <div className="camera-header">
                            <span>Your Camera</span>
                            {isListening && <span className="rec-dot">REC</span>}
                        </div>
                        <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
                    </div>

                    {/* Live Analysis */}
                    <div className="analysis-card">
                        <div className="panel-head">
                            <h4 className="panel-title">Live Performance</h4>
                            <span className="panel-meta">Real-time</span>
                        </div>
                        <div className="metric-list">
                            <Metric
                                label="Confidence"
                                value={faceConfidence}
                                hint="How composed you appear on camera — calm + positive expression. 0 means no face data captured yet."
                            />
                            <Metric
                                label="Accuracy"
                                value={lastAccuracy}
                                hint="How technically correct your last answer was, judged by the AI."
                            />
                            <Metric
                                label="Clarity"
                                value={lastClarity}
                                hint="How clearly you spoke — voice tone and audio quality of your answer."
                            />
                        </div>
                    </div>

                    {/* Adaptive Engine Info */}
                    <div className="engine-card">
                        <div className="panel-head">
                            <h4 className="panel-title">Adaptive Mentor</h4>
                        </div>
                        <p className="engine-text">
                            The next question's difficulty adjusts to match your performance.
                        </p>
                        <EngineStatus
                            isSpeaking={isSpeaking}
                            isEvaluating={isEvaluating}
                            isListening={isListening}
                        />
                    </div>
                </div>
            </div>

            {/* ===== BOTTOM CONTROLS ===== */}
            <div className="arena-controls">
                <button
                    className={`control-btn mic-btn ${isListening ? "recording" : ""}`}
                    disabled={!canRecord || isEvaluating || isSpeaking}
                    onClick={() => isListening ? stopRecording() : startRecording()}
                >
                    {isListening && <span className="rec-pulse" aria-hidden="true" />}
                    <span className="control-label">
                        {isSpeaking ? "Please wait" : isListening ? "Stop Recording" : "Start Recording"}
                    </span>
                </button>

                <button
                    className="control-btn submit-btn"
                    onClick={() => handleSubmit(false)}
                    disabled={isEvaluating || loading || isSpeaking || (!transcriptRef.current && !transcript)}
                    title={(!transcriptRef.current && !transcript) ? "Record an answer first, or wait for the timer to auto-submit" : ""}
                >
                    {isEvaluating && <span className="control-spinner" aria-hidden="true" />}
                    <span className="control-label">
                        {isEvaluating
                            ? "Analyzing"
                            : questionsAsked >= maxQuestions
                                ? "Finish Interview"
                                : "Next Question →"}
                    </span>
                </button>

                <button className="control-btn end-btn" onClick={async () => {
                    const ok = await notify.confirm(
                        "Are you sure you want to end this interview? This will delete the session and free your slot.",
                        "End Interview"
                    );
                    if (!ok) return;
                    // Set flag BEFORE exiting fullscreen so the fullscreenchange
                    // listener doesn't pop the "fullscreen lost" overlay during
                    // a legitimate end-of-interview.
                    endingInterviewRef.current = true;
                    killAllMedia();
                    try {
                        await axios.delete(`/interviews/delete/${interviewId}`);
                    } catch (_) {}
                    navigate("/dashboard");
                }}>
                    <span className="control-label">End Interview</span>
                </button>
            </div>
        </div>
    );
}

function Metric({ label, value, hint }) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value || 0)));
    const tone = safeValue < 40 ? 'low' : safeValue < 70 ? 'mid' : 'high';
    return (
        <div className={`metric-row metric-${tone}`} title={hint || undefined}>
            <div className="metric-head">
                <span className="metric-label">
                    {label}
                    {hint && <span className="metric-info" aria-hidden="true">i</span>}
                </span>
                <span className="metric-value">
                    {safeValue}<span className="metric-unit">%</span>
                </span>
            </div>
            <div className="metric-bar">
                <div className="metric-bar-fill" style={{ width: `${safeValue}%` }}></div>
            </div>
        </div>
    );
}

function EngineStatus({ isSpeaking, isEvaluating, isListening }) {
    const state = isSpeaking
        ? { key: 'speaking',   label: 'Reading question' }
        : isEvaluating
        ? { key: 'evaluating', label: 'Analyzing your answer' }
        : isListening
        ? { key: 'listening',  label: 'Listening to you' }
        : { key: 'idle',       label: 'Standing by' };
    return (
        <div className={`engine-state engine-state-${state.key}`}>
            <span className="engine-state-dot" aria-hidden="true"></span>
            <span className="engine-state-label">{state.label}</span>
        </div>
    );
}
