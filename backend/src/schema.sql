-- Create Schema for Distributed Job Scheduler

CREATE DATABASE IF NOT EXISTS scheduler_db;
USE scheduler_db;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Projects table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    organization_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Retry Policies table
CREATE TABLE IF NOT EXISTS retry_policies (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    strategy ENUM('fixed', 'linear', 'exponential') NOT NULL DEFAULT 'fixed',
    base_delay_ms INT NOT NULL DEFAULT 1000,
    max_delay_ms INT NOT NULL DEFAULT 30000,
    max_retries INT NOT NULL DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. Queues table
CREATE TABLE IF NOT EXISTS queues (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    priority INT NOT NULL DEFAULT 1, -- 1 = Low, 2 = Medium, 3 = High
    concurrency_limit INT NOT NULL DEFAULT 5,
    retry_policy_id VARCHAR(36) NOT NULL,
    is_paused TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (retry_policy_id) REFERENCES retry_policies(id),
    UNIQUE KEY idx_project_queue_name (project_id, name)
) ENGINE=InnoDB;

-- 6. Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(36) PRIMARY KEY,
    queue_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    payload JSON NOT NULL,
    status ENUM('queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dlq', 'cancelled') NOT NULL DEFAULT 'queued',
    priority_override INT DEFAULT NULL,
    run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cron_expression VARCHAR(255) DEFAULT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    last_execution_id VARCHAR(36) DEFAULT NULL,
    batch_id VARCHAR(36) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
    INDEX idx_jobs_status_run_at (status, run_at),
    INDEX idx_jobs_queue_id (queue_id),
    INDEX idx_jobs_batch_id (batch_id)
) ENGINE=InnoDB;

-- 7. Job Dependencies table (for DAG Workflows)
CREATE TABLE IF NOT EXISTS job_dependencies (
    id VARCHAR(36) PRIMARY KEY,
    parent_job_id VARCHAR(36) NOT NULL,
    child_job_id VARCHAR(36) NOT NULL,
    status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (child_job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    UNIQUE KEY idx_parent_child (parent_job_id, child_job_id)
) ENGINE=InnoDB;

-- 8. Workers table
CREATE TABLE IF NOT EXISTS workers (
    id VARCHAR(255) PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    ip_address VARCHAR(100) NOT NULL,
    status ENUM('active', 'offline') NOT NULL DEFAULT 'active',
    concurrency_slots INT NOT NULL DEFAULT 5,
    last_heartbeat_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 9. Job Executions table
CREATE TABLE IF NOT EXISTS job_executions (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    worker_id VARCHAR(255) NOT NULL,
    status ENUM('running', 'completed', 'failed') NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    stdout_logs LONGTEXT DEFAULT NULL,
    stderr_logs LONGTEXT DEFAULT NULL,
    retry_number INT NOT NULL DEFAULT 0,
    duration_ms INT DEFAULT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    INDEX idx_executions_job (job_id),
    INDEX idx_executions_worker (worker_id)
) ENGINE=InnoDB;

-- 10. Dead Letter Queue table
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    queue_id VARCHAR(36) NOT NULL,
    failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    error_summary TEXT DEFAULT NULL,
    original_payload JSON NOT NULL,
    retry_count INT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed initial data

-- Seed organization
INSERT INTO organizations (id, name) VALUES 
('org-123456', 'Acme Corporation')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Seed user (password_hash is for 'password123' bcrypt '$2a$10$tZ9/R6lG0Gj7tBswC5Fmru5jVlKly/w/yZ9jC8E4g8uM6Kz/71Nki' but wait, we will encrypt dynamically. Let's seed password_hash = '$2a$10$EfyW8EubC7L18.WJ523W1uq6sP5cQz11l0d35bT28Gz4k3f2p2vKy' which is bcrypt for 'admin123')
INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES
('user-1', 'admin@acme.com', '$2a$10$EfyW8EubC7L18.WJ523W1uq6sP5cQz11l0d35bT28Gz4k3f2p2vKy', 'Admin', 'User', 'admin')
ON DUPLICATE KEY UPDATE email=VALUES(email);

-- Seed project
INSERT INTO projects (id, name, organization_id) VALUES
('project-1', 'Distributed Scheduling Core', 'org-123456')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Seed default retry policies
INSERT INTO retry_policies (id, name, strategy, base_delay_ms, max_delay_ms, max_retries) VALUES
('policy-fixed', 'Default Fixed Delay', 'fixed', 1000, 5000, 3),
('policy-linear', 'Linear Backoff', 'linear', 1000, 10000, 3),
('policy-exponential', 'Exponential Backoff', 'exponential', 1000, 30000, 5)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Seed default queues
INSERT INTO queues (id, name, project_id, priority, concurrency_limit, retry_policy_id, is_paused) VALUES
('queue-default', 'default-queue', 'project-1', 1, 5, 'policy-fixed', 0),
('queue-high-priority', 'high-priority-queue', 'project-1', 3, 10, 'policy-exponential', 0),
('queue-reporting', 'report-processing-queue', 'project-1', 2, 2, 'policy-linear', 0)
ON DUPLICATE KEY UPDATE name=VALUES(name);
