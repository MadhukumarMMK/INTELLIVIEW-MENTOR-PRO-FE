import React, { useState, useEffect, useContext } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ThemeContext } from "../context/ThemeContext";
import "./Navbar.css";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useContext(ThemeContext);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user") || "null"));

  useEffect(() => {
    setUser(JSON.parse(localStorage.getItem("user") || "null"));
  }, [location.pathname]);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  const hiddenPaths = ["/login", "/interview"];
  const shouldHideNavbar = hiddenPaths.some(path => location.pathname.includes(path));
  if (shouldHideNavbar) return null;

  return (
    <nav className="v2-navbar">
      <div className="navbar-brand">
        <div className="brand-logo">IV</div>
        <Link to="/dashboard" className="brand-name">IntelliView</Link>
      </div>

      <div className="navbar-menu">
        {user ? (
          <div className="user-menu">
            {user.role !== "admin" && <Link to="/myreports" className="nav-link">My Reports</Link>}
            {user.role !== "admin" && <Link to="/digilocker" className="nav-link">DigiLocker</Link>}
            <Link to="/profile" className="nav-link">Profile</Link>
            {user.role === "admin" && <Link to="/admin" className="nav-link">Dashboard</Link>}

            {/* Theme Toggle — Deep Ocean / Ocean Day */}
            <button className="theme-toggle" onClick={toggleTheme} title={isDarkMode ? "Ocean Day Mode" : "Deep Ocean Mode"}>
              <span className="theme-toggle-track">
                <span className={`theme-toggle-thumb ${isDarkMode ? 'dark' : 'light'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {isDarkMode ? (
                      /* Deep Ocean — wave/depth icon */
                      <path d="M2 16c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0M2 20c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0M2 12c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    ) : (
                      /* Ocean Day — sun over water */
                      <>
                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 1v2M12 14v-1M5.6 3.6l1.4 1.4M17 5l1.4-1.4M2 8h2M20 8h2M5.6 12.4l1.4-1.4M17 11l1.4 1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M2 19c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </>
                    )}
                  </svg>
                </span>
              </span>
            </button>

            <span className="user-greeting">Hi, {user.first_name || user.roll_no}</span>
            <button onClick={logout} className="btn-logout">Logout</button>
          </div>
        ) : (
          <Link to="/login">
            <button className="btn-login-nav">Sign In</button>
          </Link>
        )}
      </div>
    </nav>
  );
}
