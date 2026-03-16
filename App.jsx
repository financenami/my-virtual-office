import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, query, serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';

// --- Firebase 配置 ---
// 這裡已經換成你剛才申請到的專屬鑰匙了
const firebaseConfig = {
  apiKey: "AIzaSyDVFc2J-5PAo-cgHUVSaNpYXHCPkiQX930",
  authDomain: "my-virtual-office-bcf46.firebaseapp.com",
  projectId: "my-virtual-office-bcf46",
  storageBucket: "my-virtual-office-bcf46.firebasestorage.app",
  messagingSenderId: "202208413014",
  appId: "1:202208413014:web:97e320ba1cdac4702982f7",
  measurementId: "G-8DZQW8P1TL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'shizuka-office-v1'; // 這是你的辦公室編號

// --- 常數定義 ---
const MAP_SIZE = { width: 1200, height: 800 };
const GRID_SIZE = 20; 

const ICONS = [
  { id: 'nobita', name: '大雄', color: '#ffeb3b', hair: '#452c22' },
  { id: 'shizuka', name: '靜香', color: '#f48fb1', hair: '#452c22' },
  { id: 'punk', name: '龐克頭', color: '#9c27b0', hair: '#ff5722' },
  { id: 'poop', name: '大便', color: '#795548', hair: '#795548' },
  { id: 'cat', name: '阿貓', color: '#cfd8dc', hair: '#455a64' },
  { id: 'dog', name: '阿狗', color: '#ffcc80', hair: '#5d4037' },
  { id: 'doraemon', name: '多拉A夢', color: '#03a9f4', hair: '#ffffff' },
  { id: 'gian', name: '胖虎', color: '#ff9800', hair: '#212121' },
  { id: 'suneo', name: '小夫', color: '#4caf50', hair: '#212121' },
];

const ZONES = [
  { id: 'work', name: '專注辦公區', x: 4, y: 4, w: 22, h: 28, color: '#ebf4ff', accent: '#a5b4fc' },
  { id: 'meeting', name: '討論會議室', x: 30, y: 4, w: 26, h: 16, color: '#f5f3ff', accent: '#c4b5fd' },
  { id: 'rest', name: '耍廢休息區', x: 30, y: 24, w: 18, h: 12, color: '#fff7ed', accent: '#fdba74' },
  { id: 'toilet', name: '廁所', x: 50, y: 24, w: 6, h: 12, color: '#fff1f2', accent: '#fda4af' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [allUsers, setAllUsers] = useState({});
  const [status, setStatus] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('nobita');
  const [isOnline, setIsOnline] = useState(false);
  
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMode, setTimerMode] = useState('work');
  
  const canvasRef = useRef(null);
  const requestRef = useRef();
  const currentPos = useRef({ x: 200, y: 200 });
  const targetPos = useRef({ x: 200, y: 200 });
  
  const lastInteraction = useRef(Date.now());
  const idleMoveTimer = useRef(null);

  const playDingDong = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playNote = (freq, startTime, duration) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      playNote(880, audioCtx.currentTime, 0.5);
      playNote(660, audioCtx.currentTime + 0.3, 0.8);
    } catch (e) {
      console.error("音效播放失敗", e);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = {};
      snapshot.forEach((doc) => {
        usersData[doc.id] = doc.data();
      });
      setAllUsers(usersData);
    }, (error) => console.error("Firestore 錯誤:", error));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    let timer = null;
    if (timerRunning && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerRunning(false);
      playDingDong(); 
    }
    return () => clearInterval(timer);
  }, [timerRunning, timeLeft]);

  useEffect(() => {
    if (!isOnline) return;

    const checkIdle = () => {
      const now = Date.now();
      const dist = Math.hypot(targetPos.current.x - currentPos.current.x, targetPos.current.y - currentPos.current.y);
      if (now - lastInteraction.current > 5000 && dist < 5) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 50;
        const nextX = Math.max(20, Math.min(MAP_SIZE.width - 20, currentPos.current.x + Math.cos(angle) * radius));
        const nextY = Math.max(20, Math.min(MAP_SIZE.height - 20, currentPos.current.y + Math.sin(angle) * radius));
        
        targetPos.current = { x: nextX, y: nextY };
        syncPosition(nextX, nextY, status);
      }
    };

    idleMoveTimer.current = setInterval(checkIdle, 2000);
    return () => clearInterval(idleMoveTimer.current);
  }, [isOnline, status]);

  const resetTimer = (mode) => {
    setTimerMode(mode);
    setTimerRunning(false);
    setTimeLeft(mode === 'work' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const syncPosition = async (x, y, newStatus = status, online = isOnline, name = displayName, icon = selectedIcon) => {
    if (!user) return;
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      x, y,
      status: newStatus,
      isOnline: online,
      lastSeen: serverTimestamp(),
      displayName: name || `夥伴 ${user.uid.slice(0, 4)}`,
      iconId: icon
    }, { merge: true });
  };

  const handleCanvasClick = (e) => {
    if (!isOnline) return;
    lastInteraction.current = Date.now(); 
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    targetPos.current = { x, y };
    syncPosition(x, y, status);
  };

  const drawPixelDesk = (ctx, x, y) => {
    ctx.fillStyle = '#b78b6d';
    ctx.fillRect(x, y, 60, 40);
    ctx.fillStyle = '#a17a5d';
    ctx.fillRect(x, y + 36, 60, 4);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x + 15, y + 5, 30, 20);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x + 17, y + 7, 26, 16);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 15, y + 30, 30, 4);
  };

  const drawPixelChair = (ctx, x, y, direction = 'up') => {
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x, y, 20, 20);
    ctx.fillStyle = '#64748b';
    if (direction === 'up') ctx.fillRect(x, y, 20, 6);
    if (direction === 'down') ctx.fillRect(x, y + 14, 20, 6);
    if (direction === 'left') ctx.fillRect(x, y, 6, 20);
    if (direction === 'right') ctx.fillRect(x + 14, y, 6, 20);
  };

  const drawPixelSofa = (ctx, x, y, size = 'small') => {
    ctx.fillStyle = '#d4a373'; 
    if (size === 'small') {
      ctx.fillRect(x, y, 40, 40);
      ctx.fillStyle = '#bc8a5f';
      ctx.fillRect(x, y + 32, 40, 8);
      ctx.fillRect(x, y, 8, 32);
      ctx.fillRect(x + 32, y, 8, 32);
    } else {
      ctx.fillRect(x, y, 100, 40);
      ctx.fillStyle = '#bc8a5f';
      ctx.fillRect(x, y + 32, 100, 8);
      ctx.fillRect(x, y, 10, 32);
      ctx.fillRect(x + 90, y, 10, 32);
    }
  };

  const drawPixelGameStation = (ctx, x, y) => {
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(x, y, 80, 20);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 10, y - 40, 60, 40);
    
    ctx.fillStyle = '#e50914';
    ctx.fillRect(x + 22, y - 34, 6, 28);
    ctx.fillRect(x + 52, y - 34, 6, 28);
    ctx.fillRect(x + 28, y - 30, 6, 8);
    ctx.fillRect(x + 34, y - 24, 6, 8);
    ctx.fillRect(x + 40, y - 18, 6, 8);
    ctx.fillRect(x + 46, y - 12, 6, 8);

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(x + 20, y - 5, 15, 5);
  };

  const drawPixelToilet = (ctx, x, y) => {
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - 2, y - 2, 24, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 20, 10);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x + 14, y + 2, 4, 2);
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(x, y + 10, 20, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(x + 4, y + 13, 12, 8);
  };

  const drawPixelPlant = (ctx, x, y, seed = 0) => {
    const type = seed % 3;
    ctx.fillStyle = '#a17a5d';
    ctx.fillRect(x + 5, y + 25, 20, 15); 
    
    ctx.fillStyle = '#6b7f64';
    if (type === 0) {
      ctx.fillRect(x + 12, y + 5, 6, 20);
      ctx.fillRect(x + 4, y + 10, 22, 6);
    } else if (type === 1) {
      ctx.fillRect(x, y + 15, 30, 10);
      ctx.fillRect(x + 5, y + 5, 20, 10);
    } else {
      ctx.fillRect(x + 10, y + 10, 10, 15);
      ctx.fillRect(x + 4, y + 12, 6, 6);
      ctx.fillRect(x + 20, y + 12, 6, 6);
    }
  };

  const drawPixelAvatar = (ctx, x, y, isMe, name, iconId) => {
    const icon = ICONS.find(i => i.id === iconId) || ICONS[0];
    const bodyColor = icon.color;
    const hairColor = icon.hair;
    const faceColor = iconId === 'doraemon' ? '#ffffff' : '#ffdbac';

    // 陰影
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(x - 12, y + 14, 24, 6);

    // 身體
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x - 14, y - 4, 28, 18);
    
    // 臉
    ctx.fillStyle = faceColor;
    ctx.fillRect(x - 10, y - 18, 20, 16);
    
    // 特殊角色造型處理
    if (iconId === 'doraemon') {
        ctx.fillStyle = '#03a9f4';
        ctx.fillRect(x - 12, y - 22, 24, 10);
        ctx.fillStyle = '#f44336';
        ctx.fillRect(x - 2, y - 13, 4, 4);
    } else if (iconId === 'shizuka') {
        ctx.fillStyle = hairColor;
        ctx.fillRect(x - 12, y - 24, 24, 10);
        ctx.fillRect(x - 14, y - 14, 6, 6);
        ctx.fillRect(x - 16, y - 8, 6, 6);
        ctx.fillRect(x - 14, y - 2, 6, 6);
        ctx.fillRect(x + 8, y - 14, 6, 6);
        ctx.fillRect(x + 10, y - 8, 6, 6);
        ctx.fillRect(x + 8, y - 2, 6, 6);
    } else if (iconId === 'cat') {
        // 阿貓：尖耳朵
        ctx.fillStyle = hairColor;
        ctx.fillRect(x - 12, y - 26, 6, 8); // 左耳
        ctx.fillRect(x + 6, y - 26, 6, 8);  // 右耳
        ctx.fillRect(x - 12, y - 22, 24, 8); // 頭頂
    } else if (iconId === 'dog') {
        // 阿狗：垂耳/寬耳
        ctx.fillStyle = hairColor;
        ctx.fillRect(x - 14, y - 24, 8, 8); // 左耳
        ctx.fillRect(x + 6, y - 24, 8, 8);  // 右耳
        ctx.fillRect(x - 12, y - 22, 24, 8); // 頭頂
    } else if (iconId === 'poop') {
        // 大便：旋轉螺旋造型
        ctx.fillStyle = hairColor;
        ctx.fillRect(x - 12, y - 22, 24, 6); // 第一層（底）
        ctx.fillRect(x - 8, y - 28, 16, 6);  // 第二層
        ctx.fillRect(x - 4, y - 34, 8, 6);   // 第三層（頂）
    } else {
        ctx.fillStyle = hairColor;
        ctx.fillRect(x - 12, y - 22, 24, 8);
    }

    // 眼睛
    ctx.fillStyle = '#000';
    if (iconId === 'nobita') {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 8, y - 14, 6, 6);
        ctx.strokeRect(x + 2, y - 14, 6, 6);
    } else {
        ctx.fillRect(x - 4, y - 10, 1.5, 1.5);
        ctx.fillRect(x + 2, y - 10, 1.5, 1.5);
    }

    ctx.fillStyle = isMe ? '#6366f1' : '#475569';
    ctx.font = 'bold 15px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, y + 32);
  };

  const drawPixelBubble = (ctx, x, y, text) => {
    ctx.font = '15px "Courier New", Courier, monospace';
    const metrics = ctx.measureText(text);
    const w = Math.max(metrics.width + 20, 50);
    const h = 34; 
    const bx = x - w / 2;
    const by = y - 70;
    
    ctx.fillStyle = '#475569';
    ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx, by, w, h);
    
    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 5, by + h, 10, 5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 3, by + h, 6, 3);
    
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, by + 22);
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.08;
    currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.08;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let j = 0; j < canvas.height; j += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke();
    }

    ZONES.forEach(zone => {
      const zx = zone.x * GRID_SIZE;
      const zy = zone.y * GRID_SIZE;
      const zw = zone.w * GRID_SIZE;
      const zh = zone.h * GRID_SIZE;
      ctx.fillStyle = zone.color;
      ctx.fillRect(zx, zy, zw, zh);
      ctx.strokeStyle = zone.accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(zx, zy, zw, zh);
      
      ctx.fillStyle = zone.accent;
      ctx.fillRect(zx, zy - 12, zw, 24);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px "Courier New", Courier, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(zone.name, zx + 10, zy + 4);

      if (zone.id === 'work') {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 4; j++) {
            drawPixelDesk(ctx, zx + 40 + i * 140, zy + 60 + j * 120);
          }
        }
        drawPixelPlant(ctx, zx + 20, zy + 20, 1);
        drawPixelPlant(ctx, zx + zw - 50, zy + 20, 2);
        drawPixelPlant(ctx, zx + 20, zy + zh - 60, 0);
        drawPixelPlant(ctx, zx + zw - 50, zy + zh - 60, 1);
      } else if (zone.id === 'meeting') {
        ctx.fillStyle = '#b78b6d';
        ctx.fillRect(zx + 80, zy + 100, zw - 160, 60);
        for (let i = 0; i < 6; i++) {
            drawPixelChair(ctx, zx + 100 + i * 60, zy + 75, 'down');
            drawPixelChair(ctx, zx + 100 + i * 60, zy + 165, 'up');
        }
        drawPixelPlant(ctx, zx + 20, zy + 20, 0);
        drawPixelPlant(ctx, zx + zw - 50, zy + 20, 1);
        drawPixelPlant(ctx, zx + 20, zy + zh - 60, 2);
      } else if (zone.id === 'rest') {
        drawPixelSofa(ctx, zx + 30, zy + zh - 80, 'large');
        drawPixelSofa(ctx, zx + zw - 130, zy + zh - 80, 'large');
        drawPixelGameStation(ctx, zx + zw/2 - 40, zy + 60);
        drawPixelPlant(ctx, zx + 20, zy + 20, 2);
        drawPixelPlant(ctx, zx + zw - 50, zy + 20, 0);
        drawPixelPlant(ctx, zx + zw/2 - 15, zy + zh - 60, 1);
      } else if (zone.id === 'toilet') {
        drawPixelToilet(ctx, zx + 20, zy + 40);
        drawPixelToilet(ctx, zx + 20, zy + 140);
        drawPixelPlant(ctx, zx + 10, zy + zh - 50, 0);
      }
    });

    Object.values(allUsers).forEach(u => {
      if (!u.isOnline) return;
      const isMe = u.uid === user?.uid;
      const x = isMe ? currentPos.current.x : u.x;
      const y = isMe ? currentPos.current.y : u.y;
      drawPixelAvatar(ctx, x, y, isMe, u.displayName, u.iconId);
      if (u.status && u.status.trim() !== '') {
        drawPixelBubble(ctx, x, y, u.status);
      }
    });
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [allUsers]);

  const toggleAttendance = () => {
    if (!displayName.trim()) return;
    lastInteraction.current = Date.now();
    const newState = !isOnline;
    setIsOnline(newState);
    syncPosition(currentPos.current.x, currentPos.current.y, status, newState, displayName, selectedIcon);
  };

  const handleStatusKeyDown = (e) => {
    if (e.key === 'Enter') {
      lastInteraction.current = Date.now();
      syncPosition(currentPos.current.x, currentPos.current.y, status);
      e.target.blur();
    }
  };

  return (
    <div className="flex h-screen bg-[#1e1b4b] overflow-hidden font-mono text-white">
      <div className="w-80 bg-[#1e1b4b] border-r-4 border-black p-6 flex flex-col gap-6">
        <div className="border-b-4 border-black pb-4">
          <h1 className="text-xl font-black tracking-tight text-indigo-300 italic">靜香團_雲端辦公室</h1>
          <p className="text-[15px] text-indigo-500 uppercase">系統狀態：正常運行中</p>
        </div>
        <div className="space-y-6">
          <div className="bg-[#312e81] p-4 border-2 border-[#4338ca]">
            <div className="text-[15px] text-indigo-400 mb-1">登入身分：</div>
            <div className="text-indigo-200 font-bold text-[18px]">{isOnline ? displayName : '尚未登入'}</div>
          </div>
          <button onClick={toggleAttendance} className={`w-full py-4 font-black border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all text-[18px] ${isOnline ? 'bg-rose-500' : 'bg-indigo-500 hover:bg-indigo-600'}`}>{isOnline ? '離開辦公室' : '進入辦公室'}</button>
          
          <div className="bg-black border-4 border-indigo-900 p-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[15px] text-indigo-400 font-bold tracking-widest">工作計時器</span>
              <div className="flex gap-1">
                <button onClick={() => resetTimer('work')} className={`text-[15px] px-2 py-1 ${timerMode === 'work' ? 'bg-indigo-600' : 'bg-neutral-800'}`}>專注</button>
                <button onClick={() => resetTimer('break')} className={`text-[15px] px-2 py-1 ${timerMode === 'break' ? 'bg-emerald-600' : 'bg-neutral-800'}`}>休息</button>
              </div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-black mb-4 text-white font-mono">{formatTime(timeLeft)}</div>
              <button onClick={() => setTimerRunning(!timerRunning)} className="w-full py-2 bg-indigo-950 border-2 border-indigo-800 text-[15px] font-bold">{timerRunning ? '暫停計時' : '啟動計時'}</button>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[15px] text-indigo-500 uppercase font-bold">當前任務廣播</label>
            <input 
              type="text" 
              placeholder="我正在處理..." 
              className="w-full px-4 py-2 bg-black border-2 border-indigo-900 focus:border-indigo-500 outline-none text-[15px] text-indigo-200" 
              value={status} 
              onChange={(e) => setStatus(e.target.value)} 
              onBlur={() => syncPosition(currentPos.current.x, currentPos.current.y)}
              onKeyDown={handleStatusKeyDown}
            />
            <p className="text-[11px] text-indigo-400 italic">💡 輸入後按下 Enter 立即廣播</p>
          </div>
        </div>
        
        <div className="mt-auto pt-4 border-t-4 border-black">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[15px] text-indigo-600 font-bold uppercase tracking-tighter">附近夥伴</h3>
            <div className="text-[15px] text-indigo-400">{Object.values(allUsers).filter(u => u.isOnline).length} 在線</div>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {Object.values(allUsers).map(u => u.isOnline && (
              <div key={u.uid} className="flex items-center justify-between p-2 bg-[#312e81] border-2 border-black text-[15px]">
                <span className="text-indigo-300">{u.displayName}</span>
                <span className={`w-2 h-2 ${u.uid === user?.uid ? 'bg-indigo-400' : 'bg-indigo-900'}`}></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 relative bg-[#111827] flex items-center justify-center p-8 overflow-auto">
        {!isOnline && (
          <div className="absolute inset-0 z-20 bg-black/90 flex items-center justify-center p-4">
            <div className="max-w-xl w-full border-8 border-white bg-[#4338ca] p-10 text-white shadow-[16px_16px_0px_0px_rgba(255,255,255,0.1)]">
              <div className="mb-8 border-b-4 border-white pb-4 text-center">
                <h2 className="text-4xl font-black tracking-tighter uppercase italic text-indigo-100">系統初始化...</h2>
                <p className="text-[18px] mt-2 opacity-70 tracking-widest uppercase text-indigo-200">歡迎登入伺服器</p>
              </div>
              <div className="space-y-6 mb-10">
                <div className="space-y-2">
                  <label className="text-[15px] font-bold uppercase tracking-widest text-indigo-200">請輸入你的稱呼</label>
                  <input type="text" placeholder="例如：大雄" className="w-full px-6 py-4 bg-black border-4 border-white text-2xl font-black placeholder:opacity-30 outline-none focus:bg-white focus:text-[#4338ca] transition-all" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-4">
                  <label className="text-[15px] font-bold uppercase tracking-widest text-indigo-200">選擇你的頭像</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ICONS.map(icon => (
                      <button key={icon.id} onClick={() => setSelectedIcon(icon.id)} className={`p-3 border-2 transition-all flex flex-col items-center gap-2 ${selectedIcon === icon.id ? 'bg-white text-[#4338ca] border-black scale-105' : 'bg-[#312e81] border-indigo-400 hover:border-white'}`}>
                        <div className="w-8 h-8" style={{backgroundColor: icon.color}}></div>
                        <span className="text-[15px] font-bold">{icon.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={toggleAttendance} className={`w-full py-5 font-black text-3xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.4)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all uppercase ${displayName.trim() ? 'bg-white text-[#4338ca]' : 'bg-neutral-600 text-neutral-400 cursor-not-allowed'}`}>連線進入辦公室</button>
            </div>
          </div>
        )}
        <div className="inline-block relative border-[16px] border-[#1e1b4b] shadow-[0_0_120px_rgba(0,0,0,1)]">
          <canvas ref={canvasRef} width={MAP_SIZE.width} height={MAP_SIZE.height} onClick={handleCanvasClick} className={`cursor-crosshair transition-all duration-1000 ${isOnline ? 'opacity-100' : 'opacity-10 blur-2xl scale-110'}`} />
        </div>
      </div>
    </div>
  );
}
