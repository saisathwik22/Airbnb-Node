# 🏨 Distributed Hotel Booking System

> A production-style microservices platform for hotel bookings — built to solve real-world distributed systems challenges like concurrent bookings, duplicate confirmations, and ghost bookings.

<br>

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/Golang-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-FF4040?style=for-the-badge&logo=redis&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)

<br>

---

## 📌 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Services](#services)
- [Core Problems Solved](#core-problems-solved)
- [Booking Creation Flow](#booking-creation-flow)
- [Booking Confirmation Flow](#booking-confirmation-flow)
- [Ghost Booking Cleanup](#ghost-booking-cleanup)
- [Database Schema](#database-schema)
- [Service Communication](#service-communication)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)

---

## Overview

This project simulates a real-world hotel booking platform similar to Airbnb, using a microservices architecture. Each service is independently deployable, owns its own database, and communicates with other services only through REST APIs or Redis queues — never through shared databases.

### What makes this project different

| Challenge | Solution |
|---|---|
| Two users booking the same room at the same time | Redis Redlock distributed locking |
| Same user confirming a booking multiple times | UUID idempotency key + pessimistic row lock |
| Rooms blocked forever by unconfirmed bookings | Expiry window + cron job cleanup |
| Wrong user confirming someone else's booking | User verification via DB join + JWT |

---

## Architecture

All client requests pass through a Golang API Gateway before reaching any microservice. Each service owns a dedicated MySQL database. No cross-database joins are allowed.

```mermaid
graph TD
    Client["🖥️ Client"]

    Client --> GW

    subgraph GW["🔐 API Gateway (Golang)"]
        direction LR
        JWT["JWT Verification"]
        RBAC["Role-Based Access Control"]
        PROXY["Reverse Proxy"]
    end

    GW --> HS
    GW --> BS
    GW --> NS
    GW --> RS

    subgraph HS["🏨 Hotel Service (Node.js)"]
        HDB[("MySQL\nairbnb_dev_mode")]
    end

    subgraph BS["📅 Booking Service (Node.js)"]
        BDB[("MySQL\nairbnb_booking_dev")]
        REDIS[("Redis\nRedlock + Queue")]
    end

    subgraph NS["📧 Notification Service (Node.js)"]
        WORKER["BullMQ Worker"]
        MAILER["Nodemailer"]
    end

    subgraph RS["⭐ Review Service (Node.js)"]
        CRON["Cron Job"]
        RDB[("MySQL\nairbnb_review_dev")]
    end

    BS -->|"HTTP API calls"| HS
    BS -->|"Redis Queue"| NS
    RS -->|"HTTP PATCH rating"| HS
```

---

## Services

### 🔐 API Gateway — Golang

The single entry point for all client requests. No microservice is directly accessible without passing through the gateway.

| Feature | Description |
|---|---|
| JWT Authentication | Verifies token on every incoming request |
| Role-Based Access Control | Enforces `user` and `admin` roles per route |
| Reverse Proxy | Forwards requests to correct microservice |
| Security | Internal service endpoints are never exposed to clients |

> **Why Golang?** Golang is fast, concurrent and strongly typed — ideal for a gateway handling high traffic with low latency.

---

### 🏨 Hotel Service — Node.js + Sequelize

Manages all hotel and room data. Exposes APIs consumed by the Booking Service.

| Feature | Description |
|---|---|
| Hotel CRUD | Create, read, update, soft delete hotels |
| Room availability check | Query rooms by category and date range |
| Assign booking to room | Mark room as temporarily unavailable |
| Release room | Free room when booking expires |
| Room generation | Auto-generate rooms for next 90 days via BullMQ |
| Soft delete | Uses `deleted_at` column — records never permanently removed |

---

### 📅 Booking Service — Node.js + Prisma

The core of the system. Handles the complete booking lifecycle from creation to confirmation.

| Feature | Description |
|---|---|
| Booking creation | Checks availability, locks resource, creates booking |
| Booking confirmation | Atomic transaction with pessimistic locking |
| Ghost booking cleanup | Cron job detects and releases expired bookings |
| Idempotency | UUID-based key prevents duplicate confirmations |
| User verification | Confirms booking creator matches logged-in user |

---

### 📧 Notification Service — Node.js + BullMQ

Completely decoupled from other services. Listens to a Redis queue and sends emails asynchronously.

| Feature | Description |
|---|---|
| Queue consumer | BullMQ worker listens on `mailer-queue` |
| Email templates | Handlebars `.hbs` templates for each email type |
| Singleton Redis | One reusable connection using JavaScript closures |
| Transactional emails | Sent via Nodemailer |

---

### ⭐ Review Service — Node.js

Manages user reviews and calculates hotel ratings asynchronously via cron job.

| Feature | Description |
|---|---|
| Review storage | Stores user reviews per hotel |
| Async rating calculation | Cron job aggregates reviews periodically |
| Hotel rating update | Calls Hotel Service API with new average rating |

---

## Core Problems Solved

### Problem 1 — Two users booking the same room simultaneously

```mermaid
sequenceDiagram
    participant UserA
    participant UserB
    participant BookingService
    participant Redis

    UserA->>BookingService: POST /bookings (roomId: 101)
    UserB->>BookingService: POST /bookings (roomId: 101)

    BookingService->>Redis: Acquire Redlock on booking:101
    Redis-->>BookingService: ✅ Lock acquired (User A)

    BookingService->>Redis: Acquire Redlock on booking:101
    Redis-->>BookingService: ❌ Lock already held (User B fails)

    BookingService-->>UserA: ✅ Booking created
    BookingService-->>UserB: ❌ Error - try again
```

**Solution:** Redis Redlock uses an atomic `SET NX PX` command — only one request can hold the lock at a time. TTL ensures the lock auto-expires if something crashes mid-booking.

---

### Problem 2 — Same user confirming booking multiple times

```mermaid
sequenceDiagram
    participant User
    participant BookingService
    participant DB

    User->>BookingService: POST /confirm (idemKey: abc-123)
    BookingService->>DB: SELECT FOR UPDATE on IdempotencyKey
    DB-->>BookingService: finalized = false
    BookingService->>DB: UPDATE status CONFIRMED, finalized = true
    BookingService-->>User: ✅ Booking confirmed

    User->>BookingService: POST /confirm (idemKey: abc-123) again
    BookingService->>DB: SELECT FOR UPDATE on IdempotencyKey
    DB-->>BookingService: finalized = true
    BookingService-->>User: ❌ Already confirmed - rejected
```

**Solution:** UUID idempotency key with `finalized` flag inside a Prisma transaction with `SELECT ... FOR UPDATE` row-level lock. No matter how many times the request is sent, it only processes once.

---

### Problem 3 — Ghost bookings blocking rooms indefinitely

```mermaid
flowchart LR
    A["Booking created\nstatus = PENDING\nexpiredAt = now + 10min"]
    B{"Cron job\nevery minute"}
    C{"expiredAt\n< now?"}
    D["Mark booking\nEXPIRED"]
    E["Call Hotel Service\nrelease room"]
    F["Room available\nfor others"]
    G["Booking confirmed\nbefore expiry"]

    A --> B
    B --> C
    C -->|Yes| D
    D --> E
    E --> F
    C -->|No| G
```

**Solution:** Every booking gets `expiredAt = now + 10 minutes`. A cron job runs every minute, finds unconfirmed expired bookings, and releases their rooms.

---

### Problem 4 — Wrong user confirming someone else's booking

**Solution:** The IdempotencyKey and Booking tables are joined to extract the `userId` who created the booking. This is compared against the logged-in user's ID extracted from the JWT token. If they don't match, the request is rejected.

---

## Booking Creation Flow

```mermaid
flowchart TD
    A["Client sends POST /bookings\nroomCategoryId, checkIn, checkOut, userId"]
    B["Call Hotel Service\nGET /rooms/availability"]
    C{"Rooms\navailable?"}
    D["Return error\nNo rooms available"]
    E["Acquire Redis Redlock\non room resource with TTL"]
    F{"Lock\nacquired?"}
    G["Return 500 error\nTry again"]
    H["Create booking in DB\nstatus=PENDING, expiredAt=now+10min"]
    I["Generate UUID\nidempotency key"]
    J["Store in IdempotencyKey table\nlinked to bookingId"]
    K["Call Hotel Service\nPATCH /rooms/update-booking"]
    L["Release Redis lock"]
    M["Return bookingId\n+ idempotencyKey to client"]

    A --> B
    B --> C
    C -->|No| D
    C -->|Yes| E
    E --> F
    F -->|No| G
    F -->|Yes| H
    H --> I
    I --> J
    J --> K
    K --> L
    L --> M
```

---

## Booking Confirmation Flow

```mermaid
flowchart TD
    A["Client sends idempotencyKey\n+ JWT token in header"]
    B["Start Prisma transaction\nall steps are atomic"]
    C["SELECT FOR UPDATE\non IdempotencyKey row\npessimistic lock acquired"]
    D{"finalized\n= true?"}
    E["Reject\nAlready confirmed"]
    F["Extract userId\nfrom idempotencyKey via join"]
    G{"Same user\nas JWT?"}
    H["Reject\nUnauthorized"]
    I["Update booking\nPENDING → CONFIRMED"]
    J["Update IdempotencyKey\nfinalized → true"]
    K["Commit transaction"]
    L["Push job to Redis queue\nNotification service sends email"]

    A --> B
    B --> C
    C --> D
    D -->|Yes| E
    D -->|No| F
    F --> G
    G -->|No| H
    G -->|Yes| I
    I --> J
    J --> K
    K --> L
```

> If any step fails, the entire transaction rolls back automatically.

---

## Ghost Booking Cleanup

```mermaid
flowchart LR
    A["Cron job\n* * * * *\nevery minute"]
    B["Query bookings\nstatus=PENDING\nAND expiredAt < now"]
    C{"Any expired\nbookings found?"}
    D["Skip\nnothing to clean"]
    E["Mark each booking\nstatus → EXPIRED"]
    F["Call Hotel Service\nPATCH /rooms/release\nbookingId → NULL"]
    G["Room available\nfor other users"]

    A --> B
    B --> C
    C -->|No| D
    C -->|Yes| E
    E --> F
    F --> G
```

---

## Database Schema

### Booking Service — `airbnb_booking_dev`

```mermaid
erDiagram
    Booking ||--|| IdempotencyKey : "has one"

    Booking {
        int id PK
        int userId
        int hotelId
        int roomCategoryId
        datetime checkInDate
        datetime checkOutDate
        int bookingAmount
        int totalGuests
        enum status
        datetime expiredAt
        datetime createdAt
        datetime updatedAt
    }

    IdempotencyKey {
        int id PK
        string idemKey UK
        boolean finalized
        int bookingId FK
        datetime createdAt
        datetime updatedAt
    }
```

### Hotel Service — `airbnb_dev_mode`

```mermaid
erDiagram
    Hotels ||--o{ RoomCategory : "has many"
    RoomCategory ||--o{ Rooms : "has many"

    Hotels {
        int id PK
        string name
        string address
        string location
        float rating
        int ratingCount
        datetime deleted_at
        datetime created_at
        datetime updated_at
    }

    RoomCategory {
        int id PK
        string type
        int price
        int hotelId FK
    }

    Rooms {
        int id PK
        int roomCategoryId FK
        int bookingId
        datetime dateOfAvailability
        int price
    }
```

> `Rooms.bookingId` links to `Booking.id` across services by value — not a foreign key, since the databases are separate.

---

## Service Communication

```mermaid
graph LR
    BS["📅 Booking Service"]
    HS["🏨 Hotel Service"]
    NS["📧 Notification Service"]
    RS["⭐ Review Service"]

    BS -->|"GET /rooms/availability\nCheck room availability"| HS
    BS -->|"PATCH /rooms/update-booking\nAssign bookingId to room"| HS
    BS -->|"PATCH /rooms/release\nRelease room on expiry"| HS
    BS -->|"Redis Queue mailer-queue\nPush email job"| NS
    RS -->|"PATCH /hotels/:id/rating\nUpdate hotel rating"| HS
```

| From | To | Method | When |
|---|---|---|---|
| Booking Service | Hotel Service | HTTP GET | Check room availability |
| Booking Service | Hotel Service | HTTP PATCH | Assign bookingId to room |
| Booking Service | Hotel Service | HTTP PATCH | Release room on expiry |
| Booking Service | Notification Service | Redis Queue | Send booking email |
| Review Service | Hotel Service | HTTP PATCH | Update hotel rating |

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| API Gateway | Golang | Fast, concurrent, low memory |
| Microservices | Node.js + TypeScript | Non-blocking I/O, type safety |
| Booking ORM | Prisma | Auto-generated types, clean transaction API |
| Hotel ORM | Sequelize | Mature, flexible migrations |
| Database | MySQL | Relational data, ACID transactions |
| Distributed lock | Redis + Redlock | Atomic SET NX PX operations |
| Job queues | BullMQ + Redis | Reliable async processing with retries |
| Email | Nodemailer + Handlebars | Transactional emails with reusable templates |

---

## Getting Started

### Prerequisites

- Node.js v18+
- Golang 1.21+
- MySQL
- Redis

### Clone the repository

```bash
git clone https://github.com/saisathwik22/Airbnb-Node
cd Airbnb-Node
```

### Setup each service

```bash
cd <service-name>
npm install
cp .env.example .env
# Fill in your environment variables
npm run dev
```

### Run migrations

**Booking Service (Prisma):**
```bash
npx prisma migrate dev
npx prisma generate
```

**Hotel Service (Sequelize):**
```bash
npm run migrate
```

### Rollback migrations

**Booking Service:**
```bash
npx prisma migrate reset
```

**Hotel Service:**
```bash
npm run rollback
```

### Environment variables

Each service needs its own `.env` file. Common variables:

```env
PORT=3001
DATABASE_URL=mysql://user:password@localhost:3306/db_name
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret
LOCK_TTL=60000
```

---

## Project Structure

```
Airbnb-Node/
├── api-gateway/          ← Golang API Gateway
├── hotel-service/        ← Node.js + Sequelize
├── booking-service/      ← Node.js + Prisma
├── notification-service/ ← Node.js + BullMQ
├── review-service/       ← Node.js + Cron
└── README.md
```

---

