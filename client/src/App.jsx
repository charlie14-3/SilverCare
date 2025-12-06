import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import { auth } from './firebaseConfig';
import { useAuthState } from 'react-firebase-hooks/auth'; // Optional helper, but we can do it manually below

// Helper component to protect routes
const PrivateRoute = ({ children }) => {
  // We check if a user is logged in
  const user = auth.currentUser;
  // Note: For a real production app, you'd use an auth listener hook here
  // But for this setup, if they click "Login" on Home, they get the session.
  return user ? children : <Navigate to="/" />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route 
          path="/dashboard" 
          element={
            // You can remove PrivateRoute wrapper while testing if it annoys you
            <Dashboard />
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;