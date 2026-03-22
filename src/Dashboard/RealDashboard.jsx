// src/Dashboard/RealDashboard.jsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Users, ShieldCheck, TrendingDown, Activity, Receipt, Banknote, TrendingUp, Scale, LayoutGrid, Settings, Save, X, Plus, Minus, Info, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { getDatabase, ref, onValue } from 'firebase/database';

// ── ICONS ─────────────────────────────────────────────────────
const ChickenIcon = ({ size = 12, inverted = false }) => (
  <img src="./chicken.png" alt="Chicken" style={{ width: size, height: size, objectFit: 'contain', filter: inverted ? 'invert(1)' : 'none' }} />
);
const FeedIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 9 L18 9 L20 20 L4 20 Z" opacity="0.8"/><path d="M9 9 Q12 4 15 9" stroke="currentColor" fill="none"/></svg>
);
const WaterIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 C12 2.5 6 9 6 14 A6 6 0 0 0 18 14 C18 9 12 2.5 12 2.5 Z" /></svg>
);
const VitaminIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20.5 19 12a4.95 4.95 0 1 0-7-7L3.5 13.5a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>
);

// ── PERSISTENT STATE HOOK ─────────────────────────────────────
// Reads from localStorage on mount, writes on every change.
// This makes ALL config survive page refreshes and tab switches.
function usePersistentState(lsKey, defaultValue) {
  const [state, _setState] = useState(() => {
    try {
      const saved = localStorage.getItem(lsKey);
      if (saved !== null) {
        // Deep-merge: keep all default keys, override with saved values
        const parsed = JSON.parse(saved);
        if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
          return { ...defaultValue, ...parsed };
        }
        return parsed;
      }
    } catch { /* corrupt storage – fall through to default */ }
    return defaultValue;
  });

  const setState = (valueOrUpdater) => {
    _setState(prev => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
      try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* quota full */ }
      return next;
    });
  };

  return [state, setState];
}

// ── METRIC CARD ───────────────────────────────────────────────
const MetricCard = ({ title, value, unit, icon: Icon, colorClass, bgClass }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-2.5 h-[72px] flex flex-col justify-between hover:border-gray-300 transition-colors">
    <div className="flex justify-between items-start">
      <span className={`p-1.5 rounded-md ${bgClass} ${colorClass}`}><Icon size={12} /></span>
      <span className="text-[7.5px] font-black text-gray-400 uppercase tracking-tighter text-right leading-none w-2/3">{title}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <h3 className={`text-base font-black leading-none ${colorClass}`}>
        {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value || '0'}
      </h3>
      <span className="text-[7px] font-bold text-gray-300 uppercase">{unit}</span>
    </div>
  </div>
);

// ── HELPER: derive batch day number from a log entry ──────────
const getDayNumber = (log, batchStartStr) => {
  if (log.day !== undefined && log.day !== null) {
    const d = parseInt(log.day);
    if (!isNaN(d) && d >= 1 && d <= 30) return d;
  }
  const batchStart = batchStartStr ? new Date(batchStartStr) : null;
  if (!batchStart) return null;
  batchStart.setHours(0, 0, 0, 0);
  if (log.date) {
    const logDate = new Date(log.date);
    if (!isNaN(logDate)) {
      logDate.setHours(0, 0, 0, 0);
      const diff = Math.round((logDate - batchStart) / 86400000) + 1;
      if (diff >= 1 && diff <= 30) return diff;
    }
  }
  if (log.timestamp) {
    const logDate = new Date(typeof log.timestamp === 'number' ? log.timestamp : parseInt(log.timestamp));
    if (!isNaN(logDate)) {
      logDate.setHours(0, 0, 0, 0);
      const diff = Math.round((logDate - batchStart) / 86400000) + 1;
      if (diff >= 1 && diff <= 30) return diff;
    }
  }
  if (log.createdAt) {
    const logDate = new Date(log.createdAt);
    if (!isNaN(logDate)) {
      logDate.setHours(0, 0, 0, 0);
      const diff = Math.round((logDate - batchStart) / 86400000) + 1;
      if (diff >= 1 && diff <= 30) return diff;
    }
  }
  return null;
};

// ── LINE CHART (BATCH PERFORMANCE) ───────────────────────────
const DailyLineChart = ({ dailyData, currentBatchDay }) => {
  const [hoverDay, setHoverDay] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const W = 900, H = 230;
  const PAD = { top: 20, right: 20, bottom: 40, left: 56 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  const LINES = [
    { key: 'feed',     label: 'Feed',     unit: 'kg', stroke: '#f97316', areafill: 'rgba(249,115,22,0.10)' },
    { key: 'vitamins', label: 'Vitamins', unit: 'g',  stroke: '#10b981', areafill: 'rgba(16,185,129,0.10)' },
    { key: 'water',    label: 'Water',    unit: 'L',  stroke: '#38bdf8', areafill: 'rgba(56,189,248,0.10)' },
  ];

  const allVals = days.flatMap(d => LINES.map(l => (dailyData[d] || {})[l.key] || 0));
  const maxVal = Math.max(...allVals, 1);

  const xPos = (day) => PAD.left + ((day - 1) / 29) * chartW;
  const yPos = (val) => PAD.top + chartH - (val / maxVal) * chartH;

  const makePath = (key) =>
    days.map((d, i) => {
      const val = (dailyData[d] || {})[key] || 0;
      return `${i === 0 ? 'M' : 'L'}${xPos(d).toFixed(1)},${yPos(val).toFixed(1)}`;
    }).join(' ');

  const makeArea = (key) => {
    const pts = days.map(d => {
      const val = (dailyData[d] || {})[key] || 0;
      return `${xPos(d).toFixed(1)},${yPos(val).toFixed(1)}`;
    }).join(' L');
    const base = yPos(0).toFixed(1);
    return `M${xPos(1).toFixed(1)},${base} L${pts} L${xPos(30).toFixed(1)},${base} Z`;
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: maxVal * f, y: yPos(maxVal * f) }));
  const todayDay = Math.min(currentBatchDay, 30);
  const hasAnyData = Object.keys(dailyData).length > 0;

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const rawDay = ((mouseX - PAD.left) / chartW) * 29 + 1;
    setHoverDay(Math.min(30, Math.max(1, Math.round(rawDay))));
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const hoverData = hoverDay ? (dailyData[hoverDay] || {}) : null;

  return (
    <div className="w-full overflow-x-auto">
      {!hasAnyData ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-300">
          <Activity size={28} className="mb-2" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">No approved log data yet</p>
        </div>
      ) : (
        <div className="relative w-full">
          {hoverDay && (
            <div className="absolute z-50 pointer-events-none bg-[#1a1a1a] text-white rounded-xl shadow-2xl px-3 py-2.5 border border-white/10"
              style={{ left: tooltipPos.x > 220 ? tooltipPos.x - 145 : tooltipPos.x + 14, top: Math.max(4, tooltipPos.y - 70), minWidth: 135 }}>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b border-white/10 pb-1.5">📅 Day {hoverDay}</div>
              {LINES.map(l => (
                <div key={l.key} className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.stroke }} />
                    <span className="text-[9px] text-gray-300 font-bold">{l.label}</span>
                  </div>
                  <span className="text-[10px] font-black" style={{ color: l.stroke }}>
                    {((hoverData || {})[l.key] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {l.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ minWidth: 480 }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverDay(null)}>
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#f3f4f6" strokeWidth="1.2" />
                <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af" fontWeight="700">
                  {t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : t.val.toFixed(t.val > 0 && t.val < 10 ? 1 : 0)}
                </text>
              </g>
            ))}
            {LINES.map(l => <path key={`area-${l.key}`} d={makeArea(l.key)} fill={l.areafill} />)}
            {LINES.map(l => <path key={`line-${l.key}`} d={makePath(l.key)} fill="none" stroke={l.stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />)}
            {hoverDay && <line x1={xPos(hoverDay)} y1={PAD.top} x2={xPos(hoverDay)} y2={PAD.top + chartH} stroke="#374151" strokeWidth="1" strokeDasharray="3,2" opacity="0.45" />}
            {LINES.map(l =>
              days.filter(d => (dailyData[d] || {})[l.key] > 0).map(d => (
                <circle key={`dot-${l.key}-${d}`} cx={xPos(d)} cy={yPos(dailyData[d][l.key])}
                  r={hoverDay === d ? 5.5 : 3.5} fill={l.stroke} stroke="white" strokeWidth="1.5" />
              ))
            )}
            {[1, 5, 10, 15, 20, 25, 30].map(d => (
              <text key={d} x={xPos(d)} y={H - 8} textAnchor="middle" fontSize="9"
                fill={hoverDay === d ? '#374151' : '#9ca3af'} fontWeight={hoverDay === d ? '900' : '700'}>Day {d}</text>
            ))}
            <line x1={xPos(todayDay)} y1={PAD.top} x2={xPos(todayDay)} y2={PAD.top + chartH} stroke="#8B1A1A" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.6" />
            <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="#e5e7eb" strokeWidth="1" />
          </svg>
          <div className="flex items-center gap-4 mt-1 px-2 justify-end flex-wrap">
            {LINES.map(l => (
              <div key={l.key} className="flex items-center gap-1.5">
                <div className="w-5 h-[2.5px] rounded-full" style={{ background: l.stroke }} />
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{l.label} ({l.unit})</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#8B1A1A" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Today</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── HELPER: CALCULATE BATCH DAY ───────────────────────────────
const calculateDaysStrict = (startDateStr) => {
  if (!startDateStr) return 1;
  const [y, mo, d] = startDateStr.split('-').map(Number);
  const start = new Date(y, mo - 1, d, 12, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);
};

// ── FEED FORECAST LOGIC ───────────────────────────────────────
const BAG_KG = 50;

const FEED_LOGIC_TABLE = [
  { days: [1],           gpb: 30,  type: 'Booster'  },
  { days: [2, 3],        gpb: 35,  type: 'Booster'  },
  { days: [4, 5, 6],     gpb: 40,  type: 'Booster'  },
  { days: [7,8,9,10],    gpb: 45,  type: 'Booster'  },
  { days: [11,12],       gpb: 50,  type: 'Booster'  },
  { days: [13],          gpb: 50,  type: 'Starter'  },
  { days: [14,15,16],    gpb: 60,  type: 'Starter'  },
  { days: [17,18,19],    gpb: 70,  type: 'Starter'  },
  { days: [20,21],       gpb: 75,  type: 'Starter'  },
  { days: [22,23],       gpb: 80,  type: 'Starter'  },
  { days: [24],          gpb: 100, type: 'Finisher' },
  { days: [25],          gpb: 120, type: 'Finisher' },
  { days: [26],          gpb: 130, type: 'Finisher' },
  { days: [27],          gpb: 150, type: 'Finisher' },
  { days: [28],          gpb: 160, type: 'Finisher' },
  { days: [29, 30],      gpb: 170, type: 'Finisher' },
];

function computeFeedForecast(population, kgPerBag = BAG_KG) {
  const result = [];
  for (let day = 1; day <= 30; day++) {
    const entry = FEED_LOGIC_TABLE.find(e => e.days.includes(day));
    if (entry) {
      const targetKilos = parseFloat(((entry.gpb * population) / 1000).toFixed(2));
      const targetBags  = parseFloat((targetKilos / kgPerBag).toFixed(3));
      result.push({
        day,
        feedType: entry.type,
        gramsPerBird: entry.gpb,
        targetKilos,
        targetBags,
        kgPerBag,
      });
    }
  }
  return result;
}

const FEED_COLORS = { Booster: '#22c55e', Starter: '#3b82f6', Finisher: '#f59e0b' };
const FEED_BG     = { Booster: 'bg-green-50',  Starter: 'bg-blue-50',   Finisher: 'bg-amber-50'  };
const FEED_TEXT   = { Booster: 'text-green-700', Starter: 'text-blue-700', Finisher: 'text-amber-700' };
const FEED_BORDER = { Booster: 'border-green-200', Starter: 'border-blue-200', Finisher: 'border-amber-200' };

// ── VITAMIN MANAGEMENT TAB ────────────────────────────────────
const VitaminManagementTab = ({ activeBatch, dailyData, currentBatchDay }) => {
  const [hoverDay, setHoverDay] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const purchasedVitamins = useMemo(() => {
    const agg = {};
    Object.values(activeBatch?.expenses || {}).forEach(exp => {
      if (exp.category === 'Vitamins' && exp.itemName) {
        const name = exp.itemName.trim();
        const qty = parseFloat(exp.quantity || 0) * parseFloat(exp.purchaseCount || 1);
        agg[name] = (agg[name] || 0) + qty;
      }
    });
    return agg;
  }, [activeBatch]);

  const { consumedVitamins, totalWaterConsumed, logsList } = useMemo(() => {
    const consumed = {};
    let water = 0;
    const logs = [];

    Object.entries(activeBatch?.vitamin_logs || {}).forEach(([penKey, penLogs]) => {
      Object.values(penLogs || {}).forEach(log => {
        if (log.status === 'approved') {
          const name = log.vitaminName ? log.vitaminName.trim() : 'Unknown';
          const val = parseFloat(log.am || 0) + parseFloat(log.pm || 0);
          const waterVal = parseFloat(log.water_am || 0) + parseFloat(log.water_pm || 0);
          
          consumed[name] = (consumed[name] || 0) + val;
          water += waterVal;

          logs.push({
            ...log,
            pen: penKey,
            totalAmt: val,
            totalWater: waterVal,
            dayNum: getDayNumber(log, activeBatch?.dateCreated)
          });
        }
      });
    });

    logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return { consumedVitamins: consumed, totalWaterConsumed: water, logsList: logs };
  }, [activeBatch]);

  const allVitaminNames = useMemo(() => {
    const keys = new Set([...Object.keys(purchasedVitamins), ...Object.keys(consumedVitamins)]);
    return Array.from(keys).filter(k => k !== 'Unknown');
  }, [purchasedVitamins, consumedVitamins]);

  const W = 900, H = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 56 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  const vitVals = days.map(d => (dailyData[d] || {}).vitamins || 0);
  const waterVals = days.map(d => (dailyData[d] || {}).water || 0);
  
  const maxVit = Math.max(...vitVals, 1);
  const maxWater = Math.max(...waterVals, 1);
  
  const xPos = (day) => PAD.left + ((day - 1) / 29) * chartW;
  const yPosVit = (val) => PAD.top + chartH - (val / maxVit) * chartH;
  const yPosWater = (val) => PAD.top + chartH - (val / maxWater) * chartH;

  const vitPath = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(d).toFixed(1)},${yPosVit(vitVals[i]).toFixed(1)}`).join(' ');
  const waterPath = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(d).toFixed(1)},${yPosWater(waterVals[i]).toFixed(1)}`).join(' ');
  
  const todayDay = Math.min(currentBatchDay, 30);

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const rawDay = ((mouseX - PAD.left) / chartW) * 29 + 1;
    setHoverDay(Math.min(30, Math.max(1, Math.round(rawDay))));
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const totalPurchasedQty = Object.values(purchasedVitamins).reduce((a,b)=>a+b, 0);
  const totalConsumedQty = Object.values(consumedVitamins).reduce((a,b)=>a+b, 0);

  const gridColsClass = 
    allVitaminNames.length === 1 ? 'grid-cols-1' :
    allVitaminNames.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    allVitaminNames.length === 3 ? 'grid-cols-1 sm:grid-cols-3' :
    'grid-cols-1 sm:grid-cols-2 md:grid-cols-4';

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-emerald-50 text-emerald-600 rounded"><VitaminIcon size={12} /></div>
          <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Vitamin & Water Management</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard title="Total Purchased" value={totalPurchasedQty} unit="g/ml" icon={Package} colorClass="text-emerald-600" bgClass="bg-emerald-50" />
        <MetricCard title="Total Consumed" value={totalConsumedQty} unit="g/ml" icon={Activity} colorClass="text-indigo-600" bgClass="bg-indigo-50" />
        <MetricCard title="Total Water" value={totalWaterConsumed} unit="Liters" icon={WaterIcon} colorClass="text-sky-500" bgClass="bg-sky-50" />
        <MetricCard title="Active Vitamins" value={allVitaminNames.length} unit="Types" icon={VitaminIcon} colorClass="text-violet-600" bgClass="bg-violet-50" />
      </div>

      <div className={`grid gap-3 ${gridColsClass}`}>
        {allVitaminNames.length === 0 && (
           <div className="col-span-full bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
             <VitaminIcon size={24} className="mx-auto mb-2 opacity-50" />
             <p className="text-[10px] font-bold uppercase tracking-widest">No Vitamin Data Logged</p>
           </div>
        )}
        {allVitaminNames.map(vitName => {
          const pur = purchasedVitamins[vitName] || 0;
          const used = consumedVitamins[vitName] || 0;
          const remaining = Math.max(0, pur - used);
          
          let status = 'good';
          let pct = 0;
          
          if (pur > 0) {
            pct = Math.min(100, (remaining / pur) * 100);
            if (pct < 15) status = 'critical';
            else if (pct < 30) status = 'warning';
          } else if (used > 0 && pur === 0) {
            status = 'critical';
          }

          const statusConfig = {
            critical: { bg: 'bg-red-50',   border: 'border-red-200',   icon: AlertTriangle, iconColor: 'text-red-600',    ringColor: '#ef4444', label: 'Low/Empty' },
            warning:  { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600',  ringColor: '#f59e0b', label: 'Low Stock' },
            good:     { bg: 'bg-white',    border: 'border-gray-100',  icon: CheckCircle,   iconColor: 'text-emerald-600',ringColor: '#10b981', label: 'OK'        },
          }[status];
          const StatusIcon = statusConfig.icon;

          return (
            <div key={vitName} className={`rounded-xl border shadow-sm p-4 flex flex-col justify-between ${statusConfig.bg} ${statusConfig.border}`}>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 truncate max-w-[120px]">
                      {vitName}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusIcon size={11} className={statusConfig.iconColor} />
                    <span className={`text-[8px] font-black uppercase ${statusConfig.iconColor}`}>{statusConfig.label}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="22" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                      <circle cx="28" cy="28" r="22" stroke={statusConfig.ringColor} strokeWidth="5" fill="none"
                        strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 22}`} strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
                        style={{ transition: 'stroke-dashoffset 0.5s' }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-black" style={{ color: statusConfig.ringColor }}>{Math.round(pct)}%</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">Remaining Stock</p>
                    <p className="text-xl font-black text-gray-900 leading-none">
                      {remaining.toLocaleString()}<span className="text-[9px] font-normal text-gray-400 ml-1">g/ml</span>
                    </p>
                    <p className="text-[8px] text-gray-400 mt-0.5">Purchased: {pur.toLocaleString()} g/ml</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mt-auto">
                 <div className="bg-white/80 rounded-lg p-1.5 text-center border border-gray-100">
                    <p className="text-[7px] text-gray-400 font-bold uppercase">Consumed</p>
                    <p className="text-[11px] font-black text-emerald-700">{used.toLocaleString()} <span className="text-[7px] font-normal">g/ml</span></p>
                 </div>
                 <div className="bg-white/80 rounded-lg p-1.5 text-center border border-gray-100">
                    <p className="text-[7px] text-gray-400 font-bold uppercase">Status</p>
                    <p className={`text-[11px] font-black ${statusConfig.iconColor}`}>{statusConfig.label}</p>
                 </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1.5">
            <div className="p-1 bg-emerald-50 text-emerald-600 rounded"><Activity size={12} /></div>
            <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Daily Consumption: Vitamins vs Water</h3>
          </div>
        </div>

        <div className="relative w-full overflow-x-auto">
          {hoverDay && (
            <div className="absolute z-50 pointer-events-none bg-[#1a1a1a] text-white rounded-xl shadow-2xl px-3 py-2.5 border border-white/10"
              style={{ left: tooltipPos.x > 220 ? tooltipPos.x - 145 : tooltipPos.x + 14, top: Math.max(4, tooltipPos.y - 70), minWidth: 135 }}>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b border-white/10 pb-1.5">📅 Day {hoverDay}</div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[9px] text-gray-300 font-bold">Vitamins</span>
                </div>
                <span className="text-[10px] font-black text-emerald-400">{(dailyData[hoverDay]?.vitamins || 0).toLocaleString()} g/ml</span>
              </div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-sky-400" />
                  <span className="text-[9px] text-gray-300 font-bold">Water</span>
                </div>
                <span className="text-[10px] font-black text-sky-400">{(dailyData[hoverDay]?.water || 0).toLocaleString()} L</span>
              </div>
            </div>
          )}

          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ minWidth: 480 }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverDay(null)}>
            
            {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
              const y = PAD.top + chartH - f * chartH;
              return (
                <g key={i}>
                  <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth="1.2" />
                </g>
              )
            })}

            {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
              const y = PAD.top + chartH - f * chartH;
              const val = maxVit * f;
              return (
                <text key={`l-${i}`} x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill="#10b981" fontWeight="800">
                  {val.toFixed(val > 0 && val < 10 ? 1 : 0)}g
                </text>
              )
            })}

            {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
              const y = PAD.top + chartH - f * chartH;
              const val = maxWater * f;
              return (
                <text key={`r-${i}`} x={W - PAD.right + 8} y={y + 4} textAnchor="start" fontSize="9" fill="#38bdf8" fontWeight="800">
                  {val.toFixed(val > 0 && val < 10 ? 1 : 0)}L
                </text>
              )
            })}

            <path d={vitPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <path d={waterPath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

            {days.filter(d => vitVals[d-1] > 0).map(d => (
              <circle key={`vdot-${d}`} cx={xPos(d)} cy={yPosVit(vitVals[d-1])} r={hoverDay === d ? 5 : 3} fill="#10b981" stroke="white" strokeWidth="1.5" />
            ))}
            {days.filter(d => waterVals[d-1] > 0).map(d => (
              <circle key={`wdot-${d}`} cx={xPos(d)} cy={yPosWater(waterVals[d-1])} r={hoverDay === d ? 5 : 3} fill="#38bdf8" stroke="white" strokeWidth="1.5" />
            ))}

            {hoverDay && <line x1={xPos(hoverDay)} y1={PAD.top} x2={xPos(hoverDay)} y2={PAD.top + chartH} stroke="#374151" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />}
            <line x1={xPos(todayDay)} y1={PAD.top} x2={xPos(todayDay)} y2={PAD.top + chartH} stroke="#8B1A1A" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.6" />

            {[1, 5, 10, 15, 20, 25, 30].map(d => (
              <text key={d} x={xPos(d)} y={H - 8} textAnchor="middle" fontSize="9" fill={hoverDay === d ? '#374151' : '#9ca3af'} fontWeight={hoverDay === d ? '900' : '700'}>Day {d}</text>
            ))}
            <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="#e5e7eb" strokeWidth="1" />
          </svg>

          <div className="flex items-center gap-4 mt-2 px-2 justify-center flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[2.5px] rounded-full bg-emerald-500" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Vitamins (g/ml)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[2.5px] rounded-full bg-sky-400" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Water (L)</span>
            </div>
            <div className="flex items-center gap-1.5 ml-4">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#8B1A1A" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Today</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="p-1 bg-gray-50 text-gray-600 rounded"><Activity size={12} /></div>
          <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Recent Vitamin Logs</h3>
        </div>
        
        {logsList.length === 0 ? (
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest text-center py-6">No vitamin records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[9px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Day', 'Date', 'Pen', 'Vitamin Type', 'Amount', 'Water Mix', 'Remarks'].map(h => (
                    <th key={h} className="text-left pb-2 font-black text-gray-400 uppercase tracking-widest pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logsList.slice(0, 15).map((log, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2 pr-3"><span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-black">Day {log.dayNum || '—'}</span></td>
                    <td className="py-2 pr-3 text-gray-500 font-bold">{log.dateLabel || '—'}</td>
                    <td className="py-2 pr-3 font-black text-gray-700">{log.pen}</td>
                    <td className="py-2 pr-3">
                      <span className="px-1.5 py-0.5 rounded font-black text-[8px] uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {log.vitaminName || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-black text-emerald-600">{log.totalAmt.toLocaleString()} g/ml</td>
                    <td className="py-2 pr-3 font-black text-sky-500">{log.totalWater > 0 ? `${log.totalWater.toLocaleString()} L` : '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 font-bold truncate max-w-[150px]" title={log.remarks}>{log.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logsList.length > 15 && <p className="text-[8px] text-gray-400 font-bold text-center mt-3 uppercase">Showing latest 15 records</p>}
          </div>
        )}
      </div>

    </div>
  );
};

// ── FEED MANAGEMENT TAB ───────────────────────────────────────
const FeedManagementTab = ({ activeBatch, feedLogsByDay, currentBatchDay, feedCfg, setFeedCfg }) => {
  const [hoverDay, setHoverDay] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  const [showFeedConfig, setShowFeedConfig] = useState(false);
  const [feedCfgDraft, setFeedCfgDraft] = useState(feedCfg);
  
  const openFeedCfg  = () => { setFeedCfgDraft({ ...feedCfg }); setShowFeedConfig(true); document.body.style.overflow = 'hidden'; };
  const closeFeedCfg = () => { setShowFeedConfig(false); document.body.style.overflow = ''; };
  // ── SAVE: calls the persistent setter from parent ──────────
  const saveFeedCfg  = () => { setFeedCfg({ ...feedCfgDraft }); closeFeedCfg(); };

  const population = activeBatch?.startingPopulation || 0;
  const forecast   = useMemo(() => computeFeedForecast(population, feedCfg.kgPerBag), [population, feedCfg.kgPerBag]);

  const purchased = useMemo(() => {
    const agg = { Booster: 0, Starter: 0, Finisher: 0 };
    Object.values(activeBatch?.expenses || {}).forEach(exp => {
      if (exp.category === 'Feeds' && exp.feedType && agg[exp.feedType] !== undefined) {
        const qty = parseFloat(exp.quantity || 0) * parseFloat(exp.purchaseCount || 1);
        agg[exp.feedType] += qty;
      }
    });
    return agg;
  }, [activeBatch]);

  const used = useMemo(() => {
    const agg = { Booster: 0, Starter: 0, Finisher: 0, Unknown: 0 };
    Object.values(activeBatch?.feed_logs || {}).forEach(penLogs => {
      Object.values(penLogs || {}).forEach(log => {
        if (log.status === 'approved') {
          const val = parseFloat(log.am || 0) + parseFloat(log.pm || 0);
          const ft  = log.feedType || 'Unknown';
          agg[ft] = (agg[ft] || 0) + val;
        }
      });
    });
    return agg;
  }, [activeBatch]);

  const required = useMemo(() => {
    const agg = { Booster: 0, Starter: 0, Finisher: 0 };
    forecast.forEach(f => { agg[f.feedType] += f.targetKilos; });
    return agg;
  }, [forecast]);

  const W = 900, H = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 56 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  const forecastByDay = {};
  forecast.forEach(f => { forecastByDay[f.day] = f; });

  const allVals = days.flatMap(d => [
    forecastByDay[d]?.targetKilos || 0,
    feedLogsByDay[d] || 0,
  ]);
  const maxVal = Math.max(...allVals, 1);

  const xPos = (day) => PAD.left + ((day - 1) / 29) * chartW;
  const yPos = (val)  => PAD.top + chartH - (val / maxVal) * chartH;
  const todayDay = Math.min(currentBatchDay, 30);

  const actualPath = days
    .filter(d => feedLogsByDay[d] > 0)
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(d).toFixed(1)},${yPos(feedLogsByDay[d]).toFixed(1)}`)
    .join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: maxVal * f, y: yPos(maxVal * f) }));

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX  = (e.clientX - rect.left) * scaleX;
    const rawDay  = ((mouseX - PAD.left) / chartW) * 29 + 1;
    setHoverDay(Math.min(30, Math.max(1, Math.round(rawDay))));
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const getStatus = (type) => {
    const req      = required[type] || 0;
    const pur      = purchased[type] || 0;
    const usedAmt  = used[type] || 0;
    const remaining  = Math.max(0, pur - usedAmt);
    const stillNeed  = Math.max(0, req - pur);
    const reqBags    = parseFloat((req / feedCfg.kgPerBag).toFixed(2));
    const purBags    = parseFloat((pur / feedCfg.kgPerBag).toFixed(2));
    const usedBags   = parseFloat((usedAmt / feedCfg.kgPerBag).toFixed(2));
    const remBags    = parseFloat((remaining / feedCfg.kgPerBag).toFixed(2));
    const needBags   = parseFloat((stillNeed / feedCfg.kgPerBag).toFixed(2));
    let status = 'good';
    if (pur === 0 && req > 0)          status = 'critical';
    else if (remaining < req * 0.15)   status = 'critical';
    else if (remaining < req * 0.30)   status = 'warning';
    else if (remaining >= req)         status = 'excess';
    return { req, pur, usedAmt, remaining, stillNeed, reqBags, purBags, usedBags, remBags, needBags, status };
  };

  const totalForecastKg   = Object.values(required).reduce((a, b) => a + b, 0);
  const totalPurchasedKg  = Object.values(purchased).reduce((a, b) => a + b, 0);
  const totalUsedKg       = (used.Booster || 0) + (used.Starter || 0) + (used.Finisher || 0);
  const kgPerBag = feedCfg.kgPerBag;
  const totalForecastBags = parseFloat((totalForecastKg / kgPerBag).toFixed(1));
  const totalPurchBags    = parseFloat((totalPurchasedKg / kgPerBag).toFixed(1));
  const totalUsedBags     = parseFloat((totalUsedKg / kgPerBag).toFixed(1));
  const totalRemBags      = parseFloat((Math.max(0, totalPurchasedKg - totalUsedKg) / kgPerBag).toFixed(1));

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-orange-50 text-orange-600 rounded"><FeedIcon size={12} /></div>
          <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Feed Management</span>
          <span className="text-[8px] text-gray-400 font-bold">· {feedCfg.kgPerBag} kg/bag · FCR {feedCfg.fcr}</span>
        </div>
        <button onClick={openFeedCfg}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#8B1A1A] hover:bg-[#6B1111] text-white rounded-lg text-[9px] font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95">
          <Settings size={11} /> Configure
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { title: 'Total Forecast',  bags: totalForecastBags, kg: totalForecastKg,                              icon: Package,  color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
          { title: 'Total Purchased', bags: totalPurchBags,    kg: totalPurchasedKg,                             icon: FeedIcon, color: 'text-orange-600',  bg: 'bg-orange-50'  },
          { title: 'Total Consumed',  bags: totalUsedBags,     kg: totalUsedKg,                                  icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { title: 'Remaining Stock', bags: totalRemBags,      kg: Math.max(0, totalPurchasedKg - totalUsedKg), icon: Scale,    color: 'text-violet-600',  bg: 'bg-violet-50'  },
        ].map(({ title, bags, kg, icon: Icon, color, bg }) => (
          <div key={title} className="bg-white rounded-lg shadow-sm border border-gray-100 p-2.5 h-[80px] flex flex-col justify-between hover:border-gray-300 transition-colors">
            <div className="flex justify-between items-start">
              <span className={`p-1.5 rounded-md ${bg} ${color}`}><Icon size={12} /></span>
              <span className="text-[7.5px] font-black text-gray-400 uppercase tracking-tighter text-right leading-none w-2/3">{title}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <h3 className={`text-base font-black leading-none ${color}`}>{bags.toLocaleString(undefined, { maximumFractionDigits: 1 })}</h3>
              <span className="text-[7px] font-bold text-gray-300 uppercase">bags</span>
              <span className="text-[7px] font-bold text-gray-400 ml-1">({parseFloat(kg.toFixed(0)).toLocaleString()} kg)</span>
            </div>
          </div>
        ))}
      </div>

      {showFeedConfig && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeFeedCfg(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100">
            <div className="bg-[#8B1A1A] px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2 text-white">
                <Settings size={16} />
                <h2 className="font-black text-sm uppercase tracking-wider">Feed Configuration</h2>
              </div>
              <button onClick={closeFeedCfg} className="p-1.5 hover:bg-[#6B1111] rounded-full text-white transition"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">kg per Bag</label>
                <p className="text-[8px] text-gray-400 mb-2">How many kg is in 1 bag of feed? (default: 50 kg)</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setFeedCfgDraft(d => ({ ...d, kgPerBag: Math.max(1, d.kgPerBag - 1) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition font-bold"><Minus size={14} /></button>
                  <input type="number" min="1" max="100" value={feedCfgDraft.kgPerBag}
                    onChange={e => setFeedCfgDraft(d => ({ ...d, kgPerBag: parseFloat(e.target.value) || 50 }))}
                    className="flex-1 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-black text-[#8B1A1A] focus:outline-none focus:border-[#8B1A1A]" />
                  <button onClick={() => setFeedCfgDraft(d => ({ ...d, kgPerBag: Math.min(100, d.kgPerBag + 1) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-[#8B1A1A]/10 hover:text-[#8B1A1A] flex items-center justify-center transition font-bold"><Plus size={14} /></button>
                </div>
                <div className="mt-2 p-2.5 bg-orange-50 rounded-lg border border-orange-100">
                  <p className="text-[8px] font-black text-orange-700">
                    At {feedCfgDraft.kgPerBag} kg/bag → for {(activeBatch?.startingPopulation||0).toLocaleString()} birds:
                    <span className="ml-1 text-orange-900">
                      {((2250 * (activeBatch?.startingPopulation||0) / 1000) / feedCfgDraft.kgPerBag).toFixed(1)} bags total
                    </span>
                  </p>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">Feed Conversion Ratio (FCR)</label>
                <p className="text-[8px] text-gray-400 mb-2">kg of feed needed per kg of weight gained.</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setFeedCfgDraft(d => ({ ...d, fcr: Math.max(0.5, parseFloat((d.fcr - 0.1).toFixed(1))) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition font-bold"><Minus size={14} /></button>
                  <input type="number" min="0.5" max="5" step="0.1" value={feedCfgDraft.fcr}
                    onChange={e => setFeedCfgDraft(d => ({ ...d, fcr: parseFloat(e.target.value) || 1.5 }))}
                    className="flex-1 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-black text-[#8B1A1A] focus:outline-none focus:border-[#8B1A1A]" />
                  <button onClick={() => setFeedCfgDraft(d => ({ ...d, fcr: Math.min(5, parseFloat((d.fcr + 0.1).toFixed(1))) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-[#8B1A1A]/10 hover:text-[#8B1A1A] flex items-center justify-center transition font-bold"><Plus size={14} /></button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {[{label:'Excellent', val:1.3, color:'text-green-700 bg-green-50 border-green-200'},
                    {label:'Good',      val:1.5, color:'text-blue-700 bg-blue-50 border-blue-200'},
                    {label:'Average',   val:1.8, color:'text-amber-700 bg-amber-50 border-amber-200'}].map(p => (
                    <button key={p.label} onClick={() => setFeedCfgDraft(d => ({ ...d, fcr: p.val }))}
                      className={`px-2 py-1.5 rounded-lg border text-[8px] font-black uppercase transition ${feedCfgDraft.fcr === p.val ? p.color + ' ring-1 ring-offset-1' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                      {p.label}<br/><span className="font-normal normal-case">FCR {p.val}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50 rounded-b-2xl">
              <button onClick={closeFeedCfg} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-100 transition">Cancel</button>
              <button onClick={saveFeedCfg} className="flex-1 py-2.5 bg-[#8B1A1A] hover:bg-[#6B1111] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 active:scale-95">
                <Save size={13} /> Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {['Booster', 'Starter', 'Finisher'].map(type => {
          const s = getStatus(type);
          const pct = s.req > 0 ? Math.min(100, (s.remaining / s.req) * 100) : 0;
          const dayRange = { Booster: 'Days 1–12', Starter: 'Days 13–23', Finisher: 'Days 24–30' }[type];
          const statusConfig = {
            critical: { bg: 'bg-red-50',   border: 'border-red-200',   icon: AlertTriangle, iconColor: 'text-red-600',    ringColor: '#ef4444', label: 'Critical'  },
            warning:  { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600',  ringColor: '#f59e0b', label: 'Low Stock' },
            excess:   { bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle,   iconColor: 'text-green-600',  ringColor: '#22c55e', label: 'Surplus'   },
            good:     { bg: 'bg-white',    border: 'border-gray-100',  icon: CheckCircle,   iconColor: 'text-emerald-600',ringColor: '#10b981', label: 'OK'        },
          }[s.status];
          const StatusIcon = statusConfig.icon;

          return (
            <div key={type} className={`rounded-xl border shadow-sm p-4 ${statusConfig.bg} ${statusConfig.border}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${FEED_BG[type]} ${FEED_TEXT[type]} border ${FEED_BORDER[type]}`}>{type}</div>
                  <span className="text-[8px] text-gray-400 font-bold">{dayRange}</span>
                </div>
                <div className="flex items-center gap-1">
                  <StatusIcon size={11} className={statusConfig.iconColor} />
                  <span className={`text-[8px] font-black uppercase ${statusConfig.iconColor}`}>{statusConfig.label}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="relative w-14 h-14 flex-shrink-0">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="22" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                    <circle cx="28" cy="28" r="22" stroke={statusConfig.ringColor} strokeWidth="5" fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 22}`}
                      strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
                      style={{ transition: 'stroke-dashoffset 0.5s' }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-black" style={{ color: statusConfig.ringColor }}>{Math.round(pct)}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">Remaining</p>
                  <p className="text-xl font-black text-gray-900 leading-none">
                    {s.remBags.toFixed(1)}<span className="text-[9px] font-normal text-gray-400 ml-1">bags</span>
                  </p>
                  <p className="text-[8px] text-gray-400 mt-0.5">{s.remaining.toFixed(0)} kg of {s.req.toFixed(0)} kg needed</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {[
                  { label: 'Forecast',  bags: s.reqBags,  kg: s.req,     color: 'text-gray-800' },
                  { label: 'Purchased', bags: s.purBags,  kg: s.pur,     color: 'text-gray-800' },
                  { label: 'Consumed',  bags: s.usedBags, kg: s.usedAmt, color: 'text-emerald-700' },
                ].map(row => (
                  <div key={row.label} className="bg-white/80 rounded-lg p-1.5 text-center border border-gray-100">
                    <p className="text-[7px] text-gray-400 font-bold uppercase">{row.label}</p>
                    <p className={`text-[11px] font-black ${row.color}`}>
                      {row.bags.toFixed(1)}<span className="text-[7px] font-normal"> bags</span>
                    </p>
                    <p className="text-[7px] text-gray-400">{row.kg.toFixed(0)} kg</p>
                  </div>
                ))}
              </div>

              {s.stillNeed > 0 && (
                <div className="flex items-center gap-1.5 bg-white/70 border border-orange-100 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle size={10} className="text-orange-500 flex-shrink-0" />
                  <p className="text-[8px] font-black text-orange-700">
                    Still need: {s.needBags.toFixed(1)} bags ({s.stillNeed.toFixed(0)} kg)
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1.5">
            <div className="p-1 bg-orange-50 text-orange-600 rounded"><FeedIcon size={12} /></div>
            <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Feed Forecast vs Actual Consumed — Day 1 to 30</h3>
          </div>
          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">kg / day</span>
        </div>

        <div className="relative w-full overflow-x-auto">
          {hoverDay && (
            <div className="absolute z-50 pointer-events-none bg-[#1a1a1a] text-white rounded-xl shadow-2xl px-3 py-2.5 border border-white/10"
              style={{ left: tooltipPos.x > 220 ? tooltipPos.x - 155 : tooltipPos.x + 14, top: Math.max(4, tooltipPos.y - 90), minWidth: 155 }}>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b border-white/10 pb-1.5">📅 Day {hoverDay}</div>
              {forecastByDay[hoverDay] && (
                <>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: FEED_COLORS[forecastByDay[hoverDay].feedType] }} />
                      <span className="text-[9px] text-gray-300 font-bold">Forecast</span>
                    </div>
                    <span className="text-[10px] font-black text-orange-300">
                      {forecastByDay[hoverDay].targetBags.toFixed(2)} bags
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[8px] text-gray-400 pl-3.5">kg</span>
                    <span className="text-[8px] font-bold text-gray-300">{forecastByDay[hoverDay].targetKilos} kg</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[8px] text-gray-400 pl-3.5">Type</span>
                    <span className="text-[8px] font-black" style={{ color: FEED_COLORS[forecastByDay[hoverDay].feedType] }}>{forecastByDay[hoverDay].feedType}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[8px] text-gray-400 pl-3.5">g/bird</span>
                    <span className="text-[8px] font-bold text-gray-300">{forecastByDay[hoverDay].gramsPerBird}g</span>
                  </div>
                </>
              )}
              {feedLogsByDay[hoverDay] > 0 && (
                <div className="border-t border-white/10 pt-1 mt-1">
                  <div className="flex items-center justify-between gap-3 mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-[9px] text-gray-300 font-bold">Actual</span>
                    </div>
                    <span className="text-[10px] font-black text-emerald-400">
                      {(feedLogsByDay[hoverDay] / kgPerBag).toFixed(2)} bags
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[8px] text-gray-400 pl-3.5">kg</span>
                    <span className="text-[8px] font-bold text-gray-300">{(feedLogsByDay[hoverDay] || 0).toFixed(2)} kg</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ minWidth: 480 }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverDay(null)}>
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#f3f4f6" strokeWidth="1.2" />
                <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af" fontWeight="700">
                  {t.val.toFixed(t.val > 0 && t.val < 10 ? 1 : 0)}
                </text>
              </g>
            ))}

            {forecast.map(f => {
              const barW = Math.max(2, (chartW / 30) - 3);
              const bx   = xPos(f.day) - barW / 2;
              const bh   = Math.max(0, (f.targetKilos / maxVal) * chartH);
              const by   = PAD.top + chartH - bh;
              return (
                <rect key={`bar-${f.day}`} x={bx} y={by} width={barW} height={bh} rx="2"
                  fill={FEED_COLORS[f.feedType]} opacity={hoverDay === f.day ? 1 : 0.65} />
              );
            })}

            {actualPath && (
              <path d={actualPath} fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            )}

            {days.filter(d => feedLogsByDay[d] > 0).map(d => (
              <circle key={`dot-${d}`} cx={xPos(d)} cy={yPos(feedLogsByDay[d])}
                r={hoverDay === d ? 6 : 4} fill="#10b981" stroke="white" strokeWidth="1.5" />
            ))}

            {hoverDay && <line x1={xPos(hoverDay)} y1={PAD.top} x2={xPos(hoverDay)} y2={PAD.top + chartH} stroke="#374151" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />}
            <line x1={xPos(todayDay)} y1={PAD.top} x2={xPos(todayDay)} y2={PAD.top + chartH} stroke="#8B1A1A" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.6" />

            {[1, 5, 10, 15, 20, 25, 30].map(d => (
              <text key={d} x={xPos(d)} y={H - 8} textAnchor="middle" fontSize="9"
                fill={hoverDay === d ? '#374151' : '#9ca3af'} fontWeight={hoverDay === d ? '900' : '700'}>Day {d}</text>
            ))}
            <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="#e5e7eb" strokeWidth="1" />
          </svg>

          <div className="flex items-center gap-4 mt-2 px-2 justify-end flex-wrap">
            {['Booster', 'Starter', 'Finisher'].map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: FEED_COLORS[t] }} />
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t} forecast</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[2.5px] rounded-full bg-emerald-500" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Actual consumed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#8B1A1A" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Today</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="p-1 bg-orange-50 text-orange-600 rounded"><FeedIcon size={12} /></div>
          <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">30-Day Feed Schedule</h3>
          <span className="ml-auto text-[8px] text-gray-400 font-bold">1 bag = {kgPerBag} kg</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['Day', 'Phase', 'g/Bird', 'Bags', 'Target (kg)', 'Actual (kg)', 'Actual (bags)', 'Diff (kg)', 'Status'].map(h => (
                  <th key={h} className="text-left pb-2 font-black text-gray-400 uppercase tracking-widest pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.map((f) => {
                const actual     = feedLogsByDay[f.day] || 0;
                const actualBags = actual > 0 ? actual / kgPerBag : null;
                const diff       = actual > 0 ? actual - f.targetKilos : null;
                const isToday    = f.day === todayDay;
                const isFuture   = f.day > todayDay;
                return (
                  <tr key={f.day} className={`border-b border-gray-50 transition-colors ${isToday ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                    <td className="py-1.5 pr-3">
                      <span className={`px-1.5 py-0.5 rounded font-black ${isToday ? 'bg-orange-500 text-white' : 'bg-indigo-50 text-indigo-700'}`}>
                        Day {f.day}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={`px-1.5 py-0.5 rounded font-black text-[8px] uppercase ${FEED_BG[f.feedType]} ${FEED_TEXT[f.feedType]} border ${FEED_BORDER[f.feedType]}`}>
                        {f.feedType}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-bold text-gray-600">{f.gramsPerBird}g</td>
                    <td className="py-1.5 pr-3 font-black text-indigo-700">{f.targetBags.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 font-black text-orange-700">{f.targetKilos.toFixed(1)}</td>
                    <td className="py-1.5 pr-3">
                      {actual > 0
                        ? <span className="font-black text-emerald-700">{actual.toFixed(2)}</span>
                        : <span className="text-gray-300 font-bold">—</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      {actualBags !== null
                        ? <span className="font-black text-emerald-600">{actualBags.toFixed(2)}</span>
                        : <span className="text-gray-300 font-bold">—</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      {diff !== null
                        ? <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                          </span>
                        : <span className="text-gray-300 font-bold">—</span>}
                    </td>
                    <td className="py-1.5">
                      {isFuture
                        ? <span className="text-[8px] text-gray-300 font-bold">Upcoming</span>
                        : isToday
                          ? <span className="text-[8px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Today</span>
                          : actual > 0
                            ? <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">✓ Done</span>
                            : <span className="text-[8px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded">No Log</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {['Booster', 'Starter', 'Finisher'].map(type => {
                const rows  = forecast.filter(f => f.feedType === type);
                const totalKg   = rows.reduce((s, f) => s + f.targetKilos, 0);
                const totalBags = rows.reduce((s, f) => s + f.targetBags, 0);
                return (
                  <tr key={type} className={`${FEED_BG[type]} border-b border-gray-100`}>
                    <td colSpan={2} className="py-1.5 pr-3 font-black text-[8px] uppercase tracking-widest">
                      <span className={`${FEED_TEXT[type]}`}>Total {type}</span>
                    </td>
                    <td className="py-1.5 pr-3" />
                    <td className={`py-1.5 pr-3 font-black text-[9px] ${FEED_TEXT[type]}`}>{totalBags.toFixed(2)} bags</td>
                    <td className={`py-1.5 pr-3 font-black text-[9px] ${FEED_TEXT[type]}`}>{totalKg.toFixed(1)} kg</td>
                    <td colSpan={4} />
                  </tr>
                );
              })}
              <tr className="bg-gray-800">
                <td colSpan={2} className="py-2 pr-3 font-black text-[9px] uppercase tracking-widest text-white">Grand Total</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 font-black text-[10px] text-yellow-300">{(totalForecastKg / kgPerBag).toFixed(2)} bags</td>
                <td className="py-2 pr-3 font-black text-[10px] text-yellow-300">{totalForecastKg.toFixed(1)} kg</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── WEIGHT TAB COMPONENT ─────────────────────────────────────
const FEED_LOGIC = [
  { days: [1],           gpb: 30 },
  { days: [2, 3],        gpb: 35 },
  { days: [4, 5, 6],     gpb: 40 },
  { days: [7,8,9,10],    gpb: 45 },
  { days: [11,12],       gpb: 50 },
  { days: [13],          gpb: 50 },
  { days: [14,15,16],    gpb: 60 },
  { days: [17,18,19],    gpb: 70 },
  { days: [20,21],       gpb: 75 },
  { days: [22,23],       gpb: 80 },
  { days: [24],          gpb: 100 },
  { days: [25],          gpb: 120 },
  { days: [26],          gpb: 130 },
  { days: [27],          gpb: 150 },
  { days: [28],          gpb: 160 },
  { days: [29, 30],      gpb: 170 },
];

const getFCR = (day) => { if (day <= 5) return 1.3; if (day <= 12) return 1.4; if (day <= 21) return 1.5; return 1.7; };
const MAX_WEIGHT_G = 1500;

function computeWeightForecast(startWeightG, population, feedLogsByDay = {}, bagKg = 50, fcrOverride = null) {
  let cur = startWeightG;
  const TARGET_DAYS = new Set([1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
  const result = [];
  for (let day = 1; day <= 30; day++) {
    if (day > 1) {
      const entry = FEED_LOGIC.find(e => e.days.includes(day));
      const scheduleGpb = entry ? entry.gpb : 170;
      const actualKgDay = feedLogsByDay[day] || 0;
      const actualGpb   = actualKgDay > 0 && population > 0
        ? (actualKgDay * 1000) / population   
        : 0;
      const gpb = actualGpb > 0 ? actualGpb : scheduleGpb;
      const fcr  = fcrOverride || getFCR(day);
      const gain = gpb / fcr;
      cur = Math.min(cur + gain, MAX_WEIGHT_G);
    }
    if (TARGET_DAYS.has(day)) {
      result.push({
        day,
        avgWeight:   Math.round(cur),
        totalWeight: Math.round((cur * population) / 1000),
        fcr: fcrOverride || getFCR(day),
      });
    }
  }
  return result;
}

const WeightTab = ({ weightForecast: fbForecast, weightLogs, activeBatch, currentBatchDay, feedLogsByDay = {}, weightCfg, setWeightCfg }) => {
  const [hoverItem,  setHoverItem]  = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showConfig, setShowConfig] = useState(false);
  const [cfgDraft,   setCfgDraft]   = useState(weightCfg);
  const svgRef = useRef(null);

  const population     = activeBatch?.startingPopulation || 10000;
  const forecastParsed = computeWeightForecast(weightCfg.startWeight, population, weightCfg.useActualFeed ? feedLogsByDay : {}, null, weightCfg.fcrOverride ? parseFloat(weightCfg.fcrOverride) : null);
  const logsByDay      = {};
  weightLogs.forEach(l => { logsByDay[l.batchDay] = l; });

  const W = 900, H = 260;
  const PAD = { top: 20, right: 24, bottom: 40, left: 60 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;

  const maxRecordedW = weightLogs.length > 0 ? Math.max(...weightLogs.map(l => parseFloat(l.averageWeight) || 0)) : 0;
  const maxY = Math.max(weightCfg.targetWeight, maxRecordedW, 1);

  const xPos = (day) => PAD.left + ((day - 1) / 29) * cW;
  const yPos = (val) => PAD.top + cH - (Math.min(val, maxY) / maxY) * cH;

  const forecastPath = forecastParsed.map((f, i) =>
    `${i === 0 ? 'M' : 'L'}${xPos(f.day).toFixed(1)},${yPos(f.avgWeight).toFixed(1)}`
  ).join(' ');
  const forecastArea = forecastParsed.length > 0
    ? `M${xPos(forecastParsed[0].day).toFixed(1)},${yPos(0).toFixed(1)} ${forecastParsed.map(f => `L${xPos(f.day).toFixed(1)},${yPos(f.avgWeight).toFixed(1)}`).join(' ')} L${xPos(forecastParsed[forecastParsed.length - 1].day).toFixed(1)},${yPos(0).toFixed(1)} Z`
    : '';

  const targetY = yPos(weightCfg.targetWeight);
  const yTicks  = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: maxY * f, y: yPos(maxY * f) }));
  const todayDay = Math.min(currentBatchDay, 30);

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const rawDay  = ((mouseX - PAD.left) / cW) * 29 + 1;
    const snapped = Math.min(30, Math.max(1, Math.round(rawDay)));
    const fc  = forecastParsed.find(f => f.day === snapped);
    const rec = logsByDay[snapped];
    if (fc || rec) {
      setHoverItem({ day: snapped, forecast: fc, recorded: rec });
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else { setHoverItem(null); }
  };

  const openCfg  = () => { setCfgDraft({ ...weightCfg }); setShowConfig(true);  document.body.style.overflow = 'hidden'; };
  const closeCfg = () => { setShowConfig(false); document.body.style.overflow = ''; };
  // ── SAVE: calls the persistent setter from parent ──────────
  const saveCfg  = () => { setWeightCfg({ ...cfgDraft }); closeCfg(); };
  const day30    = forecastParsed[forecastParsed.length - 1];

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {showConfig && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeCfg(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100">
            <div className="bg-[#8B1A1A] px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2 text-white">
                <Settings size={16} />
                <h2 className="font-black text-sm uppercase tracking-wider">Weight Configuration</h2>
              </div>
              <button onClick={closeCfg} className="p-1.5 hover:bg-[#6B1111] rounded-full text-white transition"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <div>
                  <p className="text-[9px] font-black text-indigo-800 uppercase tracking-widest">Use Actual Feed Consumed</p>
                  <p className="text-[8px] text-indigo-500 mt-0.5">Forecast weight from real feed logs</p>
                </div>
                <button onClick={() => setCfgDraft(d => ({ ...d, useActualFeed: !d.useActualFeed }))}
                  className={`w-11 h-6 rounded-full transition-colors relative ${cfgDraft.useActualFeed ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${cfgDraft.useActualFeed ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Starting / Day-1 Chick Weight (g)</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCfgDraft(d => ({ ...d, startWeight: Math.max(1, d.startWeight - 5) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition font-bold"><Minus size={14} /></button>
                  <input type="number" min="1" max="200" value={cfgDraft.startWeight}
                    onChange={e => setCfgDraft(d => ({ ...d, startWeight: parseInt(e.target.value) || 1 }))}
                    className="flex-1 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-black text-[#8B1A1A] focus:outline-none focus:border-[#8B1A1A]" />
                  <button onClick={() => setCfgDraft(d => ({ ...d, startWeight: Math.min(200, d.startWeight + 5) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-[#8B1A1A]/10 hover:text-[#8B1A1A] flex items-center justify-center transition font-bold"><Plus size={14} /></button>
                </div>
                <p className="text-[8px] text-gray-400 mt-1">Typical day-1 chick weight is 35–50g</p>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Target Harvest Weight (g / bird)</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCfgDraft(d => ({ ...d, targetWeight: Math.max(500, d.targetWeight - 50) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition font-bold"><Minus size={14} /></button>
                  <input type="number" min="500" max="3000" step="50" value={cfgDraft.targetWeight}
                    onChange={e => setCfgDraft(d => ({ ...d, targetWeight: parseInt(e.target.value) || 1500 }))}
                    className="flex-1 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-black text-[#8B1A1A] focus:outline-none focus:border-[#8B1A1A]" />
                  <button onClick={() => setCfgDraft(d => ({ ...d, targetWeight: Math.min(3000, d.targetWeight + 50) }))}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-[#8B1A1A]/10 hover:text-[#8B1A1A] flex items-center justify-center transition font-bold"><Plus size={14} /></button>
                </div>
                <p className="text-[8px] text-gray-400 mt-1">Default 1,500g — forecast line is capped here</p>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">FCR Override <span className="text-gray-300 font-normal normal-case">(leave blank to use auto FCR)</span></label>
                <input type="number" min="1" max="3" step="0.1" placeholder="e.g. 1.5"
                  value={cfgDraft.fcrOverride}
                  onChange={e => setCfgDraft(d => ({ ...d, fcrOverride: e.target.value }))}
                  className="w-full text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-black text-[#8B1A1A] focus:outline-none focus:border-[#8B1A1A]" />
                <p className="text-[8px] text-gray-400 mt-1">Auto FCR: Day 1-5 = 1.3, Day 6-12 = 1.4, Day 13-21 = 1.5, Day 22-30 = 1.7</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50 rounded-b-2xl">
              <button onClick={closeCfg} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-100 transition">Cancel</button>
              <button onClick={saveCfg} className="flex-1 py-2.5 bg-[#8B1A1A] hover:bg-[#6B1111] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 active:scale-95">
                <Save size={13} /> Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <div className="p-1 bg-violet-100 text-violet-700 rounded"><Scale size={12} /></div>
          <h3 className="text-[9px] font-black text-violet-900 uppercase tracking-widest">Weight Monitor — Day 1 to 30</h3>
        </div>
        <button onClick={openCfg}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#8B1A1A] hover:bg-[#6B1111] text-white rounded-lg text-[9px] font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95">
          <Settings size={11} /> Configure
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard title="Starting Weight" value={weightCfg.startWeight}       unit="g/bird"  icon={Scale}      colorClass="text-violet-600"  bgClass="bg-violet-50" />
        <MetricCard title="Target Weight"   value={weightCfg.targetWeight}      unit="g/bird"  icon={TrendingUp} colorClass="text-[#8B1A1A]"   bgClass="bg-red-50"    />
        <MetricCard title="Day 30 Forecast" value={day30?.avgWeight || 0} unit="g/bird"  icon={Activity}   colorClass="text-orange-600"  bgClass="bg-orange-50" />
        <MetricCard title="Recorded Logs"   value={weightLogs.length}     unit="entries" icon={LayoutGrid} colorClass="text-indigo-600"  bgClass="bg-indigo-50" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1.5">
            <div className="p-1 bg-violet-50 text-violet-600 rounded"><Scale size={12} /></div>
            <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Avg Weight Forecast vs Recorded — Day 1 to 30</h3>
            {weightCfg.useActualFeed && <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">📊 Using actual feed</span>}
          </div>
          <span className="text-[8px] font-bold text-gray-400 uppercase">g / bird · target: {weightCfg.targetWeight.toLocaleString()}g</span>
        </div>

        <div className="relative w-full overflow-x-auto">
          {hoverItem && (
            <div className="absolute z-50 pointer-events-none bg-[#1a1a1a] text-white rounded-xl shadow-2xl px-3 py-2.5 border border-white/10"
              style={{ left: tooltipPos.x > 260 ? tooltipPos.x - 165 : tooltipPos.x + 14, top: Math.max(4, tooltipPos.y - 90), minWidth: 155 }}>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b border-white/10 pb-1.5">📅 Day {hoverItem.day}</div>
              {hoverItem.forecast && (
                <div className="mb-1">
                  <div className="flex items-center justify-between gap-3 mb-0.5">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-violet-400" /><span className="text-[9px] text-gray-300 font-bold">Forecast</span></div>
                    <span className="text-[10px] font-black text-violet-400">{hoverItem.forecast.avgWeight.toLocaleString()} g</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[8px] text-gray-400 pl-3.5">Total flock</span>
                    <span className="text-[9px] font-black text-violet-300">{hoverItem.forecast.totalWeight.toLocaleString()} kg</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[8px] text-gray-400 pl-3.5">FCR</span>
                    <span className="text-[9px] font-black text-violet-300">{hoverItem.forecast.fcr}</span>
                  </div>
                </div>
              )}
              {hoverItem.recorded && (
                <div className="border-t border-white/10 pt-1 mt-1">
                  <div className="flex items-center justify-between gap-3 mb-0.5">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[9px] text-gray-300 font-bold">Recorded</span></div>
                    <span className="text-[10px] font-black text-emerald-400">{hoverItem.recorded.averageWeight} g</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[8px] text-gray-400 pl-3.5">Pen</span>
                    <span className="text-[9px] font-black text-emerald-300">{hoverItem.recorded.pen}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ minWidth: 480 }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverItem(null)}>
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#f3f4f6" strokeWidth="1.2" />
                <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af" fontWeight="700">
                  {t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : t.val.toFixed(0)}
                </text>
              </g>
            ))}
            <line x1={PAD.left} y1={targetY} x2={W - PAD.right} y2={targetY} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="5,4" opacity="0.7" />
            <text x={W - PAD.right + 3} y={targetY + 3.5} fontSize="8" fill="#ef4444" fontWeight="900">{weightCfg.targetWeight}g</text>
            <path d={forecastArea} fill="rgba(139,92,246,0.08)" />
            <path d={forecastPath} fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeDasharray="6,3" strokeLinejoin="round" strokeLinecap="round" />
            {forecastParsed.map(f => (
              <circle key={`fc-${f.day}`} cx={xPos(f.day)} cy={yPos(f.avgWeight)}
                r={hoverItem?.day === f.day ? 6 : 4} fill="#7c3aed" stroke="white" strokeWidth="1.5" />
            ))}
            {hoverItem && (
              <line x1={xPos(hoverItem.day)} y1={PAD.top} x2={xPos(hoverItem.day)} y2={PAD.top + cH}
                stroke="#374151" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
            )}
            {weightLogs.map((l, i) => {
              const day = l.batchDay || 0;
              const val = parseFloat(l.averageWeight) || 0;
              if (!day || !val) return null;
              const overTarget = val > weightCfg.targetWeight;
              return (
                <g key={`rec-${i}`}>
                  <circle cx={xPos(day)} cy={yPos(val)} r={hoverItem?.day === day ? 8 : 6}
                    fill={overTarget ? '#ef4444' : '#10b981'} stroke="white" strokeWidth="2" />
                  <text x={xPos(day)} y={yPos(val) - 10} textAnchor="middle" fontSize="8"
                    fill={overTarget ? '#b91c1c' : '#065f46'} fontWeight="900">{val}g</text>
                </g>
              );
            })}
            {[1, 5, 10, 15, 20, 25, 30].map(d => (
              <text key={d} x={xPos(d)} y={H - 8} textAnchor="middle" fontSize="9"
                fill={hoverItem?.day === d ? '#374151' : '#9ca3af'} fontWeight={hoverItem?.day === d ? '900' : '700'}>
                Day {d}
              </text>
            ))}
            <line x1={xPos(todayDay)} y1={PAD.top} x2={xPos(todayDay)} y2={PAD.top + cH} stroke="#8B1A1A" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.6" />
            <line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="#e5e7eb" strokeWidth="1" />
          </svg>

          <div className="flex items-center gap-5 mt-2 px-2 justify-end flex-wrap">
            <div className="flex items-center gap-1.5">
              <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#7c3aed" strokeWidth="2" strokeDasharray="6,3"/></svg>
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Forecast (g/bird)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow" />
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Recorded (g/bird)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5,4"/></svg>
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Target ({weightCfg.targetWeight}g)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#8B1A1A" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Today</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="p-1 bg-emerald-50 text-emerald-600 rounded"><TrendingUp size={12} /></div>
          <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Recorded Weight Logs</h3>
        </div>
        {weightLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-gray-300">
            <Scale size={22} className="mb-1.5" />
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">No approved weight records yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[9px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Day','Date','Pen','Avg Weight','vs Forecast','Remarks','Status'].map(h => (
                    <th key={h} className="text-left pb-2 font-black text-gray-400 uppercase tracking-widest pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weightLogs.map((l, i) => {
                  const fc = forecastParsed.find(f => f.day === l.batchDay);
                  const diff = fc ? parseFloat(l.averageWeight) - fc.avgWeight : null;
                  const overTarget = parseFloat(l.averageWeight) > weightCfg.targetWeight;
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-1.5 pr-3"><span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-black">Day {l.batchDay || '—'}</span></td>
                      <td className="py-1.5 pr-3 text-gray-500 font-bold">{l.dateLabel || '—'}</td>
                      <td className="py-1.5 pr-3 font-bold text-gray-700">{l.pen || '—'}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`font-black ${overTarget ? 'text-red-600' : 'text-emerald-600'}`}>{parseFloat(l.averageWeight).toLocaleString()} g</span>
                        {overTarget && <span className="ml-1 text-[7.5px] font-black text-red-500 bg-red-50 px-1 py-0.5 rounded">⚠ over target</span>}
                      </td>
                      <td className="py-1.5 pr-3">
                        {diff !== null ? (
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(0)}g
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-500 font-bold">{l.remarks || '—'}</td>
                      <td className="py-1.5"><span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-black text-[8px] uppercase">{l.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="p-1 bg-violet-50 text-violet-600 rounded"><Scale size={12} /></div>
          <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Weight Forecast Schedule</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['Day','Avg Weight','Total Flock','FCR','Phase','Recorded'].map(h => (
                  <th key={h} className="text-left pb-2 font-black text-gray-400 uppercase tracking-widest pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecastParsed.map((f, i) => {
                const rec = logsByDay[f.day];
                const phase = f.day <= 12 ? 'Booster' : f.day <= 23 ? 'Starter' : 'Finisher';
                const phaseColor = { Booster: 'text-orange-600 bg-orange-50', Starter: 'text-blue-600 bg-blue-50', Finisher: 'text-purple-600 bg-purple-50' }[phase];
                const atTarget = f.avgWeight >= weightCfg.targetWeight;
                return (
                  <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${rec ? 'bg-emerald-50/30' : ''}`}>
                    <td className="py-1.5 pr-4 font-black text-indigo-700">{f.day}</td>
                    <td className="py-1.5 pr-4">
                      <span className={`font-black ${atTarget ? 'text-[#8B1A1A]' : 'text-violet-600'}`}>{f.avgWeight.toLocaleString()} g</span>
                      {atTarget && <span className="ml-1 text-[7.5px] font-black text-[#8B1A1A] bg-red-50 px-1 py-0.5 rounded">🎯 harvest</span>}
                    </td>
                    <td className="py-1.5 pr-4 font-bold text-gray-600">{f.totalWeight.toLocaleString()} kg</td>
                    <td className="py-1.5 pr-4 font-bold text-gray-500">{f.fcr}</td>
                    <td className="py-1.5 pr-4"><span className={`px-1.5 py-0.5 rounded font-black text-[8px] uppercase ${phaseColor}`}>{phase}</span></td>
                    <td className="py-1.5">
                      {rec
                        ? <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">✓ {rec.averageWeight}g</span>
                        : <span className="text-[8px] text-gray-300 font-bold">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── TABS ──────────────────────────────────────────────────────
const TABS = [
  { id: 'performance', label: 'Batch Performance',  icon: ChickenIcon },
  { id: 'financial',   label: 'Financial Overview', icon: Banknote    },
  { id: 'weight',      label: 'Weight',             icon: Scale       },
  { id: 'feed',        label: 'Feed Management',    icon: FeedIcon    },
  { id: 'vitamins',    label: 'Vitamin Management', icon: VitaminIcon },
  { id: 'pens',        label: 'Pen Management',     icon: LayoutGrid  },
];

// ── MAIN ──────────────────────────────────────────────────────
const RealDashboard = () => {
  const [activeTab, setActiveTab] = useState('performance');
  const [activeBatch, setActiveBatch] = useState(null);

  // ── ALL THREE CONFIGS USE usePersistentState ───────────────
  // Changes are written to localStorage immediately on Save and
  // restored automatically on every page load / tab switch.
  const [feedCfg, setFeedCfg] = usePersistentState('rdb_feedCfg', { kgPerBag: 50, fcr: 1.5 });
  const [weightCfg, setWeightCfg] = usePersistentState('rdb_weightCfg', { startWeight: 45, targetWeight: 1500, fcrOverride: '', useActualFeed: true });
  // penConfig populations are user-managed; Firebase only seeds them
  // when the user has NOT saved anything yet (populations is empty {}).
  const [penConfig, setPenConfig] = usePersistentState('rdb_penCfg', { penCount: 10, populations: {} });

  const [metrics, setMetrics] = useState({
    personnel: 0, technicians: 0, population: 0, mortality: 0,
    feed: 0, vitamins: 0, water: 0, weight: 0,
    expenses: 0, sales: 0, startingPop: 0,
  });
  const [pens, setPens] = useState([]);
  const [dailyData, setDailyData] = useState({});
  const [feedLogsByDay, setFeedLogsByDay] = useState({});
  const [pensByDay, setPensByDay] = useState({});
  const [expenseList, setExpenseList] = useState([]);
  const [salesList, setSalesList] = useState([]);
  const [weightForecast, setWeightForecast] = useState([]);
  const [weightLogs, setWeightLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPenConfig, setShowPenConfig] = useState(false);
  const [penConfigDraft, setPenConfigDraft] = useState(penConfig);
  const [infoPen, setInfoPen] = useState(null);

  const closeModal  = (setter) => { setter(null); document.body.style.overflow = ''; };
  const openConfig  = () => { setPenConfigDraft(JSON.parse(JSON.stringify(penConfig))); setShowPenConfig(true); document.body.style.overflow = 'hidden'; };
  const closeConfig = () => { setShowPenConfig(false); document.body.style.overflow = ''; };

  useEffect(() => {
    const db = getDatabase();

    const unsubUsers = onValue(ref(db, 'users'), (snap) => {
      let p = 0, t = 0;
      if (snap.exists()) {
        Object.values(snap.val()).forEach(u => {
          const r = (u.role || '').toLowerCase();
          if (r === 'personnel' || r === 'personel') p++;
          if (r === 'technician' || r === 'tech' || r === 'user') t++;
        });
      }
      setMetrics(m => ({ ...m, personnel: p, technicians: t }));
    });

    const unsubBatch = onValue(ref(db, 'global_batches'), (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const batchData = snap.val();
      const active = Object.values(batchData).find(b => b.status === 'active');
      if (!active) { setActiveBatch(null); setLoading(false); return; }

      setActiveBatch(active);
      const batchStart = active.dateCreated;

      let mort = 0, feed = 0, vit = 0, water = 0, weight = 0, maxDay = -1;
      const byDay = {};
      const feedByDay = {};

      const addDay = (log, key, val) => {
        const d = getDayNumber(log, batchStart);
        if (!d) return;
        if (!byDay[d]) byDay[d] = { feed: 0, vitamins: 0, water: 0 };
        byDay[d][key] += val;
      };

      const addFeedByDay = (log, val) => {
        const d = getDayNumber(log, batchStart);
        if (!d) return;
        feedByDay[d] = (feedByDay[d] || 0) + val;
      };

      let pensArray = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1, mortality: 0, feed: 0, vitamins: 0, water: 0,
      }));

      const penDayMap = {};
      for (let i = 1; i <= 10; i++) penDayMap[i] = {};

      const addToPen = (penKey, type, val) => {
        const match = penKey.match(/\d+/);
        if (match) {
          const idx = parseInt(match[0], 10) - 1;
          if (idx >= 0 && idx < 10) pensArray[idx][type] += val;
        }
      };

      const addToPenDay = (penKey, log, key, val) => {
        const match = penKey.match(/\d+/);
        if (!match) return;
        const penId = parseInt(match[0], 10);
        if (penId < 1 || penId > 10) return;
        const day = getDayNumber(log, batchStart);
        if (!day) return;
        if (!penDayMap[penId][day]) penDayMap[penId][day] = { feed: 0, vitamins: 0, water: 0 };
        penDayMap[penId][day][key] = (penDayMap[penId][day][key] || 0) + val;
      };

      if (active.mortality_logs) {
        Object.entries(active.mortality_logs).forEach(([penKey, penLogs]) => {
          Object.values(penLogs).forEach(log => {
            if (log.status === 'approved') {
              const val = (parseFloat(log.am) || 0) + (parseFloat(log.pm) || 0);
              mort += val;
              addToPen(penKey, 'mortality', val);
            }
          });
        });
      }

      if (active.feed_logs) {
        Object.entries(active.feed_logs).forEach(([penKey, penLogs]) => {
          Object.values(penLogs).forEach(log => {
            if (log.status === 'approved') {
              const val = (parseFloat(log.am) || 0) + (parseFloat(log.pm) || 0);
              feed += val;
              addToPen(penKey, 'feed', val);
              addDay(log, 'feed', val);
              addToPenDay(penKey, log, 'feed', val);
              addFeedByDay(log, val);
            }
          });
        });
      }

      if (active.vitamin_logs) {
        Object.entries(active.vitamin_logs).forEach(([penKey, penLogs]) => {
          Object.values(penLogs).forEach(log => {
            if (log.status === 'approved') {
              const vitVal   = (parseFloat(log.am) || 0) + (parseFloat(log.pm) || 0);
              const waterVal = (parseFloat(log.water_am) || 0) + (parseFloat(log.water_pm) || 0);
              vit   += vitVal;
              water += waterVal;
              addToPen(penKey, 'vitamins', vitVal);
              addToPen(penKey, 'water',    waterVal);
              addDay(log, 'vitamins', vitVal);
              addDay(log, 'water',    waterVal);
              addToPenDay(penKey, log, 'vitamins', vitVal);
              addToPenDay(penKey, log, 'water',    waterVal);
            }
          });
        });
      }

      if (active.weight_logs) {
        Object.values(active.weight_logs).forEach(penLogs => {
          Object.values(penLogs).forEach(log => {
            const dayNum = parseInt(log.day) || 0;
            if (log.status === 'approved' && dayNum >= maxDay) {
              maxDay = dayNum;
              weight = parseFloat(log.averageWeight) || 0;
            }
          });
        });
      }

      setDailyData(byDay);
      setFeedLogsByDay(feedByDay);
      setMetrics(m => ({
        ...m,
        mortality: mort, feed, vitamins: vit, water, weight,
        startingPop: active.startingPopulation || 0,
        population: (active.startingPopulation || 0) - mort,
        expenses: Object.values(active.expenses || {}).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
        sales: Object.values(active.sales || {}).reduce((s, e) => s + (parseFloat(e.totalAmount) || 0), 0),
      }));
      setPens(pensArray);
      setPensByDay(penDayMap);
      setExpenseList(Object.values(active.expenses || {}));
      setSalesList(Object.values(active.sales || {}));
      setWeightForecast(active.weightForecast || []);

      const wlogs = [];
      Object.entries(active.weight_logs || {}).forEach(([penKey, penLogs]) => {
        Object.values(penLogs || {}).forEach(log => {
          if (log.status === 'approved') wlogs.push({ ...log, pen: penKey });
        });
      });
      wlogs.sort((a, b) => (a.batchDay || 0) - (b.batchDay || 0));
      setWeightLogs(wlogs);

      // ── SEED pen populations from Firebase ONLY if user has
      //    never saved their own pen config (populations is empty).
      //    This prevents Firebase re-fires from wiping user changes.
      setPenConfig(cfg => {
        const hasUserSavedPops = Object.keys(cfg.populations).length > 0;
        if (hasUserSavedPops) return cfg; // ← user's saved config wins
        const initPops = {};
        pensArray.forEach(p => {
          const cap = Math.floor((active.startingPopulation || 0) / pensArray.length);
          initPops[p.id] = Math.max(0, cap - p.mortality);
        });
        return { ...cfg, penCount: pensArray.length, populations: initPops };
      });

      setLoading(false);
    });

    return () => { unsubUsers(); unsubBatch(); };
  }, []);

  // Keep draft in sync with saved config when config changes externally
  useEffect(() => {
    setPenConfigDraft(JSON.parse(JSON.stringify(penConfig)));
  }, []); // only on mount — draft is always re-seeded from penConfig on openConfig()

  const currentBatchDay = useMemo(() => calculateDaysStrict(activeBatch?.dateCreated), [activeBatch]);

  if (loading) {
    const SkeletonCard = () => (
      <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 h-[72px] overflow-hidden relative shadow-sm">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 skeleton-shine" />
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-2.5 w-3/4 rounded-full bg-gray-200 skeleton-shine" />
          <div className="h-2 w-1/2 rounded-full bg-gray-200 skeleton-shine" />
        </div>
      </div>
    );
    const SkeletonChart = ({ h = 180 }) => (
      <div className="bg-white border border-gray-100 rounded-xl p-4 overflow-hidden relative shadow-sm" style={{ height: h }}>
        <div className="h-3 w-1/3 rounded-full bg-gray-200 skeleton-shine mb-4" />
        <div className="flex items-end gap-1.5 h-[calc(100%-40px)]">
          {[60,80,45,90,55,70,85,40,75,65,95,50,88,72,60,80,45,90,55,70].map((pct, i) => (
            <div key={i} className="flex-1 rounded-t bg-gray-200 skeleton-shine" style={{ height: `${pct}%` }} />
          ))}
        </div>
      </div>
    );
    const SkeletonTabBar = () => (
      <div className="flex gap-2 mb-2">
        {[90, 110, 72, 120, 140, 100].map((w, i) => (
          <div key={i} className="h-7 rounded-lg bg-gray-200 skeleton-shine flex-shrink-0" style={{ width: w }} />
        ))}
      </div>
    );

    return (
      <div className="flex flex-col gap-3 animate-fade-in">
        <style>{`
          @keyframes skeleton-shimmer {
            0%   { background-position: -600px 0; }
            100% { background-position:  600px 0; }
          }
          .skeleton-shine {
            background-image: linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 40%, #ffffff 50%, #f3f4f6 60%, #e5e7eb 100%);
            background-size: 600px 100%;
            animation: skeleton-shimmer 1.4s infinite linear;
          }
          @keyframes fade-in { from { opacity:0 } to { opacity:1 } }
          .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        `}</style>

        <SkeletonTabBar />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>

        <SkeletonChart h={220} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonChart key={i} h={160} />)}
        </div>

        <div className="flex items-center justify-center gap-2 py-2">
          <div className="w-2 h-2 rounded-full bg-gray-300 skeleton-shine" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Syncing live data...</span>
        </div>
      </div>
    );
  }

  if (!activeBatch) {
    return (
      <div className="p-8 text-center bg-white rounded-lg border border-gray-200 shadow-sm mt-4">
        <h3 className="text-lg font-black text-red-900 uppercase">No Active Batch</h3>
        <p className="text-xs text-gray-500 mt-2">Create a new batch to start tracking performance.</p>
      </div>
    );
  }

  const profit = metrics.sales - metrics.expenses;
  const totalBiomassKg = metrics.population * (metrics.weight / 1000);
  const fcr = totalBiomassKg > 0 ? metrics.feed / totalBiomassKg : 0;
  const totalFeedCost = expenseList.filter(e => e.category === 'Feeds').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  return (
    <div className="flex flex-col gap-2 animate-fade-in">

      {/* ── TABS ── */}
      <div className="flex overflow-x-auto gap-2 mb-2 pb-1 no-scrollbar">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.id ? 'bg-[#8B1A1A] text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
            {tab.id === 'performance'
              ? <ChickenIcon size={14} inverted={activeTab === 'performance'} />
              : <tab.icon size={14} />}{tab.label}
          </button>
        ))}
      </div>

      {/* ── BATCH PERFORMANCE ── */}
      {activeTab === 'performance' && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MetricCard title="Personel"      value={metrics.personnel}   unit="Count"  icon={Users}        colorClass="text-blue-600"    bgClass="bg-blue-50"    />
            <MetricCard title="Technician"    value={metrics.technicians} unit="Count"  icon={ShieldCheck}  colorClass="text-indigo-600"  bgClass="bg-indigo-50"  />
            <MetricCard title="Population"    value={metrics.population}  unit="Heads"  icon={ChickenIcon}  colorClass="text-cyan-600"    bgClass="bg-cyan-50"    />
            <MetricCard title="Mortality"     value={metrics.mortality}   unit="Heads"  icon={TrendingDown} colorClass="text-red-600"     bgClass="bg-red-50"     />
            <MetricCard title="Feed Consumed" value={metrics.feed}        unit="kg"     icon={FeedIcon}     colorClass="text-orange-600"  bgClass="bg-orange-50"  />
            <MetricCard title="Vitamins"      value={metrics.vitamins}    unit="g/ml"   icon={Activity}     colorClass="text-emerald-600" bgClass="bg-emerald-50" />
            <MetricCard title="Water"         value={metrics.water}       unit="Liters" icon={WaterIcon}    colorClass="text-sky-500"     bgClass="bg-sky-50"     />
            <MetricCard title="FCR"           value={fcr}                 unit="Ratio"  icon={Scale}        colorClass="text-violet-600"  bgClass="bg-violet-50"  />
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5">
                <div className="p-1 bg-orange-50 text-orange-600 rounded"><Activity size={12} /></div>
                <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Daily Consumption — Day 1 to 30</h3>
              </div>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Day {Math.min(currentBatchDay, 30)} / 30</span>
            </div>
            <DailyLineChart dailyData={dailyData} currentBatchDay={currentBatchDay} />
          </div>
        </div>
      )}

      {/* ── FINANCIAL OVERVIEW ── */}
      {activeTab === 'financial' && (() => {
        const catMap = {};
        expenseList.forEach(e => {
          const cat = e.category || 'Other';
          catMap[cat] = (catMap[cat] || 0) + (parseFloat(e.amount) || 0);
        });
        const catEntries = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
        const catColors  = { Feeds: '#f97316', Vitamins: '#10b981', Items: '#6366f1', Medicine: '#ec4899', Other: '#9ca3af' };
        const totalExp   = catEntries.reduce((s,[,v]) => s+v, 0) || 1;

        const BAR_W = 700, BAR_H = 180;
        const BP = { top:16, right:16, bottom:36, left:64 };
        const bChartW = BAR_W - BP.left - BP.right;
        const bChartH = BAR_H - BP.top - BP.bottom;
        const barW = catEntries.length > 0 ? Math.min(60, (bChartW / catEntries.length) - 12) : 40;
        const bXpos = (i) => BP.left + (i + 0.5) * (bChartW / Math.max(catEntries.length,1));
        const bYpos = (v) => BP.top + bChartH - (v / totalExp) * bChartH;

        return (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MetricCard title="Total Expenses" value={metrics.expenses} unit="₱" icon={Receipt}    colorClass="text-rose-600"   bgClass="bg-rose-50"   />
              <MetricCard title="Total Sales"    value={metrics.sales}    unit="₱" icon={Banknote}   colorClass="text-teal-600"   bgClass="bg-teal-50"   />
              <MetricCard title="Net Profit"     value={profit}           unit="₱" icon={TrendingUp} colorClass={profit >= 0 ? "text-green-600" : "text-red-600"} bgClass={profit >= 0 ? "bg-green-50" : "bg-red-50"} />
              <MetricCard title="Feed Cost"      value={totalFeedCost}    unit="₱" icon={FeedIcon}   colorClass="text-orange-600" bgClass="bg-orange-50" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <div className="p-1 bg-rose-50 text-rose-600 rounded"><Receipt size={12} /></div>
                  <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Expenses by Category</h3>
                </div>
                {catEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                    <Receipt size={24} className="mb-2" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">No expenses logged</p>
                  </div>
                ) : (
                  <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="w-full" style={{ minWidth: 300 }}>
                    {[0, 0.25, 0.5, 0.75, 1].map((f,i) => {
                      const y = BP.top + bChartH*(1-f);
                      return (
                        <g key={i}>
                          <line x1={BP.left} y1={y} x2={BAR_W-BP.right} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                          <text x={BP.left-6} y={y+3.5} textAnchor="end" fontSize="9" fill="#9ca3af" fontWeight="700">
                            {(totalExp*f) >= 1000 ? `${((totalExp*f)/1000).toFixed(0)}k` : (totalExp*f).toFixed(0)}
                          </text>
                        </g>
                      );
                    })}
                    {catEntries.map(([cat, val], i) => {
                      const color = catColors[cat] || '#9ca3af';
                      const x = bXpos(i);
                      const bH = Math.max((val/totalExp)*bChartH, val>0?3:0);
                      const y = BP.top + bChartH - bH;
                      return (
                        <g key={cat}>
                          <rect x={x - barW/2} y={BP.top} width={barW} height={bChartH} rx="4" fill={color} opacity="0.08" />
                          <rect x={x - barW/2} y={y} width={barW} height={bH} rx="4" fill={color} opacity="0.9" />
                          <text x={x} y={Math.max(y-3, BP.top+10)} textAnchor="middle" fontSize="8.5" fill={color} fontWeight="900">
                            {val >= 1000 ? `₱${(val/1000).toFixed(0)}k` : `₱${val}`}
                          </text>
                          <text x={x} y={BAR_H-6} textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="700">{cat}</text>
                        </g>
                      );
                    })}
                    <line x1={BP.left} y1={BP.top+bChartH} x2={BAR_W-BP.right} y2={BP.top+bChartH} stroke="#e5e7eb" strokeWidth="1" />
                  </svg>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <div className="p-1 bg-indigo-50 text-indigo-600 rounded"><Scale size={12} /></div>
                  <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Expense Breakdown</h3>
                </div>
                {catEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                    <Scale size={24} className="mb-2" /><p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">No data</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {catEntries.map(([cat, val]) => {
                      const pct = Math.round((val/totalExp)*100);
                      const color = catColors[cat] || '#9ca3af';
                      return (
                        <div key={cat}>
                          <div className="flex justify-between items-center mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                              <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{cat}</span>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[10px] font-black" style={{ color }}>₱{val.toLocaleString()}</span>
                              <span className="text-[8px] font-bold text-gray-400">{pct}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-gray-100 flex justify-between">
                      <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Total</span>
                      <span className="text-[11px] font-black text-rose-600">₱{totalExp.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <div className="p-1 bg-gray-50 text-gray-600 rounded"><Receipt size={12} /></div>
                <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Expense Log</h3>
              </div>
              {expenseList.length === 0 ? (
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest text-center py-4">No records</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Date','Item','Category','Qty','Amount'].map(h => (
                          <th key={h} className="text-left pb-2 font-black text-gray-400 uppercase tracking-widest pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {expenseList.sort((a,b) => (a.date||'').localeCompare(b.date||'')).map((e,i) => {
                        const color = catColors[e.category] || '#9ca3af';
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="py-1.5 pr-3 text-gray-500 font-bold">{e.date || '—'}</td>
                            <td className="py-1.5 pr-3 font-bold text-gray-700">{e.itemName || '—'}</td>
                            <td className="py-1.5 pr-3">
                              <span className="px-1.5 py-0.5 rounded font-black text-[8px] uppercase" style={{ background: color+'18', color }}>
                                {e.category || '—'}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-gray-500 font-bold">{e.quantity ? `${e.quantity} ${e.unit||''}` : '—'}</td>
                            <td className="py-1.5 font-black text-rose-600">₱{(parseFloat(e.amount)||0).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {salesList.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <div className="p-1 bg-teal-50 text-teal-600 rounded"><Banknote size={12} /></div>
                  <h3 className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Sales Log</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Date','Buyer','Qty','Price/head','Total'].map(h => (
                          <th key={h} className="text-left pb-2 font-black text-gray-400 uppercase tracking-widest pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {salesList.map((s,i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-1.5 pr-3 text-gray-500 font-bold">{s.dateOfPurchase || '—'}</td>
                          <td className="py-1.5 pr-3 font-bold text-gray-700">{s.buyerName || '—'}</td>
                          <td className="py-1.5 pr-3 text-gray-500 font-bold">{s.quantity?.toLocaleString() || '—'}</td>
                          <td className="py-1.5 pr-3 text-gray-500 font-bold">₱{(parseFloat(s.pricePerChicken)||0).toLocaleString()}</td>
                          <td className="py-1.5 font-black text-teal-600">₱{(parseFloat(s.totalAmount)||0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── WEIGHT ── */}
      {activeTab === 'weight' && (
        <WeightTab
          weightForecast={weightForecast}
          weightLogs={weightLogs}
          activeBatch={activeBatch}
          currentBatchDay={currentBatchDay}
          feedLogsByDay={feedLogsByDay}
          weightCfg={weightCfg}
          setWeightCfg={setWeightCfg}
        />
      )}

      {/* ── FEED MANAGEMENT ── */}
      {activeTab === 'feed' && (
        <FeedManagementTab
          activeBatch={activeBatch}
          feedLogsByDay={feedLogsByDay}
          currentBatchDay={currentBatchDay}
          feedCfg={feedCfg}
          setFeedCfg={setFeedCfg}
        />
      )}

      {/* ── VITAMIN MANAGEMENT ── */}
      {activeTab === 'vitamins' && (
        <VitaminManagementTab 
          activeBatch={activeBatch}
          dailyData={dailyData}
          currentBatchDay={currentBatchDay}
        />
      )}

      {/* ── PEN MANAGEMENT ── */}
      {activeTab === 'pens' && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <div className="p-1 bg-indigo-100 text-indigo-700 rounded"><LayoutGrid size={12} /></div>
              <h3 className="text-[9px] font-black text-indigo-900 uppercase tracking-widest">Pen Distribution Monitor — Day 1 to 30</h3>
            </div>
            <button onClick={openConfig}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#8B1A1A] hover:bg-[#6B1111] text-white rounded-lg text-[9px] font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95">
              <Settings size={11} /> Configure
            </button>
          </div>

          {showPenConfig && createPortal(
            <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={(e) => { if (e.target === e.currentTarget) closeConfig(); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col border border-gray-100 max-h-[90vh]">
                <div className="bg-[#8B1A1A] px-5 py-4 flex items-center justify-between shrink-0 rounded-t-2xl">
                  <div className="flex items-center gap-2 text-white">
                    <Settings size={16} />
                    <h2 className="font-black text-sm uppercase tracking-wider">Pen Configuration</h2>
                  </div>
                  <button onClick={closeConfig} className="p-1.5 hover:bg-[#6B1111] rounded-full text-white transition"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-5 overflow-y-auto">
                  <div>
                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Number of Pens</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setPenConfigDraft(d => ({ ...d, penCount: Math.max(1, d.penCount - 1) }))}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition font-bold"><Minus size={14} /></button>
                      <span className="text-2xl font-black text-indigo-700 w-8 text-center">{penConfigDraft.penCount}</span>
                      <button onClick={() => setPenConfigDraft(d => ({ ...d, penCount: Math.min(20, d.penCount + 1) }))}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center transition font-bold"><Plus size={14} /></button>
                      <span className="text-[9px] text-gray-400 font-bold uppercase">Max 20 pens</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-3">Population per Pen</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from({ length: penConfigDraft.penCount }, (_, i) => {
                        const penId = i + 1;
                        const val = penConfigDraft.populations[penId] ?? Math.floor((metrics.startingPop || 0) / penConfigDraft.penCount);
                        return (
                          <div key={penId} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                            <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
                              <span className="text-[9px] font-black text-indigo-700">{penId}</span>
                            </div>
                            <span className="text-[9px] font-bold text-gray-500 uppercase w-8">Pen {penId}</span>
                            <input type="number" min="0" value={val}
                              onChange={e => { const nv = parseInt(e.target.value) || 0; setPenConfigDraft(d => ({ ...d, populations: { ...d.populations, [penId]: nv } })); }}
                              className="flex-1 bg-white border border-gray-200 rounded-md px-2 py-1 text-xs font-black text-indigo-700 text-right focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 w-0 min-w-0" />
                            <span className="text-[8px] text-gray-400 font-bold shrink-0">hd</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0 bg-gray-50 rounded-b-2xl">
                  <button onClick={closeConfig} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-100 transition">Cancel</button>
                  {/* ── SAVE: calls persistent setter, writes to localStorage ── */}
                  <button onClick={() => { setPenConfig(JSON.parse(JSON.stringify(penConfigDraft))); closeConfig(); }}
                    className="flex-1 py-2.5 bg-[#8B1A1A] hover:bg-[#6B1111] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 active:scale-95">
                    <Save size={13} /> Save Changes
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {infoPen && createPortal(
            <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={(e) => { if (e.target === e.currentTarget) closeModal(setInfoPen); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100">
                <div className="bg-[#8B1A1A] px-5 py-4 flex items-center justify-between rounded-t-2xl">
                  <div className="flex items-center gap-2 text-white">
                    <div className="w-7 h-7 rounded-lg bg-[#6B1111] flex items-center justify-center">
                      <span className="text-xs font-black">{infoPen.id}</span>
                    </div>
                    <h2 className="font-black text-sm uppercase tracking-wider">Pen {infoPen.id} — Summary</h2>
                  </div>
                  <button onClick={() => closeModal(setInfoPen)} className="p-1.5 hover:bg-[#6B1111] rounded-full text-white transition"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { label: 'Total Population', value: (penConfig.populations[infoPen.id] ?? Math.max(0, Math.floor((metrics.startingPop || 0) / penConfig.penCount) - infoPen.mortality)).toLocaleString(), unit: 'heads', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                    { label: 'Mortality',         value: infoPen.mortality.toLocaleString(),                                                                                                                                                                                                                unit: 'heads', color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-100'    },
                    { label: 'Total Feed',        value: (infoPen.feed || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }),                                                                                                                                                                        unit: 'kg',    color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
                    { label: 'Total Vitamins',    value: (infoPen.vitamins || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }),                                                                                                                                                                    unit: 'g/ml',  color: 'text-emerald-600',bg: 'bg-emerald-50',border: 'border-emerald-100'},
                    { label: 'Total Water',       value: (infoPen.water || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }),                                                                                                                                                                       unit: 'L',     color: 'text-sky-500',    bg: 'bg-sky-50',    border: 'border-sky-100'    },
                  ].map(row => (
                    <div key={row.label} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${row.bg} ${row.border}`}>
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{row.label}</span>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-base font-black ${row.color}`}>{row.value}</span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase">{row.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-5">
                  <button onClick={() => closeModal(setInfoPen)} className="w-full py-2.5 bg-[#8B1A1A] hover:bg-[#6B1111] text-white text-xs font-bold rounded-xl shadow-md transition active:scale-95">Close</button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {Array.from({ length: Math.ceil(penConfig.penCount / 2) }, (_, rowIdx) => {
            const penA = pens[rowIdx * 2];
            const penB = pens[rowIdx * 2 + 1];
            const capacity = penConfig.penCount > 0 ? Math.floor((metrics.startingPop || 0) / penConfig.penCount) : 0;

            const PEN_LINES = [
              { key: 'feed',       label: 'Feed',     unit: 'kg', stroke: '#f97316', areafill: 'rgba(249,115,22,0.10)' },
              { key: 'vitamins',   label: 'Vitamins', unit: 'g',  stroke: '#10b981', areafill: 'rgba(16,185,129,0.10)' },
              { key: 'water',      label: 'Water',    unit: 'L',  stroke: '#38bdf8', areafill: 'rgba(56,189,248,0.10)' },
              { key: 'population', label: 'Pop',      unit: 'hd', stroke: '#6366f1', areafill: 'rgba(99,102,241,0.10)' },
            ];

            const PenLineChart = ({ pen }) => {
              const [hoverDay, setHoverDay] = useState(null);
              const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
              const svgRef = useRef(null);
              if (!pen) return null;

              const penDayData = pensByDay[pen.id] || {};
              const days = Array.from({ length: 30 }, (_, i) => i + 1);
              const getVal = (day, key) => {
                if (key === 'population') return penConfig.populations[pen.id] ?? Math.max(0, capacity - pen.mortality);
                return (penDayData[day] || {})[key] || 0;
              };

              const lineMax = {};
              PEN_LINES.forEach(l => {
                const vals = days.map(d => getVal(d, l.key));
                lineMax[l.key] = Math.max(...vals, 1);
              });

              const W = 500, H = 160;
              const PAD = { top: 16, right: 14, bottom: 30, left: 42 };
              const chartW = W - PAD.left - PAD.right;
              const chartH = H - PAD.top - PAD.bottom;
              const xPos = (day) => PAD.left + ((day - 1) / 29) * chartW;
              const yPos = (val, key) => PAD.top + chartH - (val / lineMax[key]) * chartH;

              const makePath = (key) =>
                days.map((d, i) => {
                  const val = getVal(d, key);
                  return `${i === 0 ? 'M' : 'L'}${xPos(d).toFixed(1)},${yPos(val, key).toFixed(1)}`;
                }).join(' ');

              const makeArea = (key) => {
                const pts = days.map(d => `${xPos(d).toFixed(1)},${yPos(getVal(d, key), key).toFixed(1)}`).join(' L');
                const base = yPos(0, key).toFixed(1);
                return `M${xPos(1).toFixed(1)},${base} L${pts} L${xPos(30).toFixed(1)},${base} Z`;
              };

              const overallMax = Math.max(...Object.values(lineMax));
              const yTicks = [0, 0.5, 1].map(f => ({ val: overallMax * f, y: PAD.top + chartH - f * chartH }));
              const todayDay = Math.min(currentBatchDay, 30);

              const handleMouseMove = (e) => {
                const svg = svgRef.current;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const scaleX = W / rect.width;
                const mouseX = (e.clientX - rect.left) * scaleX;
                const rawDay = ((mouseX - PAD.left) / chartW) * 29 + 1;
                setHoverDay(Math.min(30, Math.max(1, Math.round(rawDay))));
                setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              };

              return (
                <div className="relative w-full">
                  {hoverDay && (
                    <div className="absolute z-50 pointer-events-none bg-[#1a1a1a] text-white rounded-xl shadow-2xl px-3 py-2 border border-white/10"
                      style={{ left: tooltipPos.x > 180 ? tooltipPos.x - 140 : tooltipPos.x + 12, top: Math.max(2, tooltipPos.y - 60), minWidth: 128 }}>
                      <div className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1.5 border-b border-white/10 pb-1">📅 Day {hoverDay}</div>
                      {PEN_LINES.map(l => (
                        <div key={l.key} className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: l.stroke }} />
                            <span className="text-[8px] text-gray-300 font-bold">{l.label}</span>
                          </div>
                          <span className="text-[9px] font-black" style={{ color: l.stroke }}>
                            {getVal(hoverDay, l.key).toLocaleString(undefined, { maximumFractionDigits: 1 })} {l.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ minWidth: 280 }}
                    onMouseMove={handleMouseMove} onMouseLeave={() => setHoverDay(null)}>
                    {yTicks.map((t, i) => (
                      <g key={i}>
                        <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#f3f4f6" strokeWidth="1" />
                        <text x={PAD.left - 6} y={t.y + 3.5} textAnchor="end" fontSize="8" fill="#9ca3af" fontWeight="700">
                          {t.val >= 1000 ? `${(t.val/1000).toFixed(1)}k` : t.val.toFixed(t.val > 0 && t.val < 10 ? 1 : 0)}
                        </text>
                      </g>
                    ))}
                    {PEN_LINES.map(l => <path key={`a-${l.key}`} d={makeArea(l.key)} fill={l.areafill} />)}
                    {PEN_LINES.map(l => <path key={`l-${l.key}`} d={makePath(l.key)} fill="none" stroke={l.stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />)}
                    {hoverDay && <line x1={xPos(hoverDay)} y1={PAD.top} x2={xPos(hoverDay)} y2={PAD.top + chartH} stroke="#374151" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />}
                    {PEN_LINES.map(l =>
                      days.filter(d => getVal(d, l.key) > 0 && l.key !== 'population').map(d => (
                        <circle key={`d-${l.key}-${d}`} cx={xPos(d)} cy={yPos(getVal(d, l.key), l.key)}
                          r={hoverDay === d ? 4.5 : 2.5} fill={l.stroke} stroke="white" strokeWidth="1.2" />
                      ))
                    )}
                    {[1, 10, 20, 30].map(d => (
                      <text key={d} x={xPos(d)} y={H - 6} textAnchor="middle" fontSize="8"
                        fill={hoverDay === d ? '#374151' : '#9ca3af'} fontWeight={hoverDay === d ? '900' : '700'}>D{d}</text>
                    ))}
                    <line x1={xPos(todayDay)} y1={PAD.top} x2={xPos(todayDay)} y2={PAD.top + chartH} stroke="#8B1A1A" strokeWidth="1" strokeDasharray="4,3" opacity="0.55" />
                    <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="#e5e7eb" strokeWidth="1" />
                  </svg>
                  <div className="flex items-center gap-3 mt-1 justify-end flex-wrap px-1">
                    {PEN_LINES.map(l => (
                      <div key={l.key} className="flex items-center gap-1">
                        <div className="w-4 h-[2px] rounded-full" style={{ background: l.stroke }} />
                        <span className="text-[7.5px] font-bold text-gray-400 uppercase">{l.label} ({l.unit})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            };

            return (
              <div key={rowIdx} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[penA, penB].map((pen) => pen && (
                  <div key={pen.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:border-indigo-200 transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <span className="text-[9px] font-black text-indigo-700">{pen.id}</span>
                        </div>
                        <span className="text-xs font-black text-indigo-900 uppercase tracking-widest">Pen {pen.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold text-gray-400 uppercase">
                          Pop: <span className="text-indigo-600">{(penConfig.populations[pen.id] ?? Math.max(0, capacity - pen.mortality)).toLocaleString()}</span>
                        </span>
                        <span className="text-[7.5px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">{pen.mortality} dead</span>
                        <button
                          onClick={() => { setInfoPen(pen); document.body.style.overflow = 'hidden'; }}
                          className="p-1 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-500 hover:text-indigo-700 transition-colors"
                          title="View pen summary">
                          <Info size={13} />
                        </button>
                      </div>
                    </div>
                    <PenLineChart pen={pen} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default RealDashboard;