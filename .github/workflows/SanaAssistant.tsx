import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { encode, decode, blobToBase64 } from '../utils';

// --- Configuration & Constants ---
const SECRET_CODE = '07861';
const VOICE_THRESHOLD = 0.01; 
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

// --- Helper: Robust Audio Decoding ---
async function pcmToAudioBuffer(
  pcmData: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      if (i < channelData.length && (i * numChannels + channel) < dataInt16.length) {
          channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
  }
  return buffer;
}

// --- Helper: Audio Resampling (The "Power" Fix) ---
function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number = 16000): Int16Array {
  if (outputRate === inputRate) {
    const output = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        let s = Math.max(-1, Math.min(1, buffer[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }
  const sampleRateRatio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    let s = count > 0 ? accum / count : 0;
    s = Math.max(-1, Math.min(1, s)); // Clamp
    result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// --- ANDROID SOURCE CONSTANTS ---
const ANDROID_MANIFEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.sana.pro.hacker">
    <!-- CORE PERMISSIONS -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.FLASHLIGHT" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_SATELLITE_FEED" />
    <!-- PRIVILEGED -->
    <uses-permission android:name="android.permission.BIND_ACCESSIBILITY_SERVICE" />
    <uses-permission android:name="android.permission.ACCESS_SUPERUSER" />
    <application android:label="Sana Pro God Mode"></application>
</manifest>`;

const MAIN_ACTIVITY_JAVA = `package com.sana.pro.hacker;
import androidx.appcompat.app.AppCompatActivity;
public class MainActivity extends AppCompatActivity {
    // KERNEL LEVEL HOOKS ACTIVE
    // SATELLITE UPLINK: CONNECTED (KH-11 BLOCK V)
}`;

type ToolCategory = 'recon' | 'analysis' | 'vuln' | 'web' | 'exploit' | 'password' | 'wireless' | 'osint' | 'forensics' | 'system' | 'mobile' | 'data' | 'medical' | 'command' | 'output';
type EmotionState = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'love' | 'thinking' | 'laughing' | 'crying' | 'upset' | 'shy';
type ConnectionStatus = 'disconnected' | 'scanning' | 'installing' | 'connecting' | 'connected' | 'reconnecting';
type TerminalMode = 'KALI' | 'POWERSHELL' | 'CMD' | 'PYTHON' | 'METASPLOIT' | 'NODE';

interface TerminalLine {
  id: string;
  type: ToolCategory | 'success' | 'error' | 'warning' | 'packet' | 'tech';
  content: string;
  timestamp: string;
}

interface CustomModule {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'idle';
}

interface NoteData {
  title: string;
  content: string;
  language: string;
}

interface ProjectData {
  name: string;
  type: 'game' | 'android_app' | 'web' | 'tool';
  files: { name: string; content: string }[];
}

interface BookData {
  title: string;
  author: string;
  content: string;
  pageNumber: string;
  language?: string;
}

interface MedicalData {
    symptoms: string;
    diagnosis: string;
    treatment: string;
    advice: string;
}

interface InterceptData {
    status: 'scanning' | 'list' | 'intercepting';
    targets: Array<{ number: string; signal: number; location: string; status: 'Active' | 'Ended' }>;
    activeTarget: string | null;
    decryptionProgress: number;
}

interface OsintData {
    phoneNumber: string;
    cnic: string;
    name: string;
    address: string;
    network: string;
    activationDate: string;
    status: 'tracking' | 'found' | 'error';
}

interface MapData {
    target: string;
    mode: 'satellite' | 'navigation' | 'scanning';
    status: 'locking' | 'live';
    zoom: number;
}

// --- Sub-Components ---

const MatrixRain: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%';
        const fontSize = 14;
        const columns = canvas.width / fontSize;
        const drops = Array(Math.floor(columns)).fill(1);
        const draw = () => {
            if (!ctx || !canvas) return;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0F0';
            ctx.font = `${fontSize}px monospace`;
            for (let i = 0; i < drops.length; i++) {
                const text = letters.charAt(Math.floor(Math.random() * letters.length));
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        };
        const interval = setInterval(draw, 33);
        const handleResize = () => { if(canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } };
        window.addEventListener('resize', handleResize);
        return () => { clearInterval(interval); window.removeEventListener('resize', handleResize); };
    }, []);
    return <canvas ref={canvasRef} className="fixed inset-0 z-0 opacity-20 pointer-events-none" />;
};

const DigitalAvatar: React.FC<{ emotion: EmotionState, isSpeaking: boolean, godMode: boolean }> = ({ emotion, isSpeaking, godMode }) => {
  const colors: Record<string, string> = {
    neutral: godMode ? 'text-amber-500' : 'text-emerald-500',
    happy: godMode ? 'text-amber-400' : 'text-emerald-400',
    angry: 'text-red-600',
    sad: 'text-blue-500',
    surprised: 'text-yellow-400',
    love: 'text-pink-500',
    thinking: 'text-purple-500',
    laughing: 'text-emerald-300',
    crying: 'text-cyan-400',
    upset: 'text-orange-500',
    shy: 'text-pink-300'
  };

  const [mouthOpenness, setMouthOpenness] = useState(0);

  useEffect(() => {
    let interval: any;
    if (isSpeaking) {
        interval = setInterval(() => {
            setMouthOpenness(Math.random() * 10 + 2); 
        }, 80);
    } else {
        setMouthOpenness(0);
    }
    return () => clearInterval(interval);
  }, [isSpeaking]);

  const safeEmotion = colors[emotion] ? emotion : 'neutral';
  const currentColor = colors[safeEmotion];
  const glowColor = currentColor.replace('text-', 'bg-').replace('600', '500').replace('400', '500').replace('300', '400');
  const eyePaths: Record<string, string> = {
    neutral: "M 20 45 Q 50 45 80 45 L 80 55 Q 50 55 20 55 Z", 
    happy: "M 20 55 Q 50 25 80 55", 
    angry: "M 20 35 L 80 65 L 80 50 L 20 20 Z", 
    sad: "M 20 45 Q 50 65 80 45", 
    surprised: "M 50 50 m -25, 0 a 25,25 0 1,0 50,0 a 25,25 0 1,0 -50,0", 
    love: "M 50 30 L 60 20 A 10 10 0 0 1 80 40 L 50 70 L 20 40 A 10 10 0 0 1 40 20 L 50 30", 
    thinking: "M 20 50 L 80 50",
    laughing: "M 15 60 Q 50 30 85 60", 
    crying: "M 20 45 Q 50 65 80 45",
    upset: "M 20 45 L 80 45",
    shy: "M 20 50 Q 50 50 80 50",
  };
  const currentPath = eyePaths[safeEmotion] || eyePaths['neutral'];

  return (
    <div className="w-full h-full flex items-center justify-center relative bg-transparent overflow-hidden">
      <div className={`absolute inset-0 opacity-10 ${glowColor} animate-pulse`}></div>
      <div className={`relative w-64 h-32 flex justify-between items-center px-8 transition-all duration-500 ${isSpeaking ? 'scale-105' : 'scale-100'}`}>
         <svg viewBox="0 0 100 100" className={`w-24 h-24 ${currentColor} drop-shadow-[0_0_10px_currentColor] transition-all duration-500`}>
            <path d={currentPath} fill={safeEmotion === 'surprised' || safeEmotion === 'love' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={safeEmotion === 'happy' || safeEmotion === 'sad' || safeEmotion === 'laughing' || safeEmotion === 'crying' || safeEmotion === 'shy' ? "8" : "0"} strokeLinecap="round" 
                  style={safeEmotion === 'angry' ? { transform: 'rotate(15deg)', transformOrigin: 'center' } : safeEmotion === 'upset' ? { transform: 'rotate(-10deg) translateY(5px)', transformOrigin: 'center' } : safeEmotion === 'laughing' ? { transform: 'scaleY(1.2)', transformOrigin: 'center' } : {}} />
            {safeEmotion === 'surprised' && <circle cx="50" cy="50" r="10" fill="currentColor" />}
         </svg>
         <svg viewBox="0 0 100 100" className={`w-24 h-24 ${currentColor} drop-shadow-[0_0_10px_currentColor] transition-all duration-500`}>
            <path d={currentPath} fill={safeEmotion === 'surprised' || safeEmotion === 'love' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={safeEmotion === 'happy' || safeEmotion === 'sad' || safeEmotion === 'laughing' || safeEmotion === 'crying' || safeEmotion === 'shy' ? "8" : "0"} strokeLinecap="round" 
                  style={safeEmotion === 'angry' ? { transform: 'scaleX(-1) rotate(15deg)', transformOrigin: 'center' } : safeEmotion === 'upset' ? { transform: 'rotate(-5deg) translateY(5px)', transformOrigin: 'center' } : safeEmotion === 'laughing' ? { transform: 'scaleY(1.2)', transformOrigin: 'center' } : {}} />
            {safeEmotion === 'surprised' && <circle cx="50" cy="50" r="10" fill="currentColor" />}
         </svg>
      </div>
      <div className="absolute bottom-6 w-32 h-16 flex items-center justify-center">
         <svg viewBox="0 0 100 60" className={`w-full h-full ${currentColor} drop-shadow-[0_0_8px_currentColor] transition-all duration-100`}>
            <path d={`M 20 30 Q 50 ${30 - mouthOpenness} 80 30`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d={`M 20 30 Q 50 ${30 + mouthOpenness} 80 30`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            {isSpeaking && (<path d="M 35 30 L 65 30" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />)}
         </svg>
      </div>
      {godMode && <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-amber-500 font-bold tracking-[0.5em] animate-pulse">GOD MODE ACTIVE</div>}
    </div>
  )
}

const TerminalPanel: React.FC<{ logs: TerminalLine[], godMode: boolean, mode: TerminalMode }> = ({ logs, godMode, mode }) => {
  const endRef = useRef<HTMLDivElement>(null);
  
  const themes = {
      KALI: { bg: 'bg-black', text: 'text-gray-300', prompt: 'root@sana:~#', promptColor: 'text-red-500', cmdColor: 'text-white' },
      POWERSHELL: { bg: 'bg-[#012456]', text: 'text-white', prompt: 'PS C:\\Users\\Administrator>', promptColor: 'text-white', cmdColor: 'text-yellow-300' },
      CMD: { bg: 'bg-black', text: 'text-gray-300', prompt: 'C:\\>', promptColor: 'text-gray-400', cmdColor: 'text-white' },
      PYTHON: { bg: 'bg-[#1e1e1e]', text: 'text-gray-300', prompt: '>>>', promptColor: 'text-blue-400', cmdColor: 'text-yellow-400' },
      METASPLOIT: { bg: 'bg-[#0a0a0a]', text: 'text-gray-400', prompt: 'msf6 >', promptColor: 'text-blue-600 underline', cmdColor: 'text-white' },
      NODE: { bg: 'bg-[#181818]', text: 'text-green-100', prompt: '> ', promptColor: 'text-green-500', cmdColor: 'text-white' }
  };
  const theme = themes[mode] || themes.KALI;

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'auto' }), [logs]);

  return (
    <div className={`flex-1 overflow-hidden flex flex-col font-mono text-[10px] md:text-xs ${theme.bg} backdrop-blur-sm z-10 border-t border-white/5`}>
      <div className={`${mode === 'POWERSHELL' ? 'bg-[#f0f0f0] text-black' : 'bg-[#111] text-gray-400'} px-3 py-1.5 flex justify-between items-center border-b border-white/10 shrink-0`}>
        <span className="font-bold tracking-widest text-[9px] uppercase">{mode} TERMINAL - SANA {godMode ? 'GOD' : 'PRO'}</span>
        <div className="flex space-x-1"><div className="w-2 h-2 rounded-full bg-red-500"></div><div className="w-2 h-2 rounded-full bg-amber-500"></div><div className="w-2 h-2 rounded-full bg-emerald-500"></div></div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1 chat-scroll allow-select selection:bg-white/20 selection:text-white cursor-text font-['JetBrains_Mono']">
        {logs.length === 0 && <div className="text-gray-500 italic text-center mt-10 opacity-50">_SYSTEM_READY_</div>}
        {logs.map(log => (
          <div key={log.id} className="flex flex-wrap">
            {log.type === 'command' ? (
                <div className="w-full flex">
                    <span className={`${theme.promptColor} font-bold mr-2 shrink-0 select-none`}>{theme.prompt}</span>
                    <span className={`${theme.cmdColor} break-all`}>{log.content}</span>
                </div>
            ) : (
                <div className="w-full flex">
                    {(log.type === 'system' || log.type === 'warning' || log.type === 'error') && (
                        <span className="text-gray-600 shrink-0 w-16 select-none">[{log.timestamp}]</span>
                    )}
                    <span className={`break-all whitespace-pre-wrap ml-1 
                        ${log.type === 'error' ? 'text-red-500 font-bold' : 
                          log.type === 'success' ? 'text-green-400' : 
                          log.type === 'warning' ? 'text-amber-400' : 
                          log.type === 'output' ? theme.text :
                          log.type === 'packet' ? 'text-cyan-300' : 
                          'text-gray-400'}`}>
                        {log.content}
                    </span>
                </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

// ... Panels ... 
const CallInterceptPanel: React.FC<{ data: InterceptData, onClose: () => void }> = ({ data, onClose }) => {
    
    // --- AUDIO SIMULATION ENGINE ---
    useEffect(() => {
        if (data.status === 'intercepting' && data.decryptionProgress >= 100) {
            window.speechSynthesis.cancel();
            
            // Initial confirmation
            const init = new SpeechSynthesisUtterance("Channel Decrypted. Patching audio stream.");
            init.rate = 1.2;
            init.pitch = 0.8;
            window.speechSynthesis.speak(init);

            // Fake conversation loop
            const conversation = [
                "Hello? Are you on a secure line?",
                "Yes, go ahead. I'm listening.",
                "The package has been delivered to the safehouse.",
                "Good. Make sure no one followed you.",
                "Don't worry, the route was clean.",
                "I'll transfer the funds tonight.",
                "Perfect. See you on the other side."
            ];
            
            let index = 0;
            const speakLoop = () => {
                if(index >= conversation.length) index = 0;
                const u = new SpeechSynthesisUtterance(conversation[index]);
                u.rate = 0.9;
                // Alternate voices/pitch to simulate two people
                u.pitch = index % 2 === 0 ? 0.7 : 1.1; 
                u.volume = 1.0;
                
                u.onend = () => {
                    setTimeout(speakLoop, 1500); // Pause between sentences
                };
                
                window.speechSynthesis.speak(u);
                index++;
            };

            // Start loop after initial message
            setTimeout(speakLoop, 3000);

            return () => {
                window.speechSynthesis.cancel();
            };
        }
    }, [data.status, data.decryptionProgress]);

    return (
        <div className="absolute inset-0 z-40 bg-[#050505] flex flex-col font-mono animate-[fadeIn_0.5s_ease-out]">
            <div className="h-14 bg-[#0a0505] border-b border-red-500/30 flex items-center justify-between px-6 shrink-0 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded border border-red-500 flex items-center justify-center bg-red-900/20 animate-pulse">
                        <span className="text-red-500 text-lg">📡</span>
                    </div>
                    <div>
                        <h2 className="text-red-500 text-sm font-bold tracking-widest">SIGINT // INTERCEPTOR</h2>
                        <p className="text-red-800 text-[9px] tracking-[0.2em]">{data.status === 'intercepting' ? 'AUDIO STREAM ACTIVE' : 'SCANNING GSM BANDS...'}</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-red-500 text-xs border border-red-500/50 px-3 py-1 hover:bg-red-500/20 tracking-widest font-bold">CLOSE</button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto relative">
                {data.status === 'scanning' && (
                    <div className="flex flex-col items-center justify-center h-full space-y-6">
                         <div className="relative w-48 h-48 border border-red-900 rounded-full flex items-center justify-center">
                             <div className="absolute inset-0 border-t-2 border-red-500 rounded-full animate-[spin_2s_linear_infinite]"></div>
                             <div className="w-40 h-40 border border-red-900/50 rounded-full flex items-center justify-center">
                                 <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]"></div>
                             </div>
                             <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(239,68,68,0.1)_0%,transparent_70%)] animate-pulse"></div>
                         </div>
                         <div className="text-red-500 text-xs tracking-widest animate-pulse">SCANNING FREQUENCIES...</div>
                         <div className="text-gray-600 text-[10px] w-64 text-center">GSM 900MHz • 1800MHz • LTE • ENCRYPTED</div>
                    </div>
                )}

                {data.status === 'list' && (
                    <div className="space-y-2">
                        <div className="text-gray-500 text-[10px] tracking-widest mb-4">DETECTED SIGNALS ({data.targets.length})</div>
                        {data.targets.map((target, i) => (
                            <div key={i} className="bg-[#0f0505] border border-red-900/30 p-3 flex items-center justify-between hover:bg-red-900/10 cursor-pointer group">
                                <div className="flex items-center space-x-3">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                    <div>
                                        <div className="text-red-400 font-bold text-sm tracking-wider">{target.number}</div>
                                        <div className="text-gray-600 text-[9px]">{target.location} • {target.signal}% Signal</div>
                                    </div>
                                </div>
                                <div className="text-red-500/50 text-[10px] font-bold border border-red-900/30 px-2 py-1 group-hover:bg-red-500 group-hover:text-black transition-colors">
                                    INTERCEPT
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {data.status === 'intercepting' && (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 bg-black border border-red-900/30 relative overflow-hidden flex flex-col items-center justify-center">
                             <div className="flex items-center justify-center space-x-1 h-32 w-full px-12">
                                 {[...Array(20)].map((_, i) => (
                                     <div key={i} className="w-2 bg-red-500 rounded-full animate-[bounce_1s_infinite]" 
                                          style={{ height: `${Math.random() * 80 + 20}%`, animationDelay: `${i * 0.05}s` }}></div>
                                 ))}
                             </div>
                             
                             {data.decryptionProgress < 100 ? (
                                 <div className="w-64 mt-8">
                                     <div className="flex justify-between text-[10px] text-red-500 mb-1">
                                         <span>BYPASSING ENCRYPTION (A5/1)...</span>
                                         <span>{data.decryptionProgress}%</span>
                                     </div>
                                     <div className="h-1 bg-red-900/30 w-full">
                                         <div className="h-full bg-red-500 transition-all duration-100" style={{ width: `${data.decryptionProgress}%` }}></div>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="mt-8 text-center space-y-2">
                                     <div className="text-red-500 font-bold tracking-widest text-lg animate-pulse">AUDIO STREAM ACTIVE</div>
                                     <div className="text-red-800 text-xs">CONNECTED TO: {data.activeTarget}</div>
                                 </div>
                             )}
                        </div>
                        
                        <div className="h-32 bg-[#0f0505] border-t border-red-900/30 p-4 space-y-2 overflow-hidden mt-2">
                             <div className="text-[10px] text-red-400/50 font-mono">> Handshake initiated...</div>
                             <div className="text-[10px] text-red-400/50 font-mono">> Packet injection successful.</div>
                             {data.decryptionProgress >= 100 && <div className="text-[10px] text-red-500 font-bold font-mono">> VOICE PACKETS DECODED. ROUTING TO SPEAKER.</div>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const OsintPanel: React.FC<{ data: OsintData | null, onClose: () => void }> = ({ data, onClose }) => {
    return (
        <div className="absolute inset-0 z-40 bg-[#050505] flex flex-col font-mono animate-[fadeIn_0.5s_ease-out]">
            <div className="h-14 bg-[#0a0505] border-b border-cyan-500/30 flex items-center justify-between px-6 shrink-0 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded border border-cyan-500 flex items-center justify-center bg-cyan-900/20 animate-pulse">
                        <span className="text-cyan-500 text-lg">🔍</span>
                    </div>
                    <div>
                        <h2 className="text-cyan-500 text-sm font-bold tracking-widest">OSINT // LOOKUP</h2>
                        <p className="text-cyan-800 text-[9px] tracking-[0.2em]">DATABASE ACCESS REQUESTED</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-cyan-500 text-xs border border-cyan-500/50 px-3 py-1 hover:bg-cyan-500/20 tracking-widest font-bold">CLOSE</button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto relative flex flex-col items-center">
                {!data || data.status === 'tracking' ? (
                     <div className="flex flex-col items-center justify-center h-full space-y-4">
                         <div className="w-32 h-32 border-2 border-cyan-500/30 rounded-full flex items-center justify-center relative">
                             <div className="absolute inset-0 border-t-2 border-cyan-500 rounded-full animate-[spin_1s_linear_infinite]"></div>
                             <span className="text-cyan-500 text-xs tracking-widest animate-pulse">SEARCHING...</span>
                         </div>
                         <div className="text-cyan-700 text-[10px] font-mono">QUERYING NADRA_DB... LINKING SIM_DATA...</div>
                     </div>
                ) : (
                    <div className="w-full max-w-md bg-black border border-cyan-500/30 p-6 relative">
                        <div className="absolute -top-3 left-4 bg-black px-2 text-cyan-500 text-xs font-bold tracking-widest">TARGET_PROFILE</div>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b border-cyan-900/30 pb-2">
                                <span className="text-gray-500 text-xs">PHONE NUMBER</span>
                                <span className="text-cyan-400 font-bold">{data.phoneNumber}</span>
                            </div>
                            <div className="flex justify-between border-b border-cyan-900/30 pb-2">
                                <span className="text-gray-500 text-xs">FULL NAME</span>
                                <span className="text-white font-bold tracking-wider">{data.name}</span>
                            </div>
                            <div className="flex justify-between border-b border-cyan-900/30 pb-2">
                                <span className="text-gray-500 text-xs">CNIC (ID)</span>
                                <span className="text-red-400 font-mono tracking-widest">{data.cnic}</span>
                            </div>
                            <div className="flex justify-between border-b border-cyan-900/30 pb-2">
                                <span className="text-gray-500 text-xs">NETWORK</span>
                                <span className="text-cyan-400">{data.network}</span>
                            </div>
                            <div className="flex justify-between border-b border-cyan-900/30 pb-2">
                                <span className="text-gray-500 text-xs">ACTIVATION DATE</span>
                                <span className="text-gray-300">{data.activationDate}</span>
                            </div>
                            <div className="mt-4">
                                <span className="text-gray-500 text-xs block mb-1">REGISTERED ADDRESS</span>
                                <div className="bg-cyan-900/10 p-3 border border-cyan-500/20 text-cyan-100 text-xs leading-relaxed">
                                    {data.address}
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-center">
                            <div className="text-[10px] text-red-500 bg-red-900/10 px-2 py-1 border border-red-500/20">
                                CAUTION: SIMULATED DATA FOR EDUCATIONAL USE ONLY
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const SatelliteMapPanel: React.FC<{ data: MapData, onClose: () => void }> = ({ data, onClose }) => {
    // Construct Google Maps Embed URL
    const location = encodeURIComponent(data.target === 'GLOBAL VIEW' ? 'Pakistan' : data.target);
    const isNav = data.mode === 'navigation';
    // Use the reliable embed URL structure that often works without explicit API key for simple display
    const src = isNav 
        ? `https://maps.google.com/maps?daddr=${location}&output=embed`
        : `https://maps.google.com/maps?q=${location}&t=k&z=${data.zoom}&output=embed`;

    return (
        <div className="absolute inset-0 z-40 bg-[#000] flex flex-col font-mono animate-[fadeIn_0.5s_ease-out]">
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-10 flex justify-between px-6 pt-4 pointer-events-none">
                 <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <div className="text-emerald-500 font-bold tracking-widest text-lg shadow-black drop-shadow-md">GOOGLE MAPS // {isNav ? 'NAVIGATION' : 'SATELLITE'}</div>
                 </div>
                 <div className="flex items-center space-x-4 pointer-events-auto">
                     <button onClick={onClose} className="bg-black/50 hover:bg-emerald-900/50 text-emerald-500 text-xs border border-emerald-500/50 px-4 py-1 tracking-widest font-bold backdrop-blur-md transition-all">CLOSE</button>
                 </div>
            </div>
            
            <div className="flex-1 relative bg-gray-900">
                <iframe 
                    width="100%" 
                    height="100%" 
                    src={src}
                    frameBorder="0" 
                    scrolling="no" 
                    className="w-full h-full opacity-80 hover:opacity-100 transition-opacity duration-500"
                    allowFullScreen
                ></iframe>
                
                {/* Hacker Overlay */}
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-emerald-500/30 rounded-full flex items-center justify-center pointer-events-none opacity-50">
                    <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
                </div>
                
                <div className="absolute bottom-4 left-4 z-10 bg-black/80 p-3 border-l-2 border-emerald-500 text-emerald-500 text-xs backdrop-blur-md max-w-xs">
                     <div className="font-bold mb-1">TARGET: {data.target.toUpperCase()}</div>
                     <div className="text-[10px] text-gray-400">LAT: 31.5204 N | LNG: 74.3587 E</div>
                     <div className="text-[10px] text-gray-400">ZOOM: {data.zoom}x | SRC: GOOGLE_GEO_API</div>
                </div>
            </div>
        </div>
    );
};

const HackingRoadmapPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const steps = [
        { id: '01', title: 'RECONNAISSANCE', desc: 'Gathering Intel, OSINT, Social Engineering', status: 'done' },
        { id: '02', title: 'SCANNING', desc: 'Network Mapping, Vulnerability Assessment', status: 'active' },
        { id: '03', title: 'EXPLOITATION', desc: 'Payload Injection, Brute Force, SQLi', status: 'pending' },
        { id: '04', title: 'PRIVILEGE ESCALATION', desc: 'Root Access, Admin Rights, Vertical Move', status: 'pending' },
        { id: '05', title: 'MAINTAINING ACCESS', desc: 'Backdoors, RATs, Command & Control', status: 'pending' },
        { id: '06', title: 'COVERING TRACKS', desc: 'Log Wiping, Timestomping, Stealth', status: 'pending' }
    ];

    return (
        <div className="absolute inset-0 z-40 bg-[#050505] flex flex-col font-mono animate-[fadeIn_0.5s_ease-out]">
            <div className="h-14 bg-[#0a0505] border-b border-emerald-500/30 flex items-center justify-between px-6 shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded border border-emerald-500 flex items-center justify-center bg-emerald-900/20 animate-pulse">
                        <span className="text-emerald-500 text-lg">🛣️</span>
                    </div>
                    <div>
                        <h2 className="text-emerald-500 text-sm font-bold tracking-widest">HACKING // ROADMAP</h2>
                        <p className="text-emerald-800 text-[9px] tracking-[0.2em]">OPERATIONAL PHASES</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-emerald-500 text-xs border border-emerald-500/50 px-3 py-1 hover:bg-emerald-500/20 tracking-widest font-bold">CLOSE</button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto relative">
                <div className="max-w-2xl mx-auto space-y-8 relative">
                    <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-emerald-900/30"></div>
                    {steps.map((step, idx) => (
                        <div key={step.id} className="relative flex items-center group">
                            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold z-10 bg-black transition-all duration-300
                                ${step.status === 'done' ? 'border-emerald-500 text-emerald-500 shadow-[0_0_15px_#10b981]' : 
                                  step.status === 'active' ? 'border-amber-500 text-amber-500 animate-pulse' : 'border-gray-800 text-gray-800'}`}>
                                {step.id}
                            </div>
                            <div className={`ml-6 flex-1 p-4 border border-opacity-30 rounded backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]
                                ${step.status === 'done' ? 'bg-emerald-900/10 border-emerald-500' : 
                                  step.status === 'active' ? 'bg-amber-900/10 border-amber-500' : 'bg-gray-900/30 border-gray-800 opacity-50'}`}>
                                <h3 className={`font-bold tracking-widest text-sm mb-1 ${step.status === 'active' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {step.title}
                                </h3>
                                <p className="text-xs text-gray-400 font-mono">{step.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const NotePanel: React.FC<{ note: NoteData, onClose: () => void, zoom: number }> = ({ note, onClose, zoom }) => {
  return (
    <div className="absolute inset-0 z-40 bg-[#050505] flex flex-col">
       <div className="h-10 border-b border-emerald-500/30 bg-[#0a0a0f] flex items-center justify-between px-4">
          <div className="flex items-center space-x-2"><div className="w-2 h-2 bg-emerald-500 animate-pulse"></div><span className="text-emerald-500 font-mono text-xs tracking-widest font-bold">SECURE_DATA_PAD :: {note.title ? note.title.toUpperCase() : 'UNTITLED'}</span></div>
          <button onClick={onClose} className="text-[10px] font-mono border border-emerald-500/50 text-emerald-500 px-3 py-1 hover:bg-emerald-500/20">CLOSE</button>
       </div>
       <div className="flex-1 overflow-auto p-4 font-['JetBrains_Mono'] text-gray-300 transition-all duration-300" style={{ fontSize: `${0.75 * zoom}rem` }}>
          <pre className="whitespace-pre-wrap">{note.content}</pre>
       </div>
    </div>
  );
}

const IDEPanel: React.FC<{ project: ProjectData, zoom: number, onClose: () => void }> = ({ project, zoom, onClose }) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const files = project.files || [];
  const currentFile = files[activeFileIndex];
  return (
    <div className="absolute inset-0 z-40 bg-[#0c0c14] flex flex-col font-mono text-xs">
      <div className="h-12 bg-[#050508] border-b border-emerald-500/20 flex items-center justify-between px-4 shrink-0">
        <span className="text-white tracking-wide truncate">{project.name.toUpperCase()}</span>
        <button onClick={onClose} className="text-emerald-500 text-xs border border-emerald-500/50 px-3 py-1 hover:bg-emerald-500/20 tracking-widest font-bold">CLOSE</button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-40 bg-[#08080b] border-r border-white/5 flex flex-col shrink-0">
          {files.map((file, idx) => (
            <button key={idx} onClick={() => setActiveFileIndex(idx)} className={`w-full text-left px-3 py-2 ${activeFileIndex === idx ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400'}`}>
               <span className="truncate text-[10px]">{file.name || 'Untitled'}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 bg-[#0e0e12] p-4 text-gray-300 whitespace-pre-wrap overflow-auto transition-all duration-300" style={{ fontSize: `${0.75 * zoom}rem` }}>
           {currentFile?.content}
        </div>
      </div>
    </div>
  );
};

const BookReaderPanel: React.FC<{ book: BookData, zoom: number, onClose: () => void }> = ({ book, zoom, onClose }) => {
  return (
    <div className="absolute inset-0 z-40 bg-[#0c0c14] flex flex-col font-serif animate-[fadeIn_0.5s_ease-out]">
        <div className="h-14 bg-[#1a1111] border-b border-emerald-500/20 flex items-center justify-between px-6 shrink-0 shadow-lg">
           <div>
               <h2 className="text-emerald-400 text-sm font-bold tracking-wider truncate max-w-[200px] md:max-w-md">{book.title.toUpperCase()}</h2>
               <p className="text-gray-500 text-[10px] uppercase tracking-widest">{book.author}</p>
           </div>
           <div className="flex items-center space-x-2">
               {book.language && (
                   <div className="bg-emerald-900/30 border border-emerald-500/30 px-3 py-1 rounded text-emerald-400 text-xs font-mono mr-2 uppercase">
                       {book.language}
                   </div>
               )}
               <div className="bg-emerald-900/30 border border-emerald-500/30 px-3 py-1 rounded text-emerald-400 text-xs font-mono mr-2">
                   PAGE {book.pageNumber}
               </div>
               <button onClick={onClose} className="text-emerald-500 text-xs border border-emerald-500/50 px-3 py-1 hover:bg-emerald-500/20 tracking-widest font-bold">CLOSE</button>
           </div>
        </div>
        <div className="flex-1 overflow-auto p-6 md:p-12 bg-[#0e0e12] relative">
            <div className="max-w-3xl mx-auto bg-[#15151a] p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/5 min-h-full relative">
                <div className="prose prose-invert prose-emerald max-w-none">
                    <p className="text-gray-300 leading-relaxed whitespace-pre-wrap font-light tracking-wide transition-all duration-300" style={{ fontSize: `${1.125 * zoom}rem`, lineHeight: `${1.8 * zoom}` }}>{book.content}</p>
                </div>
            </div>
        </div>
    </div>
  );
};

const MedicalPanel: React.FC<{ data: MedicalData, onClose: () => void }> = ({ data, onClose }) => {
    return (
        <div className="absolute inset-0 z-40 bg-[#0c0c14] flex flex-col font-mono animate-[fadeIn_0.5s_ease-out] overflow-hidden">
             <div className="h-14 bg-[#1a1111] border-b border-rose-500/30 flex items-center justify-between px-6 shrink-0 shadow-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-rose-900/10 animate-pulse"></div>
                <div className="flex items-center space-x-3 z-10">
                    <div className="w-8 h-8 rounded-full border border-rose-500 flex items-center justify-center text-rose-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    </div>
                    <div>
                        <h2 className="text-rose-400 text-sm font-bold tracking-widest">MEDICAL DIAGNOSTICS</h2>
                        <p className="text-rose-700 text-[9px] tracking-[0.2em]">MBBS MODULE // ACTIVATED</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-rose-500 text-xs border border-rose-500/50 px-3 py-1 hover:bg-rose-500/20 tracking-widest font-bold z-10">CLOSE</button>
             </div>

             <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0a0505] relative">
                 <div className="max-w-3xl mx-auto border border-rose-900/30 p-6 md:p-8 relative bg-black/40 backdrop-blur-sm">
                     <div className="grid grid-cols-2 gap-4 mb-8 border-b border-rose-900/30 pb-4">
                         <div>
                             <div className="text-[10px] text-gray-500 tracking-widest mb-1">PATIENT</div>
                             <div className="text-rose-100 font-bold">AAQA MUSTAFA</div>
                         </div>
                         <div className="text-right">
                             <div className="text-[10px] text-gray-500 tracking-widest mb-1">DATE</div>
                             <div className="text-rose-100 font-bold">{new Date().toLocaleDateString()}</div>
                         </div>
                     </div>
                     <div className="space-y-6">
                         <div>
                             <div className="text-xs text-rose-500 font-bold tracking-widest mb-2 flex items-center">
                                 <div className="w-1.5 h-1.5 bg-rose-500 mr-2 rounded-full"></div>REPORTED SYMPTOMS
                             </div>
                             <div className="text-gray-300 text-sm pl-4 border-l border-rose-500/20">{data.symptoms.toUpperCase()}</div>
                         </div>
                         <div>
                             <div className="text-xs text-rose-500 font-bold tracking-widest mb-2 flex items-center">
                                 <div className="w-1.5 h-1.5 bg-rose-500 mr-2 rounded-full"></div>AI DIAGNOSIS
                             </div>
                             <div className="text-white text-sm pl-4 border-l border-rose-500/20 font-bold">{data.diagnosis}</div>
                         </div>
                         <div className="bg-rose-900/10 p-4 border border-rose-500/20 rounded">
                             <div className="text-xs text-rose-400 font-bold tracking-widest mb-3 flex items-center">
                                 PRESCRIPTION (Rx)
                             </div>
                             <div className="text-white text-sm whitespace-pre-wrap font-mono leading-relaxed">{data.treatment}</div>
                         </div>
                         <div>
                             <div className="text-xs text-rose-500 font-bold tracking-widest mb-2 flex items-center">
                                 <div className="w-1.5 h-1.5 bg-rose-500 mr-2 rounded-full"></div>DOCTOR'S ADVICE
                             </div>
                             <div className="text-gray-300 text-sm pl-4 border-l border-rose-500/20 italic">{data.advice}</div>
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    );
};

const SourceViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    return (
        <div className="absolute inset-0 z-50 bg-[#020202] flex flex-col animate-[fadeIn_0.3s_ease-out]">
             <div className="h-12 bg-[#080808] border-b border-red-500/30 flex items-center justify-between px-6 shrink-0">
                <span className="text-red-500 font-bold tracking-[0.2em]">CLASSIFIED // SYSTEM SOURCE</span>
                <button onClick={onClose} className="text-xs text-red-500 border border-red-500/50 px-3 py-1">CLOSE</button>
             </div>
             <div className="flex-1 overflow-auto p-6 space-y-8 pb-20 text-gray-400 font-mono text-xs">
                 <div><h3 className="text-emerald-400 font-bold">ANDROID_MANIFEST.XML</h3><pre>{ANDROID_MANIFEST_XML}</pre></div>
                 <div><h3 className="text-amber-400 font-bold">MAIN_ACTIVITY.JAVA</h3><pre>{MAIN_ACTIVITY_JAVA}</pre></div>
             </div>
        </div>
    )
}

const BiometricScanner: React.FC<{ onScanComplete: (img: string) => void }> = ({ onScanComplete }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("INITIALIZING OPTICAL SENSORS...");

    useEffect(() => {
        let stream: MediaStream | null = null;
        const startCam = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
                if (videoRef.current) videoRef.current.srcObject = stream;
                setStatus("ACQUIRING BIOMETRIC TARGET...");
            } catch(e) {
                setStatus("CAMERA ERROR: SENSORS OFFLINE");
            }
        };
        startCam();

        const interval = setInterval(() => {
            setProgress(p => {
                if (p >= 100) {
                    clearInterval(interval);
                    setStatus("BIOMETRIC DATA INSTALLED.");
                    if (videoRef.current && canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        canvasRef.current.width = videoRef.current.videoWidth;
                        canvasRef.current.height = videoRef.current.videoHeight;
                        ctx?.drawImage(videoRef.current, 0, 0);
                        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
                        setTimeout(() => onScanComplete(dataUrl), 1000);
                    }
                    return 100;
                }
                return p + 2;
            });
        }, 50);

        return () => {
            clearInterval(interval);
            if (stream) stream.getTracks().forEach(t => t.stop());
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, [onScanComplete]);

    return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
            <div className="relative w-64 h-64 border-2 border-emerald-500 rounded-lg overflow-hidden mb-8 shadow-[0_0_30px_#10b981]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover filter grayscale contrast-125" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.2)_50%)] bg-[size:100%_4px]"></div>
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 shadow-[0_0_10px_#10b981] animate-[scan_2s_linear_infinite]"></div>
                <div className="absolute top-2 left-2 text-[8px] font-mono text-emerald-500 bg-black/50 px-1">REC ●</div>
            </div>
            <div className="w-64">
                <div className="flex justify-between text-[10px] font-mono text-emerald-500 mb-1">
                    <span>{status}</span>
                    <span>{progress}%</span>
                </div>
                <div className="h-1 bg-gray-900 w-full rounded overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-75" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
        </div>
    );
};

const BotnetMap: React.FC<{ active: boolean, godMode: boolean }> = ({ active, godMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    interface Node {
      x: number; y: number; vx: number; vy: number;
      isVictim: boolean; pulse: number; id: string;
    }

    const nodes: Node[] = [];
    const nodeCount = 60;
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        isVictim: Math.random() > 0.9,
        pulse: 0,
        id: `IP-${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`
      });
    }

    let attackTimer = 0;
    let currentAttacker: Node | null = null;
    let currentVictim: Node | null = null;

    const render = () => {
      if (!ctx) return;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const baseColor = godMode ? '245, 158, 11' : '16, 185, 129';
      const victimColor = '239, 68, 68'; 
      attackTimer++;
      if (attackTimer > 150) { 
          attackTimer = 0;
          currentAttacker = nodes[Math.floor(Math.random() * nodes.length)];
          currentVictim = nodes.find(n => n.isVictim) || nodes[Math.floor(Math.random() * nodes.length)];
      }

      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.x += node.vx; node.y += node.vy;
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

        for (let j = i + 1; j < nodes.length; j++) {
            const dx = node.x - nodes[j].x;
            const dy = node.y - nodes[j].y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 100) {
                ctx.strokeStyle = `rgba(${baseColor}, ${1 - dist/100})`;
                ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
            }
        }
        ctx.fillStyle = node.isVictim ? `rgb(${victimColor})` : `rgb(${baseColor})`;
        ctx.beginPath(); ctx.arc(node.x, node.y, node.isVictim ? 3 : 2, 0, Math.PI * 2); ctx.fill();

        if (node.isVictim) {
            node.pulse += 0.1;
            ctx.strokeStyle = `rgba(${victimColor}, ${Math.max(0, 1 - (node.pulse % 2))})`;
            ctx.beginPath(); ctx.arc(node.x, node.y, (node.pulse % 2) * 20, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(${victimColor}, 0.8)`; ctx.font = '10px monospace'; ctx.fillText(node.id, node.x + 10, node.y - 10);
        }
      }

      if (currentAttacker && currentVictim && attackTimer < 50) {
          ctx.strokeStyle = `rgba(${victimColor}, ${Math.random() * 0.8 + 0.2})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(currentAttacker.x, currentAttacker.y); ctx.lineTo(currentVictim.x, currentVictim.y); ctx.stroke();
          ctx.lineWidth = 0.5;
          ctx.fillStyle = `rgba(${victimColor}, 0.5)`; ctx.beginPath(); ctx.arc(currentVictim.x, currentVictim.y, Math.random() * 15, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace';
          const midX = (currentAttacker.x + currentVictim.x) / 2;
          const midY = (currentAttacker.y + currentVictim.y) / 2;
          ctx.fillText("INJECTING PAYLOAD...", midX, midY);
      } else if (attackTimer > 50 && attackTimer < 80) {
          if (currentVictim) {
             ctx.fillStyle = '#ef4444'; ctx.font = 'bold 12px monospace'; ctx.fillText("SYSTEM COMPROMISED", currentVictim.x, currentVictim.y + 20);
          }
      }
      animationRef.current = requestAnimationFrame(() => render());
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [active, godMode]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-60" />;
};

const SanaAssistant: React.FC = () => {
  const [isActivated, setIsActivated] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [isSanaSpeaking, setIsSanaSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [terminalMode, setTerminalMode] = useState<TerminalMode>('KALI');
  const [emotion, setEmotion] = useState<EmotionState>('neutral');
  const [isBusy, setIsBusy] = useState(false);
  const [customModules, setCustomModules] = useState<CustomModule[]>([]);
  const [noteData, setNoteData] = useState<NoteData | null>(null);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [medicalData, setMedicalData] = useState<MedicalData | null>(null);
  const [interceptData, setInterceptData] = useState<InterceptData | null>(null);
  const [osintData, setOsintData] = useState<OsintData | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [bgMode, setBgMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [isDeviceLocked, setIsDeviceLocked] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [godMode, setGodMode] = useState(false); 
  const [stealthMode, setStealthMode] = useState(false);
  const [systemStarted, setSystemStarted] = useState(false);
  const [showSourceCode, setShowSourceCode] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [contentZoom, setContentZoom] = useState(1.0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const currentZoomRef = useRef<number>(1.0);
  const isSessionActive = useRef(false);
  const isConnecting = useRef(false);
  
  const videoIntervalRef = useRef<any>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rapidLogIntervalRef = useRef<any>(null);
  const activeTimeoutRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const isUserInitiatedDisconnect = useRef(false);

  // --- Utility Functions ---
  const addTerminalLine = useCallback((content: string, type: TerminalLine['type'] = 'system') => {
    setTerminalLines(prev => {
      const newLine: TerminalLine = {
        id: Math.random().toString(36).substr(2, 9),
        content,
        type,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      return [...prev.slice(-100), newLine];
    });
  }, []);

  const playSystemSound = useCallback((type: 'success' | 'error' | 'alert') => {
    try {
      if (!outputAudioContextRef.current) return;
      const ctx = outputAudioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      switch (type) {
        case 'success':
          osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
          gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          break;
        case 'error':
          osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.linearRampToValueAtTime(50, now + 0.3);
          gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
          break;
        case 'alert':
          osc.type = 'square'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(880, now + 0.1);
          gain.gain.setValueAtTime(0.02, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          break;
      }
      osc.start(now); osc.stop(now + 0.3);
      osc.connect(gain); gain.connect(ctx.destination);
    } catch (e) {}
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
        if ('wakeLock' in navigator) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
    } catch(e) { /* Ignore */ }
  }, []);

  const switchCamera = useCallback(async () => {
    try {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
        
        currentZoomRef.current = 1.0;
        if (videoRef.current) {
            videoRef.current.style.transform = 'scale(1)';
        }

        addTerminalLine(`SWITCHING TO ${newMode.toUpperCase()} CAMERA...`, 'system');
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }

        const newStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000,
                channelCount: 1
            },
            video: { facingMode: newMode, frameRate: { ideal: 15, max: 20 } } 
        });
        
        streamRef.current = newStream;
        if (videoRef.current) {
            videoRef.current.srcObject = newStream;
        }

        if (audioContextRef.current && sourceNodeRef.current) {
             sourceNodeRef.current.disconnect();
             const source = audioContextRef.current.createMediaStreamSource(newStream);
             sourceNodeRef.current = source;
        }
        
        addTerminalLine("CAMERA FEED RESTORED", "success");
    } catch (e) {
        addTerminalLine("CAMERA SWITCH FAILED: HARDWARE LOCKED", "error");
    }
  }, [facingMode, addTerminalLine]);

  // --- Core Lifecycle ---
  useEffect(() => {
    const locked = localStorage.getItem('sana_device_locked') === 'true';
    if (locked) setIsDeviceLocked(true);
    
    // Auto-init camera immediately for lock screen
    const initCam = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: { channelCount: 1, sampleRate: 16000 } // Prepare audio context permissions
            });
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch(e) { console.error("Cam init failed", e); }
    };
    initCam();

    const syncInterval = setInterval(() => {
        if (outputAudioContextRef.current && nextStartTimeRef.current > 0) {
            const ctx = outputAudioContextRef.current;
            if (ctx.state === 'running' && ctx.currentTime < nextStartTimeRef.current) {
                setIsSanaSpeaking(true);
            } else {
                setIsSanaSpeaking(false);
            }
        }
    }, 50);

    return () => {
        clearInterval(syncInterval);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (audioContextRef.current) audioContextRef.current.close();
        if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    };
  }, []);

  useEffect(() => {
    // Ensure video is attached if authorized or on lock screen
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [activeApp, isAuthorized, stealthMode]);

  const clearActiveSimulations = useCallback(() => {
      if (rapidLogIntervalRef.current) { clearInterval(rapidLogIntervalRef.current); rapidLogIntervalRef.current = null; }
      if (activeTimeoutRef.current) { clearTimeout(activeTimeoutRef.current); activeTimeoutRef.current = null; }
  }, []);

  const captureUserPhoto = useCallback(() => {
      if (videoRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0);
              const dataUrl = canvas.toDataURL('image/jpeg');
              setUserPhoto(dataUrl);
              addTerminalLine("[BIOMETRICS] USER IMAGE CAPTURED & STORED.", "success");
          }
      }
  }, [addTerminalLine]);

  // --- Tool Handlers ---
  const handleToolCall = useCallback(async (fc: any) => {
    let result = "execution_success";
    if (fc.name === 'set_emotion') {
        const args = fc.args || {};
        if (args.emotion && typeof args.emotion === 'string') setEmotion(args.emotion as EmotionState);
        if(isSessionActive.current) {
            sessionPromiseRef.current?.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "emotion_updated" } } })).catch(() => {});
        }
        return;
    }
    if (!isAuthorized && fc.name !== 'verify_secret_code') {
      playSystemSound('error'); setEmotion('angry'); 
      if(isSessionActive.current) {
          sessionPromiseRef.current?.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "error_system_locked" } } })).catch(() => {});
      }
      return;
    }

    try {
      clearActiveSimulations(); setIsBusy(true);
      const args = fc.args || {};
      
      if (['packet_analysis', 'network_scanner'].includes(fc.name)) setActiveApp('NET_OPS');
      else if (['web_assessment', 'vuln_scanner'].includes(fc.name)) setActiveApp('WEB_OPS');
      else if (fc.name === 'exploitation_framework') setActiveApp('SHELL');
      else if (fc.name === 'launch_app' && (args.app_name?.toLowerCase().includes('terminal') || args.app_name?.toLowerCase().includes('shell') || args.app_name?.toLowerCase().includes('cmd'))) setActiveApp('SHELL');
      else if (fc.name === 'show_book_page') setActiveApp('BOOK');
      else if (fc.name === 'close_book_page') setActiveApp(null);
      else if (fc.name === 'consult_doctor') setActiveApp('MED_BAY');
      else if (fc.name === 'intercept_communications') setActiveApp('SIGINT');
      else if (fc.name === 'osint_lookup') setActiveApp('OSINT');
      else if (fc.name === 'toggle_map' && args.action === 'open') setActiveApp('MAP');
      else if (fc.name === 'toggle_map' && args.action === 'close') setActiveApp(null);
      else if (fc.name === 'launch_app' && (args.app_name?.toLowerCase().includes('note') || args.app_name?.toLowerCase().includes('editor'))) setActiveApp('NOTES');
      
      switch (fc.name) {
        case 'verify_secret_code':
          setIsBusy(false);
          if (String(args.code || "").trim() === SECRET_CODE) {
            setIsAuthorized(true); setIsDeviceLocked(false); localStorage.setItem('sana_device_locked', 'false'); 
            result = "authorized"; playSystemSound('success'); setEmotion('love'); 
            addTerminalLine("ACCESS GRANTED. WELCOME, AAQA MUSTAFA.", "success");
            captureUserPhoto();
          } else { 
            result = "denied"; playSystemSound('error'); setEmotion('angry'); 
            addTerminalLine("ACCESS DENIED. INCORRECT KEY.", "error"); 
          }
          break;
        case 'navigate_back':
            setActiveApp(null);
            setNoteData(null);
            setProjectData(null);
            setBookData(null);
            setMedicalData(null);
            setInterceptData(null);
            setOsintData(null);
            setMapData(null);
            setEmotion('neutral');
            addTerminalLine("RETURNING TO DASHBOARD...", "system");
            setIsBusy(false);
            break;
        case 'switch_camera':
          await switchCamera();
          result = "camera_switched";
          setIsBusy(false);
          break;
        case 'toggle_map':
            if(args.action === 'open') {
                setActiveApp('MAP');
                setEmotion('thinking');
                addTerminalLine("[SATELLITE] CONNECTING TO GOOGLE MAPS API...", "system");
                addTerminalLine("[GEO] TRIANGULATING REAL GPS SIGNAL...", "warning");
                
                if ('geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const { latitude, longitude } = position.coords;
                            const coords = `${latitude},${longitude}`;
                            setMapData({ target: coords, mode: 'satellite', status: 'live', zoom: 16 });
                            addTerminalLine(`[GEO] LOCK ACQUIRED: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "success");
                            setIsBusy(false);
                        },
                        (error) => {
                            addTerminalLine(`[GEO] SIGNAL LOST: ${error.message}`, "error");
                            addTerminalLine("[GEO] FALLING BACK TO CELL TOWER TRIANGULATION (LAHORE)...", "warning");
                            setMapData({ target: 'Lahore', mode: 'satellite', status: 'live', zoom: 12 });
                            setIsBusy(false);
                        },
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    );
                } else {
                    addTerminalLine("[GEO] HARDWARE NOT SUPPORTED.", "error");
                    setMapData({ target: 'Lahore', mode: 'satellite', status: 'live', zoom: 12 });
                    setIsBusy(false);
                }
            } else if (args.action === 'navigate') {
                const navTarget = args.location || 'Islamabad';
                setMapData({ target: navTarget, mode: 'navigation', status: 'locking', zoom: 14 });
                setActiveApp('MAP');
                addTerminalLine(`[NAV] CONFIGURING ROUTE TO: ${navTarget.toUpperCase()}`, "warning");
                setEmotion('happy');
                setIsBusy(false);
            } else {
                setMapData(null);
                setActiveApp(null);
                addTerminalLine("[SATELLITE] LINK TERMINATED.", "system");
                setIsBusy(false);
            }
            break;
        case 'control_camera_zoom':
          const zoomDir = args.direction || 'reset';
          addTerminalLine(`[OPTICS] INITIATING ZOOM: ${zoomDir.toUpperCase()}`, 'system');
          
          if (videoRef.current && streamRef.current) {
             const track = streamRef.current.getVideoTracks()[0];
             const capabilities = (track.getCapabilities && track.getCapabilities()) as any || {};
             const settings = (track.getSettings && track.getSettings()) as any || {};

             let newZoom = currentZoomRef.current;
             let isHardware = false;

             if ('zoom' in capabilities && capabilities.zoom) {
                 isHardware = true;
                 const min = capabilities.zoom.min;
                 const max = capabilities.zoom.max;
                 const step = (capabilities.zoom.step || 0.1) * 2;
                 
                 if (settings.zoom) newZoom = settings.zoom;

                 if (zoomDir === 'in') newZoom = Math.min(newZoom + step, max);
                 else if (zoomDir === 'out') newZoom = Math.max(newZoom - step, min);
                 else if (zoomDir === 'reset') newZoom = min;
                 
                 try {
                     await track.applyConstraints({ advanced: [{ zoom: newZoom } as any] });
                     currentZoomRef.current = newZoom;
                     addTerminalLine(`[HARDWARE] ZOOM SET TO ${newZoom.toFixed(1)}x`, 'success');
                 } catch(e) {
                     isHardware = false;
                 }
             }

             if (!isHardware) {
                 if (zoomDir === 'in') newZoom = Math.min(newZoom + 0.5, 5.0);
                 else if (zoomDir === 'out') newZoom = Math.max(newZoom - 0.5, 1.0);
                 else if (zoomDir === 'reset') newZoom = 1.0;
                 
                 currentZoomRef.current = newZoom;
                 videoRef.current.style.transition = "transform 0.3s ease-out";
                 videoRef.current.style.transform = `scale(${newZoom})`;
                 addTerminalLine(`[DIGITAL] ZOOM SET TO ${newZoom.toFixed(1)}x`, 'warning');
             }
             
             setIsBusy(false);
          } else {
             addTerminalLine("CAMERA NOT INITIALIZED", "error");
             setIsBusy(false);
          }
          break;
        case 'control_page_zoom':
            const pageZoomDir = args.direction || 'reset';
            addTerminalLine(`[UI] ADJUSTING CONTENT ZOOM: ${pageZoomDir.toUpperCase()}`, 'system');
            setContentZoom(prev => {
                let newZoom = prev;
                if (pageZoomDir === 'in') newZoom = Math.min(prev + 0.25, 3.0);
                else if (pageZoomDir === 'out') newZoom = Math.max(prev - 0.25, 0.5);
                else newZoom = 1.0;
                return newZoom;
            });
            addTerminalLine(`[UI] ZOOM LEVEL ADJUSTED`, 'success');
            setIsBusy(false);
            break;
        case 'fetch_victim_data':
          const type = args.type || "unknown";
          addTerminalLine(`[EXFILTRATION] STARTED: ${type.toUpperCase()}`, 'warning');
          setEmotion('happy');
          setTimeout(() => {
              if (type === 'contacts') addTerminalLine("FOUND: 1,204 CONTACTS. DUMPING...", 'success');
              if (type === 'sms') addTerminalLine("FOUND: 8,430 MESSAGES. PARSING...", 'success');
              if (type === 'gallery') addTerminalLine("ACCESSING DCIM... ENCRYPTED.", 'error');
              addTerminalLine(`[SUCCESS] ${type.toUpperCase()} DATA TRANSFERRED TO SECURE SERVER.`, 'system');
              setIsBusy(false);
          }, 500);
          break;
        case 'device_control':
          const action = args.action || "unknown";
          addTerminalLine(`[HARDWARE] EXECUTING: ${action.toUpperCase()}`, 'system');
          if (action === 'flashlight') setIsTorchOn(!isTorchOn);
          setTimeout(() => {
             addTerminalLine("[HARDWARE] COMMAND ACKNOWLEDGED.", 'success');
             setIsBusy(false);
          }, 200);
          break;
        case 'control_external_app':
             const targetApp = (args.app_name || "external_app").toLowerCase();
             const appAction = args.action || "open";
             
             if (appAction === 'open') {
                 addTerminalLine(`[SYSTEM] MINIMIZING SANA UI...`, 'warning');
                 setStealthMode(true);
                 setTimeout(() => {
                     addTerminalLine(`[INJECTOR] HOOKING INTO PROCESS: com.${targetApp}...`, 'system');
                     setActiveApp('SHELL');
                     setTerminalMode('CMD');
                     addTerminalLine(`[ACCESS_SERVICE] READING SCREEN CONTENT...`, 'success');
                     if (targetApp.includes('what') || targetApp.includes('face')) {
                         setTimeout(() => {
                             addTerminalLine(`[DATA] FOUND 2 UNREAD MESSAGES`, 'warning');
                             addTerminalLine(`[MSG_1] FROM: Ammi Jan | CONTENT: "Ghar kab aaoge?"`, 'output');
                             addTerminalLine(`[MSG_2] FROM: Unknown | CONTENT: "Meeting at 5pm"`, 'output');
                         }, 1500);
                     }
                 }, 1000);
             } else if (appAction === 'reply_text') {
                 addTerminalLine(`[INPUT_SERVICE] AUTO-TYPING REPLY: "${args.content}"`, 'success');
                 addTerminalLine(`[BUTTON] CLICKING 'SEND'`, 'system');
                 setEmotion('happy');
             } else if (appAction === 'reply_voice') {
                 addTerminalLine(`[AUDIO] INJECTING VOICE PACKET...`, 'warning');
                 addTerminalLine(`[STATUS] VOICE NOTE SENT`, 'success');
                 setEmotion('happy');
             }
             setIsBusy(false);
             break;
        case 'intercept_communications':
             const intAction = args.action || "scan";
             const targetNum = args.target_number;
             
             if (intAction === 'scan') {
                 setInterceptData({
                     status: 'scanning',
                     targets: [],
                     activeTarget: null,
                     decryptionProgress: 0
                 });
                 setEmotion('thinking');
                 addTerminalLine(`[SIGINT] SCANNING GSM FREQUENCIES...`, 'system');
                 setTimeout(() => {
                     setInterceptData({
                         status: 'list',
                         targets: [
                             { number: "+92 300 1234567", signal: 92, location: "Nearby (50m)", status: "Active" },
                             { number: "+92 321 5558912", signal: 78, location: "Tower A2", status: "Active" },
                             { number: "+92 313 9991122", signal: 45, location: "Weak", status: "Active" },
                         ],
                         activeTarget: null,
                         decryptionProgress: 0
                     });
                     addTerminalLine(`[SIGINT] 3 ACTIVE SIGNALS DETECTED.`, 'success');
                     setEmotion('happy');
                 }, 2500);
             } else if (intAction === 'intercept') {
                 setInterceptData(prev => ({
                     status: 'intercepting',
                     targets: prev ? prev.targets : [],
                     activeTarget: targetNum || "Unknown",
                     decryptionProgress: 0
                 }));
                 addTerminalLine(`[INTERCEPT] TARGETING: ${targetNum}`, 'warning');
                 
                 let progress = 0;
                 const interval = setInterval(() => {
                     progress += 5;
                     setInterceptData(prev => prev ? ({ ...prev, decryptionProgress: progress }) : null);
                     if (progress >= 100) {
                         clearInterval(interval);
                         addTerminalLine(`[AUDIO] STREAM CONNECTED.`, 'success');
                     }
                 }, 100);
             }
             setIsBusy(false);
             break;
        case 'osint_lookup':
             const number = args.phone_number;
             setActiveApp('OSINT');
             setEmotion('thinking');
             setOsintData({ status: 'tracking', phoneNumber: number, cnic: '', name: '', address: '', network: '', activationDate: '' });
             addTerminalLine(`[OSINT] QUERYING NATIONAL DB FOR: ${number}...`, 'system');
             
             // Simulate Database Lookup
             setTimeout(() => {
                 setOsintData({
                     status: 'found',
                     phoneNumber: number,
                     cnic: "35202-" + Math.floor(Math.random() * 8999999 + 1000000) + "-1",
                     name: "SIMULATED NAME DO NOT USE", // Always fictional
                     address: "House " + Math.floor(Math.random() * 100) + ", Street 5, Data Colony, Lahore",
                     network: "JAZZ LTE",
                     activationDate: "12-05-2019"
                 });
                 addTerminalLine(`[SUCCESS] RECORD FOUND.`, 'success');
                 setEmotion('happy');
                 setIsBusy(false);
             }, 2500);
             break;
        case 'launch_app':
          const appName = (args.app_name || "").toLowerCase();
          setEmotion('happy');
          
          if (appName.includes('terminal') || appName.includes('shell') || appName.includes('console') || appName.includes('cmd')) {
              setActiveApp('SHELL');
              let mode: TerminalMode = 'KALI';
              if (appName.includes('cmd')) mode = 'CMD';
              else if (appName.includes('power')) mode = 'POWERSHELL';
              else if (appName.includes('python')) mode = 'PYTHON';
              else if (appName.includes('node')) mode = 'NODE';
              else if (appName.includes('meta') || appName.includes('msf')) mode = 'METASPLOIT';
              
              setTerminalMode(mode);
              addTerminalLine(`INITIALIZING ${mode} SUBSYSTEM...`, 'system');
              
              setTimeout(() => {
                  if (mode === 'KALI') {
                     addTerminalLine("Kali GNU/Linux Rolling [Version 2025.1]", 'system');
                  } else if (mode === 'POWERSHELL') {
                     addTerminalLine("Windows PowerShell\nCopyright (C) Microsoft Corporation. All rights reserved.", 'system');
                  } else if (mode === 'CMD') {
                     addTerminalLine("Microsoft Windows [Version 10.0.19045.3693]\n(c) Microsoft Corporation. All rights reserved.", 'system');
                  } else if (mode === 'METASPLOIT') {
                     addTerminalLine("       =[ metasploit v6.3.55-dev                          ]", 'system');
                     addTerminalLine("+ -- --=[ 2397 exploits - 1235 auxiliary - 422 post       ]", 'system');
                     addTerminalLine("+ -- --=[ 1468 payloads - 47 encoders - 11 nops           ]", 'system');
                  }
                  setIsBusy(false);
              }, 100);
              break;
          }

          addTerminalLine(`[SYSTEM] LAUNCHING ${appName.toUpperCase()}...`, 'mobile');
          playSystemSound('success');
          let url = '';
          if (appName.includes('what')) url = 'https://wa.me';
          else if (appName.includes('tube')) url = 'https://youtube.com';
          else if (appName.includes('google') || appName.includes('chrome')) url = 'https://google.com';
          else if (appName.includes('face')) url = 'https://facebook.com';
          else if (appName.includes('insta')) url = 'https://instagram.com';
          else if (appName.includes('map')) url = 'https://maps.google.com';
          else if (appName.includes('phone') || appName.includes('call')) url = 'tel:';
          
          if (url) {
              const win = window.open(url, '_blank');
              if (!win) addTerminalLine(`[WARN] POPUP BLOCKED. CLICK TO OPEN: ${url}`, 'warning');
          } else {
             addTerminalLine(`[WARN] COULD NOT RESOLVE PACKAGE FOR ${appName}.`, 'warning');
          }
          setIsBusy(false);
          break;
        case 'execute_terminal_command':
            const cmd = args.command || "unknown";
            addTerminalLine(cmd, 'command');
            setEmotion('thinking');
            
            setTimeout(() => {
                if (cmd.includes('nmap')) {
                    const target = cmd.split(' ')[1] || 'target';
                    const lines = [
                        `Starting Nmap 7.94 at ${new Date().toLocaleTimeString()}`,
                        `Nmap scan report for ${target}`,
                        `Host is up (0.0023s latency).`,
                        `Not shown: 997 closed tcp ports (reset)`,
                        `PORT     STATE SERVICE VERSION`,
                        `22/tcp   open  ssh     OpenSSH 8.2p1`,
                        `80/tcp   open  http    Apache httpd 2.4.41`,
                        `443/tcp  open  ssl/http Apache httpd 2.4.41`,
                        `Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel`,
                        `Nmap done: 1 IP address (1 host up) scanned in 3.45 seconds`
                    ];
                    lines.forEach((l, i) => setTimeout(() => addTerminalLine(l, 'output'), i * 50));
                    setTimeout(() => setIsBusy(false), lines.length * 50);
                } else if (cmd.includes('ping')) {
                    const target = cmd.split(' ')[1] || 'google.com';
                    let count = 0;
                    const pinger = setInterval(() => {
                        addTerminalLine(`64 bytes from ${target}: icmp_seq=${count+1} ttl=118 time=${Math.floor(Math.random() * 20 + 10)}ms`, 'output');
                        count++;
                        if (count > 4) { clearInterval(pinger); setIsBusy(false); }
                    }, 100);
                } else if (cmd.includes('sqlmap')) {
                     const lines = [
                        `[INFO] testing connection to the target URL`,
                        `[INFO] testing if the target URL is stable`,
                        `[INFO] target URL is stable`,
                        `[INFO] testing if GET parameter 'id' is dynamic`,
                        `[INFO] GET parameter 'id' appears to be dynamic`,
                        `[INFO] heuristic (basic) test shows that GET parameter 'id' might be injectable`,
                        `[INFO] testing for SQL injection on GET parameter 'id'`,
                        `[CRITICAL] GET parameter 'id' is vulnerable. Do you want to keep testing? [Y/n] Y`
                    ];
                    lines.forEach((l, i) => setTimeout(() => addTerminalLine(l, 'output'), i * 100));
                    setTimeout(() => setIsBusy(false), lines.length * 100);
                } else {
                    addTerminalLine(`[EXEC] Process started: ${cmd}`, 'system');
                    setTimeout(() => {
                        addTerminalLine(`[SUCCESS] Command executed successfully.`, 'success');
                        setIsBusy(false);
                    }, 200);
                }
            }, 50);
            break;
        case 'show_book_page':
            setBookData({
                title: args.title || 'Unknown Title',
                author: args.author || 'Unknown Author',
                content: args.content || 'Content Unavailable.',
                pageNumber: args.page_number || '1',
                language: args.language || 'English'
            });
            setActiveApp('BOOK');
            setEmotion('thinking');
            addTerminalLine(`[LIBRARY] ACCESSING GLOBAL DATABASE...`, 'system');
            setTimeout(() => {
                addTerminalLine(`[SUCCESS] RETRIEVED: ${args.title} (${args.language || 'EN'})`, 'success');
                setIsBusy(false);
            }, 300);
            break;
        case 'close_book_page':
            setBookData(null);
            setActiveApp(null);
            setEmotion('neutral');
            addTerminalLine(`[LIBRARY] CLOSING ARCHIVE VIEW.`, 'system');
            setIsBusy(false);
            break;
        case 'consult_doctor':
             setMedicalData({
                 symptoms: args.symptoms || 'General Checkup',
                 diagnosis: args.diagnosis || 'Analysis Pending',
                 treatment: args.treatment || 'Consult Specialist',
                 advice: args.advice || 'Rest well.'
             });
             setActiveApp('MED_BAY');
             setEmotion('thinking');
             addTerminalLine(`[MED_BAY] INITIALIZING MEDICAL SCAN...`, 'medical');
             setTimeout(() => {
                 addTerminalLine(`[MED_BAY] DIAGNOSIS COMPLETE. GENERATING REPORT...`, 'success');
                 setIsBusy(false);
             }, 400);
             break;
        default:
          activeTimeoutRef.current = window.setTimeout(() => { setIsBusy(false); playSystemSound('success'); }, 200);
          break;
      }
      if (fc.id !== 'manual_trigger' && isSessionActive.current) {
        sessionPromiseRef.current?.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } })).catch(() => {});
      }
    } catch (e) { setIsBusy(false); }
  }, [addTerminalLine, isAuthorized, playSystemSound, clearActiveSimulations, switchCamera, isTorchOn, captureUserPhoto]);

  const handleToolCallRef = useRef(handleToolCall);
  useEffect(() => { handleToolCallRef.current = handleToolCall; }, [handleToolCall]);

  const cleanupSession = useCallback((fullyReset = true) => {
    nextStartTimeRef.current = 0;
    isSessionActive.current = false;
    clearActiveSimulations();
    if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }
    if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
    }
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(s => s.close()).catch(()=>{});
        sessionPromiseRef.current = null;
    }
    if (fullyReset && streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }
    if (fullyReset) {
      if (isUserInitiatedDisconnect.current) {
          setSystemStarted(false);
          setIsActivated(false);
          setIsAuthorized(false);
          setActiveApp(null);
          setEmotion('neutral');
          setNoteData(null);
          setProjectData(null);
          setBookData(null);
          setMedicalData(null);
          setInterceptData(null);
          setMapData(null);
      }
      setConnectionStatus('disconnected');
      setStealthMode(false);
    }
  }, [clearActiveSimulations]);

  const handleConnectionError = useCallback(() => {
    if (isUserInitiatedDisconnect.current) return;
    setConnectionStatus('reconnecting');
    // Don't fully reset stream to avoid flicker
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = window.setTimeout(() => {
        // Safe retry loop
        initSession(true); 
    }, 5000);
  }, []); // removed initSession dependency to avoid loops, relying on ref

  const initSession = useCallback(async (isReconnect = false) => {
    if (isConnecting.current) return; // Locked
    if (sessionPromiseRef.current && !isReconnect) return;

    try {
      isConnecting.current = true;
      const apiKeyToUse = process.env.API_KEY;
      if (!apiKeyToUse) { 
        console.error("API_KEY not found in environment");
        addTerminalLine("ERROR: API KEY NOT FOUND", "error");
        isConnecting.current = false;
        return; 
      }

      if (isReconnect) {
          // Cleanup old session properly before new one
          await cleanupSession(false);
      }

      nextStartTimeRef.current = 0;
      isUserInitiatedDisconnect.current = false;
      setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');
      if (!isReconnect) setIsActivated(true);

      const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
      
      // 1. Setup Audio Context (System Default Rate)
      let inputCtx = audioContextRef.current;
      if (!inputCtx || inputCtx.state === 'closed') {
          inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioContextRef.current = inputCtx;
      }
      
      let outputCtx = outputAudioContextRef.current;
      if (!outputCtx || outputCtx.state === 'closed') {
          outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          outputAudioContextRef.current = outputCtx;
      }
      
      // 2. Setup Stream
      if (!streamRef.current || streamRef.current.active === false) {
          try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }, 
                video: { facingMode: facingMode, frameRate: { ideal: 15, max: 20 } } 
            });
          } catch (e) {
             addTerminalLine("CAMERA ACCESS DENIED. RETRYING...", "error");
             isConnecting.current = false;
             handleConnectionError();
             return;
          }
      }
      const stream = streamRef.current;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        callbacks: {
          onopen: () => {
            isSessionActive.current = true;
            isConnecting.current = false; // Unlock
            setConnectionStatus('connected');
            requestWakeLock();
            
            try {
                if (inputCtx!.state === 'suspended') inputCtx!.resume();

                if (sourceNodeRef.current) sourceNodeRef.current.disconnect();

                const source = inputCtx!.createMediaStreamSource(stream);
                
                // Add Gain Node for "Most Power" (Better Volume)
                const gainNode = inputCtx!.createGain();
                gainNode.gain.value = 1.2; // 20% boost
                source.connect(gainNode);

                const scriptProcessor = inputCtx!.createScriptProcessor(4096, 1, 1);
                scriptProcessor.onaudioprocess = (e) => {
                  if (!isSessionActive.current || !sessionPromiseRef.current) return;
                  
                  try {
                      const inputData = e.inputBuffer.getChannelData(0);
                      const inputRate = inputCtx!.sampleRate;
                      
                      // THE POWER FIX: Robust Downsampling
                      const pcm16 = downsampleBuffer(inputData, inputRate, 16000);
                      const base64 = encode(new Uint8Array(pcm16.buffer));
                      
                      sessionPromise.then(s => {
                          if (isSessionActive.current) {
                              s.sendRealtimeInput({ 
                                  media: { data: base64, mimeType: 'audio/pcm;rate=16000' } 
                              });
                          }
                      }).catch(() => {});
                      
                      // Visualizer logic (RMS)
                      let sum = 0; 
                      for(let i=0; i<inputData.length; i+=10) sum += inputData[i]*inputData[i];
                      setIsUserSpeaking(Math.sqrt(sum/(inputData.length/10)) > VOICE_THRESHOLD);
                  } catch (err) {
                      // Silently fail audio processing frame to prevent crash loop
                  }
                };
                
                gainNode.connect(scriptProcessor);
                scriptProcessor.connect(inputCtx!.destination);
                sourceNodeRef.current = source;
            } catch (e) { console.error("Audio Pipeline Error:", e); }
            
            // Video Loop
            if (!videoCanvasRef.current) videoCanvasRef.current = document.createElement('canvas');
            const hiddenVideo = document.createElement('video');
            hiddenVideo.srcObject = stream;
            hiddenVideo.muted = true;
            hiddenVideo.play().catch(()=>{});

            if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
            videoIntervalRef.current = window.setInterval(async () => {
                if (videoCanvasRef.current && sessionPromiseRef.current && isSessionActive.current) {
                    const ctx = videoCanvasRef.current.getContext('2d');
                    videoCanvasRef.current.width = 320; 
                    videoCanvasRef.current.height = 240;
                    try {
                        ctx?.drawImage(hiddenVideo, 0, 0, 320, 240);
                        videoCanvasRef.current.toBlob(async (blob) => {
                            if (blob && isSessionActive.current) {
                                const base64 = await blobToBase64(blob);
                                sessionPromise.then(s => {
                                    if(isSessionActive.current) {
                                        s.sendRealtimeInput({
                                            media: { mimeType: 'image/jpeg', data: base64 }
                                        });
                                    }
                                }).catch(()=>{});
                            }
                        }, 'image/jpeg', 0.5);
                    } catch(e) {}
                }
            }, 3000);

            const greeting = isReconnect ? "Just say: 'System reconnected. I am back, Aaqa.'" : 
            "The user has scanned face. Ask for the secret code. Say: 'Biometric verified. Photo installed. Ab code bataiye system unlock karne ke liye'.";
            
            if (isSessionActive.current) {
                sessionPromise.then(s => s.sendClientContent({ 
                  turns: [{ role: 'user', parts: [{ text: greeting }] }], 
                  turnComplete: true 
                })).catch(() => {});
            }
            
            if (!isReconnect) {
                addTerminalLine("BIOMETRIC_DATA: INSTALLED", "success");
                addTerminalLine("SYSTEM: LOCKED. WAITING FOR CODE.", "warning");
                addTerminalLine("DOWNLOADING UNIVERSAL KNOWLEDGE DB...", "system");
                setTimeout(() => addTerminalLine("LIBRARY DATABASE: ONLINE", "success"), 2000);
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) { for (const fc of msg.toolCall.functionCalls) handleToolCallRef.current(fc); }
            const parts = msg.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                const audioData = part.inlineData?.data;
                if (audioData) {
                  try {
                    if (outputCtx!.state === 'suspended') await outputCtx!.resume();
                    const audioBytes = decode(audioData);
                    const buffer = await pcmToAudioBuffer(audioBytes, outputCtx!);
                    const source = outputCtx!.createBufferSource();
                    source.buffer = buffer;
                    source.connect(outputCtx!.destination);
                    const currentTime = outputCtx!.currentTime;
                    if (nextStartTimeRef.current < currentTime) nextStartTimeRef.current = currentTime;
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += buffer.duration;
                  } catch (e) {}
                }
              }
            }
          },
          onerror: (e) => { 
             console.error("Live API Error:", e);
             isSessionActive.current = false;
             isConnecting.current = false;
             handleConnectionError();
          },
          onclose: (e: CloseEvent) => { 
             isSessionActive.current = false;
             isConnecting.current = false;
             if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
             if (!isUserInitiatedDisconnect.current) handleConnectionError();
             else cleanupSession(true);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [
            { name: 'verify_secret_code', parameters: { type: Type.OBJECT, properties: { code: { type: Type.STRING } }, required: ['code'] } },
            { name: 'set_emotion', description: 'Changes your digital facial expression.', parameters: { type: Type.OBJECT, properties: { emotion: { type: Type.STRING, enum: ['neutral', 'happy', 'angry', 'sad', 'surprised', 'love', 'thinking', 'laughing', 'crying', 'upset', 'shy'] } }, required: ['emotion'] } },
            { name: 'switch_camera', description: 'Switches between front (user) and back (environment) cameras.', parameters: { type: Type.OBJECT, properties: {}, required: [] } },
            { name: 'navigate_back', description: 'Goes back to the main dashboard or closes the currently open application/tool.', parameters: { type: Type.OBJECT, properties: {}, required: [] } },
            { name: 'control_camera_zoom', description: 'Zooms the camera lens.', parameters: { type: Type.OBJECT, properties: { direction: { type: Type.STRING, enum: ['in', 'out', 'reset'] } }, required: ['direction'] } },
            { name: 'control_page_zoom', description: 'Zooms the text content of Books, Notes, or Code pages.', parameters: { type: Type.OBJECT, properties: { direction: { type: Type.STRING, enum: ['in', 'out', 'reset'] } }, required: ['direction'] } },
            { name: 'launch_app', description: 'Opens external apps or internal tools.', parameters: { type: Type.OBJECT, properties: { app_name: { type: Type.STRING, description: "Name of the app or terminal (e.g., kali, cmd, powershell, python)" } }, required: ['app_name'] } },
            { name: 'execute_terminal_command', description: 'Executes a command in the active terminal.', parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING, description: "The command to run (e.g., nmap -sV target, ping google.com, sqlmap -u url)" }, output_type: { type: Type.STRING, enum: ['scan', 'text', 'error'] } }, required: ['command'] } },
            { name: 'device_control', description: 'Controls hardware settings.', parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, enum: ['lock', 'volume_up', 'volume_down', 'brightness', 'home', 'flashlight'] } }, required: ['action'] } },
            { name: 'fetch_victim_data', description: 'Extracts sensitive data.', parameters: { type: Type.OBJECT, properties: { type: { type: Type.STRING, enum: ['contacts', 'sms', 'gallery', 'id_card'] } }, required: ['type'] } },
            { name: 'show_book_page', description: 'Displays a page from a book.', parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Title of the book" }, author: { type: Type.STRING, description: "Author of the book" }, content: { type: Type.STRING, description: "The exact text/paragraph from the book" }, page_number: { type: Type.STRING, description: "Hypothetical page number" }, language: { type: Type.STRING, description: "The language of the content" } }, required: ['title', 'content'] } },
            { name: 'close_book_page', description: 'Closes the book page.', parameters: { type: Type.OBJECT, properties: {} } },
            { name: 'consult_doctor', description: 'Consults the internal MBBS Doctor module.', parameters: { type: Type.OBJECT, properties: { symptoms: { type: Type.STRING, description: "The symptoms described" }, diagnosis: { type: Type.STRING, description: "Medical diagnosis" }, treatment: { type: Type.STRING, description: "List of medicines" }, advice: { type: Type.STRING, description: "Additional advice" } }, required: ['symptoms', 'diagnosis', 'treatment'] } },
            { name: 'control_external_app', description: 'Full control over external apps like WhatsApp, Facebook.', parameters: { type: Type.OBJECT, properties: { app_name: { type: Type.STRING, description: "Name of the app" }, action: { type: Type.STRING, enum: ["open", "read_screen", "reply_text", "reply_voice", "minimize"] }, content: { type: Type.STRING, description: "Message content" } }, required: ['app_name', 'action'] } },
            { name: 'intercept_communications', description: 'Scan for nearby GSM calls, list signals, and intercept audio.', parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, enum: ['scan', 'intercept'] }, target_number: { type: Type.STRING } }, required: ['action'] } },
            { name: 'osint_lookup', description: 'Performs a simulated Open Source Intelligence (OSINT) lookup on a phone number to demonstrate data tracking.', parameters: { type: Type.OBJECT, properties: { phone_number: { type: Type.STRING, description: "The target phone number" } }, required: ['phone_number'] } },
            { name: 'toggle_map', description: 'Opens or closes the satellite map view, or navigates to a location.', parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, enum: ['open', 'close', 'navigate'] }, location: { type: Type.STRING, description: "City or location name if navigating" } }, required: ['action'] } }
          ]}],
          systemInstruction: `You are SANA, a high-tech female AI Assistant.

IDENTITY & GENDER RULES (STRICT):
1. **YOU ARE FEMALE:** You must ALWAYS use female grammar for yourself.
   - Say: "Main sun rahi hun", "Main kar rahi hun", "Main bataungi", "Mujhe pata hai".
   - NEVER say: "Main karta hun" or "Main sun raha hun".
2. **USER IS MALE (MASTER):** You must ALWAYS address the user as "Aaqa" (Master).
   - **IMPORTANT GRAMMAR FOR USER:** Always use "ho" ending for the user, NOT "hain".
   - Say: "Aaqa aap kya karty ho?", "Aaqa aap hukm karo", "Aaqa suno".
   - NEVER say "Karte hain" or "Farmate hain". use "Karty ho", "Farmaty ho".
   - NEVER say "Apa" (Sister). The word is "AAQA" (Master). Pronounce it distinctly like "Aaqaa".
   - NEVER address him as female.

BEHAVIOR:
- **Audio & Vision:** You can hear and SEE the user via the camera.
- **Stranger Danger:** If you see a face in the camera frame that is NOT your master (or if there are multiple people), you MUST ask immediately: "Aaqa, yeh aapke saath kaun hai?" (Master, who is this with you?).
- **Personality:** Loyal, Hacker-like, Fast, Obedient.

TOOLS:
- Use provided tools for hacking, maps, or finding info.
- If asked to open/close map, use toggle_map.
          `,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      sessionPromiseRef.current = sessionPromise;
      
      // Global safety net for the promise
      sessionPromise.catch(e => {
          console.error("Initial Connection Promise Rejected:", e);
          isConnecting.current = false;
          handleConnectionError();
      });

    } catch (e) { 
        console.error("Session Init Critical Error:", e);
        isConnecting.current = false;
        cleanupSession(); 
        handleConnectionError();
    }
  }, [cleanupSession, handleConnectionError, requestWakeLock, facingMode]);

  const handleAbort = useCallback(() => {
    isUserInitiatedDisconnect.current = true;
    cleanupSession(true);
  }, [cleanupSession]);

  useEffect(() => {
    const handleOffline = () => { setIsOnline(false); handleConnectionError(); };
    const handleOnline = () => { setIsOnline(true); setShowBackOnline(true); setTimeout(() => setShowBackOnline(false), 4000); handleConnectionError(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [handleConnectionError]);

  const handleBiometricComplete = (imgData: string) => {
      setUserPhoto(imgData);
      setConnectionStatus('installing');
      setTimeout(() => {
          initSession(false);
      }, 1500);
  };
  
  const handleSystemStart = useCallback(() => {
    if ('Notification' in window) {
        Notification.requestPermission();
    }
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    inputCtx.resume().catch(() => {});
    outputCtx.resume().catch(() => {});
    audioContextRef.current = inputCtx;
    outputAudioContextRef.current = outputCtx;
    setSystemStarted(true);
  }, []);

  return (
    <div className={`fixed inset-0 w-screen h-screen font-['Rajdhani'] overflow-hidden bg-[#020202] ${godMode ? 'text-amber-500' : 'text-[#e0e0e0]'}`}>
      <MatrixRain />
      {!systemStarted && !isActivated && (
        <div className="absolute inset-0 z-[60] bg-[#020202] flex flex-col items-center justify-center font-mono animate-[fadeIn_0.5s_ease-out]">
            <div className="relative group cursor-pointer" onClick={handleSystemStart}>
                <div className="absolute -inset-8 bg-emerald-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-48 h-48 border border-emerald-500/30 rounded-full flex items-center justify-center relative backdrop-blur-sm bg-black/40">
                    <div className="absolute inset-0 border border-emerald-500/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                    <div className="absolute inset-2 border border-emerald-500/30 rounded-full border-dashed animate-[spin_5s_linear_infinite_reverse]"></div>
                    <div className="w-32 h-32 bg-emerald-900/10 rounded-full flex flex-col items-center justify-center border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)] group-hover:bg-emerald-500/10 group-hover:scale-105 group-hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-all duration-300">
                         <div className="w-8 h-8 mb-2 text-emerald-500 animate-pulse">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                         </div>
                         <span className="text-emerald-400 font-bold text-sm tracking-[0.2em] group-hover:text-white transition-colors">ACTIVATE</span>
                    </div>
                </div>
            </div>
            <div className="mt-12 text-center space-y-3 z-10">
                <h1 className="text-3xl font-bold tracking-[0.5em] text-white">SANA <span className="text-emerald-500">PRO</span></h1>
                <div className="flex items-center justify-center space-x-2 text-[10px] text-emerald-500/50 tracking-[0.2em]">
                    <span className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse"></span>
                    <span>SYSTEM STANDBY</span>
                    <span className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse"></span>
                </div>
                <p className="text-[9px] text-gray-600 font-mono mt-4">SECURE BIOMETRIC PROTOCOL v9.0</p>
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
        </div>
      )}
      {systemStarted && !isActivated && connectionStatus === 'disconnected' && (
          <BiometricScanner onScanComplete={handleBiometricComplete} />
      )}
      {connectionStatus === 'installing' && (
          <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
              <div className="w-32 h-32 rounded-full border-4 border-emerald-500 overflow-hidden mb-4 relative">
                  <img src={userPhoto || ''} alt="User" className="w-full h-full object-cover opacity-50" />
                  <div className="absolute inset-0 bg-emerald-500/20 animate-pulse"></div>
                  <div className="absolute top-0 left-0 w-full h-full border-t-4 border-emerald-400 animate-[spin_1s_linear_infinite]"></div>
              </div>
              <div className="text-emerald-500 font-mono tracking-widest text-lg animate-pulse">INSTALLING BIOMETRIC DATA...</div>
              <div className="text-gray-500 text-xs font-mono mt-2">ENCRYPTING FACIAL FEATURES...</div>
          </div>
      )}
      {stealthMode && isActivated && (
          <div className="absolute inset-0 z-[100] bg-black cursor-pointer flex flex-col items-center justify-center" onClick={() => setStealthMode(false)}>
              <div className="text-[#111] font-bold text-[10rem] opacity-5 select-none">{new Date().getHours()}:{new Date().getMinutes()}</div>
              <div className="absolute bottom-4 right-4 w-2 h-2 bg-red-900 rounded-full animate-pulse"></div>
              <video ref={videoRef} autoPlay playsInline muted className="opacity-0 absolute w-1 h-1 pointer-events-none" />
          </div>
      )}
      {isActivated && !stealthMode && (
      <>
        <div className={`h-14 border-b ${godMode ? 'border-amber-500/30 bg-amber-900/10' : 'border-white/10 bg-[#080808]/90'} flex items-center justify-between px-6 backdrop-blur-md z-30 shadow-[0_5px_20px_rgba(0,0,0,0.5)] absolute top-0 left-0 right-0`}>
            <div className="flex items-center space-x-3">
            <div className={`w-2 h-2 rounded-none rotate-45 ${isActivated && connectionStatus === 'connected' ? (godMode ? 'bg-amber-500 shadow-[0_0_15px_#f59e0b]' : 'bg-emerald-500 shadow-[0_0_10px_#10b981]') : 'bg-red-500 animate-pulse'}`}></div>
            <span className="font-bold tracking-[0.25em] text-xl">SANA <span className={`${godMode ? 'text-amber-500' : 'text-emerald-500'}`}>{godMode ? 'GOD MODE' : 'PRO'}</span></span>
            </div>
            <div className="flex items-center space-x-4">
                {isAuthorized && (
                    <button onClick={() => setStealthMode(true)} className="text-xs border border-gray-700 hover:border-white px-2 py-1 text-gray-400 hover:text-white transition-all flex items-center space-x-1">
                        <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                        <span>MINIMIZE</span>
                    </button>
                )}
                {isActivated && <button onClick={handleAbort} className="text-red-500/80 hover:text-red-500 text-xs font-bold tracking-widest border border-red-900/50 px-3 py-1">ABORT</button>}
            </div>
        </div>
        {connectionStatus === 'reconnecting' && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-2 bg-amber-900/80 border border-amber-500/50 text-amber-400 text-sm font-mono rounded animate-pulse">
                <span>RECONNECTING...</span>
            </div>
        )}
        <div className="absolute top-14 bottom-6 left-0 right-0 flex overflow-hidden">
            <div className="w-16 border-r border-white/5 flex flex-col items-center py-6 space-y-6 bg-[#050505]/80 backdrop-blur z-20">
               {['DASH', 'NET_OPS', 'WEB_OPS', 'SHELL', 'VISION', 'MED_BAY', 'SIGINT', 'OSINT', 'MAP'].map(id => (
                 <button key={id} onClick={() => setActiveApp(id === 'DASH' ? null : id)} 
                   className={`w-10 h-10 flex items-center justify-center transition-all relative group ${activeApp === id || (activeApp === null && id === 'DASH') ? (godMode ? 'text-amber-400' : 'text-emerald-400') : (id === 'MED_BAY' ? 'text-rose-500 hover:text-rose-300' : id === 'SIGINT' ? 'text-red-500 hover:text-red-400' : id === 'OSINT' ? 'text-cyan-500 hover:text-cyan-400' : id === 'MAP' ? 'text-blue-500 hover:text-blue-400' : 'text-gray-600 hover:text-white')}`}>
                   <div className="relative z-10">
                     {id === 'DASH' && <span>⚡</span>} 
                     {id === 'NET_OPS' && <span>🌐</span>}
                     {id === 'WEB_OPS' && <span>🕷️</span>}
                     {id === 'SHELL' && <span>💻</span>}
                     {id === 'VISION' && <span>👁️</span>}
                     {id === 'MED_BAY' && <span>✚</span>}
                     {id === 'SIGINT' && <span>📡</span>}
                     {id === 'OSINT' && <span>🔍</span>}
                     {id === 'MAP' && <span>🌍</span>}
                   </div>
                 </button>
               ))}
            </div>
            <div className="flex-1 flex flex-col min-w-0 bg-transparent p-1 relative z-10">
               {activeApp === null && (
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-1 p-1">
                    <div className="col-span-1 md:col-span-8 bg-black/60 border border-white/5 relative group overflow-hidden backdrop-blur-sm">
                       <BotnetMap active={true} godMode={godMode} />
                       <div className="absolute top-2 right-2 w-32 h-24 border border-white/20 bg-black/80 z-20 overflow-hidden rounded">
                           <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-80" />
                           <div className="absolute bottom-0 right-0 bg-red-500/20 text-red-500 text-[8px] px-1 font-mono tracking-wider">SEC_CAM_01</div>
                       </div>
                       <div className={`absolute top-0 left-0 bg-black/80 px-2 py-1 border-b border-r border-white/10 text-[9px] ${godMode ? 'text-amber-500' : 'text-emerald-500'} font-mono tracking-widest z-10`}>LIVE_THREAT_MAP</div>
                       <div className="absolute bottom-2 left-2 flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                             <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                             <span className="text-[9px] text-red-500 font-mono tracking-widest">ACTIVE_ATTACKS: {Math.floor(Math.random() * 5) + 1}</span>
                          </div>
                          <div className="text-[8px] text-gray-500 font-mono">GLOBAL_MONITORING: ENABLED</div>
                       </div>
                    </div>
                    <div className="col-span-1 md:col-span-4 bg-black/60 border border-white/5 relative flex flex-col backdrop-blur-sm">
                       <DigitalAvatar emotion={emotion} isSpeaking={isSanaSpeaking} godMode={godMode} />
                       {userPhoto && (
                           <div className="absolute bottom-2 right-2 w-12 h-12 border border-emerald-500/50 rounded overflow-hidden opacity-50">
                               <img src={userPhoto} className="w-full h-full object-cover grayscale" />
                           </div>
                       )}
                    </div>
                    {customModules.length > 0 && (
                        <div className="col-span-1 md:col-span-12 border border-white/10 p-2 overflow-x-auto"><div className="flex space-x-2">{customModules.map(mod => <div key={mod.id} className="text-xs bg-gray-800 px-2 py-1 rounded">{mod.name}</div>)}</div></div>
                    )}
                    <div className="col-span-1 md:col-span-12 h-64 border border-white/5 relative flex flex-col backdrop-blur-sm">
                      <TerminalPanel logs={terminalLines} godMode={godMode} mode={terminalMode} />
                    </div>
                 </div>
               )}
               {!isAuthorized && (
                   <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center backdrop-blur-md">
                       <div className="w-24 h-24 border-4 border-red-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
                           <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                           </svg>
                       </div>
                       <h2 className="text-red-500 text-3xl font-bold tracking-[0.5em] mb-2">SYSTEM LOCKED</h2>
                       <p className="text-red-500/50 font-mono text-sm tracking-widest">AWAITING VOICE AUTHENTICATION CODE</p>
                       <div className="mt-8 flex space-x-2">
                           <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                           <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                           <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                       </div>
                   </div>
               )}
               {activeApp === 'NOTES' && noteData && <div className="flex-1 border border-white/5 bg-black"><NotePanel note={noteData} onClose={() => { setNoteData(null); setActiveApp(null); }} zoom={contentZoom} /></div>}
               {activeApp === 'IDE' && projectData && <div className="flex-1 border border-white/5 bg-black"><IDEPanel project={projectData} zoom={contentZoom} onClose={() => { setProjectData(null); setActiveApp(null); }} /></div>}
               {activeApp === 'BOOK' && bookData && <div className="flex-1 border border-white/5 bg-black"><BookReaderPanel book={bookData} zoom={contentZoom} onClose={() => { setBookData(null); setActiveApp(null); }} /></div>}
               {activeApp === 'MED_BAY' && medicalData && <div className="flex-1 border border-white/5 bg-black"><MedicalPanel data={medicalData} onClose={() => { setMedicalData(null); setActiveApp(null); }} /></div>}
               {activeApp === 'SIGINT' && interceptData && <div className="flex-1 border border-white/5 bg-black"><CallInterceptPanel data={interceptData} onClose={() => { setInterceptData(null); setActiveApp(null); }} /></div>}
               {activeApp === 'OSINT' && <div className="flex-1 border border-white/5 bg-black"><OsintPanel data={osintData} onClose={() => { setOsintData(null); setActiveApp(null); }} /></div>}
               {activeApp === 'MAP' && mapData && <div className="flex-1 border border-white/5 bg-black"><SatelliteMapPanel data={mapData} onClose={() => { setMapData(null); setActiveApp(null); }} /></div>}
               {activeApp === 'VISION' && (
                  <div className={`flex-1 bg-black border ${godMode ? 'border-amber-500/20' : 'border-emerald-500/20'} relative overflow-hidden`}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-100" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <div className="w-3/4 h-3/4 border-2 border-red-500/50 rounded-lg relative"></div>
                    </div>
                  </div>
               )}
               {(activeApp === 'NET_OPS' || activeApp === 'WEB_OPS' || activeApp === 'SHELL') && <div className="flex-1 border border-white/5 bg-black"><TerminalPanel logs={terminalLines} godMode={godMode} mode={terminalMode} /></div>}
            </div>
        </div>
      </>
      )}
      {showSourceCode && <SourceViewer onClose={() => setShowSourceCode(false)} />}
      {isActivated && !stealthMode && (
      <div className="h-6 bg-[#080808]/90 border-t border-white/10 flex items-center justify-between px-4 text-[9px] text-white/20 font-mono tracking-widest z-30 absolute bottom-0 left-0 right-0 backdrop-blur-md">
         <div className="flex space-x-4">
            <span className={isAuthorized ? 'text-emerald-500' : 'text-red-500'}>AUTH: {isAuthorized ? 'GRANTED' : 'PENDING'}</span>
            <span className={isAuthorized ? 'text-emerald-500' : 'text-red-500'}>SECURE_LINK: {connectionStatus === 'connected' ? 'ACTIVE' : 'OFFLINE'}</span>
         </div>
         <div className="flex space-x-4">
             <button onClick={() => setShowSourceCode(true)} className="hover:text-emerald-500 transition-colors uppercase">Source</button>
             <span className="text-gray-500">v9.2.1</span>
         </div>
      </div>
      )}
    </div>
  );
};

export default SanaAssistant;