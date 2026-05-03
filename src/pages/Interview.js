import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import { io } from "socket.io-client";
import axios from "../api/axiosInstance";
import { SOCKET_URL } from "../api/config";
import { useNotification } from "../context/NotificationContext";
import AIAvatar from "../components/AIAvatar";
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
    const [showInstructions, setShowInstructions] = useState(true);
    const [countdown, setCountdown] = useState(10);

    useEffect(() => {
        if (!showInstructions) return;
        if (countdown <= 0) {
            // Unlock TTS when countdown auto-finishes
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
    const [questions, setQuestions] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [questionsAsked, setQuestionsAsked] = useState(0); // Total asked (including skips)
    const [loading, setLoading] = useState(true);
    const [seconds, setSeconds] = useState(0);
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const transcriptRef = useRef("");
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

    // --- 1. Fetch Admin Settings (dynamic question count) ---
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get("/admin/settings");
                const s = res.data;
                // Per-mode question counts (per spec: Resume 10, Custom 10, HR 8)
                const modeKey = { resume: 'questions_resume', custom: 'questions_custom', hr: 'questions_hr' };
                const count = s?.[modeKey[baseMode]] || s?.questions_per_session || 3;
                setMaxQuestions(count);
            } catch (err) {
                console.warn("Admin settings unavailable, using default (3)");
            }
        };
        fetchSettings();
    }, []);

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
                    audio_confidence: data.audio_confidence || null
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

                // Calculate overall score from all question results
                const answered = resultsRef.current.filter(r => !r.was_skipped);
                const overallScore = answered.length > 0
                    ? Math.round(answered.reduce((sum, r) => sum + r.accuracy, 0) / answered.length)
                    : 0;

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
                        skipped: resultsRef.current.length - answered.length
                    }],
                    overall_score: overallScore
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
        const timer = setInterval(() => setSeconds(prev => prev + 1), 1000);

        const setupHardware = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                streamRef.current = stream; // Save for reliable cleanup
                if (videoRef.current) videoRef.current.srcObject = stream;

                // Setup MediaRecorder with audio-only stream for Librosa/CNN-LSTM
                try {
                    const audioTracks = stream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        const audioStream = new MediaStream(audioTracks);
                        const audioMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', '']
                            .find(type => !type || MediaRecorder.isTypeSupported(type));
                        const opts = audioMime ? { mimeType: audioMime } : {};
                        mediaRecorderRef.current = new MediaRecorder(audioStream, opts);
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
            clearInterval(timer);
            killAllMedia();
        };
    }, [showInstructions]);

    // --- 4b. Tab Switch Proctoring (Anti-Cheat) ---
    // First switch = warning. Second switch = auto-end interview.
    const tabSwitchCountRef = useRef(0);
    const [tabWarning, setTabWarning] = useState(false);
    const wasSpeakingRef = useRef(false);
    // Mirror currentQuestionText so the visibility handler always reads the
    // LATEST question, not a stale closure capture from effect mount time.
    const currentQuestionRef = useRef("");

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
    const speak = useCallback((text) => {
        if (!text) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        setIsSpeaking(true);
        setCanRecord(false);

        const msg = new SpeechSynthesisUtterance(text);
        msg.rate = 0.9;
        msg.lang = 'en-US';

        // Try to pick a good English voice
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
            || voices.find(v => v.lang.startsWith('en'))
            || null;
        if (englishVoice) msg.voice = englishVoice;

        msg.onend = () => {
            setIsSpeaking(false);
            setCanRecord(true);
        };
        msg.onerror = () => {
            setIsSpeaking(false);
            setCanRecord(true);
        };

        // Unstick paused state
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }

        window.speechSynthesis.speak(msg);

        // Fallback: if nothing happens after 1 second, enable record anyway
        setTimeout(() => {
            if (!window.speechSynthesis.speaking) {
                setIsSpeaking(false);
                setCanRecord(true);
            }
        }, 1000);
    }, []);

    // Preload voices (Chrome loads them async)
    useEffect(() => {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
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

    // Build and emit the answer payload to backend
    const emitAnswer = (isSkip) => {
        const currentQuestion = typeof questions[currentIdx] === 'object'
            ? questions[currentIdx].question
            : questions[currentIdx];

        const payload = {
            interviewId,
            lastQuestion: currentQuestion,
            lastAnswer: isSkip ? "SKIPPED" : transcriptRef.current,
            was_skipped: isSkip,
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
    };

    // --- 9. Submit Answer / Skip ---
    const handleSubmit = () => {
        if (isEvaluating || loading) return;
        setIsEvaluating(true);
        if (recognitionRef.current) recognitionRef.current._shouldRun = false;
        try { recognitionRef.current?.stop(); } catch (_) {}

        // Stop MediaRecorder — wait for final ondataavailable before emitting
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.onstop = () => {
                setIsListening(false);
                // Small delay ensures the final audio_chunk socket event is sent
                setTimeout(() => emitAnswer(false), 200);
            };
            try { mediaRecorderRef.current.stop(); } catch (_) {
                setIsListening(false);
                emitAnswer(false);
            }
        } else {
            setIsListening(false);
            emitAnswer(false);
        }
    };

    const handleSkip = () => {
        if (isEvaluating || loading) return;
        setIsEvaluating(true);
        stopRecording();
        emitAnswer(true);
    };

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
                "You can skip questions but they still count",
                "Take your time — there is no time limit per answer",
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
                "You can skip questions but they still count",
                "Be honest and structured in your responses",
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
                "You can skip questions but they still count toward total",
                "No time limit — answer at your own pace",
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
                                    strokeDasharray={`${(countdown / 10) * 113} 113`} />
                            </svg>
                            <span className="countdown-num">{countdown}</span>
                        </div>
                        <button className="instructions-skip" onClick={() => {
                            // Unlock browser TTS with a tiny utterance on user click
                            window.speechSynthesis.cancel();
                            const unlock = new SpeechSynthesisUtterance('.');
                            unlock.volume = 0.01;
                            window.speechSynthesis.speak(unlock);
                            // Request fullscreen on the user gesture — browsers
                            // require an explicit click to allow fullscreen.
                            // If user later presses Esc to exit, that's fine —
                            // we don't penalize. Tab switches remain a violation
                            // and are handled separately by visibilitychange.
                            const root = document.documentElement;
                            const req = root.requestFullscreen
                                || root.webkitRequestFullscreen
                                || root.mozRequestFullScreen
                                || root.msRequestFullscreen;
                            if (req) {
                                try { req.call(root)?.catch?.(() => {}); } catch (_) {}
                            }
                            setShowInstructions(false);
                        }}>
                            {countdown > 0 ? `Skip (${countdown}s)` : "Start Interview"}
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
                    <div className="timer">{formatTime(seconds)}</div>
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

                    {/* Transcript Area */}
                    <div className="transcript-card">
                        <div className="transcript-header">
                            <span className="transcript-label">Your Answer</span>
                            {isListening && <span className="recording-indicator">Recording</span>}
                        </div>
                        <div className="transcript-body">
                            {transcript || (isListening ? "Listening... start speaking" : canRecord ? "Click Record to begin your answer" : "Wait for the question to be read...")}
                        </div>
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
                    onClick={handleSubmit}
                    disabled={isEvaluating || loading || isSpeaking || (!transcriptRef.current && !transcript)}
                >
                    {isEvaluating && <span className="control-spinner" aria-hidden="true" />}
                    <span className="control-label">
                        {isEvaluating ? "Analyzing" : "Submit Answer"}
                    </span>
                </button>

                <button
                    className="control-btn skip-btn"
                    onClick={handleSkip}
                    disabled={isEvaluating || loading || isSpeaking}
                >
                    <span className="control-label">Skip Question</span>
                </button>

                <button className="control-btn end-btn" onClick={async () => {
                    const ok = await notify.confirm(
                        "Are you sure you want to end this interview? This will delete the session and free your slot.",
                        "End Interview"
                    );
                    if (!ok) return;
                    killAllMedia();
                    // Delete the in-progress interview
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
