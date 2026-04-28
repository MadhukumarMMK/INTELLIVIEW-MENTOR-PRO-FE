import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { NotificationProvider } from "./context/NotificationContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Splash from "./components/Splash"; // <-- Import the Splash Screen
import InterviewSetup from "./pages/InterviewSetup";
// Pages
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding"; // <-- Import the new Onboarding Page
import Dashboard from "./pages/Dashboard";
import Interviews from "./pages/Interviews";
import InterviewModeSelection from './pages/InterviewModeSelection';
import Interview from "./pages/Interview";
import Report from "./pages/Report";
import MyReports from "./pages/MyReports";
import AdminPanel from "./pages/AdminPanel";
import AdminRoute from "./components/AdminRoute";
import Profile from "./pages/Profile";
import DigiLocker from "./pages/DigiLocker";
import PublicProfile from "./pages/PublicProfile";

function App() {
  const [showSplash, setShowSplash] = useState(true); // <-- State to handle the splash screen

  return (
    <NotificationProvider>
    <BrowserRouter>
      {showSplash && <Splash onComplete={() => setShowSplash(false)} />}
      {!showSplash && (
        <>
          <Navbar />
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            
            {/* New Onboarding Route protected by login */}
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/interviews" element={<ProtectedRoute><Interviews /></ProtectedRoute>} />
            <Route path="/interview/:id/mode" element={<ProtectedRoute><InterviewModeSelection /></ProtectedRoute>} />
            <Route path="/interview/:id" element={<ProtectedRoute><Interview /></ProtectedRoute>} />
            <Route path="/report/:id" element={<ProtectedRoute><Report /></ProtectedRoute>} />
            <Route path="/myreports" element={<ProtectedRoute><MyReports /></ProtectedRoute>} />
            <Route path="/interview-setup" element={<ProtectedRoute><InterviewSetup /></ProtectedRoute>} />
            <Route path="/interview/active" element={<ProtectedRoute><Interview /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/digilocker" element={<ProtectedRoute><DigiLocker /></ProtectedRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
            {/* PUBLIC: anyone with the link can view — no auth required */}
            <Route path="/profile/share/:roll_no" element={<PublicProfile />} />
          </Routes>
        </>
      )}
    </BrowserRouter>
    </NotificationProvider>
  );
}

export default App;