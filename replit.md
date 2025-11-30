# Review Rewards Application

## Overview
A web application that allows users to claim rewards for leaving Google reviews. The application uses Supabase as a backend for authentication, database, and serverless functions, with a Node.js server that proxies task API requests.

## Project Type
- **Frontend**: Static HTML, CSS, and vanilla JavaScript
- **Backend**: Node.js server + Supabase (PostgreSQL database, authentication, edge functions)
- **Task API Integration**: Server-side proxy for secure API communication
- **Deployment**: Originally designed for Netlify, adapted for Replit

## Architecture

### Server
- `server.js` - Node.js HTTP server that serves static files and proxies task API requests

### Frontend Files
- `index.html` - Main user-facing page for submitting review rewards
- `admin.html` - Admin dashboard for managing submissions with task creation modal
- `test.html` - Testing page
- `js/index.js` - Main application logic, Supabase client initialization, form handling
- `js/admin.js` - Admin dashboard logic, authentication, submission management, task API integration

### Design System
The application uses a wine/gold Claude-inspired design theme:
- **Fonts**: Instrument Serif (headings) and DM Sans (body)
- **Colors**: Wine burgundy (#722F37) and warm gold (#C4956A) palette
- **UI Elements**: Elegant rounded corners, subtle shadows, refined gradients
- **Animations**: Smooth transitions, hover effects

### Backend (Supabase)
- Database: PostgreSQL with tables for review rewards and user management
- Key Fields: `task_created` (boolean), `task_id` (text) for tracking task creation
- Authentication: Email/password authentication
- Edge Functions:
  - `send-admin-notification` - Sends email notifications to admins
  - `test-secrets` - Testing endpoint for secrets

### Task API Integration
- **Endpoint**: POST `/api/tasks` (proxied through server.js)
- **Health Check**: GET `/api/tasks/health`
- **Authentication**: Server-side using TASKS_API_EMAIL and TASKS_API_PASSWORD secrets
- **Trigger**: When status changes to "awarded", shows modal to create task
- **Behavior**: 
  - Creates task with reward details (email, type, amount)
  - Marks task_created=true to prevent duplicate prompts
  - Handles skip/duplicate cases gracefully

### Configuration
- `supabase/config.toml` - Supabase local development configuration
- `supabase/migrations/` - Database migration files (including task_created field)
- `netifly.toml` - Original Netlify deployment configuration

## Environment Variables
- `TASKS_API_EMAIL` - Email for task API authentication
- `TASKS_API_PASSWORD` - Password for task API authentication
- `SENDGRID_API_KEY` - SendGrid API key for sending emails
- `ADMIN_EMAIL` - Admin email address for notifications

## Setup in Replit

The application is served via Node.js server on port 5000.

### Key Configurations
1. Node.js server runs on `0.0.0.0:5000` with static file serving and API proxy
2. Supabase connection is configured in `js/index.js` with production credentials
3. Task API credentials stored as Replit secrets

## Performance Optimizations
- Screenshots (base64) are NOT loaded in the main query - fetched on-demand when viewing details
- This provides 10-50x faster page loads on admin dashboard

## Important Notes
- The application connects to an existing Supabase project (not local)
- Supabase URL and keys are hardcoded in `js/index.js`
- Campaign can be paused for non-previous guests via URL parameters
- Supports multiple payment methods: PayPal, Venmo, CashApp, Amazon, Starbucks

## Recent Changes
- **2025-11-30**: Task API Integration
  - Added server-side proxy for task API (credentials kept secure on server)
  - Task creation modal triggers when status changes to "awarded"
  - Added task_created and task_id fields to track task creation
  - Skip and duplicate cases properly update database to prevent re-prompting
  - Health endpoint at /api/tasks/health to verify configuration
- **2025-11-30**: Performance Optimization
  - Removed screenshot_url from main query - now loads on-demand
  - Reduced page load time from ~15s to ~500ms (30x improvement)
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
