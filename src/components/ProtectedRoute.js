import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  
  // If no token is found, kick them back to the Login/Onboarding screen
  if (!token) return <Navigate to="/login" replace />;
  
  return children;
}