# Fulcrum Australia — Property Services Portal

A Progressive Web App (PWA) for mortgage broker partners to request:
- **Rent Letters** — rental yield confirmation
- **Price Checks** — current market value estimate based on comparable sales
- **Price Discovery Reports** — client purchasing parameter intake

---

## Quick Start (Claude Code / VS Code Terminal)

### 1. Install dependencies
```bash
npm install
```

### 2. Run locally
```bash
npm run dev
```
Open http://localhost:5173

### 3. Build for production
```bash
npm run build
```

---

## Demo Logins

| Role   | Email                              | Password   |
|--------|------------------------------------|------------|
| Staff  | admin@fulcrumaustralia.com.au      | admin123   |
| Staff  | staff@fulcrumaustralia.com.au      | staff123   |
| Broker | james@gtfinance.com.au             | broker123  |

---

## Google Maps API Key

Replace `YOUR_GOOGLE_MAPS_API_KEY` in `src/fulcrum-rent-portal.jsx` (line ~210):

```js
const GOOGLE_MAPS_API_KEY = "YOUR_REAL_KEY_HERE";
```

Get a key at https://console.cloud.google.com → Enable **Places API** → Create credentials.

---

## PWA Icons

Add two icon files to the `/public` folder:
- `public/icon-192.png` — 192×192px (your Fulcrum logo)
- `public/icon-512.png` — 512×512px (same logo, larger)

These appear on home screens when brokers install the app.

---

## Deploy to Vercel

### Option A — Vercel CLI
```bash
npm install -g vercel
vercel
```
Follow the prompts. Done.

### Option B — Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import repo
3. Framework: **Vite** (auto-detected)
4. Deploy

### Custom Domain
In Vercel dashboard → Project → Settings → Domains
Add: `portal.fulcrumaustralia.com.au`
Follow the DNS instructions.

---

## Price Discovery — Public Client Link

When a broker clicks "Copy client link" in the portal, they get a URL like:
```
https://portal.fulcrumaustralia.com.au?pdr=broker
```

Clients visit this link, fill in the multi-step form (no login required), and
the submission appears in the staff **PDR Reports** queue.

---

## EmailJS Setup (Broker Notifications)

1. Create account at https://emailjs.com
2. Connect your email service
3. Create two templates:
   - **Request received** — sent to broker on submission
   - **Document ready** — sent to broker/client with download link
4. Add your Service ID, Template IDs and Public Key to the app

---

## Project Structure

```
fulcrum-portal/
├── public/
│   ├── icon-192.png        ← Add your logo here
│   └── icon-512.png        ← Add your logo here
├── src/
│   ├── main.jsx            ← Entry point + PDR routing
│   └── fulcrum-rent-portal.jsx  ← All app code
├── index.html
├── vite.config.js          ← PWA config
├── vercel.json             ← Deployment routing
└── package.json
```
