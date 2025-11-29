# Review Rewards Application

## Overview
A static HTML/JavaScript web application that allows users to claim rewards for leaving Google reviews. The application uses Supabase as a backend for authentication, database, and serverless functions.

## Project Type
- **Frontend**: Static HTML, CSS, and vanilla JavaScript
- **Backend**: Supabase (PostgreSQL database, authentication, edge functions)
- **Deployment**: Originally designed for Netlify, adapted for Replit

## Architecture

### Frontend Files
- `index.html` - Main user-facing page for submitting review rewards
- `admin.html` - Admin dashboard for managing submissions
- `test.html` - Testing page
- `js/index.js` - Main application logic, Supabase client initialization, form handling
- `js/admin.js` - Admin dashboard logic, authentication, submission management

### Design System
The application uses a whimsical, cute, and friendly design theme:
- **Font**: Nunito (Google Fonts) for a rounded, friendly look
- **Colors**: Pink-purple-blue gradient palette with pastel accents
  - Primary gradient: `#f472b6` (pink) → `#a855f7` (purple) → `#6366f1` (indigo)
  - Background: Soft pastel gradient with pink, blue, and mint hues
- **UI Elements**: Rounded corners (16px-24px), soft shadows, floating emoji decorations
- **Animations**: Subtle hover effects, floating emoji shapes, smooth transitions
- **Emojis**: 🎁 (gift) for rewards, 🔐 (lock) for admin, 🚀 (rocket) on buttons

### Backend (Supabase)
- Database: PostgreSQL with tables for review rewards and user management
- Authentication: Email/password authentication
- Edge Functions:
  - `send-admin-notification` - Sends email notifications to admins
  - `test-secrets` - Testing endpoint for secrets

### Configuration
- `supabase/config.toml` - Supabase local development configuration
- `supabase/migrations/` - Database migration files
- `netifly.toml` - Original Netlify deployment configuration

## Setup in Replit

The application is served as a static site using a simple HTTP server on port 5000.

### Key Configurations
1. Static file server runs on `0.0.0.0:5000` to work with Replit's proxy
2. Supabase connection is configured in `js/index.js` with production credentials
3. No build step required - pure static files

## Important Notes
- The application connects to an existing Supabase project (not local)
- Supabase URL and keys are hardcoded in `js/index.js`
- Campaign can be paused for non-previous guests via URL parameters
- Supports multiple payment methods: PayPal, Venmo, CashApp, Amazon, Starbucks

## Recent Changes
- **2025-11-29**: Whimsical design overhaul
  - Complete UI redesign with cute, friendly, fun aesthetic
  - Added Nunito font family and pink-purple-blue gradient color scheme
  - Implemented floating emoji decorations and playful animations
  - Created external js/admin.js file for admin dashboard logic
  - Updated both index.html and admin.html with matching design language
  - Fixed Supabase CDN script loading in admin.html
- **2025-01-29**: Initial import and setup for Replit environment
  - Created .gitignore for Node.js projects
  - Set up static file server on port 5000
  - Configured workflow for automatic server startup
