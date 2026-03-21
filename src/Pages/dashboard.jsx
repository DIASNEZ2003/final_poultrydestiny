// src/Pages/Dashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import { auth } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, update, get, onValue, onDisconnect, push, set, remove } from "firebase/database";
import { supabase } from "../supabaseClient";
import { MessageSquare, X, Download, FileText, Loader2, Send, Paperclip, Edit2, Trash2, ShieldCheck, MapPin, Search } from "lucide-react";

// Import your components
import BatchControl from "../Dashboard/BatchControl";
import User from "../Dashboard/User";

// --- HELPER: TIME FORMAT ---
const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  return isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `${date.toLocaleDateString([], { month: 'short', day: 'numeric'})}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

// --- COMPONENT: FULLSCREEN IMAGE VIEWER ---
const ImageViewerModal = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-white/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-600 hover:text-red-600 bg-white/80 hover:bg-white p-1.5 rounded-full z-50 shadow-sm"><X size={20} /></button>
      <img src={imageUrl} alt="Fullscreen View" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white" onClick={(e) => e.stopPropagation()} />
    </div>
  );
};

// --- COMPONENT: IN-SYSTEM DOCUMENT VIEWER ---
const DocumentViewerModal = ({ documentInfo, onClose }) => {
  if (!documentInfo) return null;
  const { url, type, name } = documentInfo;
  const isPdf = type?.includes('pdf');
  const isOffice = type?.includes('word') || type?.includes('document') || type?.includes('excel') || type?.includes('sheet') || type?.includes('powerpoint') || type?.includes('presentation');
  
  let viewerUrl = url;
  if (isOffice) viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  else if (isPdf) viewerUrl = `${url}#view=FitH`;
  else viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div className="fixed inset-0 z-[9999] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-4xl h-full flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden relative">
        <div className="bg-gray-100 p-3 flex justify-between items-center border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><FileText size={16} /></div>
            <div>
              <h3 className="text-xs font-black text-gray-800 tracking-wide truncate max-w-xs">{name || "Document Viewer"}</h3>
              <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">{isPdf ? "PDF Document" : isOffice ? "Office Document" : "Document"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[10px] font-bold uppercase rounded-lg hover:bg-gray-50 hover:text-blue-600 shadow-sm"><Download size={14} /> <span className="hidden sm:inline">Open / Download</span></a>
            <button onClick={onClose} className="p-1.5 bg-white border border-gray-200 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-lg shadow-sm"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 w-full bg-gray-200 relative flex items-center justify-center">
          <div className="absolute flex flex-col items-center text-gray-400 p-4 text-center">
            <Loader2 className="animate-spin mb-3 text-gray-400" size={28} />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Loading Viewer...</span>
          </div>
          <iframe src={viewerUrl} className="w-full h-full border-none absolute inset-0 z-10 bg-transparent" title="Document Viewer" />
        </div>
      </div>
    </div>
  );
};

// --- COMPONENT: FLOATING MESSENGER MODAL ---
const FloatingMessengerModal = ({ isOpen, onClose, onBack, targetUser, onViewImage, onViewDocument }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [msgToDelete, setMsgToDelete] = useState(null); 
  const [msgToEdit, setMsgToEdit] = useState(null);
  const [editText, setEditText] = useState("");
  const [liveStatus, setLiveStatus] = useState("offline"); 
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef();

  useEffect(() => {
    if (!isOpen || !targetUser) return;
    const db = getDatabase();
    const unsubStatus = onValue(ref(db, `users/${targetUser.uid}/status`), snap => setLiveStatus(snap.val() || "offline"));
    const unsubscribeChat = onValue(ref(db, `chats/${targetUser.uid}`), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sortedList = Object.keys(data).map(id => ({ id, ...data[id] })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(sortedList);
        const updates = {};
        Object.keys(data).forEach(id => {
            if ((data[id].sender === targetUser.uid || data[id].sender === 'tech') && data[id].seen !== true) {
                updates[`chats/${targetUser.uid}/${id}/seen`] = true;
                updates[`chats/${targetUser.uid}/${id}/status`] = 'seen';
            }
        });
        if (Object.keys(updates).length > 0) update(ref(db), updates);
      } else setMessages([]);
    });
    return () => { unsubscribeChat(); unsubStatus(); };
  }, [isOpen, targetUser]);

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() && !selectedFile) return;
    
    const currentInput = input.trim();
    const currentFile = selectedFile;
    
    setInput(""); 
    setSelectedFile(null);
    setIsSendingMessage(true); 

    await new Promise(resolve => setTimeout(resolve, 1000));

    const sendTimestamp = Date.now();
    if (currentFile) setUploading(true);

    try {
      let payload = { sender: "admin", senderUid: auth.currentUser.uid, text: currentInput, timestamp: sendTimestamp, seen: false, status: liveStatus === 'online' ? "delivered" : "sent" };
      if (currentFile) {
        const uniqueName = `attachments/${auth.currentUser.uid}/${sendTimestamp}_${currentFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`; 
        await supabase.storage.from('chat-attachments').upload(uniqueName, currentFile);
        const { data } = supabase.storage.from('chat-attachments').getPublicUrl(uniqueName);
        payload = { ...payload, attachmentUrl: data.publicUrl, attachmentName: currentFile.name, attachmentType: currentFile.type };
      }
      await set(push(ref(getDatabase(), `chats/${targetUser.uid}`)), payload);
    } catch (err) { alert("Failed to send."); } 
    finally { 
      if (currentFile) setUploading(false); 
      setIsSendingMessage(false); 
    }
  };

  const deleteMessage = async () => {
    await remove(ref(getDatabase(), `chats/${targetUser.uid}/${msgToDelete}`));
    setMsgToDelete(null);
  };

  const submitEdit = async () => {
    await update(ref(getDatabase(), `chats/${targetUser.uid}/${msgToEdit.id}`), { text: editText, isEdited: true });
    setMsgToEdit(null);
  };

  if (!isOpen || !targetUser) return null; 

  return (
    <div className="fixed bottom-0 right-0 sm:bottom-24 sm:right-6 z-[200] animate-slide-up shadow-2xl rounded-t-2xl sm:rounded-2xl border border-gray-200 overflow-hidden w-full sm:w-[360px] h-[85vh] sm:h-[500px] flex flex-col bg-white">
      
      {msgToDelete && (
        <div className="absolute inset-0 z-[160] bg-white/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="text-center w-full max-w-xs">
            <h4 className="text-sm font-bold text-gray-800 mb-3">Delete message?</h4>
            <div className="flex gap-2">
              <button onClick={() => setMsgToDelete(null)} className="flex-1 py-2 bg-gray-100 font-bold rounded-lg text-xs text-gray-600 hover:bg-gray-200">Cancel</button>
              <button onClick={deleteMessage} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg text-xs shadow-md hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {msgToEdit && (
        <div className="absolute inset-0 z-[160] bg-white/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs">
            <h4 className="font-bold text-gray-800 mb-2 text-xs uppercase">Edit Message</h4>
            <textarea className="w-full border bg-gray-50 p-2 rounded-lg text-xs h-24 outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900" value={editText} onChange={(e) => setEditText(e.target.value)} />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setMsgToEdit(null)} className="flex-1 py-2 bg-gray-100 font-bold rounded-lg text-[10px] text-gray-600 uppercase hover:bg-gray-200">Cancel</button>
              <button onClick={submitEdit} className="flex-1 py-2 bg-red-900 text-white font-bold rounded-lg text-[10px] uppercase shadow-md hover:bg-red-800">Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-red-900 p-3 flex items-center justify-between shadow z-10 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 hover:bg-red-800 rounded-full text-white transition mr-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>
          <div className={`relative w-9 h-9 rounded-full flex items-center justify-center text-white font-bold border-2 border-white/20 overflow-hidden ${targetUser.profilePicture || targetUser.profileImage ? 'bg-white' : 'bg-red-800'}`}>
            {targetUser.profilePicture || targetUser.profileImage ? <img src={targetUser.profilePicture || targetUser.profileImage} className="w-full h-full object-cover" alt="Profile" /> : <span className="text-sm">{(targetUser.username || "U").charAt(0).toUpperCase()}</span>}
            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-red-900 rounded-full ${liveStatus === 'online' ? 'bg-green-400' : 'bg-gray-400'}`}></div>
          </div>
          <div className="overflow-hidden">
            <h3 className="font-bold text-white text-xs leading-tight flex items-center gap-1 truncate max-w-[140px]">
              {targetUser.username || targetUser.fullName || "Unknown"} {targetUser.role === 'admin' && <ShieldCheck size={12} className="text-blue-400 shrink-0" />}
            </h3>
            <p className="text-[9px] text-red-100 uppercase font-bold tracking-wider mt-0.5">
              {liveStatus === 'online' ? 'Active Now' : 'Offline'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 bg-red-950/30 rounded-full hover:bg-red-950/50 text-white transition"><X size={16} /></button>
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 bg-gray-50 no-scrollbar space-y-3">
        {messages.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-50">
             <MessageSquare size={32} className="mb-2" />
             <p className="text-[10px] font-bold uppercase tracking-widest">Say Hello</p>
           </div>
        ) : messages.map((m) => {
          const isAdmin = m.sender === 'admin' || m.senderUid === auth.currentUser?.uid;
          if (!m.text?.trim() && !m.attachmentUrl) return null;
          return (
            <div key={m.id} className={`flex group w-full ${isAdmin ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'} max-w-[85%]`}>
                <div className={`px-3 py-2 rounded-xl text-xs font-medium shadow-sm relative z-10 ${isAdmin ? 'bg-red-900 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}`}>
                  {m.attachmentUrl && (
                    <div className={`${m.text?.trim() ? 'mb-1.5' : ''}`}>
                      {m.attachmentType?.startsWith('image/') ? (
                        <img src={m.attachmentUrl} alt="attachment" className="max-w-[160px] max-h-[160px] rounded-lg object-contain bg-white cursor-pointer border border-black/5" onClick={() => onViewImage(m.attachmentUrl)} />
                      ) : (
                        <div onClick={() => onViewDocument({url: m.attachmentUrl, type: m.attachmentType, name: m.attachmentName})} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs ${isAdmin ? 'bg-red-950/40 text-white' : 'bg-gray-50 text-gray-800'}`}>
                          <FileText size={16} className="shrink-0" /> <span className="truncate max-w-[150px]">{m.attachmentName || "File"}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {m.text?.trim() && <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>}
                  {isAdmin && (
                    <div className="absolute top-0 -left-16 hidden group-hover:flex gap-1 h-full items-center z-0">
                      {m.text?.trim() && <button onClick={() => { setMsgToEdit(m); setEditText(m.text); }} className="p-1.5 bg-white text-blue-600 rounded hover:bg-blue-50 shadow text-[10px]"><Edit2 size={12} /></button>}
                      <button onClick={() => setMsgToDelete(m.id)} className="p-1.5 bg-white text-red-600 rounded hover:bg-red-50 shadow text-[10px]"><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 px-1">
                  <span className="text-[8px] text-gray-400 font-medium">{formatTime(m.timestamp)} {m.isEdited ? '• Edited' : ''}</span>
                  {isAdmin && <span className={`text-[8px] font-bold uppercase ${m.seen ? 'text-blue-500' : m.status === 'delivered' ? 'text-gray-400' : 'text-gray-300'}`}>{m.seen ? 'Seen' : m.status}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border-t border-gray-200 z-20 shrink-0 p-2 pb-safe">
        {selectedFile && (
          <div className="px-3 py-2 bg-red-50/50 border border-red-100 rounded-lg mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-800 truncate max-w-[200px]">{selectedFile.name}</span>
            <button onClick={() => setSelectedFile(null)} className="p-1 text-gray-400 hover:text-red-600 bg-white rounded-full shadow-sm"><X size={12} /></button>
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-1.5 items-center">
          <input type="file" ref={fileInputRef} onChange={e => {if(e.target.files[0]) setSelectedFile(e.target.files[0]); fileInputRef.current.value="";}} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-400 hover:bg-gray-100 hover:text-red-900 rounded-full transition-colors"><Paperclip size={18} /></button>
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="flex-1 bg-gray-100 border-transparent rounded-full px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-900 focus:bg-white transition-all" />
          <button 
            type="submit" 
            disabled={(!input.trim() && !selectedFile) || isSendingMessage || uploading} 
            className="w-10 h-10 flex items-center justify-center bg-red-900 text-white rounded-full shadow-md hover:bg-red-800 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 shrink-0"
          >
            {isSendingMessage || uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="ml-0.5" />}
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// DASHBOARD COMPONENT
// ==========================================
const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState("Boss"); 
  const [profileImage, setProfileImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Viewers State
  const [viewingImage, setViewingImage] = useState(null);
  const [viewingDocument, setViewingDocument] = useState(null);

  // Weather States
  const [weatherData, setWeatherData] = useState({ 
    temp: "--", feelsLike: null, humidity: 0, precipitation: 0, 
    windSpeed: 0, uvIndex: 0, code: null, unit: "°C", isDay: 1,
    forecast: [], locationName: "Loading..." 
  });
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);

  // Messenger / Floating Widget States
  const [usersMap, setUsersMap] = useState({});
  const [recentChats, setRecentChats] = useState([]);
  const [showFloatingChatList, setShowFloatingChatList] = useState(false);
  const [globalChatUser, setGlobalChatUser] = useState(null); 
  const [chatSearch, setChatSearch] = useState("");

  const deviceLocation = useRef({ lat: 10.3323, lon: 123.3283 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const savedState = localStorage.getItem("isSidebarOpen");
    return savedState !== null ? JSON.parse(savedState) : true;
  });

  useEffect(() => { localStorage.setItem("isSidebarOpen", JSON.stringify(isSidebarOpen)); }, [isSidebarOpen]);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const fileInputRef = useRef(null);

  const navItems = [
    { name: "Dashboard", icon: "./dashboard.png" },
    { name: "Batch Control", icon: "./batch.png" },      
    { name: "Manage Users", icon: "./user.png" },
    { name: "Sales", icon: "./sales.png" },            
    { name: "Expenses", icon: "./expenses.png" },        
    { name: "Records", icon: "./folder.png" },          
  ];

  const getWeatherDetails = (code, isDay = 1) => {
    const nightMode = isDay === 0;
    if (code === 0) return nightMode ? { icon: "🌙", label: "Clear", color: "text-blue-100", bg: "bg-blue-900 border-blue-800" } : { icon: "☀️", label: "Sunny", color: "text-orange-600", bg: "bg-orange-50 border-orange-100" };
    if (code === 1 || code === 2) return nightMode ? { icon: "☁️", label: "Mostly clear", color: "text-indigo-200", bg: "bg-indigo-900 border-indigo-800" } : { icon: "⛅", label: "Mostly sunny", color: "text-orange-500", bg: "bg-orange-50 border-orange-100" };
    if (code === 3 || (code >= 45 && code <= 48)) return nightMode ? { icon: "☁️", label: "Cloudy", color: "text-indigo-100", bg: "bg-indigo-900 border-indigo-800" } : { icon: "☁️", label: "Cloudy", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: "🌧️", label: "Rainy", color: nightMode ? "text-blue-300" : "text-blue-700", bg: nightMode ? "bg-blue-950 border-blue-900" : "bg-blue-50 border-blue-200" };
    if (code >= 95) return { icon: "⛈️", label: "Thunder", color: nightMode ? "text-purple-200" : "text-purple-800", bg: nightMode ? "bg-purple-900 border-purple-800" : "bg-purple-100 border-purple-200" };
    return { icon: "☁️", label: "Cloudy", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" };
  };

  const getDayName = (dateString, index) => {
    if (index === 0) return "Today";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const fetchLocationName = async (lat, lon) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`);
      const data = await res.json();
      if (data && data.address) {
        const city = data.address.town || data.address.municipality || data.address.city || data.address.village || "Vallehermoso";
        const province = data.address.state || data.address.province || data.address.region || "Negros Oriental";
        return `${city}, ${province}`;
      }
      return "Vallehermoso, Negros Oriental";
    } catch (e) { return "Vallehermoso, Negros Oriental"; }
  };

  const fetchWeather = async (lat, lon) => {
    const db = getDatabase();
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,precipitation,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FManila&wind_speed_unit=kmh&forecast_days=7`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Weather fetch failed");
      const data = await response.json();
      
      if (data && data.current && data.daily) {
        const c = data.current;
        const d = data.daily;
        const weeklyForecast = d.time.map((time, index) => ({
          date: time, maxTemp: Math.round(d.temperature_2m_max[index]),
          minTemp: Math.round(d.temperature_2m_min[index]), weatherCode: d.weather_code[index]
        }));
        const locName = await fetchLocationName(lat, lon); 
        const weatherPayload = {
          temperature: Math.round(c.temperature_2m * 10) / 10 ?? 0, feelsLike: Math.round(c.apparent_temperature * 10) / 10 ?? 0,
          humidity: c.relative_humidity_2m ?? 0, precipitation: Math.round(c.precipitation * 10) / 10 ?? 0,
          windSpeed: Math.round(c.wind_speed_10m * 10) / 10 ?? 0, uvIndex: c.uv_index ?? 0,
          weatherCode: c.weather_code ?? 0, isDay: c.is_day ?? 1, unit: "°C",
          forecast: weeklyForecast, locationName: locName, last_updated: Date.now()
        };
        await update(ref(db, 'current_weather'), weatherPayload);
      }
    } catch (err) { console.error("Weather error:", err); }
  };

  const updateLocationAndWeather = () => {
    setIsRefreshingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          deviceLocation.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          try { await fetchWeather(pos.coords.latitude, pos.coords.longitude); } 
          catch (e) { alert("Weather update failed. Check internet."); }
          setIsRefreshingLocation(false);
        },
        (err) => { setIsRefreshingLocation(false); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } 
      );
    } else setIsRefreshingLocation(false);
  };

  useEffect(() => {
    const db = getDatabase();
    updateLocationAndWeather(); 
    const weatherInterval = setInterval(() => { updateLocationAndWeather(); }, 60000); 

    const unsubscribeWeather = onValue(ref(db, 'current_weather'), (snapshot) => {
      if (snapshot.exists()) {
        const d = snapshot.val();
        setWeatherData({
          temp: d.temperature ?? "--", feelsLike: d.feelsLike ?? null,  
          humidity: d.humidity ?? 0, precipitation: d.precipitation ?? 0,
          windSpeed: d.windSpeed ?? 0, uvIndex: d.uvIndex ?? 0,
          code: d.weatherCode ?? null, unit: d.unit || "°C", isDay: d.isDay !== undefined ? d.isDay : 1,
          forecast: d.forecast || [], locationName: d.locationName || "Vallehermoso, Negros Oriental" 
        });
        setIsWeatherLoading(false); 
      }
    });

    const unsubUsers = onValue(ref(db, 'users'), (snap) => {
      if (snap.exists()) setUsersMap(snap.val());
    });

    const unsubChats = onValue(ref(db, 'chats'), (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        let chatsList = [];
        Object.keys(data).forEach(uid => {
          const userMsgs = data[uid];
          const msgArray = Object.values(userMsgs);
          const unreadCount = msgArray.filter(m => m.sender !== 'admin' && !m.seen).length;
          
          if (msgArray.length > 0) {
            const sorted = msgArray.sort((a, b) => b.timestamp - a.timestamp);
            const latest = sorted[0];
            chatsList.push({
              uid, count: unreadCount,
              latestText: latest.text || (latest.attachmentUrl ? "Sent an attachment" : "Sent a message"),
              timestamp: latest.timestamp, senderRole: latest.sender === 'admin' ? 'You' : 'Them'
            });
          }
        });
        setRecentChats(chatsList.sort((a, b) => b.timestamp - a.timestamp));
      } else { setRecentChats([]); }
    });

    return () => { clearInterval(weatherInterval); unsubscribeWeather(); unsubUsers(); unsubChats(); };
  }, []);

  const totalUnreadMessages = recentChats.reduce((sum, chat) => sum + chat.count, 0);

  // ==========================================
  // UPDATED: BUILD THE COMPLETE CHAT DISPLAY LIST
  // Now explicitly filtering for personnel, personel, and user.
  // ==========================================
  const allMessageableUsers = Object.keys(usersMap)
    .map(uid => ({ uid, ...usersMap[uid] }))
    .filter(u => 
      u.uid !== user?.uid && // Don't show the logged-in admin
      (u.role === 'personnel' || u.role === 'personel' || u.role === 'user') // Include all requested spellings
    );

  const chatDisplayList = allMessageableUsers.map(u => {
    const chatInfo = recentChats.find(c => c.uid === u.uid);
    return {
      ...u,
      lastChatTime: chatInfo ? chatInfo.timestamp : 0,
      unreadCount: chatInfo ? chatInfo.count : 0,
      latestText: chatInfo ? chatInfo.latestText : "Start a conversation",
      senderRole: chatInfo ? chatInfo.senderRole : null
    };
  }).sort((a, b) => b.lastChatTime - a.lastChatTime);

  const filteredChats = chatDisplayList.filter(u => 
    (u.username || "").toLowerCase().includes(chatSearch.toLowerCase()) || 
    (u.fullName || "").toLowerCase().includes(chatSearch.toLowerCase()) ||
    (u.firstName || "").toLowerCase().includes(chatSearch.toLowerCase())
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const db = getDatabase();
          const snapshot = await get(ref(db, `users/${currentUser.uid}`));
          if (snapshot.exists()) {
            const data = snapshot.val();
            setProfileImage(data.profileImage || null);
            const nameFromEmail = currentUser.email ? currentUser.email.split("@")[0] : "Admin";
            setFullName(data.fullName || data.firstName || nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1));
          }
          const myStatusRef = ref(db, `users/${currentUser.uid}`);
          const connectedRef = ref(db, ".info/connected");
          onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
              onDisconnect(myStatusRef).update({ status: "offline", lastSeen: Date.now() })
              .then(() => update(myStatusRef, { status: "online", lastSeen: Date.now() }));
            }
          });
        } catch (error) { console.error("User fetch error:", error); }
      }
    });
    return () => unsubscribe();
  }, []);

  const confirmLogout = async () => {
    try {
      if (user) await update(ref(getDatabase(), `users/${user.uid}`), { status: "offline", lastSeen: Date.now() });
      await signOut(auth); 
    } catch (error) {}
    setShowLogoutModal(false);
  };

  const handleImageUpload = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file || !user) return;
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.uid}_${Date.now()}.${fileExt}`;
      await supabase.storage.from("avatars").upload(filePath, file);
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      await update(ref(getDatabase(), `users/${user.uid}`), { profileImage: data.publicUrl });
      setProfileImage(data.publicUrl);
      setModalMessage("Profile picture updated successfully!");
      setShowSuccessModal(true);
    } catch (error) { alert("Upload error: " + error.message); } 
    finally { setUploading(false); }
  };

  const getDynamicBackground = () => {
    const hour = new Date().getHours(); 
    if (hour >= 5 && hour <= 11) return "./1.jpg";  
    if (hour >= 12 && hour <= 15) return "./2.jpg"; 
    if (hour >= 16 && hour <= 19) return "./3.jpg"; 
    return "./4.jpg";                                
  };

  const isDarkBackground = () => { const hour = new Date().getHours(); return (hour >= 16 || hour <= 4); };
  const mainTextColor = isDarkBackground() ? "text-white" : "text-gray-900";
  const subTextColor = isDarkBackground() ? "text-gray-200" : "text-gray-600";
  const labelTextColor = isDarkBackground() ? "text-gray-300" : "text-gray-500";
  const closeButtonColor = isDarkBackground() ? "text-white hover:text-red-400" : "text-gray-600 hover:text-red-600";
  const weatherUI = getWeatherDetails(weatherData.code, weatherData.isDay);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      
      {/* GLOBAL MODALS */}
      <ImageViewerModal imageUrl={viewingImage} onClose={() => setViewingImage(null)} />
      <DocumentViewerModal documentInfo={viewingDocument} onClose={() => setViewingDocument(null)} />
      
      {/* FLOATING MESSENGER WIDGET (Like FB Messenger Chat Head) */}
      <div className="fixed bottom-6 right-6 z-[150] flex flex-col items-end">
        
        {/* Chat List Panel (Now Shows ALL Users with a Search bar) */}
        {showFloatingChatList && !globalChatUser && (
          <div className="mb-4 bg-white w-80 max-h-[450px] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-up flex flex-col">
            <div className="bg-red-900 px-4 py-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-xs flex items-center gap-2"><MessageSquare size={14} /> Start a Chat</h3>
              <button onClick={() => setShowFloatingChatList(false)} className="hover:bg-red-800 p-1 rounded transition-colors"><X size={14}/></button>
            </div>
            
            {/* Search Bar inside widget */}
            <div className="p-2 bg-white border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                <input 
                  type="text" 
                  placeholder="Search staff..." 
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 transition-all"
                />
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100 bg-gray-50 no-scrollbar">
              {filteredChats.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs font-bold uppercase tracking-widest flex flex-col items-center">
                  <MessageSquare size={24} className="mb-2 opacity-20" />
                  No users found
                </div>
              ) : (
                filteredChats.map(u => {
                  const isUnread = u.unreadCount > 0;
                  const isOnline = u.status === 'online';
                  
                  return (
                    <div 
                      key={u.uid}
                      onClick={() => setGlobalChatUser(u)}
                      className={`p-3 cursor-pointer transition-colors flex items-start gap-3 border-l-2 ${isUnread ? 'bg-white border-red-600 hover:bg-red-50/50' : 'bg-gray-50 border-transparent hover:bg-gray-100'}`}
                    >
                      <div className={`relative w-10 h-10 rounded-full overflow-hidden shrink-0 border ${isUnread ? 'border-red-200' : 'border-gray-200'}`}>
                        {u.profilePicture || u.profileImage ? (
                          <img src={u.profilePicture || u.profileImage} className="w-full h-full object-cover"/>
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${isUnread ? 'bg-red-50 text-red-700' : 'bg-white text-gray-500'}`}>
                            {(u.username || "U").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <span className={`text-xs font-bold truncate ${isUnread ? 'text-gray-900' : 'text-gray-600'}`}>{u.username || u.fullName || 'Unknown User'}</span>
                          {u.lastChatTime > 0 && <span className="text-[9px] text-gray-400 whitespace-nowrap ml-2">{formatTime(u.lastChatTime)}</span>}
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <p className={`text-[10px] truncate ${isUnread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                            {u.senderRole === 'You' ? 'You: ' : ''}{u.latestText}
                          </p>
                          {isUnread && <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">{u.unreadCount}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* The Open Chat Window */}
        <FloatingMessengerModal 
          isOpen={!!globalChatUser} 
          onClose={() => { setGlobalChatUser(null); setShowFloatingChatList(false); }} 
          onBack={() => { setGlobalChatUser(null); setShowFloatingChatList(true); }}
          targetUser={globalChatUser} 
          onViewImage={setViewingImage} 
          onViewDocument={setViewingDocument} 
        />

        {/* The actual Floating Button */}
        {!globalChatUser && (
          <button 
            onClick={() => setShowFloatingChatList(!showFloatingChatList)}
            className={`relative w-14 h-14 bg-red-900 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-red-800 transition-all hover:scale-105 active:scale-95 ${totalUnreadMessages > 0 ? 'animate-bounce' : ''}`}
            style={{ animationIterationCount: totalUnreadMessages > 0 ? 3 : 0 }}
          >
            {showFloatingChatList ? <X size={24} /> : <MessageSquare size={24} />}
            {totalUnreadMessages > 0 && !showFloatingChatList && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
              </span>
            )}
          </button>
        )}
      </div>

      {/* SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-red-900 text-white flex flex-col shadow-2xl z-20 transition-all duration-500 ease-in-out relative h-full`}>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`absolute z-30 pt-3 p-1.5 rounded-full hover:bg-red-800 transition-all duration-500 ease-in-out ${isSidebarOpen ? 'top-3 right-3' : 'top-3 left-1/2 -translate-x-1/2'}`}>
            <img src="./lapse.png" alt="Toggle" className={`w-5 h-5 invert transition-transform duration-500 ${isSidebarOpen ? 'rotate-0' : 'rotate-180'}`} />
        </button>

        <div className={`flex-shrink-0 flex flex-col items-center justify-center border-b border-red-800 bg-red-950 relative transition-all duration-500 ease-in-out ${isSidebarOpen ? 'pt-6 pb-6 px-4' : 'pt-16 pb-5 px-2'}`}>
          <div className={`relative group cursor-pointer transition-all duration-500 ease-in-out ${isSidebarOpen ? 'h-20 w-20' : 'h-10 w-10'} bg-white rounded-full flex items-center justify-center border-2 border-red-200 shadow-xl overflow-hidden`} onClick={() => fileInputRef.current.click()}>
            {profileImage ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover transition-opacity duration-300 animate-fade-in" /> : <span className={`font-bold text-red-900 transition-all duration-500 ${isSidebarOpen ? 'text-2xl' : 'text-sm'}`}>{fullName.charAt(0)}</span>}
            <div className={`absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center transition-opacity duration-300 ${uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}><span className="text-white text-[10px] font-bold">{uploading ? "..." : "Edit"}</span></div>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          {isSidebarOpen && (
              <div className="mt-4 text-center animate-fade-in">
                <h2 className="text-base font-bold tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">{fullName}</h2>
                <p className="text-[11px] text-red-200 mt-0.5 uppercase tracking-widest">Farm Owner</p>
              </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-red-800 scrollbar-track-transparent">
          {navItems.map((item) => (
            <button key={item.name} onClick={() => setActiveTab(item.name)} className={`flex items-center w-full px-3 py-3 rounded-xl transition-all duration-300 ease-in-out group ${activeTab === item.name ? "bg-red-800 text-white shadow-sm transform scale-[1.02]" : "text-red-100 hover:bg-red-800/50 hover:text-white"} ${!isSidebarOpen && 'justify-center'}`} title={!isSidebarOpen ? item.name : ''}>
              <img src={item.icon} alt={item.name} className={`w-5 h-5 invert transition-all duration-300 ${activeTab === item.name ? 'opacity-100' : 'opacity-70 group-hover:opacity-100 group-hover:scale-110'} ${isSidebarOpen ? 'mr-3' : 'mr-0'}`} />
              {isSidebarOpen && <span className="font-medium text-sm whitespace-nowrap">{item.name}</span>}
            </button>
          ))}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-red-800 bg-red-950">
          <button onClick={() => setShowLogoutModal(true)} className={`flex items-center justify-center w-full py-2.5 rounded-xl text-red-100 hover:bg-red-900 hover:text-white transition-all duration-300 border border-red-900 hover:border-red-700 ${isSidebarOpen ? 'px-3' : 'px-0'}`}>
            {isSidebarOpen ? <span className="font-bold text-xs uppercase tracking-wider">Sign Out</span> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-gray-50">
        
        {/* Header */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10 flex-shrink-0 border-b border-gray-100 transition-all duration-300">
          <h1 className="text-xl font-black text-gray-800 tracking-tight">{activeTab}</h1>

          {/* REAL-TIME NOTIFICATIONS, WEATHER & LOCATION */}
          <div className="flex items-center gap-3 relative">
            
            {/* UPDATED LOCATION BUTTON: Icon Only */}
            <button 
              onClick={updateLocationAndWeather}
              disabled={isRefreshingLocation}
              className={`p-2 rounded-md transition-all duration-300 border shadow-sm ${
                isRefreshingLocation ? 'bg-red-50 border-red-100 text-red-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
              }`}
              title="Get Precise Device Location"
            >
              <MapPin size={18} className={isRefreshingLocation ? 'animate-bounce' : ''} />
            </button>

            {isWeatherLoading ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-gray-100 animate-pulse">
                <div className="w-5 h-5 bg-gray-300 rounded-full"></div>
                <div className="flex flex-col gap-0.5"><div className="w-8 h-1.5 bg-gray-300 rounded"></div><div className="w-5 h-2 bg-gray-300 rounded"></div></div>
              </div>
            ) : (
              <button 
                onClick={() => setShowWeatherModal(!showWeatherModal)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border shadow-sm transition-all duration-300 ease-in-out cursor-pointer ${weatherUI.bg} ${showWeatherModal ? 'ring-2 ring-red-200 scale-[1.02]' : 'hover:scale-[1.02]'}`}
              >
                <span className="text-lg">{weatherUI.icon}</span>
                <div className="flex flex-col text-left leading-none gap-0.5">
                  <span className={`text-[8px] font-black uppercase tracking-widest ${weatherUI.color}`}>{weatherUI.label}</span>
                  <span className={`font-black text-xs leading-none ${weatherData.isDay === 0 ? 'text-white' : 'text-gray-900'}`}>{weatherData.temp}{weatherData.unit}</span>
                </div>
              </button>
            )}

            {showWeatherModal && (
              <>
                <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowWeatherModal(false)}></div>
                <div className="absolute right-0 top-full mt-3 rounded-2xl w-[460px] shadow-2xl border border-gray-200 z-50 animate-fade-in-down cursor-default origin-top-right overflow-hidden ring-1 ring-black/10">
                  <div className="absolute inset-0 bg-cover bg-center transition-all duration-1000 z-0" style={{ backgroundImage: `url('${getDynamicBackground()}')` }}></div>
                  <div className={`absolute inset-0 z-0 transition-colors duration-1000 ${isDarkBackground() ? 'bg-black/40' : 'bg-white/30'}`}></div>

                  <div className="relative z-10 p-5">
                    <button onClick={() => setShowWeatherModal(false)} className={`absolute top-4 right-4 transition-colors ${closeButtonColor}`}><X size={20} /></button>

                    <div className="flex items-center justify-between border-b border-gray-300/30 pb-4 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-5xl drop-shadow-md">{weatherUI.icon}</span>
                        <div>
                          <h2 className={`text-4xl font-extrabold tracking-tight leading-none drop-shadow-md transition-colors ${mainTextColor}`}>{weatherData.temp}<span className={`text-xl font-bold align-top transition-colors ${subTextColor}`}>{weatherData.unit}</span></h2>
                          <p className={`text-xs font-bold uppercase tracking-wider mt-1 drop-shadow-md transition-colors ${subTextColor}`}>{weatherUI.label}</p>
                          <div className={`flex items-center gap-1 mt-1.5 text-[9px] font-bold tracking-wide drop-shadow-md transition-colors ${subTextColor}`}>
                            <MapPin size={12} /> {weatherData.locationName}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col gap-1.5 mr-6">
                        <span className={`text-[10px] font-black px-2.5 py-1 bg-green-100 text-green-800 rounded-md whitespace-nowrap shadow-sm border ${isDarkBackground() ? 'bg-black/50 text-green-400 border-white/10 backdrop-blur-sm' : 'bg-green-100 text-green-800 border-green-200/50'}`}>💧 {weatherData.precipitation}%</span>
                        <span className={`text-[10px] font-black px-2.5 py-1 bg-red-100 text-red-800 rounded-md whitespace-nowrap shadow-sm border ${isDarkBackground() ? 'bg-black/50 text-red-400 border-white/10 backdrop-blur-sm' : 'bg-red-100 text-red-800 border-red-200/50'}`}>💨 {weatherData.windSpeed} km/h</span>
                      </div>
                    </div>

                    <div>
                      <h3 className={`text-[10px] font-extrabold mb-2.5 uppercase tracking-widest drop-shadow-sm transition-colors ${labelTextColor}`}>7-Day Forecast</h3>
                      <div className="flex justify-between items-center gap-1 w-full">
                        {weatherData.forecast && weatherData.forecast.slice(0, 7).map((day, index) => {
                          const ui = getWeatherDetails(day.weatherCode, 1);
                          const isToday = index === 0;
                          return (
                            <div key={index} className={`flex-1 flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 ${isToday ? (isDarkBackground() ? 'bg-white/20 border border-white/50 shadow-md backdrop-blur-sm' : 'bg-white/80 border border-white/50 shadow-md ring-1 ring-red-200') : (isDarkBackground() ? 'bg-black/20 hover:bg-white/20 border border-transparent backdrop-blur-sm' : 'bg-white/40 hover:bg-white/80 border border-transparent shadow-sm')}`}>
                              <span className={`text-[9px] font-black drop-shadow-sm transition-colors ${isToday ? (isDarkBackground() ? 'text-white' : 'text-red-700') : (isDarkBackground() ? 'text-gray-300' : 'text-gray-700')}`}>{getDayName(day.date, index)}</span>
                              <span className="text-2xl my-1.5 drop-shadow-md">{ui.icon}</span>
                              <div className="flex flex-col items-center gap-0 text-[10px]">
                                <span className={`font-black drop-shadow-sm transition-colors ${isDarkBackground() ? 'text-red-400' : 'text-red-700'}`} title="High">{day.maxTemp}°</span>
                                <span className={`font-bold drop-shadow-sm transition-colors ${isDarkBackground() ? 'text-green-400' : 'text-green-700'}`} title="Low">{day.minTemp}°</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Dynamic Content Rendering */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in-down h-full relative">
          {activeTab === "Batch Control" ? <BatchControl /> : activeTab === "Manage Users" ? <User /> : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100 p-8 transition-all duration-300 hover:shadow-md">
              <svg className="w-16 h-16 mb-4 text-red-900 opacity-20 transition-transform duration-700 hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              <h2 className="text-2xl font-black text-gray-800 mb-2">{activeTab}</h2>
              <p className="text-center max-w-sm text-sm text-gray-500 leading-relaxed font-medium">The <span className="font-bold text-red-800">{activeTab}</span> module is temporarily disabled while we transition our code.</p>
            </div>
          )}
        </div>
      </main>

      {/* LOGOUT & SUCCESS MODALS */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl transform transition-all animate-slide-up text-center border border-gray-100">
            <h3 className="text-xl font-black text-gray-900 mb-1">Sign Out</h3>
            <p className="text-sm text-gray-500 mb-6 font-medium">Are you sure you want to exit?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutModal(false)} className="flex-1 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl py-3 hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={confirmLogout} className="flex-1 bg-red-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-red-800 transition-all active:scale-95">Log Out</button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-80 text-center shadow-2xl transform transition-all animate-slide-up border border-gray-100">
            <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100"><ShieldCheck size={28} /></div>
            <h3 className="text-xl font-black text-gray-900 mb-1">Success!</h3>
            <p className="text-sm text-gray-500 mb-6 font-medium">{modalMessage}</p>
            <button onClick={() => setShowSuccessModal(false)} className="w-full py-3 bg-red-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-red-800 transition-all active:scale-95">Continue</button>
          </div>
        </div>
      )}

      <style>{`
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fade-in-down { 0% { opacity: 0; transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-down { animation: fade-in-down 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
        @keyframes slide-up { 0% { opacity: 0; transform: translateY(15px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
      `}</style>
    </div>
  );
};

export default Dashboard;