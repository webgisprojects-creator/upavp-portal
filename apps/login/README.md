# UPAVP Geo-enabled Dashboard — Login page

A real responsive React/Vite login-page frontend using the actual uploaded aerial housing video as its full-screen background. No invented state boundary/map silhouette.

## Start

```bash
npm install
npm run dev
```

Open the address printed by Vite (usually `http://localhost:5173`).

## Immediate preview without npm

Open `preview.html` in Chrome or Edge. It uses the same styles and local video, with standalone form interactions (no actual authentication). The React app is the implementation to continue developing.

## Files
- `src/App.jsx` — accessible login form, background video controls and API-ready submit handler.
- `src/styles.css` — desktop/mobile styles.
- `public/assets/housing-aerial-bg.mp4` — compressed 28-second extract (from second 8) of the user-supplied video, H.264 with `faststart`, muted in browser.
- `public/assets/housing-poster.jpg` — poster/fallback when autoplay is blocked or reduced motion is requested.
- `public/assets/upavp-mark.png` — UPAVP four-house mark extracted from the supplied official departmental letterhead (low-resolution reference); replace with a department-approved high-resolution logo before deployment.

## Real authentication

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_LOGIN_ENDPOINT` to the backend `POST` login URL.
3. The request JSON is `{ "username": "...", "password": "..." }`.
4. The sample handler assumes an HttpOnly cookie-based authenticated session and redirects to `VITE_DASHBOARD_PATH` after a successful HTTP response. Adapt it if your existing backend uses a different authentication contract. **Never store passwords or bearer tokens in localStorage.**
5. `Forgot password?` requires `VITE_FORGOT_PASSWORD_URL`. Without it, the UI explains the missing integration.
6. The user role should come from the backend, not a selectable role on the login page.

## Branding

UPAVP branding is taken from the user-provided government letterhead. The right-hand Government of Uttar Pradesh seal is referenced from Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Seal_of_Uttar_Pradesh.svg (CC BY-SA 4.0, author Furfur). For an offline/deployed portal, replace the externally loaded emblem with an organisation-approved local emblem asset after verifying reuse and deployment permissions. If the remote image is unavailable, the government text label remains visible.

## Production checklist

- Have UPAVP approve official logo variants and usage.
- Enable HTTPS and secure backend session management.
- Set CSRF protection, rate limiting and audit logging in the backend.
- Make video optional for slow networks and maintain the reduced-motion fallback.
- Replace sample destinations and configure routing to the actual dashboard.
- Confirm rights to display the supplied housing aerial footage.
