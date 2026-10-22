
import React, { useState, useRef, useEffect } from "react";
import { checkDemoLogin, loadDemoUsers } from "./auth/demoAuth";

const ASSETS = "/assets";

const UP_SEAL_URL =
  "https://upload.wikimedia.org/wikipedia/commons/f/fa/Seal_of_Uttar_Pradesh.svg";

// DEMO USERS
// TEMPORARY sign-in: the user list is injected at build time (VITE_DEMO_USERS) and is therefore visible in the
// browser bundle - it only keeps the pre-production demo working. Replace with backend authentication
// (see docs/architecture.md, "Authentication roadmap") before go-live.
const DEMO_USERS = loadDemoUsers();

const REDIRECT_URL = import.meta.env.VITE_DASHBOARD_PATH || "/AwasVikas/";

function Icon({ name, size = 19, ...props }) {
  const paths = {
    user: (
      <>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    lock: (
      <>
        <rect x="4.5" y="10" width="15" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.7" />
      </>
    ),
    eyeOff: (
      <>
        <path d="m3 3 18 18M10.6 5.6c.5-.1 1-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3.1 3.8M7.3 7.3A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.4-.3 3.5-.8" />
        <path d="M10.2 10.2a2.7 2.7 0 0 0 3.6 3.6" />
      </>
    ),
    arrow: (
      <path d="M5 12h14M13 6l6 6-6 6" />
    ),
    shield: (
      <>
        <path d="M12 22c5.5-2 8.5-5.7 8.5-10V5L12 2 3.5 5v7c0 4.3 3 8 8.5 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    pause: (
      <path d="M9 5v14M15 5v14" strokeWidth="2.8" />
    ),
    play: (
      <path d="m8 5 11 7-11 7V5Z" />
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8h.01" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export default function App() {
  const video = useRef(null);

  const [paused, setPaused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [username, setUsername] = useState(
    () => localStorage.getItem("upavp_remembered_id") || ""
  );

  const [password, setPassword] = useState("");

  const [remember, setRemember] = useState(
    () => !!localStorage.getItem("upavp_remembered_id")
  );

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [stateSealFailed, setStateSealFailed] = useState(false);

  // Background video accessibility
useEffect(() => {
  if (!video.current) return;

  // Background video speed
  video.current.playbackRate = 0.75;

  // Skip the 6.8 MB video on data-saver mode, a slow link (mobile hotspot) or reduced motion:
  // the poster image is shown instead and nothing is downloaded.
  const connection = navigator.connection;
  const slowLink =
    connection &&
    (connection.saveData ||
      /(^|-)(2g|3g)$/.test(connection.effectiveType || "") ||
      (connection.downlink && connection.downlink < 1.5));
  if (slowLink || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.current.pause();
    video.current.querySelectorAll("source").forEach((source) => source.remove());
    video.current.load();
    setPaused(true);
  }
}, []);

  // Background video play/pause
  async function toggleVideo() {
    if (!video.current) return;

    if (video.current.paused) {
      try {
        await video.current.play();
        setPaused(false);
      } catch {
        setPaused(true);
      }
    } else {
      video.current.pause();
      setPaused(true);
    }
  }

  // LOGIN AUTHENTICATION
  function handleSubmit(e) {
    e.preventDefault();
    setNotice("");

    const enteredUsername = username.trim();

    // Empty field validation
    if (!enteredUsername || !password) {
      setNotice("Enter your user ID and password to continue.");
      return;
    }

    setLoading(true);

    if (DEMO_USERS.length === 0) {
      setNotice("Sign-in is not configured for this environment. Please contact the administrator.");
      setLoading(false);
      return;
    }

    // Check username and password
    const matchedUser = checkDemoLogin(DEMO_USERS, enteredUsername, password);

    if (!matchedUser) {
      setNotice("Invalid user ID or password.");
      setLoading(false);
      return;
    }

    // Remember username only
    if (remember) {
      localStorage.setItem(
        "upavp_remembered_id",
        enteredUsername
      );
    } else {
      localStorage.removeItem("upavp_remembered_id");
    }

    // Successful login
    setNotice("");
    setPassword("");

    // Redirect to the dashboard (served by the same nginx at /AwasVikas/)
    window.location.assign(REDIRECT_URL);
  }

  // Forgot password
  function forgotPassword() {
    setNotice(
      "Please contact the system administrator to reset your password."
    );
  }

  return (
    <div className="login-page">

      {/* Background Video */}
   <video
  ref={video}
  className="background-video"
  autoPlay
  muted
  playsInline
  loop
  preload="metadata"
  poster={`${ASSETS}/housing-poster.jpg`}
  aria-hidden="true"
>
  <source
    src={`${ASSETS}/housing-aerial-bg.mp4`}
    type="video/mp4"
  />
</video>

      <div className="video-wash" aria-hidden="true" />

      <div className="page-content">

        {/* Header */}
        <header className="topbar">

          <div className="brand-block">

            <div className="brand-logo-box">
              <img
                src={`${ASSETS}/upavp-mark.png`}
                alt="UPAVP official mark"
              />
            </div>

            <div className="brand-words">
              <strong lang="hi">
                उत्तर प्रदेश आवास एवं विकास परिषद
              </strong>

              <span>
                Uttar Pradesh Awas Evam Vikas Parishad
              </span>
            </div>

          </div>

          <div
            className="government-mark"
            title="Government of Uttar Pradesh"
          >
            {!stateSealFailed ? (
              <img
                src={UP_SEAL_URL}
                alt="Government of Uttar Pradesh emblem"
                onError={() => setStateSealFailed(true)}
              />
            ) : (
              <span className="seal-fallback">UP</span>
            )}
          </div>

        </header>

        {/* Main Content */}
        <main className="main-area">

          {/* Introduction */}
          <section
            className="intro"
            aria-labelledby="portal-title"
          >

            <h1 id="portal-title">
              Geo-enabled
              <br />
              <em>Housing Scheme</em>
              <br />
              Dashboard
            </h1>

            <p>
              One secure platform to explore approved
              housing layouts, scheme boundaries,
              plotted properties and linked
              allotment information.
            </p>

            <div className="intro-rule" />

          </section>

          {/* Login Card */}
          <section
            className="login-card"
            aria-labelledby="login-title"
          >

         
<div className="card-header">

  <div className="secure-mark">
    <Icon name="shield" size={18} />
    <span>SECURE ACCESS</span>
  </div>

  {/* Login Header Image */}
  <div className="login-header-image">
    <img
      src="/assets/upavp_logo.png"
      alt="UPAVP Login"
    />
  </div>

</div>


            <form onSubmit={handleSubmit} noValidate>

              {/* Username */}
              <label htmlFor="username">
                User ID
              </label>

              <div className="field-wrap">

                <Icon name="user" size={20} />

                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your user ID"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setNotice("");
                  }}
                  required
                />

              </div>

              {/* Password Label */}
              <div className="form-label-row">

                <label htmlFor="password">
                  Password
                </label>

                <button
                  className="text-button"
                  type="button"
                  onClick={forgotPassword}
                >
                  Forgot password?
                </button>

              </div>

              {/* Password Input */}
              <div className="field-wrap">

                <Icon name="lock" size={20} />

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setNotice("");
                  }}
                  required
                />

                <button
                  className="eye-toggle"
                  type="button"
                  onClick={() =>
                    setShowPassword((v) => !v)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  <Icon
                    name={showPassword ? "eyeOff" : "eye"}
                    size={19}
                  />
                </button>

              </div>

              {/* Remember Username */}
              <label className="remember-row">

                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) =>
                    setRemember(e.target.checked)
                  }
                />

                <span>
                  Remember my user ID on this device
                </span>

              </label>

              {/* Login Error */}
              {notice && (
                <div
                  className="form-alert"
                  role="alert"
                >
                  <Icon name="info" size={17} />
                  <span>{notice}</span>
                </div>
              )}

              {/* Login Button */}
              <button
                className="submit"
                type="submit"
                disabled={loading}
              >

                {loading
                  ? "Signing in…"
                  : "Sign in to Dashboard"}

                <Icon name="arrow" size={20} />

              </button>

            </form>

            <div className="card-foot">

              <Icon name="shield" size={17} />

              <span>
                Access is restricted to authorised personnel.
              </span>

            </div>

          </section>

        </main>

        {/* Footer */}
        <footer className="page-footer">

          <span>
            © {new Date().getFullYear()} UPAVP ·
            Developed by RSAC-UP
          </span>

         

        </footer>

      </div>
    </div>
  );
}
