<h1 align="center">⚡ Distributed Job Scheduler</h1>

<p align="center">
  A production-ready, distributed job scheduling platform with a modern React dashboard, robust Node.js/TypeScript backend, and MySQL database.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/MySQL-8.0+-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/Socket.IO-4.7-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.IO" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Database Schema](#-database-schema)
- [API Reference](#-api-reference)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the Application](#-running-the-application)
- [Default Credentials](#-default-credentials)
- [Project Structure](#-project-structure)

---

## 🌟 Overview

This platform provides a scalable, fault-tolerant job scheduling system capable of handling high-throughput background work. It supports **cron-based scheduling**, **DAG-style job dependencies**, **configurable retry policies**, **dead-letter queue (DLQ) handling**, **real-time worker heartbeat monitoring**, and a **live analytics dashboard**.

---

## ✨ Features

### ⚙️ Core Scheduling Engine
- **Atomic Job Claiming** — Workers claim jobs using database transactions to prevent double-processing
- **Cron Expression Support** — Schedule recurring jobs with standard cron syntax
- **Priority-Based Queuing** — Three priority levels (Low, Medium, High) with configurable concurrency limits
- **DAG Workflow Support** — Define parent-child job dependencies for ordered pipeline execution

### 🔁 Retry & Fault Tolerance
- **Configurable Retry Policies** — Three strategies: Fixed Delay, Linear Backoff, Exponential Backoff
- **Dead Letter Queue (DLQ)** — Failed jobs beyond max retries are moved to DLQ for inspection and replay
- **Orphaned Job Recovery** — Automatic recovery of jobs from crashed or timed-out workers
- **Worker Heartbeat Tracking** — Workers send heartbeats every 5 seconds; stale workers are auto-detected

### 📊 Real-Time Dashboard
- **Live Job Explorer** — Browse, filter, search, and manage all jobs with real-time status updates
- **Queue Manager** — Create, pause/resume queues, configure retry policies and concurrency
- **Worker Monitor** — Track active workers, their status, load, and last heartbeat
- **Log Viewer** — View per-execution stdout/stderr logs inline
- **System Analytics** — Throughput metrics, success/failure rates, DLQ stats, and more

### 🔐 Authentication & Authorization
- **JWT-based authentication** with 24-hour token expiry
- **Role-based access control** (`admin` and `member` roles)
- **bcrypt password hashing**

### 🔌 Real-Time Events
- **Socket.IO** integration for live job status updates, worker heartbeats, and dashboard metrics

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend (Vite)              │
│  Dashboard | Job Explorer | Queue Manager | Workers  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP REST + WebSocket (Socket.IO)
┌──────────────────────▼──────────────────────────────┐
│              Express API Server (Node.js/TS)         │
│   Auth | Jobs | Queues | Workers | Analytics         │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼────────────────┐
        │              │                │
┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
│   MySQL DB   │ │  Scheduler │ │   Worker(s) │
│  (schema.sql)│ │  (cron)    │ │  (poller)   │
└──────────────┘ └────────────┘ └─────────────┘
```

The system consists of **three independent processes** that all connect to the same MySQL database:

| Process | Description |
|---|---|
| **API Server** (`server.ts`) | Handles HTTP REST API & WebSocket connections |
| **Scheduler** (`scheduler.ts`) | Enqueues scheduled/cron jobs at the right time |
| **Worker** (`worker.ts`) | Polls for and executes claimed jobs |

Multiple **Worker** processes can run concurrently for horizontal scaling.

---

## 🛠️ Tech Stack

### Backend
| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.19 | HTTP server & REST API |
| `socket.io` | ^4.7 | Real-time WebSocket events |
| `mysql2` | ^3.10 | MySQL database driver |
| `jsonwebtoken` | ^9.0 | JWT authentication |
| `bcryptjs` | ^2.4 | Password hashing |
| `cron-parser` | ^4.9 | Cron expression parsing |
| `typescript` | ^5.5 | Type safety |
| `ts-node` / `nodemon` | latest | Dev workflow |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3 | UI framework |
| `vite` | ^5.3 | Build tool & dev server |
| `socket.io-client` | ^4.7 | Real-time WebSocket client |
| `lucide-react` | ^0.395 | Icon library |
| `typescript` | ^5.5 | Type safety |

---

## 🗄️ Database Schema

The MySQL database (`scheduler_db`) contains **10 tables**:

| Table | Description |
|---|---|
| `users` | User accounts with hashed passwords and roles |
| `organizations` | Top-level organizational units |
| `projects` | Projects grouped under an organization |
| `retry_policies` | Named retry strategies (fixed, linear, exponential) |
| `queues` | Job queues with priority, concurrency, and retry policy |
| `jobs` | Individual job records with status, payload, and scheduling info |
| `job_dependencies` | Parent-child relationships for DAG workflows |
| `workers` | Registered worker instances with heartbeat tracking |
| `job_executions` | Per-execution logs including stdout/stderr and duration |
| `dead_letter_queue` | Jobs that exhausted all retries |

**Job Status Lifecycle:**
```
queued → scheduled → claimed → running → completed
                                       ↘ failed → (retry) → dlq
```

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive JWT token |
| `GET` | `/api/auth/me` | Get current user profile |

### Jobs
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/jobs` | List all jobs (filterable by status, queue) |
| `POST` | `/api/jobs` | Create a new job |
| `GET` | `/api/jobs/:id` | Get a specific job |
| `PUT` | `/api/jobs/:id/cancel` | Cancel a pending job |
| `POST` | `/api/jobs/:id/retry` | Retry a failed/DLQ job |
| `GET` | `/api/jobs/:id/executions` | Get execution history for a job |

### Queues
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/queues` | List all queues |
| `POST` | `/api/queues` | Create a new queue |
| `PUT` | `/api/queues/:id/pause` | Pause/resume a queue |
| `DELETE` | `/api/queues/:id` | Delete a queue |

### Workers
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/workers` | List all registered workers |
| `GET` | `/api/workers/:id` | Get worker details |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/summary` | System-wide job stats |
| `GET` | `/api/analytics/throughput` | Jobs processed over time |
| `GET` | `/api/analytics/dlq` | Dead letter queue stats |

### Retry Policies
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/retry-policies` | List all retry policies |
| `POST` | `/api/retry-policies` | Create a new retry policy |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v20+
- **MySQL** 8.0+
- **npm** v9+

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/distributed-job-scheduler.git
cd distributed-job-scheduler
```

### 2. Set Up the Database

Start your MySQL server and run the schema:

```bash
mysql -u root -p < backend/src/schema.sql
```

This will:
- Create the `scheduler_db` database
- Create all tables and indexes
- Seed default organization, user, project, retry policies, and queues

### 3. Configure Environment Variables

```bash
cd backend
cp .env .env.local   # or just edit .env directly
```

Edit `backend/.env` with your settings (see [Environment Variables](#-environment-variables)).

### 4. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

## 🔧 Environment Variables

Create / edit `backend/.env` with the following variables:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_DATABASE=scheduler_db
JWT_SECRET=your_super_secret_jwt_key_here
NODE_ENV=development
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port for the API server |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL username |
| `DB_PASSWORD` | — | MySQL password |
| `DB_DATABASE` | `scheduler_db` | Database name |
| `JWT_SECRET` | — | Secret key for JWT signing |
| `NODE_ENV` | `development` | Node environment |

---

## ▶️ Running the Application

You need to run **three backend processes** and the **frontend dev server** — each in a separate terminal.

### Terminal 1 — API Server
```bash
cd backend
npm run dev
# Starts on http://localhost:5000
```

### Terminal 2 — Scheduler
```bash
cd backend
npm run scheduler
# Picks up cron/scheduled jobs and enqueues them
```

### Terminal 3 — Worker
```bash
cd backend
npm run worker
# Polls for and executes jobs (run multiple for scaling)
```

### Terminal 4 — Frontend
```bash
cd frontend
npm run dev
# Starts on http://localhost:5173
```

Open your browser at **http://localhost:5173** and log in with the default credentials.

> **Scaling Workers**: To add more worker capacity, start additional `npm run worker` processes in new terminals. Each worker registers itself with a unique ID and operates independently.

---

## 🔑 Default Credentials

After running the schema SQL, a seed admin account is created:

| Field | Value |
|---|---|
| **Email** | `admin@acme.com` |
| **Password** | `admin123` |
| **Role** | `admin` |

> ⚠️ **Change the default password immediately in any non-development environment.**

---

## 📁 Project Structure

```
distributed-job-scheduler/
├── backend/
│   ├── src/
│   │   ├── server.ts          # Express API server + Socket.IO
│   │   ├── worker.ts          # Job worker process (poller + executor)
│   │   ├── scheduler.ts       # Cron/scheduled job enqueuer
│   │   ├── database.ts        # MySQL connection pool
│   │   ├── eventBus.ts        # Socket.IO event emitter
│   │   ├── schema.sql         # Full DB schema + seed data
│   │   ├── middleware/
│   │   │   └── auth.ts        # JWT authentication middleware
│   │   └── tests/
│   │       └── run.ts         # Integration tests
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
│
└── frontend/
    ├── src/
    │   ├── App.tsx             # Root app + routing
    │   ├── main.tsx            # React entry point
    │   ├── index.css           # Global styles
    │   └── components/
    │       ├── Dashboard.tsx       # System overview & analytics
    │       ├── JobExplorer.tsx     # Job list, filter, create, manage
    │       ├── QueueManager.tsx    # Queue CRUD & configuration
    │       ├── WorkerMonitor.tsx   # Worker status & heartbeat view
    │       └── LogViewer.tsx       # Execution log display
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
