# Guest Appreciation Platform

## Overview
A web application that allows guests to receive thank-you gifts for sharing their feedback. The application uses a Node.js backend with PostgreSQL database for authentication, data storage, and email notifications via SendGrid.

## Project Type
- **Frontend**: Static HTML, CSS, and vanilla JavaScript
- **Backend**: Node.js server with PostgreSQL database
- **Authentication**: Custom session-based authentication (bcrypt password hashing)
- **Email**: SendGrid for notifications and password reset
- **Task API Integration**: Server-side proxy for automated gift fulfillment

## Architecture

### Server
- `server.js` - Node.js HTTP server with:
  - Static file serving
  - Authentication API (signup, signin, signout, password reset)
  - Submissions CRUD API
  - Task API proxy
  - Email API (SendGrid)

### Database Tables
- `users` - User accounts (id, email, password_hash, reset_token, etc.)
- `sessions` - Session management (user_id, token, expires_at)
- `admins` - Admin email whitelist
- `review_rewards` - Submission data (payment_method, payment_handle, status, etc.)

### Frontend Files
- `index.html` - Main user-facing page for submitting reward claims
- `admin.html` - Admin dashboard for managing submissions with analytics
- `js/index.js` - Main application logic, form handling, authentication
- `js/admin.js` - Admin dashboard logic, submission management

### Design System
The application uses a Warm Editorial aesthetic inspired by high-end architectural magazines:

**Typography:**
- **Headlines**: Playfair Display (high-contrast serif)
- **Body**: Inter (Swiss minimal grotesk)

**Color Palette (Warm Neutrals):**
- Cream (#FDFCF8) - Primary background
- Alabaster (#F7F3EA) - Secondary background
- Deep Moss (#0F2C1F) - Primary accent, headers
- Terracotta (#D96F52) - Secondary accent
- Charcoal (#2A2A2A) - Text, borders

### API Endpoints

**Authentication:**
- POST `/api/auth/signup` - Create new account
- POST `/api/auth/signin` - Sign in
- POST `/api/auth/signout` - Sign out
- GET `/api/auth/session` - Check current session
- POST `/api/auth/reset-password-request` - Request password reset
- POST `/api/auth/reset-password` - Reset password with token

**Submissions:**
- GET `/api/submissions` - List submissions (with filters)
- POST `/api/submissions` - Create new submission
- GET `/api/submissions/:id` - Get submission details
- PATCH `/api/submissions/:id` - Update submission (admin only)

**Email:**
- POST `/api/email/send` - Send custom email
- GET `/api/email/health` - Check email configuration

**Tasks:**
- POST `/api/tasks` - Create payment task
- GET `/api/tasks/health` - Check task API configuration

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `TASKS_API_EMAIL` - Email for task API authentication
- `TASKS_API_PASSWORD` - Password for task API authentication
- `SENDGRID_API_KEY` - SendGrid API key for sending emails
- `ADMIN_EMAIL` - Admin email address for notifications

## Setup in Replit

The application is served via Node.js server on port 5000.

### Key Configurations
1. Node.js server runs on `0.0.0.0:5000`
2. PostgreSQL database via Replit's built-in database
3. Session-based authentication with HTTP-only cookies
4. All secrets stored as Replit secrets

## Campaign Control
- `?g=vip2024` - Enable for returning guests
- `?r=h24p` - Set $20 reward amount (default $10)
- Without guest parameter, campaign is paused for non-returning guests

## Email Configuration
- **FROM address**: hello@hyatus.com (all outgoing emails)
- **Admin notifications**: michaelort@hyatus.com (new submissions)
- **Password resets**: Sent to user's email address

## Recent Changes
- **2025-12-01**: Security hardening - Admin endpoints now require authenticated admin session
- **2025-12-01**: Performance optimization - Excluded large screenshot data (up to 4MB) from admin listings
- **2025-11-30**: Changed email FROM address from no-reply@hyatus.com to hello@hyatus.com for better deliverability
- **2025-11-30**: Complete Migration from Supabase to Replit PostgreSQL
  - Built custom authentication system (signup, signin, password reset)
  - Created users and sessions tables for auth
  - All frontend code updated to use new API endpoints
  - Removed all Supabase dependencies and references
  - Email notifications via SendGrid (not Supabase Edge Functions)
- **2025-11-30**: Admin Panel Fix & Analytics Overhaul
  - Fixed broken admin panel, added analytics features
  - "Group By" dropdown for analytics (Gift Type, Email, Status, Month)
  - "Reviews Over Time" weekly chart
- **2025-11-30**: User Authentication & Submissions View
  - Sign In button fully functional for regular users
  - Users can create accounts and view their submissions
  - Profile dropdown with submission count and sign out option
- **2025-11-30**: Warm Editorial Design Overhaul
  - New typography: Playfair Display + Inter
  - Warm neutral color palette
  - Magazine-style layouts
