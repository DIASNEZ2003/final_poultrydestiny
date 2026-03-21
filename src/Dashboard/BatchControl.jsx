// src/Dashboard/BatchControl.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase'; 
import { ref, onValue, push, set, update, remove, get } from 'firebase/database';
import { 
  Calendar, Users, ClipboardList, 
  Archive, Trash2, CheckCircle, PlusCircle, 
  AlertTriangle, Check, Search, X, Filter, Edit2, Play, Loader2
} from 'lucide-react';

// ==========================================
// 1. FORECASTING & MATH ENGINE (Untouched)
// ==========================================
const getFeedLogic = (day) => {
  if (day <= 1) return { grams: 35.0, type: "Booster" };
  if (day <= 3) return { grams: 35.0, type: "Booster" };
  if (day <= 6) return { grams: 45.0, type: "Booster" };
  if (day <= 10) return { grams: 55.0, type: "Booster" };
  if (day <= 14) return { grams: 85.0, type: "Starter" };
  if (day <= 20) return { grams: 115.0, type: "Starter" };
  if (day <= 25) return { grams: 145.0, type: "Finisher" };
  return { grams: 170.0, type: "Finisher" };
};

const getEstimatedFCR = (day) => {
  if (day <= 5) return 1.3;
  if (day <= 12) return 1.4;
  if (day <= 21) return 1.5;
  return 1.7;
};

const generateForecastData = (pop) => {
  let forecast = [];
  for (let day = 1; day <= 30; day++) {
    const logic = getFeedLogic(day);
    const targetKilos = (logic.grams * pop) / 1000.0;
    forecast.push({
      day: day,
      feedType: logic.type,
      targetKilos: Number(targetKilos.toFixed(2)),
      gramsPerBird: logic.grams
    });
  }
  return forecast;
};

const generatePenPopulations = (pop, pens) => {
  let pCount = pens <= 0 ? 1 : pens;
  let perPen = Math.floor(pop / pCount);
  let remainder = pop % pCount;
  let result = {};
  for (let i = 1; i <= pCount; i++) {
    result[`pen_${i}`] = i <= remainder ? perPen + 1 : perPen;
  }
  return result;
};

const generatePenForecasts = (forecast, penPops) => {
  let penForecasts = {};
  for (let [penId, pop] of Object.entries(penPops)) {
    penForecasts[penId] = {};
    for (let f of forecast) {
      const kilos = Number(((pop * f.gramsPerBird) / 1000.0).toFixed(2));
      penForecasts[penId][`day_${f.day}`] = { targetKilos: kilos, feedType: f.feedType };
    }
  }
  return penForecasts;
};

const generateWeightForecast = (startWeight, pop, feedForecast) => {
  let weightData = [];
  let currentWeightG = startWeight;
  const targetDays = [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30]; 
  
  for (let day = 1; day <= 30; day++) {
    const f = feedForecast.find(x => x.day === day);
    if (f) {
      const fcr = getEstimatedFCR(day);
      const dailyGain = f.gramsPerBird / fcr;
      currentWeightG += dailyGain;
      if (targetDays.includes(day)) {
        const totalKilos = (currentWeightG * pop) / 1000.0;
        weightData.push({
          day: `Day ${day}`,
          weight: Number(totalKilos.toFixed(2)),
          avgWeight: Math.floor(currentWeightG),
          fcr: fcr,
          unit: "kg"
        });
      }
    }
  }
  return weightData;
};

// ==========================================
// 2. COMPACT MODALS
// ==========================================
const SuccessModal = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-[140] animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl p-5 w-72 text-center border border-gray-200">
        <div className="mx-auto flex items-center justify-center h-10 w-10 rounded-full bg-green-50 mb-3 border border-green-100">
          <Check className="h-5 w-5 text-green-600" />
        </div>
        <h3 className="text-sm font-black text-gray-800 mb-1">Success</h3>
        <p className="text-xs text-gray-500 mb-5 font-medium">{message}</p>
        <button 
          onClick={onClose}
          className="w-full bg-red-900 text-white text-xs font-bold rounded-lg px-3 py-2 hover:bg-red-800 transition-all active:scale-95"
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
};

const ConfirmModal = ({ isOpen, type, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  let config = {
    title: "Confirm Action", message: "Are you sure?", btnColor: "bg-red-600",
    icon: <AlertTriangle className="h-5 w-5 text-orange-500" />, iconBg: "bg-orange-50", btnText: "Confirm"
  };

  if (type === 'create' || type === 'update') {
    config = {
      title: type === 'create' ? "Start New Batch" : "Save Changes",
      message: "Please verify all details before proceeding. Status will be auto-assigned.",
      btnColor: "bg-green-600 hover:bg-green-700", icon: <PlusCircle className="h-5 w-5 text-green-600" />,
      iconBg: "bg-green-50", btnText: type === 'create' ? "Create" : "Save"
    };
  } else if (type === 'activate') {
    config = {
      title: "Set as Active",
      message: "This will set this batch as the active cycle. The current active batch will be deactivated.",
      btnColor: "bg-red-900 hover:bg-red-800", icon: <Play className="h-5 w-5 text-red-900" />,
      iconBg: "bg-red-50", btnText: "Activate"
    };
  } else if (type === 'complete') {
    config = {
      title: "Archive Batch",
      message: "Moves the batch to history and automatically activates the next waiting batch.",
      btnColor: "bg-gray-800 hover:bg-gray-900", icon: <Archive className="h-5 w-5 text-gray-700" />,
      iconBg: "bg-gray-100", btnText: "Archive"
    };
  } else if (type === 'delete') {
    config = {
      title: "Delete Record",
      message: "This is permanent. All related records will be deleted.",
      btnColor: "bg-red-600 hover:bg-red-700", icon: <Trash2 className="h-5 w-5 text-red-600" />,
      iconBg: "bg-red-50", btnText: "Delete"
    };
  }

  return (
    <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-[150] p-4">
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-xs border border-gray-200 text-center ring-1 ring-black/5">
        <div className={`mx-auto flex items-center justify-center h-10 w-10 rounded-full ${config.iconBg} mb-3 border`}>
          {config.icon}
        </div>
        <h3 className="text-sm font-black text-gray-800 mb-1">{config.title}</h3>
        <p className="text-[11px] text-gray-500 mb-5 leading-relaxed">{config.message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 bg-gray-100 border border-transparent text-gray-700 font-bold py-2 rounded-lg text-[10px] uppercase hover:bg-gray-200 transition-colors">Cancel</button>
          <button onClick={onConfirm} className={`flex-1 text-white font-bold py-2 rounded-lg text-[10px] uppercase shadow-md transition-colors ${config.btnColor}`}>{config.btnText}</button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
const BatchControl = () => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); 
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTargetId, setEditTargetId] = useState(null);

  const [successMessage, setSuccessMessage] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null, targetId: null });
  const [formData, setFormData] = useState({ batchName: '', dateCreated: '', expectedCompleteDate: '', startingPopulation: '', status: 'active' });

  // Real-time Firebase Listener
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const batchesRef = ref(db, 'global_batches');
        const unsubscribeDb = onValue(batchesRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            const batchList = Object.entries(data)
              .map(([id, val]) => ({ id, ...val }))
              .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
            setBatches(batchList);
          } else {
            setBatches([]);
          }
          setLoading(false);
        });
        return () => unsubscribeDb();
      } else {
        setBatches([]);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    let calculatedEndDate = formData.expectedCompleteDate; 
    if (newDate) {
      const dateObj = new Date(newDate);
      dateObj.setDate(dateObj.getDate() + 30); 
      calculatedEndDate = dateObj.toISOString().split('T')[0]; 
    }
    setFormData({ ...formData, dateCreated: newDate, expectedCompleteDate: calculatedEndDate });
  };

  const handleEditClick = (batch) => {
    setFormData({
      batchName: batch.batchName,
      dateCreated: batch.dateCreated,
      expectedCompleteDate: batch.expectedCompleteDate,
      startingPopulation: batch.startingPopulation,
      status: batch.status
    });
    setEditTargetId(batch.id);
    setIsEditing(true);
    setIsAddModalOpen(true);
  };

  const deactivateOtherActiveBatches = async (currentBatchId) => {
    const snapshot = await get(ref(db, 'global_batches'));
    if (snapshot.exists()) {
      const updates = {};
      snapshot.forEach((child) => {
        const data = child.val();
        if (data.status === 'active' && child.key !== currentBatchId) {
          updates[`${child.key}/status`] = 'inactive';
        }
      });
      if (Object.keys(updates).length > 0) {
        await update(ref(db, 'global_batches'), updates);
      }
    }
  };

  const activateNextInactiveBatch = async () => {
    const snapshot = await get(ref(db, 'global_batches'));
    if (snapshot.exists()) {
      let oldestInactive = null;
      snapshot.forEach((child) => {
        const data = child.val();
        if (data.status === 'inactive') {
          if (!oldestInactive || new Date(data.dateCreated) < new Date(oldestInactive.dateCreated)) {
            oldestInactive = { id: child.key, dateCreated: data.dateCreated };
          }
        }
      });
      if (oldestInactive) {
        await update(ref(db, `global_batches/${oldestInactive.id}`), { status: 'active' });
      }
    }
  };

  const performAction = async () => {
    const { type, targetId } = confirmModal;
    setConfirmModal({ isOpen: false, type: null, targetId: null });
    
    try {
      if (type === 'create') {
        let finalStatus = formData.status;
        if (finalStatus === 'active') {
          await deactivateOtherActiveBatches();
        } else {
          const hasActive = batches.some(b => b.status === 'active');
          finalStatus = hasActive ? "inactive" : "active";
        }

        const pop = parseInt(formData.startingPopulation);
        const penCount = 5; 
        const startWeight = 50.0;
        
        const feedForecast = generateForecastData(pop);
        const penPops = generatePenPopulations(pop, penCount);
        const penForecasts = generatePenForecasts(feedForecast, penPops);
        const weightForecast = generateWeightForecast(startWeight, pop, feedForecast);

        const newBatchRef = push(ref(db, 'global_batches'));
        await set(newBatchRef, {
          batchName: formData.batchName,
          dateCreated: formData.dateCreated,
          expectedCompleteDate: formData.expectedCompleteDate,
          startingPopulation: pop,
          vitaminBudget: 0,
          penCount: penCount,
          averageChickWeight: startWeight,
          status: finalStatus,
          feedForecast,
          weightForecast,
          pen_populations: penPops,
          pen_forecasts: penForecasts
        });
        setSuccessMessage("Batch created successfully!");

      } else if (type === 'update') {
        const batchRef = ref(db, `global_batches/${editTargetId}`);
        const snapshot = await get(batchRef);
        const currentData = snapshot.val();
        
        const updates = {
          batchName: formData.batchName,
          dateCreated: formData.dateCreated,
          expectedCompleteDate: formData.expectedCompleteDate,
        };

        const newPop = parseInt(formData.startingPopulation);
        if (newPop !== currentData.startingPopulation) {
          updates.startingPopulation = newPop;
          
          const penCount = currentData.penCount || 5;
          const startWeight = currentData.averageChickWeight || 50.0;
          
          updates.feedForecast = generateForecastData(newPop);
          updates.pen_populations = generatePenPopulations(newPop, penCount);
          updates.pen_forecasts = generatePenForecasts(updates.feedForecast, updates.pen_populations);
          updates.weightForecast = generateWeightForecast(startWeight, newPop, updates.feedForecast);
        }

        await update(batchRef, updates);
        setSuccessMessage("Batch updated successfully!");

      } else if (type === 'activate') {
        await deactivateOtherActiveBatches(targetId);
        await update(ref(db, `global_batches/${targetId}`), { status: "active" });
        setSuccessMessage("Batch is now ACTIVE!");

      } else if (type === 'complete') {
        await update(ref(db, `global_batches/${targetId}`), { status: "completed" });
        await activateNextInactiveBatch();
        setSuccessMessage("Batch archived!");

      } else if (type === 'delete') {
        await remove(ref(db, `global_batches/${targetId}`));
        setSuccessMessage("Batch deleted permanently.");
      }

      setFormData({ batchName: '', dateCreated: '', expectedCompleteDate: '', startingPopulation: '', status: 'active' });
      setIsAddModalOpen(false);
      setIsEditing(false);
    } catch (error) { 
      console.error(error); 
      alert("Database Error: " + error.message);
    }
  };

  const filteredBatches = batches.filter(batch => {
    const matchesSearch = batch.batchName?.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesStatus = false;
    if (statusFilter === "all") matchesStatus = true;
    else if (statusFilter === "not_active") matchesStatus = batch.status !== "active";
    else matchesStatus = batch.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="bg-transparent h-full w-full font-sans text-gray-800 animate-fade-in flex flex-col text-sm">
      <SuccessModal message={successMessage} onClose={() => setSuccessMessage('')} />
      <ConfirmModal 
        isOpen={confirmModal.isOpen} 
        type={confirmModal.type} 
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
        onConfirm={performAction} 
      />

      {/* --- SLEEK COMPACT TOOLBAR --- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        
        {/* Left: Search Bar */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input 
            type="text" 
            placeholder="Search batches..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm text-xs outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 transition-all placeholder-gray-400"
          />
        </div>
        
        {/* Right: Filters & Action */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 shadow-sm rounded-lg px-2.5 py-1.5 flex-1 sm:flex-none">
            <Filter size={12} className="text-gray-400" />
            <select 
              className="bg-transparent text-[11px] font-bold text-gray-600 outline-none cursor-pointer w-full" 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Records</option>
              <option value="active">Active</option>
              <option value="not_active">Waiting</option>
              <option value="completed">Archived</option>
            </select>
          </div>
          
          <button 
            onClick={() => { setIsEditing(false); setFormData({batchName: '', dateCreated: '', expectedCompleteDate: '', startingPopulation: '', status: 'active'}); setIsAddModalOpen(true); }} 
            className="bg-red-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-800 transition-colors flex items-center gap-1.5 shadow active:scale-95 whitespace-nowrap"
          >
            <PlusCircle size={14} /> New Batch
          </button>
        </div>
      </div>

      {/* --- COMPACT DATA CARDS --- */}
      {loading ? (
        <div className="flex justify-center items-center py-20 flex-1">
          <Loader2 className="animate-spin text-red-900" size={24} />
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 flex flex-col items-center justify-center text-gray-400 flex-1">
          <Archive size={28} className="mb-2 text-gray-300" />
          <p className="text-xs font-bold uppercase tracking-widest">No matching records</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-4">
          {filteredBatches.map((batch) => {
            const isActive = batch.status === 'active';
            const isCompleted = batch.status === 'completed';

            return (
              <div 
                key={batch.id} 
                className={`relative bg-white rounded-xl p-4 flex flex-col transition-all duration-200 border group
                  ${isActive 
                    ? 'border-red-900/20 shadow-md shadow-red-900/5' 
                    : isCompleted 
                    ? 'border-gray-200 shadow-sm opacity-70 hover:opacity-100' 
                    : 'border-gray-200 shadow-sm'
                  }
                `}
              >
                {/* Active Accent Line */}
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 rounded-l-xl"></div>}

                {/* Header: Name & Badge */}
                <div className="flex justify-between items-start mb-3 pl-1">
                  <div className="overflow-hidden mr-2">
                    <h3 className={`text-sm font-bold tracking-tight truncate ${isActive ? 'text-gray-900' : 'text-gray-700'}`} title={batch.batchName}>
                      {batch.batchName}
                    </h3>
                    <p className="text-[9px] text-gray-400 mt-0.5 font-mono">
                      ID: {batch.id.slice(-6)}
                    </p>
                  </div>
                  
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border whitespace-nowrap ${
                    isActive ? 'bg-red-50 text-red-700 border-red-200' : 
                    isCompleted ? 'bg-gray-100 text-gray-500 border-gray-200' :
                    'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>
                    {isCompleted ? 'Archived' : batch.status}
                  </span>
                </div>

                {/* Minimalist Data Rows */}
                <div className="space-y-2 mb-4 flex-1 pl-1">
                  <div className="flex items-center text-xs">
                    <Calendar size={12} className="text-gray-400 mr-2 shrink-0" />
                    <span className="text-gray-500 w-12 shrink-0 text-[10px] font-bold uppercase">Dates</span>
                    <span className="text-gray-800 font-medium truncate text-[11px]">
                      {new Date(batch.dateCreated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {batch.expectedCompleteDate ? new Date(batch.expectedCompleteDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                    </span>
                  </div>

                  <div className="flex items-center text-xs">
                    <img src="./chicken.png" alt="Birds" className="w-3 h-3 object-contain mr-2 shrink-0 opacity-50 grayscale" />
                    <span className="text-gray-500 w-12 shrink-0 text-[10px] font-bold uppercase">Birds</span>
                    <span className="text-gray-800 font-bold text-[11px]">
                      {batch.startingPopulation.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Footer: Live Dot & ALWAYS VISIBLE Actions */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between pl-1">
                  
                  {/* Left: Status Indicator */}
                  <div className="flex-1">
                    {batch.status === 'inactive' && (
                      <button 
                        onClick={() => setConfirmModal({ isOpen: true, type: 'activate', targetId: batch.id })} 
                        className="flex items-center gap-1 text-[9px] font-bold uppercase text-gray-500 hover:text-red-900 transition-colors"
                      >
                        <Play size={10} /> Set Active
                      </button>
                    )}
                    {isActive && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-red-600">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600"></span>
                        </span>
                        Live Now
                      </div>
                    )}
                  </div>
                  
                  {/* Right: Permanent Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => handleEditClick(batch)} 
                      className="p-1.5 bg-gray-50 text-gray-600 border border-gray-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 rounded-md transition-colors"
                      title="Edit Batch"
                    >
                      <Edit2 size={13} />
                    </button>
                    
                    {isActive && (
                      <button 
                        onClick={() => setConfirmModal({ isOpen: true, type: 'complete', targetId: batch.id })} 
                        className="p-1.5 bg-gray-50 text-gray-600 border border-gray-200 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 rounded-md transition-colors"
                        title="Finish Batch"
                      >
                        <CheckCircle size={13} />
                      </button>
                    )}
                    
                    <button 
                      onClick={() => setConfirmModal({ isOpen: true, type: 'delete', targetId: batch.id })} 
                      className="p-1.5 bg-gray-50 text-gray-600 border border-gray-200 hover:text-red-600 hover:bg-red-50 hover:border-red-200 rounded-md transition-colors"
                      title="Delete Record"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- COMPACT ADD/EDIT MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-[130] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 animate-fade-in ring-1 ring-black/5">
            <div className="bg-red-900 p-3 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/10 rounded-lg">
                  {isEditing ? <Edit2 size={14} /> : <PlusCircle size={14} />}
                </div>
                <h2 className="font-bold text-xs">{isEditing ? "Edit Batch Record" : "New Production Batch"}</h2>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="hover:bg-red-800 p-1 rounded transition-colors"><X size={16} /></button>
            </div>
            
            <form 
              onSubmit={(e) => { 
                e.preventDefault(); 
                setConfirmModal({ isOpen: true, type: isEditing ? 'update' : 'create', targetId: null }); 
              }} 
              className="p-4 space-y-3"
            >
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Batch Name</label>
                <input 
                  type="text" required placeholder="E.g., Summer Flock 2026" value={formData.batchName} 
                  onChange={(e) => setFormData({...formData, batchName: e.target.value})} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 transition-all font-medium" 
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Start Date</label>
                  <input 
                    type="date" required value={formData.dateCreated} onChange={handleDateChange} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 font-medium" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Harvest Date</label>
                  <input 
                    type="date" required value={formData.expectedCompleteDate} 
                    onChange={(e) => setFormData({...formData, expectedCompleteDate: e.target.value})} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 font-medium" 
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Total Birds</label>
                <input 
                  type="number" required placeholder="0" value={formData.startingPopulation} 
                  onChange={(e) => setFormData({...formData, startingPopulation: e.target.value})} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 font-bold" 
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)} 
                  className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg text-xs uppercase hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-red-900 text-white font-bold py-2 rounded-lg text-xs uppercase hover:bg-red-800 transition-colors shadow"
                >
                  {isEditing ? "Save" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default BatchControl;