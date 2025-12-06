// client/src/Home.jsx
import React from 'react';
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../firebaseConfig";
import { useNavigate } from 'react-router-dom';
import "../css/Home.css";
function Home() {
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
      navigate('/dashboard'); // Redirects to dashboard after login
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div className="container">
      {/* Navbar */}
      <nav>
        <h2 className="logo">SILVER CASE</h2>
        <button onClick={handleLogin} className="loginBtn">Owner Login</button>
      </nav>

      {/* Hero Section */}
      <header className="hero">
        <h1 className="title">
          Elite Nurse Management <br/> for <span>Agencies</span>
        </h1>
        <p className="subtitle">
          Automate attendance, track locations, and manage your medical staff directly from Telegram. No apps to install.
        </p>
        <button onClick={handleLogin} className="ctaBtn">
          Get Started Free
        </button>
      </header>

      {/* Features Grid */}
      <div className="grid">
        <div className="card">
          <h3>📍 GPS Tracking</h3>
          <p>Real-time location updates instantly whenever staff marks attendance via Telegram.</p>
        </div>
        <div className="card">
          <h3>📸 Selfie Verification</h3>
          <p>Ensure authenticity with photo-based check-ins directly from the job site.</p>
        </div>
        <div className="card">
          <h3>🤖 Telegram Bot</h3>
          <p>Staff uses the chat app they already know. Zero learning curve for your team.</p>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>© 2025 Silver Case Inc. Built for Indian Healthcare Agencies.</p>
      </footer>
    </div>
  );
}

export default Home;