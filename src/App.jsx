import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './Pages/login';
import Dashboard from './Pages/dashboard';

const App = () => {
  return (
    <Router>
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;