# 📅 Booking Service

The Booking Service is the **core of the Distributed Hotel Booking System**. It manages the complete booking lifecycle — from creation to confirmation — and solves real-world challenges like concurrent bookings, duplicate confirmations, and ghost bookings.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Responsibilities](#responsibilities)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Core Flows](#core-flows)
- [Problems Solved](#problems-solved)
- [Database Schema](#database-schema)
- [Migrations](#migrations)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)

---

## Overview

The Booking Service owns its dedicated database `airbnb_booking_dev` and communicates with the Hotel Service via HTTP API calls and with the Notification Service via a Redis queue.

```
Client
  │
  ▼
Booking Service
  │               │                    │
  ▼               ▼                    ▼
MySQL DB    Hotel Service         Redis Queue
(Prisma)   (HTTP API calls)    (Notification Service)
```

---

## Responsibilities

- Receive and validate booking requests
- Check room availability with Hotel Service
- Handle concurrent booking requests safely using Redis Redlock
- Create bookings in pending state
- Generate idempotency keys to prevent duplicate confirmations
- Confirm bookings using database transactions with row level locking
- Clean up ghost bookings using a cron job
- Push notification jobs to Redis queue after booking events

---

## Architecture

This service follows a strict layered architecture:

```
Request
   │
   ▼
Router         ← defines routes
   │
   ▼
Middleware     ← validation (Zod schemas)
   │
   ▼
Controller     ← handles request and response
   │
   ▼
Service        ← business logic lives here
   │
   ▼
Repository     ← database operations only
   │
   ▼
Prisma Client  ← MySQL table operations
```

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/bookings` | Create a new booking |
| POST | `/api/v1/bookings/confirm` | Confirm an existing booking |
| GET | `/api/v1/bookings/:id` | Get booking by ID |

---

## Core Flows

### 1. Booking Creation

```
Client sends POST /api/v1/bookings
Body: {
  userId, hotelId, roomCategoryId,
  checkInDate, checkOutDate,
  totalGuests, bookingAmount
}
         │
         ▼
Call Hotel Service GET /rooms/availability
with roomCategoryId, checkInDate, checkOutDate
         │
         ├── No rooms available → Return error
         │
         └── Rooms available → Continue
         │
         ▼
Acquire Redis Redlock on room resource
bookingResource = "booking:<roomId>"
await redlock.acquire([bookingResource], ttl)
         │
         ├── Lock failed → Return 500 error
         │
         └── Lock acquired → Continue
         │
         ▼
Create booking in DB
status = PENDING
expiredAt = current time + 10 minutes
         │
         ▼
Generate UUID idempotency key
Store in IdempotencyKey table
linked to bookingId
         │
         ▼
Call Hotel Service PATCH /rooms/update-booking
Assign bookingId to room
         │
         ▼
Release Redis lock
         │
         ▼
Return { bookingId, idempotencyKey } to client
```

---

### 2. Booking Confirmation

```
Client sends POST /api/v1/bookings/confirm
Body: { idempotencyKey }
Header: Authorization Bearer <jwt_token>
         │
         ▼
Extract logged in userId from JWT token
         │
         ▼
Start Prisma Transaction
(all steps are atomic — rollback on any failure)
         │
         ▼
Acquire row level pessimistic lock:
SELECT * FROM IdempotencyKey
WHERE idemKey = ? FOR UPDATE
         │
         ▼
Check finalized flag
         │
         ├── finalized = true
         │     → Reject: "Booking already confirmed"
         │
         └── finalized = false → Continue
         │
         ▼
Extract userId from idempotencyKey
(join IdempotencyKey and Booking tables)
         │
         ▼
Compare extracted userId with logged in userId
         │
         ├── Different user → Reject: "Unauthorized"
         │
         └── Same user → Continue
         │
         ▼
Update Booking: status PENDING → CONFIRMED
         │
         ▼
Update IdempotencyKey: finalized false → true
         │
         ▼
Commit Transaction
         │
         ▼
Push notification job to Redis queue
         │
         ▼
Return confirmed booking to client
```

---

### 3. Ghost Booking Cleanup

A ghost booking happens when a user creates a booking but never confirms it. The room stays blocked for other users indefinitely.

```
Cron job runs every minute (* * * * *)
         │
         ▼
Query Booking table:
WHERE status = 'PENDING'
AND expiredAt < current time
         │
         ▼
For each expired booking:
  1. Update status: PENDING → EXPIRED
  2. Call Hotel Service PATCH /rooms/release
     to remove bookingId from room
         │
         ▼
Room is available again for other users
```

**Why 10 minutes?**

This gives the user enough time to complete the confirmation step (e.g., fill payment details) without blocking the room for too long.

---

## Problems Solved

### Problem 1: Two Users Booking the Same Room Simultaneously

**Without locking:**
- User A checks availability → room is free
- User B checks availability → room is free
- Both create bookings → double booking bug 😱

**With Redis Redlock:**
- User A acquires lock on room resource
- User B tries to acquire same lock → fails
- User A creates booking safely
- User B gets an error and must retry

```
SET booking:<roomId> "unique-lock-id" NX PX <ttl>
```

- `NX` — only set if key does not exist (atomic operation)
- `PX ttl` — auto expires after TTL milliseconds
- TTL prevents the lock from being held forever if something crashes

---

### Problem 2: Same User Confirming Booking Multiple Times

**Without idempotency:**
- User clicks confirm → booking confirmed
- User clicks confirm again (accidentally) → booking confirmed again → double charge 😱

**With idempotency key:**
- UUID generated at booking creation and stored with `finalized = false`
- First confirmation → `finalized` checked (false) → booking confirmed → `finalized` set to true
- Second confirmation → `finalized` checked (true) → request rejected immediately

**With pessimistic row level lock:**
- Two simultaneous confirmation requests arrive
- First request acquires `SELECT FOR UPDATE` lock on the idempotency key row
- Second request is blocked until first completes
- First confirms booking and sets `finalized = true`
- Second request proceeds → sees `finalized = true` → rejected

---

### Problem 3: Ghost Bookings

**Without cleanup:**
- User creates booking → room assigned bookingId → room blocked
- User never confirms → booking stays PENDING forever
- Room never becomes available → lost revenue 😱

**With expiry + cron job:**
- Every booking gets `expiredAt = now + 10 minutes`
- Cron job runs every minute
- Detects PENDING bookings past their expiry
- Marks them EXPIRED and releases the room

---

## Database Schema

**Database:** `airbnb_booking_dev`

### Booking Table

```
Booking
├── id              Int           PRIMARY KEY AUTO_INCREMENT
├── userId          Int           NOT NULL
├── hotelId         Int           NOT NULL
├── roomCategoryId  Int           NOT NULL
├── checkInDate     DATETIME      NOT NULL
├── checkOutDate    DATETIME      NOT NULL
├── bookingAmount   Int           NOT NULL
├── totalGuests     Int           NOT NULL
├── status          ENUM          (PENDING, CONFIRMED, EXPIRED)
├── expiredAt       DATETIME      NOT NULL
├── createdAt       DATETIME      DEFAULT NOW()
└── updatedAt       DATETIME      AUTO UPDATE
```

### IdempotencyKey Table

```
IdempotencyKey
├── id          Int       PRIMARY KEY AUTO_INCREMENT
├── idemKey     VARCHAR   UNIQUE NOT NULL (UUID)
├── finalized   BOOLEAN   DEFAULT false
├── bookingId   Int       UNIQUE FOREIGN KEY → Booking.id
├── createdAt   DATETIME  DEFAULT NOW()
└── updatedAt   DATETIME  AUTO UPDATE
```

### Relationship

```
Booking (1) ──── (1) IdempotencyKey
```

One booking has exactly one idempotency key. The relationship is defined from the IdempotencyKey side via `bookingId`.

### Why a separate IdempotencyKey table?

- Keeps the Booking table clean
- Single responsibility — booking table stores booking data, idempotency table handles duplicate prevention
- Row level lock can be applied to just the idempotency row without locking the entire booking row

---

## Migrations

This service uses **Prisma Migrate** for database migrations. All schema changes are tracked in `prisma/migrations`.

### Run migrations

```bash
npx prisma migrate dev
```

### Create a new migration

```bash
npx prisma migrate dev --name your_migration_name
```

### Reset all migrations

```bash
npx prisma migrate reset
```

### View current schema

```bash
npx prisma studio
```

---

## Environment Variables

```env
PORT=3002
DATABASE_URL=mysql://user:password@localhost:3306/airbnb_booking_dev
REDIS_SERVER_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
LOCK_TTL=60000
HOTEL_SERVICE_URL=http://localhost:3001
JWT_SECRET=your_jwt_secret
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MySQL
- Redis

### Install dependencies

```bash
npm install
```

### Run migrations

```bash
npx prisma migrate dev
```

### Generate Prisma client

```bash
npx prisma generate
```

### Start the service

```bash
npm run dev
```

---

## Folder Structure

```
booking-service/
├── src/
│   ├── config/
│   │   └── redis.config.ts       ← Redis + Redlock setup
│   ├── prisma/
│   │   ├── schema.prisma         ← Prisma schema definition
│   │   ├── client.ts             ← Prisma client instance
│   │   └── migrations/           ← Migration files
│   ├── repositories/
│   │   └── booking.repository.ts ← All DB operations
│   ├── services/
│   │   └── booking.service.ts    ← Business logic
│   ├── controllers/
│   │   └── booking.controller.ts
│   ├── routers/
│   │   └── v1/
│   │       └── booking.router.ts
│   ├── queues/
│   │   └── email.queue.ts        ← Mailer queue setup
│   ├── producers/
│   │   └── email.producer.ts     ← Pushes notification jobs
│   ├── cron/
│   │   └── bookingCleanup.cron.ts ← Ghost booking cleanup
│   ├── dto/
│   │   └── booking.dto.ts
│   └── utils/
│       ├── errors/
│       └── helpers/
│           └── generateIdempotencyKey.ts
└── server.ts
```
