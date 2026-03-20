import React, { useState, useEffect, useRef } from "react";
import { auth } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, update, get, onValue, onDisconnect } from "firebase/database";
import { supabase } from "../supabaseClient";

// Import the newly migrated, Firebase-direct BatchControl component
import BatchControl from "../Dashboard/BatchControl";

const Dashboard = () => {
  // ==========================================
  // 1. STATE & REFERENCES
  // ==========================================
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState("Boss"); 
  const [profileImage, setProfileImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Weather States
  const [weatherData, setWeatherData] = useState({ 
    temp: "--", feelsLike: null, humidity: 0, precipitation: 0, 
    windSpeed: 0, uvIndex: 0, code: null, unit: "°C", isDay: 1,
    forecast: [], locationName: "Loading..." 
  });
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  
  // State for the 7-day Forecast Dropdown
  const [showWeatherModal, setShowWeatherModal] = useState(false);

  // Securely stores the device's exact coordinates
  const deviceLocation = useRef({ lat: 10.3323, lon: 123.3283 }); // Fallback: Vallehermoso coords

  // Sidebar State 
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const savedState = localStorage.getItem("isSidebarOpen");
    return savedState !== null ? JSON.parse(savedState) : true;
  });

  useEffect(() => {
    localStorage.setItem("isSidebarOpen", JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  // Modal States
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

  // ==========================================
  // 2. WEATHER MAPPING FUNCTION
  // ==========================================
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

  // ==========================================
  // 3. EXACT LAPTOP LOCATION & 7-DAY WEATHER
  // ==========================================

  // Automatically turns LAT/LON into a readable city name (Using OpenStreetMap for high accuracy in PH)
  const fetchLocationName = async (lat, lon) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`);
      const data = await res.json();
      if (data && data.address) {
        // Look for town/municipality first, fallback to city or village
        const city = data.address.town || data.address.municipality || data.address.city || data.address.village || "Vallehermoso";
        // Look for province or state
        const province = data.address.state || data.address.province || data.address.region || "Negros Oriental";
        return `${city}, ${province}`;
      }
      return "Vallehermoso, Negros Oriental";
    } catch (e) {
      return "Vallehermoso, Negros Oriental"; // Fallback
    }
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
          date: time,
          maxTemp: Math.round(d.temperature_2m_max[index]),
          minTemp: Math.round(d.temperature_2m_min[index]),
          weatherCode: d.weather_code[index]
        }));

        const locName = await fetchLocationName(lat, lon); // Translate coords to highly accurate city name

        const weatherPayload = {
          temperature: Math.round(c.temperature_2m * 10) / 10 ?? 0,
          feelsLike: Math.round(c.apparent_temperature * 10) / 10 ?? 0,
          humidity: c.relative_humidity_2m ?? 0,
          precipitation: Math.round(c.precipitation * 10) / 10 ?? 0,
          windSpeed: Math.round(c.wind_speed_10m * 10) / 10 ?? 0,
          uvIndex: c.uv_index ?? 0,
          weatherCode: c.weather_code ?? 0,
          isDay: c.is_day ?? 1,
          unit: "°C",
          forecast: weeklyForecast, 
          locationName: locName, // Save location name to Firebase
          last_updated: Date.now()
        };
        
        await update(ref(db, 'current_weather'), weatherPayload);
      }
    } catch (err) {
      console.error("Weather refresh error:", err);
      throw err; 
    }
  };

  const updateLocationAndWeather = () => {
    setIsRefreshingLocation(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          deviceLocation.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          try {
            await fetchWeather(pos.coords.latitude, pos.coords.longitude);
          } catch (e) {
            alert("Weather update failed. Please check your internet connection.");
          }
          setIsRefreshingLocation(false);
        },
        (err) => {
          console.warn("Location denied by user.", err);
          setIsRefreshingLocation(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } 
      );
    } else {
      setIsRefreshingLocation(false);
    }
  };

  useEffect(() => {
    const db = getDatabase();
    
    // Fetch initial location and weather on load
    updateLocationAndWeather(); 

    // Re-fetch precise location and weather every 1 minute (60000 ms)
    const weatherInterval = setInterval(() => {
      updateLocationAndWeather();
    }, 60000); 

    const unsubscribeWeather = onValue(ref(db, 'current_weather'), (snapshot) => {
      if (snapshot.exists()) {
        const d = snapshot.val();
        setWeatherData({
          temp: d.temperature ?? "--", feelsLike: d.feelsLike ?? null,  
          humidity: d.humidity ?? 0, precipitation: d.precipitation ?? 0,
          windSpeed: d.windSpeed ?? 0, uvIndex: d.uvIndex ?? 0,
          code: d.weatherCode ?? null, unit: d.unit || "°C",
          isDay: d.isDay !== undefined ? d.isDay : 1,
          forecast: d.forecast || [],
          locationName: d.locationName || "Vallehermoso, Negros Oriental" // Updated Default Location
        });
        setIsWeatherLoading(false); 
      }
    });

    return () => {
      clearInterval(weatherInterval);
      unsubscribeWeather(); 
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================
  // 4. USER PRESENCE & PROFILE SYNC
  // ==========================================
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
        } catch (error) { console.error("User data fetch error:", error); }
      }
    });
    return () => unsubscribe();
  }, []);

  const confirmLogout = async () => {
    try {
      if (user) await update(ref(getDatabase(), `users/${user.uid}`), { status: "offline", lastSeen: Date.now() });
      await signOut(auth); 
    } catch (error) { console.error(error); }
    setShowLogoutModal(false);
  };

  // ==========================================
  // 5. SUPABASE AVATAR UPLOAD
  // ==========================================
  const handleImageUpload = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file || !user) return;
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.uid}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      await update(ref(getDatabase(), `users/${user.uid}`), { profileImage: data.publicUrl });
      setProfileImage(data.publicUrl);
      setModalMessage("Profile picture updated successfully!");
      setShowSuccessModal(true);
    } catch (error) {
      alert("Upload error: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // ==========================================
  // DYNAMIC BACKGROUND & TEXT COLOR LOGIC
  // ==========================================
  const getDynamicBackground = () => {
    const hour = new Date().getHours(); 
    if (hour >= 5 && hour <= 11) return "./1.jpg";  // Morning
    if (hour >= 12 && hour <= 15) return "./2.jpg"; // Afternoon
    if (hour >= 16 && hour <= 19) return "./3.jpg"; // Evening/Sunset
    return "./4.jpg";                               // Night
  };

  const isDarkBackground = () => {
    const hour = new Date().getHours();
    return (hour >= 16 || hour <= 4); 
  };

  const mainTextColor = isDarkBackground() ? "text-white" : "text-gray-900";
  const subTextColor = isDarkBackground() ? "text-gray-200" : "text-gray-600";
  const labelTextColor = isDarkBackground() ? "text-gray-300" : "text-gray-500";
  const closeButtonColor = isDarkBackground() ? "text-white hover:text-red-400" : "text-gray-600 hover:text-red-600";

  const weatherUI = getWeatherDetails(weatherData.code, weatherData.isDay);

  // ==========================================
  // 6. MAIN UI RENDER
  // ==========================================
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-red-900 text-white flex flex-col shadow-2xl z-20 transition-all duration-500 ease-in-out relative h-full`}>
        <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`absolute z-30 pt-3 p-1.5 rounded-full hover:bg-red-800 transition-all duration-500 ease-in-out ${isSidebarOpen ? 'top-3 right-3' : 'top-3 left-1/2 -translate-x-1/2'}`}
        >
            <img src="./lapse.png" alt="Toggle" className={`w-5 h-5 invert transition-transform duration-500 ${isSidebarOpen ? 'rotate-0' : 'rotate-180'}`} />
        </button>

        <div className={`flex-shrink-0 flex flex-col items-center justify-center border-b border-red-800 bg-red-950 relative transition-all duration-500 ease-in-out ${isSidebarOpen ? 'pt-6 pb-6 px-4' : 'pt-16 pb-5 px-2'}`}>
          <div
            className={`relative group cursor-pointer transition-all duration-500 ease-in-out ${isSidebarOpen ? 'h-20 w-20' : 'h-10 w-10'} bg-white rounded-full flex items-center justify-center border-2 border-red-200 shadow-xl overflow-hidden`}
            onClick={() => fileInputRef.current.click()}
          >
            {profileImage ? (
              <img src={profileImage} alt="Profile" className="w-full h-full object-cover transition-opacity duration-300 animate-fade-in" />
            ) : (
              <span className={`font-bold text-red-900 transition-all duration-500 ${isSidebarOpen ? 'text-2xl' : 'text-sm'}`}>{fullName.charAt(0)}</span>
            )}
            <div className={`absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center transition-opacity duration-300 ${uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              <span className="text-white text-[10px] font-bold">{uploading ? "..." : "Edit"}</span>
            </div>
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
            <button
              key={item.name}
              onClick={() => setActiveTab(item.name)}
              className={`flex items-center w-full px-3 py-3 rounded-xl transition-all duration-300 ease-in-out group ${activeTab === item.name ? "bg-red-800 text-white shadow-sm transform scale-[1.02]" : "text-red-100 hover:bg-red-800/50 hover:text-white"} ${!isSidebarOpen && 'justify-center'}`}
              title={!isSidebarOpen ? item.name : ''}
            >
              <img src={item.icon} alt={item.name} className={`w-5 h-5 invert transition-all duration-300 ${activeTab === item.name ? 'opacity-100' : 'opacity-70 group-hover:opacity-100 group-hover:scale-110'} ${isSidebarOpen ? 'mr-3' : 'mr-0'}`} />
              {isSidebarOpen && <span className="font-medium text-sm whitespace-nowrap">{item.name}</span>}
            </button>
          ))}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-red-800 bg-red-950">
          <button onClick={() => setShowLogoutModal(true)} className={`flex items-center justify-center w-full py-2.5 rounded-xl text-red-100 hover:bg-red-900 hover:text-white transition-all duration-300 border border-red-900 hover:border-red-700 ${isSidebarOpen ? 'px-3' : 'px-0'}`}>
            {isSidebarOpen ? <span className="font-bold text-xs uppercase tracking-wider">Sign Out</span> : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
            )}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-gray-50">
        
        {/* Header */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10 flex-shrink-0 border-b border-gray-100 transition-all duration-300">
          <h1 className="text-xl font-black text-gray-800 tracking-tight">{activeTab}</h1>

          {/* REAL-TIME WEATHER & LOCATION BUTTONS */}
          <div className="flex items-center gap-3 relative">
            
            {/* NEW: Locate Area Text Button */}
            <button 
              onClick={updateLocationAndWeather}
              disabled={isRefreshingLocation}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-300 border shadow-sm ${
                isRefreshingLocation 
                  ? 'bg-red-50 border-red-100 text-red-600' 
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
              }`}
              title="Get Precise Device Location"
            >
              <svg className={`w-3.5 h-3.5 ${isRefreshingLocation ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {isRefreshingLocation ? "Locating..." : "Locate Area"}
              </span>
            </button>

            {/* SMALLER Weather Widget (Toggles Dropdown) */}
            {isWeatherLoading ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-gray-100 animate-pulse">
                <div className="w-5 h-5 bg-gray-300 rounded-full"></div>
                <div className="flex flex-col gap-0.5">
                  <div className="w-8 h-1.5 bg-gray-300 rounded"></div>
                  <div className="w-5 h-2 bg-gray-300 rounded"></div>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setShowWeatherModal(!showWeatherModal)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border shadow-sm transition-all duration-300 ease-in-out cursor-pointer ${weatherUI.bg} ${showWeatherModal ? 'ring-2 ring-red-200 scale-[1.02]' : 'hover:scale-[1.02]'}`}
              >
                <span className="text-lg">{weatherUI.icon}</span>
                <div className="flex flex-col text-left leading-none gap-0.5">
                  <span className={`text-[8px] font-black uppercase tracking-widest ${weatherUI.color}`}>{weatherUI.label}</span>
                  <span className={`font-black text-xs leading-none ${weatherData.isDay === 0 ? 'text-white' : 'text-gray-900'}`}>
                    {weatherData.temp}{weatherData.unit}
                  </span>
                </div>
              </button>
            )}

            {/* ========================================== */}
            {/* DYNAMIC BACKGROUND 7-DAY WEATHER MODAL     */}
            {/* ========================================== */}
            {showWeatherModal && (
              <>
                <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowWeatherModal(false)}></div>
                
                {/* WIDENED to 460px so all 7 days fit perfectly side-by-side */}
                <div className="absolute right-0 top-full mt-3 rounded-2xl w-[460px] shadow-2xl border border-gray-200 z-50 animate-fade-in-down cursor-default origin-top-right overflow-hidden ring-1 ring-black/10">
                  
                  {/* Dynamic Background Image - Sharp and Unblurred */}
                  <div 
                    className="absolute inset-0 bg-cover bg-center transition-all duration-1000 z-0" 
                    style={{ backgroundImage: `url('${getDynamicBackground()}')` }}
                  ></div>
                  
                  {/* Light/Dark Overlay to help text readability */}
                  <div className={`absolute inset-0 z-0 transition-colors duration-1000 ${isDarkBackground() ? 'bg-black/40' : 'bg-white/30'}`}></div>

                  {/* Modal Content container (relative z-10 puts it ON TOP of the image) */}
                  <div className="relative z-10 p-5">
                    <button onClick={() => setShowWeatherModal(false)} className={`absolute top-4 right-4 transition-colors ${closeButtonColor}`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    <div className="flex items-center justify-between border-b border-gray-300/30 pb-4 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-5xl drop-shadow-md">{weatherUI.icon}</span>
                        <div>
                          <h2 className={`text-4xl font-extrabold tracking-tight leading-none drop-shadow-md transition-colors ${mainTextColor}`}>
                            {weatherData.temp}<span className={`text-xl font-bold align-top transition-colors ${subTextColor}`}>{weatherData.unit}</span>
                          </h2>
                          <p className={`text-xs font-bold uppercase tracking-wider mt-1 drop-shadow-md transition-colors ${subTextColor}`}>{weatherUI.label}</p>
                          
                          {/* NEW: DYNAMIC LOCATION INDICATOR */}
                          <div className={`flex items-center gap-1 mt-1.5 text-[9px] font-bold tracking-wide drop-shadow-md transition-colors ${subTextColor}`}>
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {weatherData.locationName}
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
                      
                      {/* Justify-between spreads all 7 days evenly across the 460px box */}
                      <div className="flex justify-between items-center gap-1 w-full">
                        {weatherData.forecast && weatherData.forecast.slice(0, 7).map((day, index) => {
                          const ui = getWeatherDetails(day.weatherCode, 1);
                          const isToday = index === 0;
                          return (
                            <div key={index} className={`flex-1 flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 ${isToday ? (isDarkBackground() ? 'bg-white/20 border border-white/50 shadow-md backdrop-blur-sm' : 'bg-white/80 border border-white/50 shadow-md ring-1 ring-red-200') : (isDarkBackground() ? 'bg-black/20 hover:bg-white/20 border border-transparent backdrop-blur-sm' : 'bg-white/40 hover:bg-white/80 border border-transparent shadow-sm')}`}>
                              <span className={`text-[9px] font-black drop-shadow-sm transition-colors ${isToday ? (isDarkBackground() ? 'text-white' : 'text-red-700') : (isDarkBackground() ? 'text-gray-300' : 'text-gray-700')}`}>
                                {getDayName(day.date, index)}
                              </span>
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in-down h-full">
          {activeTab === "Batch Control" ? (
            <BatchControl />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100 p-8 transition-all duration-300 hover:shadow-md">
              <svg className="w-16 h-16 mb-4 text-red-900 opacity-20 transition-transform duration-700 hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
              <h2 className="text-2xl font-black text-gray-800 mb-2">{activeTab}</h2>
              <p className="text-center max-w-sm text-sm text-gray-500 leading-relaxed font-medium">
                The <span className="font-bold text-red-800">{activeTab}</span> module is temporarily disabled while we transition our code to communicate entirely through the Firebase Realtime Database.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* LOGOUT & SUCCESS MODALS */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-80 text-center shadow-2xl transform transition-all animate-slide-up border border-gray-100">
            <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-1">Success!</h3>
            <p className="text-sm text-gray-500 mb-6 font-medium">{modalMessage}</p>
            <button onClick={() => setShowSuccessModal(false)} className="w-full py-3 bg-red-900 text-white text-sm font-bold rounded-xl shadow-md hover:bg-red-800 transition-all active:scale-95">Continue</button>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        
        @keyframes fade-in-down { 0% { opacity: 0; transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-down { animation: fade-in-down 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
        
        @keyframes slide-up { 0% { opacity: 0; transform: translateY(15px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default Dashboard;