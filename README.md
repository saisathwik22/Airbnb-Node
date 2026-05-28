# 🏨 Distributed Hotel Booking System

A production-style **microservices-based hotel booking platform** built with Node.js, TypeScript, Golang, MySQL, Redis and BullMQ. The system handles real-world challenges like concurrent bookings, duplicate confirmations, ghost bookings and asynchronous notifications across independent services.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Services](#services)
  - [API Gateway](#1-api-gateway-golang)
  - [Hotel Service](#2-hotel-service)
  - [Booking Service](#3-booking-service)
  - [Notification Service](#4-notification-service)
  - [Review Service](#5-review-service)
- [Core Problems Solved](#core-problems-solved)
- [Database Schema](#database-schema)
- [Service Communication](#service-communication)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)

---

## Overview

This project simulates a real-world hotel booking platform (similar to Airbnb) using a microservices architecture. Each service is independently deployable, owns its own database, and communicates with other services through REST APIs or Redis queues.

The system is designed to handle:
- Multiple users trying to book the same room simultaneously
- Users accidentally confirming the same booking multiple times
- Rooms getting permanently blocked by unconfirmed bookings
- Asynchronous email notifications without slowing down the booking flow

---

## Architecture

```
Client
   │
   ▼
┌─────────────────────┐
│     API Gateway     │  ← Golang
│  JWT Auth + RBAC    │
│  Reverse Proxy      │
└─────────────────────┘
   │           │           │           │
   ▼           ▼           ▼           ▼
Hotel       Booking    Notification  Review
Service     Service     Service      Service
(Node.js)  (Node.js)   (Node.js)   (Node.js)
   │           │               │
   ▼           ▼               ▼
MySQL       MySQL           Redis Queue
(Sequelize) (Prisma)        (BullMQ)
                │
                ▼
            Redis (Redlock)
```

---

## Services

### 1. API Gateway (Golang)

The single entry point for all client requests. No microservice is directly accessible without going through the gateway.

**Responsibilities:**
- Verifies JWT tokens on every incoming request
- Enforces Role-Based Access Control (RBAC) — only users with correct roles can access certain routes
- Reverse proxies requests to the correct microservice
- Hides internal service endpoints from clients

**Why Golang?**
Golang is fast, concurrent and strongly typed — ideal for a gateway that handles high traffic with low latency.

---

### 2. Hotel Service

Manages all hotel and room related operations.

**Responsibilities:**
- Hotel CRUD operations (create, update, soft delete, get)
- Room category management (SINGLE, DOUBLE, DELUXE, FAMILY)
- Room availability checks by date range and room category
- Assign and release booking IDs on rooms
- Bulk room generation using BullMQ workers
- Maintain a 90-day room availability window using cron jobs

**Key Design Decision — One Room Per Date:**

Each row in the rooms table represents one room available on one specific date. This makes availability checking simple:

```sql
SELECT * FROM rooms
WHERE roomCategoryId = ?
AND bookingId IS NULL
AND dateOfAvailability BETWEEN ? AND ?
```

**Soft Delete:**

Hotels are never hard deleted. A `deleted_at` timestamp is set instead, preserving records for auditing while hiding them from active queries.

**Room Generation Flow:**

```
POST /rooms/generate
        │
        ▼
Producer pushes job to Redis queue
        │
        ▼
BullMQ Worker picks up job
        │
        ▼
Generates room entries in batches of 100
(avoids DB overload during bulk creation)
        │
        ▼
Cron job runs daily to extend
availability window to next 90 days
```

---

### 3. Booking Service

The core of the system. Handles the complete booking lifecycle from creation to confirmation.

**Booking Creation Flow:**

```
Client sends booking request
        │
        ▼
Call Hotel Service to check room availability
        │
        ▼
Acquire Redis Redlock on room resource (TTL: 60s)
        │
        ▼
Create booking in DB (status: PENDING)
Set expiredAt = current time + 10 minutes
        │
        ▼
Generate UUID idempotency key
Store in IdempotencyKey table linked to bookingId
        │
        ▼
Call Hotel Service to assign bookingId to room
        │
        ▼
Release Redis lock
        │
        ▼
Return bookingId + idempotencyKey to client
```

**Booking Confirmation Flow:**

```
Client sends idempotencyKey
        │
        ▼
Start Prisma Transaction
        │
        ▼
Acquire row level pessimistic lock
SELECT * FROM IdempotencyKey WHERE idemKey = ? FOR UPDATE
        │
        ▼
Check finalized flag
├── true  → Reject (already confirmed)
└── false → Continue
        │
        ▼
Verify logged in user matches booking creator
        │
        ▼
Update booking status: PENDING → CONFIRMED
Update finalized: false → true
        │
        ▼
Commit transaction
(rollback everything if any step fails)
```

**Ghost Booking Cleanup:**

```
Cron job runs every minute
        │
        ▼
Find bookings where:
status = PENDING AND expiredAt < current time
        │
        ▼
Mark those bookings as EXPIRED
        │
        ▼
Call Hotel Service to remove bookingId from room
        │
        ▼
Room is available again for other users
```

---

### 4. Notification Service

Completely independent service that sends email notifications to users. No direct HTTP calls from booking service — communication happens only through a shared Redis queue.

**Flow:**

```
Booking Service
pushes job to Redis queue "mailer-queue"
        │
        ▼
Notification Service Worker
listens on same queue
        │
        ▼
Worker picks up job
Loads Handlebars email template
Sends email via Nodemailer
```

**Why Redis Queue and not HTTP?**

Email delivery does not need to be instant. Using a queue decouples the services — if the notification service goes down temporarily, jobs are preserved in Redis and processed when it comes back up.

**Singleton Redis Connection:**

Instead of creating a new Redis connection on every function call, a singleton pattern using JavaScript closures ensures one connection is created and reused throughout the service lifecycle. This prevents TCP connection exhaustion and resource waste.

---

### 5. Review Service

Manages user reviews and calculates hotel ratings asynchronously.

**Flow:**

```
Users submit reviews
        │
        ▼
Cron job runs periodically
        │
        ▼
Aggregates new reviews
Calculates average hotel rating
        │
        ▼
Updates Hotel Service with new rating
```

---

## Core Problems Solved

### Problem 1: Two Users Booking the Same Room Simultaneously

**Solution: Redis Distributed Locking (Redlock Algorithm)**

Before creating a booking, the system acquires a lock on the room resource in Redis:

```
SET booking:roomId "unique-lock-id" NX PX ttl
```

- `NX` — only set if key does not exist (atomic)
- `PX ttl` — auto expires after TTL milliseconds

Only one request gets the lock. The second request fails to acquire it and is rejected. TTL ensures the lock auto-expires if something goes wrong mid-booking.

---

### Problem 2: Same User Confirming Booking Multiple Times

**Solution: Idempotency Key + Pessimistic Row Level Lock**

A UUID is generated at booking creation and stored in a dedicated `IdempotencyKey` table with a `finalized` flag (default: false).

On every confirmation request:
1. Row level lock is acquired on the idempotency key row
2. `finalized` flag is checked
3. If `true` → request is rejected
4. If `false` → booking is confirmed and `finalized` is set to `true`

No matter how many times the client sends the confirmation, it only gets processed once.

---

### Problem 3: Ghost Bookings (Rooms Blocked but Never Confirmed)

**Solution: Expiry Window + Cron Job Cleanup**

Every booking gets an `expiredAt` timestamp set to `current time + 10 minutes`. A cron job runs every minute and releases rooms whose bookings have expired without confirmation.

---

## Database Schema

### Booking Service — `airbnb_booking_dev`

**Booking Table**

| Column | Type | Description |
|---|---|---|
| id | Int | Primary key |
| userId | Int | User who created booking |
| hotelId | Int | Hotel being booked |
| roomCategoryId | Int | Room category |
| checkInDate | DateTime | Check in date |
| checkOutDate | DateTime | Check out date |
| bookingAmount | Int | Total amount |
| totalGuests | Int | Number of guests |
| status | Enum | PENDING / CONFIRMED / EXPIRED |
| expiredAt | DateTime | Booking expiry time |

**IdempotencyKey Table**

| Column | Type | Description |
|---|---|---|
| id | Int | Primary key |
| idemKey | String | UUID, unique |
| finalized | Boolean | Default false |
| bookingId | Int | Foreign key to Booking |

---

### Hotel Service — `airbnb_dev_mode`

**Hotels Table**

| Column | Type | Description |
|---|---|---|
| id | Int | Primary key |
| name | String | Hotel name |
| address | String | Hotel address |
| location | String | City or area |
| rating | Float | Average rating |
| deleted_at | DateTime | Null = active, timestamp = deleted |

**RoomCategory Table**

| Column | Type | Description |
|---|---|---|
| id | Int | Primary key |
| type | Enum | SINGLE / DOUBLE / DELUXE / FAMILY |
| price | Int | Base price |
| hotelId | Int | Foreign key to Hotels |

**Rooms Table**

| Column | Type | Description |
|---|---|---|
| id | Int | Primary key |
| roomCategoryId | Int | Foreign key to RoomCategory |
| bookingId | Int | Null = available, not null = booked |
| dateOfAvailability | DateTime | Specific date for this room entry |
| price | Int | Can override category price |

---

## Service Communication

| From | To | Method | When |
|---|---|---|---|
| Booking Service | Hotel Service | HTTP GET | Check room availability |
| Booking Service | Hotel Service | HTTP PATCH | Assign bookingId to room |
| Booking Service | Hotel Service | HTTP PATCH | Release room (ghost booking cleanup) |
| Booking Service | Notification Service | Redis Queue | Send booking email |
| Review Service | Hotel Service | HTTP PATCH | Update hotel rating |

> **Note:** Booking and Hotel Service have separate databases. Direct SQL joins are not allowed. All cross-service data access happens through HTTP API calls only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| API Gateway | Golang |
| Microservices | Node.js + TypeScript |
| Hotel Service ORM | Sequelize |
| Booking Service ORM | Prisma |
| Database | MySQL |
| Distributed Locking | Redis + Redlock |
| Job Queues | BullMQ + Redis |
| Email | Nodemailer + Handlebars |
| Migrations | Prisma Migrate + Sequelize CLI |

---

## Getting Started

### Prerequisites

- Node.js v18+
- Golang 1.21+
- MySQL
- Redis

### Clone all services

```bash
git clone https://github.com/saisathwik22/Airbnb-Node
```

### Setup each service

Navigate into each service folder and follow these steps:

```bash
cd <service-name>
npm install
cp .env.example .env
# Fill in your environment variables
npm run dev
```

### Environment Variables

Each service requires its own `.env` file. Common variables:

```env
PORT=3001
DATABASE_URL=mysql://user:password@localhost:3306/db_name
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret
```

### Run Migrations

**Booking Service (Prisma):**
```bash
npx prisma migrate dev
```

**Hotel Service (Sequelize):**
```bash
npm run migrate
```

### Rollback Migrations

**Booking Service:**
```bash
npx prisma migrate reset
```

**Hotel Service:**
```bash
npm run rollback
```

---

## 📄 License

MIT License — feel free to use this project for learning and reference.
