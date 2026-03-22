// src/Pages/User.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // <-- Added createPortal
import { auth } from '../firebase'; 
import { getDatabase, ref, onValue, update, push, set, remove } from "firebase/database";
import { supabase } from '../supabaseClient'; 
import { 
  UserPlus, MessageSquare, Trash2, Lock, 
  Check, AlertTriangle, Send, X, Edit2, ShieldCheck,
  Search, Paperclip, FileText, Download, Loader2, Image as ImageIcon, Camera
} from 'lucide-react';

// --- HELPER: TIME FORMAT ---
const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

// --- COMPONENT: FULLSCREEN IMAGE VIEWER (Using Portal) ---
const ImageViewerModal = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-600 hover:text-red-600 transition-colors bg-white/80 hover:bg-white p-1.5 rounded-full z-50 shadow-sm ring-1 ring-black/5">
        <X size={20} />
      </button>
      <img src={imageUrl} alt="Fullscreen View" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white ring-1 ring-black/5" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body
  );
};

// --- COMPONENT: IN-SYSTEM DOCUMENT VIEWER (Using Portal) ---
const DocumentViewerModal = ({ documentInfo, onClose }) => {
  if (!documentInfo) return null;
  const { url, type, name } = documentInfo;

  const isPdf = type?.includes('pdf');
  const isWord = type?.includes('word') || type?.includes('document');
  const isExcel = type?.includes('excel') || type?.includes('sheet');
  const isPowerPoint = type?.includes('powerpoint') || type?.includes('presentation');
  const isOffice = isWord || isExcel || isPowerPoint;

  let viewerUrl = url;
  if (isOffice) {
    viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  } else if (isPdf) {
    viewerUrl = `${url}#view=FitH`;
  } else {
    viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-4xl h-full flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden relative ring-1 ring-black/5">
        <div className="bg-gray-100 p-3 flex justify-between items-center border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
              <FileText size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-gray-800 tracking-wide truncate max-w-xs sm:max-w-sm">
                {name || "Document Viewer"}
              </h3>
              <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">
                {isPdf ? "PDF Document" : isOffice ? "Office Document" : "Document"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[10px] font-bold uppercase rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm"
              title="Open file in a new tab or download it"
            >
              <Download size={14} /> <span className="hidden sm:inline">Open / Download</span>
            </a>
            <button 
              onClick={onClose} 
              className="p-1.5 bg-white border border-gray-200 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-lg transition-colors shadow-sm"
            >
              <X size={16} />
            </button>
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
    </div>,
    document.body
  );
};

// --- COMPONENT: REAL-TIME STATUS BADGE ---
const UserStatusBadge = ({ uid, initialStatus, initialLastSeen }) => {
  const [status, setStatus] = useState(initialStatus || 'offline');
  const [lastSeen, setLastSeen] = useState(initialLastSeen || null);

  useEffect(() => {
    const db = getDatabase();
    const unsub = onValue(ref(db, `users/${uid}`), (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setStatus(data.status || 'offline');
        setLastSeen(data.lastSeen || null);
      }
    });
    return () => unsub();
  }, [uid]);

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${
          status === 'online' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
      }`}>
          {status === 'online' ? 'Online Now' : 'Offline'}
      </span>
    </div>
  );
};

// --- COMPONENT: PASSWORD INPUT ---
const PasswordInput = ({ label, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">{label}</label>
      <div className="relative">
        <Lock className="absolute left-2.5 top-2 text-gray-400 h-3 w-3" />
        <input 
          type={show ? "text" : "password"} required minLength={6}
          className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-lg focus:ring-1 focus:ring-red-900 focus:border-red-900 block pl-7 p-2 outline-none font-medium transition-all"
          value={value} onChange={onChange} placeholder={placeholder}
        />
        <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 px-2 flex items-center text-gray-400 hover:text-red-900 text-[9px] font-bold uppercase">
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
};

// --- COMPONENT: SUCCESS MODAL (Using Portal) ---
const SuccessModal = ({ message, onClose }) => {
  if (!message) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in p-4">
      <div className="bg-white rounded-xl shadow-2xl p-5 w-72 text-center border border-gray-200 ring-1 ring-black/5">
        <div className="mx-auto flex items-center justify-center h-10 w-10 rounded-full bg-green-50 mb-3 border border-green-100">
          <Check className="h-5 w-5 text-green-600" />
        </div>
        <h3 className="text-sm font-black text-gray-800 mb-1">Success</h3>
        <p className="text-xs text-gray-500 mb-5 font-medium">{message}</p>
        <button onClick={onClose} className="w-full bg-red-900 text-white text-xs font-bold rounded-lg px-3 py-2 hover:bg-red-800 transition-all active:scale-95">CONTINUE</button>
      </div>
    </div>,
    document.body
  );
};

// --- COMPONENT: CONFIRM MODAL (Using Portal) ---
const ConfirmModal = ({ isOpen, type, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  let config = { title: "Confirm Action", message: "Proceed with this action?", btnColor: "bg-red-600", icon: <AlertTriangle className="h-5 w-5 text-orange-500" />, iconBg: "bg-orange-50", btnText: "Confirm" };
  if (type === 'create') config = { title: "Register User", message: "Are you sure you want to create this account?", btnColor: "bg-green-600", icon: <UserPlus className="h-5 w-5 text-green-600" />, iconBg: "bg-green-50", btnText: "Create" };
  else if (type === 'delete') config = { title: "Delete User?", message: "Permanently remove this user? Cannot be undone.", btnColor: "bg-red-600 hover:bg-red-700", icon: <Trash2 className="h-5 w-5 text-red-600" />, iconBg: "bg-red-50", btnText: "Delete" };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-xs border border-gray-200 text-center ring-1 ring-black/5">
        <div className={`mx-auto flex items-center justify-center h-10 w-10 rounded-full ${config.iconBg} mb-3 border`}>{config.icon}</div>
        <h3 className="text-sm font-black text-gray-800 mb-1">{config.title}</h3>
        <p className="text-[11px] text-gray-500 mb-5 leading-relaxed">{config.message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold py-2 rounded-lg text-[10px] uppercase transition-colors">Cancel</button>
          <button onClick={onConfirm} className={`flex-1 text-white font-bold py-2 rounded-lg text-[10px] uppercase shadow-md transition-colors ${config.btnColor}`}>{config.btnText}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- COMPONENT: MESSENGER MODAL (Using Portal) ---
const MessengerModal = ({ isOpen, onClose, targetUser, onViewImage, onViewDocument }) => {
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
        // STRICT TIMSTAMP SORTING - Fixes overlapping bugs
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
    const scrollToBottom = () => { if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; };
    scrollToBottom();
    const t = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(t);
  }, [messages]);

  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() && !selectedFile) return;
    
    const currentInput = input.trim();
    const currentFile = selectedFile;
    
    setInput(""); 
    setSelectedFile(null);
    setIsSendingMessage(true); // Triggers the loading spinner

    // 1-SECOND DELAY to ensure timestamps never overlap
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
      setIsSendingMessage(false); // Removes the spinner
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md h-[550px] rounded-xl shadow-2xl flex flex-col overflow-hidden relative border border-gray-200 ring-1 ring-black/5 animate-fade-in">
        
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

        {/* HEADER */}
        <div className="bg-red-900 p-3 flex items-center justify-between shadow z-10">
          <div className="flex items-center gap-2">
            <div className={`relative w-10 h-10 rounded-full flex items-center justify-center text-white font-bold border-2 border-white/20 overflow-hidden ${targetUser.profilePicture ? 'bg-white' : 'bg-red-800'}`}>
              {targetUser.profilePicture ? <img src={targetUser.profilePicture} className="w-full h-full object-cover" alt="Profile" /> : <span className="text-sm">{(targetUser.username || "U").charAt(0).toUpperCase()}</span>}
            </div>
            <div>
              <h3 className="font-bold text-white text-sm leading-tight flex items-center gap-1">
                {targetUser.fullName || targetUser.username || "Unknown"}
              </h3>
              <p className="text-[10px] text-red-100 uppercase font-bold tracking-wider mt-0.5">
                {liveStatus === 'online' ? 'Active Now' : 'Offline'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-red-950/30 rounded-full hover:bg-red-950/50 text-white transition"><X size={18} /></button>
        </div>

        {/* MESSAGES AREA */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-gray-50 no-scrollbar space-y-4">
          {messages.map((m) => {
            const isAdmin = m.sender === 'admin' || m.senderUid === auth.currentUser?.uid;
            if (!m.text?.trim() && !m.attachmentUrl) return null;
            return (
              <div key={m.id} className={`flex group w-full ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'} max-w-[80%]`}>
                  <div className={`px-4 py-2.5 rounded-2xl text-[13px] font-medium shadow-sm relative z-10 ${isAdmin ? 'bg-red-900 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}`}>
                    
                    {m.attachmentUrl && (
                      <div className={`${m.text?.trim() ? 'mb-1.5' : ''}`}>
                        {m.attachmentType?.startsWith('image/') ? (
                          <img src={m.attachmentUrl} alt="attachment" className="max-w-[160px] max-h-[160px] rounded-lg object-contain bg-white cursor-pointer" onClick={() => onViewImage(m.attachmentUrl)} />
                        ) : (
                          <div onClick={() => onViewDocument({url: m.attachmentUrl, type: m.attachmentType, name: m.attachmentName})} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs ${isAdmin ? 'bg-red-950/40 text-white' : 'bg-gray-50 text-gray-800'}`}>
                            <FileText size={16} /> <span className="truncate w-32">{m.attachmentName || "File"}</span>
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
                  
                  {/* TIMESTAMP ALIGNMENT EXACTLY LIKE SCREENSHOT */}
                  <div className={`flex items-center gap-1.5 mt-1 px-1 ${isAdmin ? 'justify-end w-full' : 'justify-start w-full'}`}>
                    <span className="text-[10px] text-gray-400 font-medium">
                      {formatTime(m.timestamp)} {m.isEdited ? '• Edited' : ''}
                    </span>
                    {isAdmin && <span className={`text-[10px] font-bold uppercase ${m.seen ? 'text-blue-500' : m.status === 'delivered' ? 'text-gray-400' : 'text-gray-300'}`}>{m.seen ? 'SEEN' : m.status}</span>}
                  </div>

                </div>
              </div>
            );
          })}
        </div>

        {/* INPUT AREA EXACTLY LIKE SCREENSHOT */}
        <div className="bg-white border-t border-gray-200 z-20 shrink-0 p-3">
          {selectedFile && (
            <div className="px-3 py-2 bg-red-50/50 border border-red-100 rounded-lg mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 truncate">{selectedFile.name}</span>
              <button onClick={() => setSelectedFile(null)} className="p-1 text-gray-400 hover:text-red-600"><X size={14} /></button>
            </div>
          )}
          <form onSubmit={sendMessage} className="flex gap-2 items-center">
            <input type="file" ref={fileInputRef} onChange={e => {if(e.target.files[0]) setSelectedFile(e.target.files[0]); fileInputRef.current.value="";}} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-red-900 transition-colors">
              <Paperclip size={20} />
            </button>
            <input 
              type="text" 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              placeholder="Message..." 
              className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-red-900 focus:ring-1 focus:ring-red-900 transition-all" 
            />
            <button 
              type="submit" 
              disabled={(!input.trim() && !selectedFile) || isSendingMessage || uploading} 
              className="bg-red-900 text-white p-2.5 rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors flex items-center justify-center shadow-sm"
            >
              {isSendingMessage || uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>

      </div>
    </div>,
    document.body
  );
};

const User = () => {
  const [users, setUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [chatUser, setChatUser] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null, targetId: null });
  const [loading, setLoading] = useState(true);
  const [viewingImage, setViewingImage] = useState(null);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState({ firstName: '', lastName: '', username: '', profilePicture: '', uid: '' });
  const [uploadingImage, setUploadingImage] = useState(false);
  const profileFileInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeRoleTab, setActiveRoleTab] = useState('user');
  const [formData, setFormData] = useState({ firstName: '', lastName: '', username: '', password: '', confirmPassword: '', role: 'user' });
  const backendUrl = "https://finalfinal-backend.onrender.com";

  useEffect(() => {
    const db = getDatabase();
    const unsubUsers = onValue(ref(db, 'users'), snap => { setUsers(snap.val() ? Object.keys(snap.val()).map(uid => ({ uid, ...snap.val()[uid] })) : []); setLoading(false); });
    const unsubChats = onValue(ref(db, 'chats'), snap => {
      const counts = {};
      if (snap.val()) Object.keys(snap.val()).forEach(uid => { counts[uid] = Object.values(snap.val()[uid]).filter(m => m.sender !== 'admin' && !m.seen).length; });
      setUnreadCounts(counts);
    });
    return () => { unsubUsers(); unsubChats(); };
  }, []);

  const requestCreate = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) return alert("Passwords mismatch!");
    setConfirmModal({ isOpen: true, type: 'create', targetId: null });
  };

  const performAction = async () => {
    const { type, targetId } = confirmModal; setConfirmModal({ isOpen: false, type: null, targetId: null });
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${backendUrl}${type === 'create' ? '/admin-create-user' : `/admin-delete-user/${targetId}`}`, {
        method: type === 'create' ? 'POST' : 'DELETE', headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: type === 'create' ? JSON.stringify(formData) : null
      });
      if (response.ok) {
        setSuccessMessage(type === 'create' ? "Account Created!" : "Account Deleted!");
        if (type === 'create') { setFormData({ firstName: '', lastName: '', username: '', password: '', confirmPassword: '', role: activeRoleTab }); setIsAddModalOpen(false); }
      } else alert(`Error: ${(await response.json()).detail || 'Failed'}`);
    } catch (e) { console.error(e); }
  };

  const handleProfileImageUpload = async (e) => {
    if (!e.target.files[0]) return;
    setUploadingImage(true);
    try {
      const file = e.target.files[0];
      const uniqueName = `profiles/${editUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      await supabase.storage.from('profile_ccjs').upload(uniqueName, file, { upsert: true });
      const { data } = supabase.storage.from('profile_ccjs').getPublicUrl(uniqueName);
      setEditUser(prev => ({ ...prev, profilePicture: data.publicUrl }));
    } catch (error) { alert("Upload failed."); } finally { setUploadingImage(false); }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    try {
      await update(ref(getDatabase(), `users/${editUser.uid}`), { ...editUser, fullName: `${editUser.firstName} ${editUser.lastName}` });
      setSuccessMessage("Updated successfully!"); setIsEditModalOpen(false);
    } catch (error) { alert("Update failed."); }
  };

  const filteredUsers = users.filter(u => {
    const role = (u.role || '').toLowerCase();
    return role !== 'admin' && ((role === 'personnel' || role === 'staff') ? 'personnel' : 'user') === activeRoleTab &&
           ((u.username||"").toLowerCase().includes(searchTerm.toLowerCase()) || `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  return (
    <div className="bg-transparent h-full w-full animate-fade-in font-sans text-gray-800 flex flex-col text-sm">
      <ImageViewerModal imageUrl={viewingImage} onClose={() => setViewingImage(null)} />
      <DocumentViewerModal documentInfo={viewingDocument} onClose={() => setViewingDocument(null)} />
      <SuccessModal message={successMessage} onClose={() => setSuccessMessage('')} />
      <MessengerModal isOpen={!!chatUser} onClose={() => setChatUser(null)} targetUser={chatUser} onViewImage={setViewingImage} onViewDocument={setViewingDocument} />
      <ConfirmModal isOpen={confirmModal.isOpen} type={confirmModal.type} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={performAction} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <div className="flex bg-white p-1 rounded-lg shadow-sm border border-gray-200">
          <button onClick={() => setActiveRoleTab('user')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${activeRoleTab === 'user' ? 'bg-red-900 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>
            <img 
              src="./technician.png" 
              alt="Technician" 
              className={`w-3.5 h-3.5 object-contain transition-all ${activeRoleTab === 'user' ? 'brightness-0 invert opacity-100' : 'opacity-80'}`} 
            /> Technicians
          </button>
          <button onClick={() => setActiveRoleTab('personnel')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${activeRoleTab === 'personnel' ? 'bg-red-900 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>
            <img 
              src="./personel.png" 
              alt="Personnel" 
              className={`w-3.5 h-3.5 object-contain transition-all ${activeRoleTab === 'personnel' ? 'brightness-0 invert opacity-100' : 'opacity-80'}`} 
            /> Personnel
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm focus:ring-1 focus:ring-red-900 outline-none text-xs transition-all" />
          </div>
          <button onClick={() => { setFormData(prev => ({ ...prev, role: activeRoleTab })); setIsAddModalOpen(true); }} className="bg-red-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-800 transition-all flex items-center gap-1.5 shadow active:scale-95 whitespace-nowrap">
              <UserPlus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">Profile</th>
                <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">Status</th>
                <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">Messages</th>
                <th className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right border-b border-gray-200">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="4" className="py-12 text-center"><Loader2 className="animate-spin text-red-900 mx-auto" size={24}/></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan="4" className="py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">No users found</td></tr>
              ) : filteredUsers.map((u) => {
                const unread = unreadCounts[u.uid] || 0;
                return (
                  <tr key={u.uid} className="hover:bg-red-50/40 transition-colors group">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className={`relative w-8 h-8 rounded-full flex-shrink-0 border border-gray-200 overflow-hidden ${u.profilePicture ? 'bg-white' : 'bg-red-50 text-red-900'}`}>
                          {u.profilePicture ? <img src={u.profilePicture} className="w-full h-full object-cover cursor-pointer" alt="Profile" onClick={() => setViewingImage(u.profilePicture)} /> : <div className="w-full h-full flex items-center justify-center font-black text-xs">{(u.username || "U").charAt(0).toUpperCase()}</div>}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">{u.username || "Unknown"}</span>
                          <span className="text-[10px] text-gray-500">{u.firstName} {u.lastName}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><UserStatusBadge uid={u.uid} initialStatus={u.status} initialLastSeen={u.lastSeen} /></td>
                    <td className="px-4 py-2.5">
                        {unread > 0 ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>{unread} New</span> : <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded border border-transparent">Up to date</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => setChatUser(u)} 
                          className={`p-1.5 border rounded-md transition-colors ${unread > 0 ? 'text-white bg-red-600 border-red-600 hover:bg-red-700 shadow-sm' : 'text-gray-600 bg-gray-50 border-gray-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200'}`}
                          title="Message User"
                        >
                          <MessageSquare size={14} />
                        </button>
                        <button 
                          onClick={() => { setEditUser({ ...u }); setIsEditModalOpen(true); }} 
                          className="p-1.5 text-gray-600 bg-gray-50 border border-gray-200 hover:text-green-600 hover:bg-green-50 hover:border-green-200 rounded-md transition-colors"
                          title="Edit User"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => setConfirmModal({ isOpen: true, type: 'delete', targetId: u.uid })} 
                          className="p-1.5 text-gray-600 bg-gray-50 border border-gray-200 hover:text-red-600 hover:bg-red-50 hover:border-red-200 rounded-md transition-colors"
                          title="Delete User"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- ADD USER MODAL (Using Portal) --- */}
      {isAddModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 ring-1 ring-black/5 animate-fade-in">
            <div className="bg-red-900 p-3 flex justify-between items-center text-white">
              <h2 className="font-bold text-sm flex items-center gap-2"><UserPlus size={16}/> Register Account</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="hover:bg-red-800 p-1 rounded transition-colors"><X size={16} /></button>
            </div>
            <form onSubmit={requestCreate} className="p-4 space-y-3">
              <div className="flex gap-2 mb-1">
                <button type="button" onClick={() => setFormData(prev => ({...prev, role: 'user'}))} className={`flex-1 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 ${formData.role === 'user' ? 'bg-red-50 text-red-900 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  <img src="./technician.png" alt="Tech" className="w-3.5 h-3.5 object-contain opacity-80" /> Tech
                </button>
                <button type="button" onClick={() => setFormData(prev => ({...prev, role: 'personnel'}))} className={`flex-1 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 ${formData.role === 'personnel' ? 'bg-red-50 text-red-900 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  <img src="./personel.png" alt="Staff" className="w-3.5 h-3.5 object-contain opacity-80" /> Staff
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">First Name</label><input required value={formData.firstName} onChange={(e)=>setFormData(prev => ({...prev, firstName:e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 font-medium" /></div>
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Last Name</label><input required value={formData.lastName} onChange={(e)=>setFormData(prev => ({...prev, lastName:e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 font-medium" /></div>
              </div>
              <div><label className="text-[10px] font-bold text-gray-500 uppercase">Username</label><input required value={formData.username} onChange={(e)=>setFormData(prev => ({...prev, username:e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 font-medium" /></div>
              <PasswordInput label="Create Password" value={formData.password} onChange={(e)=>setFormData(prev => ({...prev, password:e.target.value}))} />
              <PasswordInput label="Confirm Password" value={formData.confirmPassword} onChange={(e)=>setFormData(prev => ({...prev, confirmPassword:e.target.value}))} />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg text-xs uppercase hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-red-900 text-white font-bold py-2 rounded-lg text-xs uppercase shadow hover:bg-red-800 transition-colors">Create</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* --- EDIT USER MODAL (Using Portal) --- */}
      {isEditModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 ring-1 ring-black/5 animate-fade-in">
            <div className="bg-red-900 p-3 flex justify-between items-center text-white">
              <h2 className="font-bold text-sm flex items-center gap-2"><Edit2 size={16}/> Edit Profile</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="hover:bg-red-800 p-1 rounded transition-colors"><X size={16} /></button>
            </div>
            <form onSubmit={submitEdit} className="p-4 space-y-3">
              <div className="flex flex-col items-center justify-center mb-2">
                <input type="file" accept="image/*" ref={profileFileInputRef} onChange={handleProfileImageUpload} className="hidden" />
                <div onClick={() => profileFileInputRef.current?.click()} className="relative w-16 h-16 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center cursor-pointer group overflow-hidden">
                  {uploadingImage ? <Loader2 className="animate-spin text-red-900" size={24} /> : editUser.profilePicture ? <><img src={editUser.profilePicture} alt="Profile" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Camera size={16} className="text-white" /></div></> : <Camera size={20} className="text-gray-400 group-hover:text-red-900 transition-colors" />}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">First Name</label><input required value={editUser.firstName} onChange={(e)=>setEditUser(prev => ({...prev, firstName:e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 font-medium" /></div>
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Last Name</label><input required value={editUser.lastName} onChange={(e)=>setEditUser(prev => ({...prev, lastName:e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 font-medium" /></div>
              </div>
              <div><label className="text-[10px] font-bold text-gray-500 uppercase">Username</label><input required value={editUser.username} onChange={(e)=>setEditUser(prev => ({...prev, username:e.target.value}))} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-red-900 font-medium" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg text-xs uppercase hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" disabled={uploadingImage} className="flex-1 bg-red-900 text-white font-bold py-2 rounded-lg text-xs uppercase shadow disabled:opacity-50 hover:bg-red-800 transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default User;