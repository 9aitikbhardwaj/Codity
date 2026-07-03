<h1 align="center">⚡ Distributed Job Scheduler</h1>

<p align="center">
A scalable, production-ready distributed job scheduling platform built using <b>React, Node.js, TypeScript, MySQL, and Socket.IO</b>.
</p>

<p align="center">

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![MySQL](https://img.shields.io/badge/MySQL-8+-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?style=for-the-badge&logo=socket.io&logoColor=white)

</p>

---

# 📌 Overview

Distributed Job Scheduler is a modern job scheduling platform designed to execute background jobs reliably across multiple workers. It supports cron scheduling, job dependencies, retry mechanisms, worker monitoring, real-time dashboards, and fault-tolerant execution.

The system is built with scalability and production-readiness in mind, making it suitable for handling large numbers of asynchronous jobs efficiently.

---

# ✨ Features

## ⚙️ Job Scheduling

- Cron-based recurring jobs
- One-time scheduled jobs
- Priority-based queues
- DAG (Directed Acyclic Graph) job dependencies
- Atomic job claiming

## 🔁 Fault Tolerance

- Configurable retry policies
- Fixed Delay Retry
- Linear Backoff Retry
- Exponential Backoff Retry
- Dead Letter Queue (DLQ)
- Automatic orphaned job recovery
- Worker heartbeat monitoring

## 📊 Dashboard

- Live Job Explorer
- Queue Manager
- Worker Monitor
- Execution Log Viewer
- Analytics Dashboard
- Success & Failure Statistics

## 🔐 Authentication

- JWT Authentication
- Role-Based Access Control
- bcrypt Password Hashing

## ⚡ Real-Time Communication

- Socket.IO integration
- Live job updates
- Worker heartbeat updates
- Dashboard auto-refresh

---

# 🏗️ System Architecture

```
React Frontend
        │
 REST API + Socket.IO
        │
Node.js + Express Server
        │
 ┌───────────────┐
 │               │
Scheduler     Worker(s)
 │               │
 └──────┬────────┘
        │
      MySQL
```

The application consists of four major components:

- React Frontend
- Express API Server
- Scheduler Service
- Worker Processes

All components communicate through a shared MySQL database.

---

# 🛠️ Tech Stack

## Frontend

- React 18
- TypeScript
- Vite
- Socket.IO Client
- Lucide React

## Backend

- Node.js
- Express.js
- TypeScript
- Socket.IO
- JWT Authentication
- bcrypt
- mysql2

## Database

- MySQL 8+

---

# 📂 Database Tables

The project contains the following tables:

- users
- organizations
- projects
- retry_policies
- queues
- jobs
- job_dependencies
- workers
- job_executions
- dead_letter_queue

---

# 🚀 Key Functionalities

- Create Jobs
- Schedule Jobs
- Retry Failed Jobs
- Worker Monitoring
- Queue Management
- Analytics Dashboard
- Job Execution Logs
- Role Management
- Dead Letter Queue
- Real-Time Notifications

---

# 📦 Installation

## Clone Repository

```bash
git clone https://github.com/your-username/distributed-job-scheduler.git
```

```
cd distributed-job-scheduler
```

---

## Backend

```
cd backend
npm install
```

---

## Frontend

```
cd frontend
npm install
```

---

# ⚙️ Environment Variables

Create a `.env` file inside the backend folder.

```env
PORT=5000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=scheduler_db

JWT_SECRET=your_secret_key

NODE_ENV=development
```

---

# ▶️ Running the Project

## API Server

```bash
cd backend
npm run dev
```

---

## Scheduler

```bash
cd backend
npm run scheduler
```

---

## Worker

```bash
cd backend
npm run worker
```

---

## Frontend

```bash
cd frontend
npm run dev
```

Open

```
http://localhost:5173
```

---

# 🔑 Default Login

| Email | Password |
|--------|----------|
| admin@acme.com | admin123 |

> Change the default password before deploying.

---

# 📁 Project Structure

```
distributed-job-scheduler
│
├── backend
│   ├── src
│   │   ├── server.ts
│   │   ├── scheduler.ts
│   │   ├── worker.ts
│   │   ├── database.ts
│   │   ├── schema.sql
│   │   └── middleware
│   │
│   ├── package.json
│   └── .env
│
├── frontend
│   ├── src
│   ├── components
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

# 📊 Job Lifecycle

```
Queued
   │
   ▼
Scheduled
   │
   ▼
Claimed
   │
   ▼
Running
   │
   ├────────► Completed
   │
   └────────► Failed
                  │
                  ▼
              Retry Policy
                  │
                  ▼
          Dead Letter Queue
```

---

# 🌟 Highlights

- Production-ready architecture
- Distributed worker execution
- Real-time dashboard
- Secure JWT authentication
- Socket.IO integration
- Retry policies
- Queue management
- Worker monitoring
- Analytics
- Fault tolerance
- Highly scalable
- Clean TypeScript codebase

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature-name
```

3. Commit your changes

```bash
git commit -m "Added new feature"
```

4. Push the branch

```bash
git push origin feature-name
```

5. Open a Pull Request

---

# 📄 License

This project is developed for educational and learning purposes.

---

# 👨‍💻 Author

**Naitik Bhardwaj**

B.Tech CSE Student

SRM Institute of Science and Technology

GitHub: https://github.com/9aitikbhardwaj
