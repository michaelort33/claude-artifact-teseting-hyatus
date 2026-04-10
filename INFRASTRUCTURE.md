# Infrastructure Summary

## Runtime & Server

| Component | Detail |
|---|---|
| **Runtime** | Node.js |
| **Web Server** | Custom-built using Node.js built-in `http` module (no Express or other framework) |
| **Entry Point** | `server.js` |
| **Port** | 5000 (`0.0.0.0:5000`) |
| **Static Files** | Served directly by the Node.js server |
| **URL Routing** | Clean URLs handled server-side (e.g., `/admin` serves `admin.html`) |

## Database

| Component | Detail |
|---|---|
| **Engine** | PostgreSQL (Replit built-in) |
| **Client Library** | `pg` (v8.16.3) |
| **Connection** | Connection pool via `DATABASE_URL` environment variable |

### Tables

| Table | Purpose |
|---|---|
| `users` | User accounts (email, password hash, reset tokens) |
| `sessions` | Session tokens for authentication |
| `admins` | Admin email whitelist |
| `review_rewards` | Guest feedback/reward submissions |
| `referrals` | Company referral program entries |
| `guest_referrals` | Friends & family referral entries |
| `settings` | App configuration (key/value pairs) |
| `task_logs` | External task API audit logs |

## Frontend

| Component | Detail |
|---|---|
| **Framework** | None (vanilla JavaScript, HTML5, CSS3) |
| **Typography** | Playfair Display (headings), Inter (body) |
| **Pages** | `index.html`, `admin.html`, `referral.html`, `guest-referral.html` |
| **JS Modules** | `js/index.js`, `js/admin.js` |

## Authentication

| Component | Detail |
|---|---|
| **Method** | Custom session-based authentication |
| **Password Hashing** | bcryptjs (v3.0.3) |
| **Token Generation** | Node.js `crypto` module |
| **Session Storage** | PostgreSQL `sessions` table |
| **Cookie** | HttpOnly session cookie |

## Third-Party Integrations

| Service | Library / Method | Purpose |
|---|---|---|
| **SendGrid** | `@sendgrid/mail` (v8.1.6) | Transactional emails (confirmations, password resets, admin notifications) |
| **Google Cloud Translate** | `@google-cloud/translate` (v9.3.0) | Multilingual support (9 languages, rate-limited 30 req/min per IP) |
| **GPT Pricing Tasks API** | `fetch` to `api.gptpricing.com` | Automated gift/task fulfillment |
| **Guest Portal API** | `fetch` to AWS API Gateway | Reservation lookup by guest email |

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SENDGRID_API_KEY` | SendGrid email service |
| `GOOGLE_TRANSLATE` | Google Cloud Translation API key |
| `GPTGPTBACKEND_X_API_KEY` | Task API key (x-api-key header) |
| `ADMIN_EMAIL` | Admin notification recipient |
| `GUEST_PORTAL_API_KEY` | Reservation lookup API key |

## Dependencies (package.json)

| Package | Version | Role |
|---|---|---|
| `pg` | ^8.16.3 | PostgreSQL client |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `crypto` | ^1.0.1 | Token generation |
| `@sendgrid/mail` | ^8.1.6 | Email delivery |
| `@google-cloud/translate` | ^9.3.0 | Translation |
| `http-server` | ^14.1.1 | (Listed but unused; server uses custom `http` module) |

## Hosting & Deployment

| Component | Detail |
|---|---|
| **Platform** | Replit |
| **Start Command** | `node server.js` |
| **Secrets Management** | Replit Secrets (environment variables) |
| **Database Hosting** | Replit built-in PostgreSQL |
