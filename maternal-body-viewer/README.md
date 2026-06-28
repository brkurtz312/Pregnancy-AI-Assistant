# Maternal Body Cross-Section Viewer

An interactive educational React application showing anatomical sagittal cross-sections of the maternal body across 8 stages of pregnancy, from the pre-pregnancy pelvis to full-term delivery.

## Features

- **8 developmental stages**: Weeks 1–2, 3–4, 5–8, 9–12, 13–16, 17–24, 25–32, 38–40
- **3D-rendered AI anatomical illustrations** — sagittal cross-sections showing uterine growth, fetal development, and maternal organ displacement
- **Clinical data per stage**: fundal height, organ changes, and 4 maternal clinical milestones
- **Navigation**: Previous/Next buttons, clickable progress dots, Autoplay (7-second intervals)
- **Animated transitions**: Fade + translateY on stage changes
- **Responsive layout**: Side-by-side on desktop, stacked on mobile

## Design

- Dark `#07090f` background matching companion Fetal Development Viewer
- Teal `#4ecdc4` accent color
- Georgia serif font
- Portrait-ratio WebP-optimized images (~850KB total)

## Companion App

This viewer is designed as a companion to the **Fetal Development Viewer**:
- Fetal viewer: https://fetal-development.pplx.app — close-up fetal anatomy per stage
- Maternal viewer: https://maternal-development.pplx.app — maternal body cross-section per stage

## Tech Stack

- React 18 + Vite
- Pure inline styles (no CSS framework)
- AI-generated 3D renders (GPT Image 2 / nano_banana_pro) for anatomical illustrations

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
# Output in dist/
```

## Project Structure

```
maternal-vite/
├── src/
│   ├── App.jsx        # Main component with all 8 stages and clinical data
│   └── main.jsx       # React entry point
├── public/
│   └── images/        # WebP anatomical cross-section illustrations
│       ├── maternal1-wk2.webp    # Non-pregnant pelvis
│       ├── maternal2-wk4.webp    # Implantation
│       ├── maternal3-wk6.webp    # 6-week embryo
│       ├── maternal4-wk10.webp   # 10-week fetus
│       ├── maternal5-wk14.webp   # 14-week fetus
│       ├── maternal6-wk20.webp   # 20-week fetus
│       ├── maternal7-wk28.webp   # 28-week fetus
│       └── maternal8-wk40.webp   # Full-term vertex
├── index.html
├── vite.config.js
└── package.json
```
