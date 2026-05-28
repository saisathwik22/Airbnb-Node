# 🏨 Distributed Hotel Booking System

<div align="center">

# Airbnb-Style Microservices Booking Platform

### Scalable • Concurrent • Fault-Tolerant • Event-Driven

Built using **Node.js**, **TypeScript**, **Golang**, **MySQL**, **Redis**, **BullMQ**, and **Prisma**.

</div>

---

# 📌 Overview

This project is a **production-style distributed hotel booking platform** inspired by real-world systems like Airbnb.

The architecture is designed using **microservices principles**, where every service owns its own responsibility, database, and business logic.

The system focuses heavily on solving real backend engineering challenges such as:

* Preventing **double booking** during concurrent requests
* Handling **duplicate booking confirmations** safely
* Cleaning up **ghost bookings** automatically
* Processing notifications asynchronously using queues
* Keeping services loosely coupled and independently deployable

---

# 🏗️ System Architecture

```mermaid
flowchart TD
    Client[Client / Frontend]

    Client --> Gateway[API Gateway - Golang]

    Gateway --> Hotel[Hotel Service]
    Gateway --> Booking[Booking Service]
    Gateway --> Review[Review Service]
    Gateway --> Notification[Notification Service]

    Hotel --> MySQL1[(MySQL - Hotel DB)]
    Booking --> MySQL2[(MySQL - Booking DB)]
    Review --> MySQL3[(MySQL - Review DB)]

    Booking --> Redis[(Redis)]
    Notification --> Redis
    Hotel --> Redis

    Redis --> Queue[BullMQ Queue]
    Queue --> Worker[Notification Workers]
```

---

# 🚀 Core Features

<div align="center">

| Feature                            | Description                                    |
| ---------------------------------- | ---------------------------------------------- |
| 🔒 Distributed Locking             | Prevents multiple users from booking same room |
| 🔁 Idempotent Booking Confirmation | Prevents duplicate confirmations               |
| 📬 Queue-Based Notifications       | Async email processing using BullMQ            |
| 🧹 Ghost Booking Cleanup           | Automatically releases expired bookings        |
| 🧩 Microservices Architecture      | Independent and scalable services              |
| 📦 Database Migrations             | Version controlled schema updates              |
| 🧠 Layered Architecture            | Clean separation of responsibilities           |
| ⚡ Redis Integration                | Fast distributed coordination                  |

</div>

---

# 🧱 Services

# 1️⃣ API Gateway (Golang)

The API Gateway acts as the **single entry point** for all client requests.

No service is directly exposed publicly.

## Responsibilities

* JWT Authentication
* Role-Based Access Control (RBAC)
* Reverse Proxy Routing
* Request Forwarding
* Hiding Internal Service URLs

---

## API Gateway Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant Service

    Client->>Gateway: HTTP Request + JWT
    Gateway->>Gateway: Validate JWT
    Gateway->>Gateway: Check RBAC Permissions
    Gateway->>Service: Forward Request
    Service-->>Gateway: Response
    Gateway-->>Client: Final Response
```

---

# 2️⃣ Hotel Service

Responsible for all hotel, room category and room availability operations.

---

## Responsibilities

* Hotel CRUD operations
* Room category management
* Room availability checking
* Booking ID assignment and release
* Bulk room generation
* Maintaining room availability windows

---

# 🛏️ Room Availability Design

Instead of storing one room record permanently, each row represents:

> **One room available on one specific date**

This simplifies date-range availability queries.

---

## Availability Query

```sql
SELECT * FROM rooms
WHERE roomCategoryId = ?
AND bookingId IS NULL
AND dateOfAvailability BETWEEN ? AND ?
```

---

# 🏨 Room Generation Architecture

```mermaid
flowchart TD
    A[Admin Creates Room Inventory]
    --> B[Producer Pushes Job to BullMQ]

    B --> C[Redis Queue]

    C --> D[Worker Consumes Job]

    D --> E[Generate Room Entries in Batches]

    E --> F[Store Availability for Next 90 Days]

    G[Cron Job Runs Daily]
    --> H[Extend Future Availability Window]
```

---

# 🗑️ Soft Delete Strategy

Hotels are never permanently deleted.

Instead:

```text
deleted_at = current timestamp
```

This preserves:

* Historical records
* Auditing capability
* Booking references

while hiding deleted hotels from active queries.

---

# 3️⃣ Booking Service

The Booking Service handles the entire booking lifecycle.

This service is responsible for solving:

* Concurrency problems
* Duplicate confirmations
* Booking consistency
* Transaction safety
* Expired booking cleanup

---

# 📌 Booking Creation Flow

```mermaid
sequenceDiagram
    participant User
    participant BookingService
    participant HotelService
    participant Redis
    participant DB

    User->>BookingService: Create Booking

    BookingService->>HotelService: Check Room Availability

    HotelService-->>BookingService: Rooms Available

    BookingService->>Redis: Acquire Distributed Lock

    Redis-->>BookingService: Lock Acquired

    BookingService->>DB: Create PENDING Booking

    BookingService->>DB: Generate Idempotency Key

    BookingService->>HotelService: Assign bookingId to Room

    BookingService->>Redis: Release Lock

    BookingService-->>User: bookingId + idempotencyKey
```

---

# 🔁 Booking Confirmation Flow

```mermaid
sequenceDiagram
    participant User
    participant BookingService
    participant DB

    User->>BookingService: Confirm Booking

    BookingService->>DB: Start Transaction

    BookingService->>DB: SELECT FOR UPDATE

    BookingService->>DB: Check finalized flag

    alt Already Finalized
        BookingService-->>User: Reject Duplicate Confirmation
    else Not Finalized
        BookingService->>DB: Update Booking Status
        BookingService->>DB: finalized = true
        BookingService->>DB: Commit Transaction
        BookingService-->>User: Booking Confirmed
    end
```

---

# 🔒 Distributed Locking (Redlock)

To prevent two users from booking the same room simultaneously, the system uses:

* Redis
* Redlock Algorithm

---

## Locking Flow

```mermaid
flowchart TD
    A[User Requests Booking]
    --> B[Generate Booking Resource Key]

    B --> C[Acquire Redis Lock]

    C -->|Success| D[Proceed with Booking]

    C -->|Failure| E[Reject / Retry Request]

    D --> F[Create Booking]

    F --> G[Release Lock]
```

---

# 🔑 Idempotency Key System

Every booking confirmation request uses a UUID-based idempotency key.

This guarantees:

✅ One successful confirmation only

✅ Safe retries during network failures

✅ No duplicate operations

---

## Idempotency Lifecycle

```mermaid
flowchart LR
    A[Create Booking]
    --> B[Generate UUID]

    B --> C[Store in Idempotency Table]

    C --> D[Client Sends Confirmation]

    D --> E[Check finalized flag]

    E -->|false| F[Confirm Booking]

    E -->|true| G[Reject Duplicate Request]
```

---

# 👻 Ghost Booking Cleanup

Sometimes users abandon the booking flow.

This can permanently block rooms.

To solve this:

* Every booking gets an `expiredAt` timestamp
* Cron jobs continuously cleanup expired bookings

---

## Cleanup Flow

```mermaid
flowchart TD
    A[Cron Job Runs Every Minute]
    --> B[Find Expired PENDING Bookings]

    B --> C[Mark Booking as EXPIRED]

    C --> D[Call Hotel Service]

    D --> E[Remove bookingId from Room]

    E --> F[Room Becomes Available Again]
```

---

# 4️⃣ Notification Service

The Notification Service handles asynchronous email delivery.

The Booking Service never directly sends emails.

Instead, it pushes jobs into a Redis queue.

---

# 📬 Queue-Based Communication

```mermaid
sequenceDiagram
    participant BookingService
    participant RedisQueue
    participant NotificationWorker
    participant Nodemailer
    participant User

    BookingService->>RedisQueue: Push Email Job

    NotificationWorker->>RedisQueue: Consume Job

    NotificationWorker->>NotificationWorker: Load Handlebars Template

    NotificationWorker->>Nodemailer: Send Email

    Nodemailer-->>User: Booking Email
```

---

# ⚡ Why Queue-Based Processing?

Using Redis queues provides:

* Loose coupling between services
* Faster booking responses
* Retry mechanisms
* Failure tolerance
* Background processing

Even if Notification Service goes down temporarily:

✅ Jobs remain safely stored in Redis.

---

# ♻️ Singleton Redis Connection

Instead of creating new Redis connections repeatedly:

✅ One Redis connection is created and reused.

This prevents:

* TCP connection exhaustion
* Resource wastage
* Redis client overload
* Performance degradation

---

# 5️⃣ Review Service

Responsible for handling hotel reviews and ratings.

---

## Review Aggregation Flow

```mermaid
flowchart TD
    A[Users Submit Reviews]
    --> B[Store Reviews]

    B --> C[Cron Job Aggregates Reviews]

    C --> D[Calculate Average Rating]

    D --> E[Update Hotel Service]
```

---

# 🧠 Problems Solved

# 1️⃣ Double Booking Problem

### Problem

Two users try to book the same room simultaneously.

### Solution

Redis Distributed Locking using Redlock.

---

# 2️⃣ Duplicate Confirmation Requests

### Problem

Users accidentally click confirm multiple times.

### Solution

UUID-based idempotency keys + row-level pessimistic locking.

---

# 3️⃣ Ghost Bookings

### Problem

Users abandon booking flow but rooms remain blocked.

### Solution

Expiry windows + automatic cron cleanup.

---

# 🗃️ Database Architecture

Each service owns its own database.

No direct SQL joins are allowed across services.

```mermaid
flowchart LR
    HotelService --> HotelDB[(Hotel DB)]
    BookingService --> BookingDB[(Booking DB)]
    ReviewService --> ReviewDB[(Review DB)]
```

This ensures:

* Independent scaling
* Service isolation
* Better maintainability
* Independent deployments

---

# 🔄 Service Communication

| From            | To                   | Communication Type |
| --------------- | -------------------- | ------------------ |
| Booking Service | Hotel Service        | REST API           |
| Booking Service | Notification Service | Redis Queue        |
| Review Service  | Hotel Service        | REST API           |
| API Gateway     | All Services         | Reverse Proxy      |

---

# 🛠️ Tech Stack

<div align="center">

| Layer               | Technology                     |
| ------------------- | ------------------------------ |
| API Gateway         | Golang                         |
| Backend Services    | Node.js + TypeScript           |
| ORM                 | Prisma + Sequelize             |
| Database            | MySQL                          |
| Distributed Locking | Redis + Redlock                |
| Queue Processing    | BullMQ                         |
| Email Service       | Nodemailer                     |
| Templating Engine   | Handlebars                     |
| Migrations          | Prisma Migrate + Sequelize CLI |

</div>

---

# 📂 Project Structure

```text
services/
├── api-gateway/
├── booking-service/
├── hotel-service/
├── notification-service/
├── review-service/
```

---

# ⚙️ Getting Started

# Clone Repository

```bash
git clone https://github.com/saisathwik22/Airbnb-Node
```

---

# Install Dependencies

```bash
npm install
```

---

# Setup Environment Variables

```env
PORT=3001
DATABASE_URL=mysql://user:password@localhost:3306/db_name
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_secret
```

---

# Run Prisma Migrations

```bash
npx prisma migrate dev
```

---

# Start Development Server

```bash
npm run dev
```

---

# ✨ Key Engineering Highlights

✅ Microservices Architecture

✅ Distributed Locking using Redis Redlock

✅ Queue-Based Asynchronous Communication

✅ Idempotent Booking Confirmation

✅ Transactional Consistency with Prisma

✅ Cron-Based Cleanup Systems

✅ Layered and Maintainable Codebase

✅ Scalable Service-Oriented Design

---


Feel free to use this project for learning and reference.
