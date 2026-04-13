import React, { useState } from "react";
import axios from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { useNotification } from "../context/NotificationContext";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const notify = useNotification();
  const [rollNo, setRollNo] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
const res = await axios.post("/user/login", { roll_no: rollNo, password });      
      const user = res.data.user;
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(user));
      
      // --- ROLE-BASED ROUTING ---
      if (user.role === "admin") {
        navigate("/admin");
      } else if (!user.skills || user.skills.length === 0) {
        navigate("/onboarding");
      } else {
        navigate("/dashboard");
      }

    } catch (err) {
      notify.error(err.response?.data?.message || "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="onboarding-wrapper" style={{ justifyContent: "center" }}>
      <div className="v2-card onboarding-panel" style={{ minHeight: "auto", padding: "3rem" }}>
        <div className="brand-text" style={{ textAlign: "center" }}>IntelliView</div>
        <h2 className="panel-title" style={{ textAlign: "center" }}>Welcome back</h2>
        <p className="panel-subtitle" style={{ textAlign: "center" }}>Sign in to continue your interview practice</p>

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>Roll Number / Email</label>
            <input className="v2-input" value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="e.g. 21A91A0501" required />
          </div>
          
          <div className="input-group">
            <label>Password</label>
            <input type="password" className="v2-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          <button type="submit" className="btn-primary" disabled={loginLoading} style={{ marginTop: "1rem" }}>
            {loginLoading ? "Authenticating..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}