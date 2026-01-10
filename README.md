# LaborOS

Military-grade workforce management PWA with geo-fencing, face recognition, and fraud prevention.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- 🔐 **Geo-Fenced Login** - Staff can only login within 200m of assigned site
- 📸 **Face Recognition** - Browser-based AI attendance scanning
- 🌙 **Night Mode** - Flashlight toggle + white screen for dark environments
- 🔢 **Blind Tally** - Evening verification prevents number manipulation
- 💰 **Auto Payouts** - Wage calculation with Maistry commission
- 🏷️ **White-Label** - Fully customizable branding per client

## Environment Variables

Copy `.env.local.example` to `.env.local` and configure:

```bash
NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
NEXT_PUBLIC_COMPANY_NAME="Your Company"
NEXT_PUBLIC_THEME_COLOR="orange"
```

## Database Setup

Run the SQL in `supabase/schema.sql` in your Supabase SQL Editor.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS
- **AI:** face-api.js (client-side)
