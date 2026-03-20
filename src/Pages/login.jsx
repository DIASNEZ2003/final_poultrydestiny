import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase'; 
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get } from 'firebase/database'; 
import { useNavigate } from 'react-router-dom';

const Login = () => {
  // ==========================================
  // 1. STATE VARIABLES
  // ==========================================
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false); 
  const [isLoading, setIsLoading] = useState(false); 
  
  const [showModal, setShowModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const navigate = useNavigate();

  // ==========================================
  // 2. LOAD SAVED CREDENTIALS (FIXED)
  // ==========================================
  useEffect(() => {
    const savedUsername = localStorage.getItem('rememberedUsername');
    const savedPassword = localStorage.getItem('rememberedPassword');
    
    if (savedUsername && savedPassword) {
      setUsername(savedUsername);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const triggerError = (message) => {
    setErrorMessage(message);
    setShowModal(true);
    setIsLoading(false);
  };

  // ==========================================
  // 3. CORE LOGIN FUNCTION
  // ==========================================
  const performLogin = async (loginUsername, loginPassword) => {
    setIsLoading(true); 
    const firebaseEmail = `${loginUsername.trim()}@example.com`; 
    
    try {
      const userCert = await signInWithEmailAndPassword(auth, firebaseEmail, loginPassword);
      const user = userCert.user;

      const userRef = ref(db, `users/${user.uid}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const userData = snapshot.val();
        
        if (userData.role === "admin") {
          if (rememberMe) {
            localStorage.setItem('rememberedUsername', loginUsername.trim());
            localStorage.setItem('rememberedPassword', loginPassword);
          } else {
            localStorage.removeItem('rememberedUsername');
            localStorage.removeItem('rememberedPassword');
          }
          
          navigate('/dashboard'); 
        } else {
          await signOut(auth); 
          triggerError("Access Denied: You must be an Admin to log in.");
        }
      } else {
        await signOut(auth);
        triggerError("Access Denied: User profile not found in our database.");
      }
    } catch (err) { 
      console.error(err);
      triggerError("Invalid username or password. Please try again.");
    }
  };

  // ==========================================
  // 4. FORM & KEYBOARD SUBMIT HANDLERS
  // ==========================================
  const handleFormSubmit = (e) => {
    e.preventDefault();
    performLogin(username, password);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      performLogin(username, password);
    }
  };

  // ==========================================
  // 5. USER INTERFACE (UI)
  // ==========================================
  return (
    <div className="flex min-h-screen w-full bg-red-50 relative">
      {/* Left Side - Image/Branding */}
      <div className="hidden lg:flex w-1/2 items-center justify-center bg-red-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900 to-red-950 opacity-90 z-10"></div>
        <img 
          src="https://images.unsplash.com/photo-1563205844-3d9178cb7717?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" 
          alt="Chicken Farm" 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-10000 hover:scale-110"
        />
        <div className="z-20 text-white text-center px-12 animate-fade-in-down">
          <div className="mb-6">
            <h1 className="text-5xl font-extrabold tracking-tight">
              Destiny Angas <br/> Monitoring System
            </h1>
          </div>
          <p className="text-xl text-red-100 font-light tracking-wide">
             Admin Portal: Secure Poultry Management
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 md:px-16 lg:px-24 bg-white">
        <div className="w-full max-w-md mx-auto animate-slide-up">
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back, Boss!</h2>
            <p className="text-gray-500">Login to check your Poultry.</p>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-6">
            <div className="group">
              <label className="block text-sm font-medium text-gray-700 mb-2 group-hover:text-red-700">Username</label>
              <input 
                type="text" 
                placeholder="Enter username" 
                value={username}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-red-600 focus:bg-white focus:ring-4 focus:ring-red-100 transition-all duration-300 outline-none" 
                onChange={e => setUsername(e.target.value)} 
                onKeyDown={handleKeyDown} 
                required 
                disabled={isLoading}
              />
            </div>
            
            <div className="group">
              <label className="block text-sm font-medium text-gray-700 mb-2 group-hover:text-red-700">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={password}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-red-600 focus:bg-white focus:ring-4 focus:ring-red-100 transition-all duration-300 outline-none pr-12" 
                  onChange={e => setPassword(e.target.value)} 
                  onKeyDown={handleKeyDown} 
                  required 
                  disabled={isLoading}
                />
                
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-red-700 focus:outline-none font-medium text-sm transition-colors"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center cursor-pointer" onClick={() => !isLoading && setRememberMe(!rememberMe)}>
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                  className="h-4 w-4 text-red-900 focus:ring-red-900 border-gray-300 rounded cursor-pointer" 
                />
                <label className="ml-2 block text-sm text-gray-900 cursor-pointer select-none">Remember me</label>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-4 px-4 bg-gradient-to-r from-red-800 to-red-900 hover:from-red-900 hover:to-black text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? 'Logging you in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>

      {/* ========================================== */}
      {/* 6. ERROR MODAL POPUP                       */}
      {/* ========================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 transform transition-all animate-slide-up text-center">
            
            {/* Alert Icon */}
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
              <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Login Failed</h3>
            <p className="text-gray-600 mb-8">{errorMessage}</p>
            
            <button
              onClick={() => setShowModal(false)}
              className="w-full py-3 px-4 bg-red-900 hover:bg-red-800 text-white font-bold rounded-xl transition-all duration-300 shadow-md hover:shadow-lg"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
      
      {/* CSS Animations */}
      <style>{`
        @keyframes slide-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.5s ease-out forwards;
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        @keyframes fade-in-down {
          0% { opacity: 0; transform: translateY(-20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fade-in-down 1s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default Login;