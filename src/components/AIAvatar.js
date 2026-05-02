import React, { useEffect, useRef, useState } from "react";
import "./AIAvatar.css";

/**
 * AIAvatar — animated AI mentor for the interview screen.
 *
 * Props:
 *   speaking   — TTS is reading the question (mouth animates)
 *   evaluating — Python engine analyzing the answer (status only)
 *   listening  — Browser is recording the user (status only)
 *   loading    — Initial connection / fetching first question
 *   size       — base pixel size (default 320). Container scales responsively.
 *   name       — label shown under the avatar (default "IntelliView AI Mentor")
 */
export default function AIAvatar({
  speaking = false,
  evaluating = false,
  listening = false,
  loading = false,
  size = 320,
  name = "IntelliView AI Mentor",
}) {
  const [blink, setBlink] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [headTilt, setHeadTilt] = useState(0);
  const blinkTimerRef = useRef(null);

  // Natural eye blinking
  useEffect(() => {
    const blinkLoop = () => {
      const delay = 2600 + Math.random() * 3000;
      blinkTimerRef.current = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        blinkLoop();
      }, delay);
    };
    blinkLoop();
    return () => clearTimeout(blinkTimerRef.current);
  }, []);

  // Mouth animation — only animates when speaking
  useEffect(() => {
    let frame;
    let t = 0;
    if (speaking) {
      const run = () => {
        t += 0.18;
        setMouthOpen(
          Math.abs(Math.sin(t)) * 0.65 + Math.abs(Math.sin(t * 2.2)) * 0.35
        );
        frame = requestAnimationFrame(run);
      };
      frame = requestAnimationFrame(run);
    } else {
      setMouthOpen(0);
    }
    return () => cancelAnimationFrame(frame);
  }, [speaking]);

  // Subtle idle head sway (always on — feels alive)
  useEffect(() => {
    let frame;
    let t = 0;
    const run = () => {
      t += 0.011;
      setHeadTilt(Math.sin(t) * 1.4);
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, []);

  const mo = mouthOpen;
  const eyeScaleY = blink ? 0.05 : 1;

  // Resolve current state for the status pill
  const status = loading
    ? { key: "loading",    label: "Connecting" }
    : speaking
    ? { key: "speaking",   label: "Speaking" }
    : listening
    ? { key: "listening",  label: "Listening" }
    : evaluating
    ? { key: "evaluating", label: "Analyzing" }
    : { key: "idle",       label: name };

  return (
    <div
      className={`ai-avatar-wrap ai-avatar-${status.key}`}
      style={{ "--avatar-size": `${size}px` }}
    >
      <div className="ai-avatar-frame">
        <svg
          viewBox="0 0 480 480"
          xmlns="http://www.w3.org/2000/svg"
          className="ai-avatar-svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="aiSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#060e1a" />
              <stop offset="55%" stopColor="#0e2340" />
              <stop offset="100%" stopColor="#1a3a58" />
            </linearGradient>
            <radialGradient id="aiFaceGrad" cx="50%" cy="38%" r="60%">
              <stop offset="0%" stopColor="#d4916a" />
              <stop offset="50%" stopColor="#b86e3a" />
              <stop offset="100%" stopColor="#8a4820" />
            </radialGradient>
            <radialGradient id="aiNeckGrad" cx="50%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#c8824a" />
              <stop offset="100%" stopColor="#8a4820" />
            </radialGradient>
            <linearGradient id="aiHairGrad" x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="#1e1206" />
              <stop offset="45%" stopColor="#2a1a08" />
              <stop offset="100%" stopColor="#080402" />
            </linearGradient>
            <linearGradient id="aiShirtGrad" x1="0" y1="0" x2="0.25" y2="1">
              <stop offset="0%" stopColor="#2e6842" />
              <stop offset="50%" stopColor="#1e4d2b" />
              <stop offset="100%" stopColor="#112c18" />
            </linearGradient>
            <linearGradient id="aiGlassLens" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#cce8f8" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#88b8d8" stopOpacity="0.06" />
            </linearGradient>
            <radialGradient id="aiIrisL" cx="38%" cy="35%" r="62%">
              <stop offset="0%" stopColor="#5c3010" />
              <stop offset="45%" stopColor="#381c08" />
              <stop offset="100%" stopColor="#180800" />
            </radialGradient>
            <radialGradient id="aiIrisR" cx="38%" cy="35%" r="62%">
              <stop offset="0%" stopColor="#5c3010" />
              <stop offset="45%" stopColor="#381c08" />
              <stop offset="100%" stopColor="#180800" />
            </radialGradient>
            <filter id="aiBlur4"><feGaussianBlur stdDeviation="4" /></filter>
            <filter id="aiBlur2"><feGaussianBlur stdDeviation="2" /></filter>
            <filter id="aiBlur1"><feGaussianBlur stdDeviation="0.8" /></filter>
            <filter id="aiHairDrop">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#000" floodOpacity="0.55" />
            </filter>
            <clipPath id="aiCircle"><circle cx="240" cy="240" r="240" /></clipPath>
            <radialGradient id="aiVignette" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="transparent" />
              <stop offset="100%" stopColor="#020810" stopOpacity="0.75" />
            </radialGradient>
          </defs>

          <g clipPath="url(#aiCircle)">
            {/* Sky */}
            <rect width="480" height="480" fill="url(#aiSky)" />

            {/* Atmospheric glow */}
            <ellipse cx="240" cy="185" rx="175" ry="140" fill="#1a4870" opacity="0.3" filter="url(#aiBlur4)" />

            {/* City buildings */}
            {[
              [18, 28, 95], [44, 20, 132], [62, 32, 80], [90, 18, 112],
              [112, 25, 142], [138, 20, 88],
              [310, 24, 118], [332, 18, 88], [350, 30, 152], [378, 22, 84],
              [400, 28, 112], [430, 20, 132], [452, 24, 70],
            ].map(([x, w, h], i) => (
              <g key={i} filter="url(#aiBlur4)">
                <rect
                  x={x}
                  y={330 - h}
                  width={w}
                  height={h + 100}
                  fill={["#0b1c2e", "#091520", "#0d2035"][i % 3]}
                  opacity="0.92"
                />
                {Array.from({ length: Math.floor(h / 20) }).map((_, r) =>
                  Array.from({ length: Math.floor(w / 11) }).map((_, c) => {
                    const lit = (i * 7 + r * 3 + c * 5) % 10 > 3;
                    return lit ? (
                      <rect
                        key={`${r}-${c}`}
                        x={x + 3 + c * 11}
                        y={330 - h + 5 + r * 20}
                        width={5}
                        height={9}
                        fill="#ffd080"
                        opacity={0.45 + ((i + r + c) % 5) * 0.1}
                      />
                    ) : null;
                  })
                )}
              </g>
            ))}

            {/* Ground */}
            <rect x="0" y="380" width="480" height="100" fill="#04090f" opacity="0.8" />
            <ellipse cx="240" cy="385" rx="290" ry="14" fill="#112a45" opacity="0.4" filter="url(#aiBlur2)" />

            {/* SHIRT / BODY */}
            <path d="M 55 480 Q 78 368 148 348 Q 192 338 240 338 Q 288 338 332 348 Q 402 368 425 480 Z" fill="url(#aiShirtGrad)" />
            <path d="M 218 350 L 262 350 L 262 480 L 218 480 Z" fill="#0d2618" opacity="0.35" />
            <path d="M 55 480 Q 78 368 148 348 Q 168 342 185 345 Q 152 368 128 408 Q 100 442 78 480 Z" fill="#3a7050" opacity="0.28" />
            <path d="M 198 338 Q 214 344 228 356 Q 236 364 240 378 Q 216 360 192 354 Z" fill="#1e4d2b" />
            <path d="M 282 338 Q 266 344 252 356 Q 244 364 240 378 Q 264 360 288 354 Z" fill="#1e4d2b" />
            <ellipse cx="240" cy="352" rx="50" ry="8" fill="#0a1c10" opacity="0.3" filter="url(#aiBlur1)" />

            {/* Backpack strap */}
            <path d="M 298 344 Q 320 356 330 380 Q 340 408 336 440 Q 332 462 330 480 L 310 480 Q 314 460 318 436 Q 322 404 312 376 Q 302 358 288 348 Z" fill="#22223a" />
            <rect x="316" y="420" width="22" height="16" rx="3.5" fill="#323248" />

            {/* Neck */}
            <path d="M 212 338 Q 222 322 240 320 Q 258 322 268 338 Q 256 346 240 348 Q 224 346 212 338 Z" fill="url(#aiNeckGrad)" />
            <ellipse cx="240" cy="346" rx="24" ry="7" fill="#5a2808" opacity="0.3" filter="url(#aiBlur1)" />

            {/* HEAD GROUP (with idle sway) */}
            <g transform={`rotate(${headTilt} 240 310)`}>
              <ellipse cx="242" cy="316" rx="75" ry="15" fill="#1a0800" opacity="0.38" filter="url(#aiBlur2)" />

              {/* Face */}
              <ellipse cx="240" cy="218" rx="90" ry="104" fill="url(#aiFaceGrad)" />
              <ellipse cx="164" cy="234" rx="28" ry="26" fill="#c87848" opacity="0.22" filter="url(#aiBlur2)" />
              <ellipse cx="316" cy="234" rx="28" ry="26" fill="#c87848" opacity="0.22" filter="url(#aiBlur2)" />
              <ellipse cx="240" cy="164" rx="50" ry="30" fill="#d89060" opacity="0.22" filter="url(#aiBlur2)" />
              <path d="M 152 248 Q 150 278 166 305 Q 182 322 210 330 Q 224 334 240 335 Q 256 334 270 330 Q 298 322 314 305 Q 330 278 328 248 Q 318 265 310 280 Q 296 302 272 312 Q 258 318 240 319 Q 222 318 208 312 Q 184 302 170 280 Q 162 265 152 248 Z" fill="#9a5020" opacity="0.15" />
              <path d="M 152 195 Q 150 250 164 292 Q 152 260 154 210 Z" fill="#6a3010" opacity="0.2" filter="url(#aiBlur2)" />
              <path d="M 328 195 Q 330 250 316 292 Q 328 260 326 210 Z" fill="#6a3010" opacity="0.2" filter="url(#aiBlur2)" />

              {/* Ears */}
              <ellipse cx="151" cy="224" rx="12" ry="17" fill="#c07040" />
              <ellipse cx="153" cy="224" rx="6.5" ry="11" fill="#a05828" opacity="0.45" />
              <ellipse cx="329" cy="224" rx="12" ry="17" fill="#c07040" />
              <ellipse cx="327" cy="224" rx="6.5" ry="11" fill="#a05828" opacity="0.45" />

              {/* Hair (back/sides) */}
              <path d="M 152 170 Q 150 130 163 107 Q 180 76 212 65 Q 228 60 240 60 Q 252 60 268 65 Q 300 76 317 107 Q 330 130 328 170 Q 310 148 282 136 Q 262 129 240 129 Q 218 129 198 136 Q 170 148 152 170 Z" fill="url(#aiHairGrad)" filter="url(#aiHairDrop)" />
              <path d="M 168 150 Q 172 110 192 90 Q 210 72 240 68 Q 270 72 288 90 Q 308 110 312 150 Q 292 122 264 113 Q 252 109 240 109 Q 228 109 216 113 Q 188 122 168 150 Z" fill="#1c1006" />
              <path d="M 218 72 Q 235 65 256 72 Q 242 67 240 67 Q 238 67 218 72 Z" fill="#352010" opacity="0.55" />
              <path d="M 152 170 Q 148 200 155 230 Q 160 205 168 188 Q 163 178 152 170 Z" fill="#160e04" />
              <path d="M 328 170 Q 332 200 325 230 Q 320 205 312 188 Q 317 178 328 170 Z" fill="#160e04" />

              {/* Eyebrows */}
              <path d="M 188 184 Q 200 177 218 179 Q 223 180 225 184" fill="none" stroke="#1a1006" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M 292 184 Q 280 177 262 179 Q 257 180 255 184" fill="none" stroke="#1a1006" strokeWidth="3.5" strokeLinecap="round" />

              {/* Eyes */}
              <ellipse cx="207" cy="204" rx="23" ry="14" fill="#7a3c0c" opacity="0.22" filter="url(#aiBlur1)" />
              <ellipse cx="273" cy="204" rx="23" ry="14" fill="#7a3c0c" opacity="0.22" filter="url(#aiBlur1)" />

              <g transform={`scale(1,${eyeScaleY})`} style={{ transformOrigin: "207px 205px" }}>
                <path d="M 186 205 Q 195 197 207 197 Q 219 197 228 205 Q 219 213 207 213 Q 195 213 186 205 Z" fill="#f2ede4" />
                <circle cx="207" cy="205" r="7.8" fill="url(#aiIrisL)" />
                <circle cx="207" cy="205" r="4.4" fill="#060200" />
                <circle cx="204" cy="202" r="2" fill="white" opacity="0.92" />
                <circle cx="209.5" cy="207.5" r="1" fill="white" opacity="0.45" />
                <path d="M 186 205 Q 195 196 207 196 Q 219 196 228 205" fill="none" stroke="#1a0c04" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 187 206 Q 196 214 207 214 Q 218 214 227 206" fill="none" stroke="#3a2010" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
              </g>

              <g transform={`scale(1,${eyeScaleY})`} style={{ transformOrigin: "273px 205px" }}>
                <path d="M 252 205 Q 261 197 273 197 Q 285 197 294 205 Q 285 213 273 213 Q 261 213 252 205 Z" fill="#f2ede4" />
                <circle cx="273" cy="205" r="7.8" fill="url(#aiIrisR)" />
                <circle cx="273" cy="205" r="4.4" fill="#060200" />
                <circle cx="270" cy="202" r="2" fill="white" opacity="0.92" />
                <circle cx="275.5" cy="207.5" r="1" fill="white" opacity="0.45" />
                <path d="M 252 205 Q 261 196 273 196 Q 285 196 294 205" fill="none" stroke="#1a0c04" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 253 206 Q 262 214 273 214 Q 284 214 293 206" fill="none" stroke="#3a2010" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
              </g>

              {/* Nose */}
              <path d="M 237 200 Q 234 218 231 228 Q 233 236 240 238 Q 247 236 249 228 Q 246 218 243 200 Z" fill="#945020" opacity="0.22" />
              <path d="M 226 236 Q 233 230 240 231 Q 247 230 254 236 Q 250 244 240 245 Q 230 244 226 236 Z" fill="#7a3810" opacity="0.5" />
              <ellipse cx="232" cy="239" rx="6.5" ry="5.5" fill="#6e3010" opacity="0.38" />
              <ellipse cx="248" cy="239" rx="6.5" ry="5.5" fill="#6e3010" opacity="0.38" />
              <ellipse cx="240" cy="233" rx="6" ry="4.5" fill="#cc7840" opacity="0.28" />

              {/* Mouth */}
              <path d="M 223 250 Q 219 258 221 266" fill="none" stroke="#8a4018" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
              <path d="M 257 250 Q 261 258 259 266" fill="none" stroke="#8a4018" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />

              <path d={`M 218 ${263 - mo * 3} Q 226 ${256 - mo * 2} 240 ${258 - mo * 3} Q 254 ${256 - mo * 2} 262 ${263 - mo * 3} Q 256 ${261 - mo} 240 ${262 - mo * 2} Q 224 ${261 - mo} 218 ${263 - mo * 3} Z`} fill="#7a3820" />
              <path d={`M 228 ${258 - mo * 2} Q 234 ${254 - mo * 2} 240 ${255 - mo * 2} Q 246 ${254 - mo * 2} 252 ${258 - mo * 2}`} fill="none" stroke="#612a14" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

              {mo > 0.05 && (
                <path d={`M 222 ${262 - mo * 2} Q 240 ${264 + mo * 18} 258 ${262 - mo * 2} Q 250 ${266 + mo * 14} 240 ${267 + mo * 15} Q 230 ${266 + mo * 14} 222 ${262 - mo * 2} Z`} fill="#260c06" />
              )}
              {mo > 0.12 && (
                <path d={`M 226 ${264 - mo * 2} Q 240 ${266 + mo * 10} 254 ${264 - mo * 2} Q 248 ${265 + mo * 8} 240 ${266 + mo * 9} Q 232 ${265 + mo * 8} 226 ${264 - mo * 2} Z`} fill="#ece8e2" opacity={Math.min(mo * 2.2, 1)} />
              )}

              <path d={`M 218 ${263 - mo * 3} Q 228 ${272 + mo * 3} 240 ${274 + mo * 2} Q 252 ${272 + mo * 3} 262 ${263 - mo * 3} Q 254 ${276 + mo * 4} 240 ${278 + mo * 3} Q 226 ${276 + mo * 4} 218 ${263 - mo * 3} Z`} fill="#8a4228" />
              <ellipse cx="240" cy={275 + mo} rx="11" ry="4" fill="#b06440" opacity="0.32" />
              <circle cx="218" cy={264 - mo} r="2.5" fill="#8a3a18" opacity="0.4" />
              <circle cx="262" cy={264 - mo} r="2.5" fill="#8a3a18" opacity="0.4" />

              {/* Beard / stubble */}
              <path d="M 173 244 Q 170 276 178 300 Q 190 322 212 330 Q 226 335 240 336 Q 254 335 268 330 Q 290 322 302 300 Q 310 276 307 244 Q 298 256 290 268 Q 278 286 268 296 Q 256 308 240 310 Q 224 308 212 296 Q 202 286 190 268 Q 182 256 173 244 Z" fill="#140c06" opacity="0.3" />
              {[178, 190, 202, 214, 226, 238, 250, 262, 274, 286, 298].map((x, i) =>
                [258, 268, 278, 288, 298, 308].map((y, j) => (
                  <circle
                    key={`${i}-${j}`}
                    cx={x + ((i + j) % 3) * 1.5}
                    cy={y}
                    r={1.1}
                    fill="#1a0c06"
                    opacity={0.25 + ((i * j) % 4) * 0.07}
                  />
                ))
              )}
              <path d="M 224 257 Q 232 252 240 253 Q 248 252 256 257 Q 249 254 240 255 Q 231 254 224 257 Z" fill="#160a04" opacity="0.75" />
              <path d="M 218 294 Q 228 304 240 306 Q 252 304 262 294 Q 255 300 240 302 Q 225 300 218 294 Z" fill="#160a04" opacity="0.55" />
              <path d="M 161 210 Q 160 232 163 250 Q 166 238 168 226 Q 167 218 161 210 Z" fill="#160a04" opacity="0.45" />
              <path d="M 319 210 Q 320 232 317 250 Q 314 238 312 226 Q 313 218 319 210 Z" fill="#160a04" opacity="0.45" />

              {/* Glasses */}
              <rect x="179" y="192" width="57" height="33" rx="5.5" fill="url(#aiGlassLens)" stroke="#c4d8e8" strokeWidth="2.6" />
              <path d="M 183 195 Q 194 192 212 195" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
              <path d="M 183 200 Q 188 198 196 199" stroke="white" strokeWidth="0.9" strokeLinecap="round" opacity="0.28" />

              <rect x="244" y="192" width="57" height="33" rx="5.5" fill="url(#aiGlassLens)" stroke="#c4d8e8" strokeWidth="2.6" />
              <path d="M 248 195 Q 259 192 277 195" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />

              <path d="M 236 208 Q 240 203 244 208" fill="none" stroke="#c4d8e8" strokeWidth="2.1" strokeLinecap="round" />
              <path d="M 179 205 Q 164 205 159 212 Q 156 218 157 226" fill="none" stroke="#c4d8e8" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 301 205 Q 316 205 321 212 Q 324 218 323 226" fill="none" stroke="#c4d8e8" strokeWidth="2.2" strokeLinecap="round" />

              {/* Hair overlay */}
              <path d="M 162 170 Q 160 145 170 124 Q 184 100 206 88 Q 222 80 240 78 Q 258 80 274 88 Q 296 100 310 124 Q 320 145 318 170 Q 300 148 275 136 Q 260 130 240 130 Q 220 130 205 136 Q 180 148 162 170 Z" fill="url(#aiHairGrad)" />
            </g>

            {/* Speaking waveform at bottom */}
            {speaking && (
              <g className="ai-avatar-wave">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <rect
                    key={i}
                    x={210 + i * 10}
                    y={454}
                    width={6}
                    height={20}
                    rx={3}
                    fill="#44ff88"
                    style={{ animation: `aiWave${i} ${0.4 + i * 0.07}s ease-in-out infinite alternate` }}
                  />
                ))}
              </g>
            )}

            {/* Vignette */}
            <circle cx="240" cy="240" r="240" fill="url(#aiVignette)" />
          </g>
        </svg>
      </div>

      {/* Status pill */}
      <div className="ai-avatar-status">
        <span className="ai-avatar-status-dot" aria-hidden="true" />
        <span className="ai-avatar-status-label">{status.label}</span>
      </div>
    </div>
  );
}
