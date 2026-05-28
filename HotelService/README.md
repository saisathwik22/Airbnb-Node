# 🏨 Hotel Service

The Hotel Service manages all hotel and room related operations in the Distributed Hotel Booking System. It exposes REST APIs consumed by the Booking Service and handles room availability, room generation, and hotel management.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Responsibilities](#responsibilities)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Core Flows](#core-flows)
- [Database Schema](#database-schema)
- [Room Generation](#room-generation)
- [Migrations](#migrations)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)

---

## Overview

The Hotel Service owns all hotel and room data in its dedicated database `airbnb_dev_mode`. It is completely independent of the Booking Service — no shared database, no direct joins. All cross-service data access happens through HTTP API calls only.

```
Booking Service
      │
      │ HTTP API calls
      ▼
Hotel Service
      │
      ▼
MySQL Database (airbnb_dev_mode)
  ├── Hotels
  ├── RoomCategory
  └── Rooms
```

---

## Responsibilities

- Hotel CRUD operations (create, read, update, soft delete)
- Room category management
- Room availability checks for date ranges
- Assign booking IDs to rooms when booked
- Release booking IDs from rooms when bookings expire
- Bulk room generation using Redis queues and BullMQ workers
- Maintain a 90 day room availability window using cron jobs

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
Service        ← business logic
   │
   ▼
Repository     ← database operations only
   │
   ▼
Sequelize Model ← MySQL table representation
```

### Base Repository Pattern

Common database operations like `findById`, `update`, `delete` are written once in `base.repository.ts` and shared across all repositories through inheritance. This avoids code duplication.

---

## API Endpoints

### Hotel Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/hotels` | Create a new hotel |
| GET | `/api/v1/hotels/:id` | Get hotel by ID |
| PUT | `/api/v1/hotels/:id` | Update hotel |
| DELETE | `/api/v1/hotels/:id` | Soft delete hotel |

### Room Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/rooms/availability` | Check room availability for date range |
| PATCH | `/api/v1/rooms/update-booking` | Assign bookingId to room |
| PATCH | `/api/v1/rooms/release` | Remove bookingId from room |

### Room Generation Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/rooms/generate` | Trigger bulk room generation |
| POST | `/api/v1/room-scheduler/start` | Start cron job for room availability window |

### Room Category Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/room-categories` | Create room category |
| GET | `/api/v1/room-categories/:id` | Get room category |
| PUT | `/api/v1/room-categories/:id` | Update room category |
| DELETE | `/api/v1/room-categories/:id` | Delete room category |

---

## Core Flows

### 1. Room Availability Check

Called by Booking Service before creating a booking.

```
Booking Service calls GET /api/v1/rooms/availability
with roomCategoryId, checkInDate, checkOutDate
         │
         ▼
Hotel Service queries rooms table:

SELECT * FROM rooms
WHERE roomCategoryId = ?
AND bookingId IS NULL
AND dateOfAvailability BETWEEN ? AND ?
         │
         ▼
Returns available rooms to Booking Service
```

**Why bookingId IS NULL?**

When a room is booked, its `bookingId` column is set to the active booking ID. If `bookingId` is null, the room is free. This makes availability checking a simple query.

---

### 2. Assign BookingId to Room

Called by Booking Service after a booking is successfully created.

```
Booking Service calls PATCH /api/v1/rooms/update-booking
with roomIds and bookingId
         │
         ▼
Hotel Service runs:

UPDATE rooms
SET bookingId = ?
WHERE id IN (?)
         │
         ▼
Room is now unavailable for other users
```

---

### 3. Release Room (Ghost Booking Cleanup)

Called by Booking Service when an unconfirmed booking expires.

```
Booking Service calls PATCH /api/v1/rooms/release
with bookingId
         │
         ▼
Hotel Service runs:

UPDATE rooms
SET bookingId = NULL
WHERE bookingId = ?
         │
         ▼
Room is available again for other users
```

---

### 4. Soft Delete

Hotels are never permanently deleted. Instead a `deleted_at` timestamp is set.

```
DELETE request received
         │
         ▼
UPDATE hotels
SET deleted_at = current_timestamp
WHERE id = ?
         │
         ▼
Record still exists in DB for auditing
Hidden from all active queries
```

This pattern is called a **tombstone** — the record exists but is treated as deleted.

---

## Database Schema

**Database:** `airbnb_dev_mode`

### Hotels Table

```
Hotels
├── id           Int          PRIMARY KEY AUTO_INCREMENT
├── name         VARCHAR(255) NOT NULL
├── address      VARCHAR(255) NOT NULL
├── location     VARCHAR(255) NOT NULL
├── rating       FLOAT        DEFAULT NULL
├── ratingCount  INT          DEFAULT 0
├── deleted_at   DATETIME     DEFAULT NULL
├── created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
└── updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### RoomCategory Table

```
RoomCategory
├── id       Int         PRIMARY KEY AUTO_INCREMENT
├── type     ENUM        (SINGLE, DOUBLE, DELUXE, FAMILY)
├── price    Int         NOT NULL
└── hotelId  Int         FOREIGN KEY → Hotels.id
```

### Rooms Table

```
Rooms
├── id                  Int       PRIMARY KEY AUTO_INCREMENT
├── roomCategoryId      Int       FOREIGN KEY → RoomCategory.id
├── bookingId           Int       DEFAULT NULL (null = available)
├── dateOfAvailability  DATETIME  NOT NULL
└── price               Int       (can override RoomCategory price)
```

### Relationships

```
Hotels (1) ──── (Many) RoomCategory
RoomCategory (1) ──── (Many) Rooms
```

---

## Room Generation

Rooms are generated automatically for future dates so users can book them. Each row in the `Rooms` table represents **one room available on one specific date**.

### Why generate rooms this way?

Instead of checking seat counts, each date gets its own room row. Availability check becomes a simple `WHERE bookingId IS NULL` query.

### Bulk Room Generation Flow

```
POST /api/v1/rooms/generate
Body: { roomCategoryId, startDate, endDate }
         │
         ▼
Producer pushes job to Redis queue
         │
         ▼
BullMQ Worker picks up job
         │
         ▼
generateRoomsService() runs:
  1. Validate roomCategoryId exists
  2. Calculate total days between startDate and endDate
  3. Loop through dates in batches of 100
  4. For each batch check which dates already have rooms
  5. Create only missing room entries in bulk
         │
         ▼
Rooms created for requested date range
```

**Why batches of 100?**

Creating hundreds of DB entries at once can overload MySQL. Batching limits memory usage and keeps each DB operation manageable.

### 90-Day Window Cron Job

```
Cron job runs daily at midnight (0 0 * * *)
         │
         ▼
extendRoomAvailability() runs:
  1. Find latest available date for each room category
  2. Calculate next date after latest date
  3. Push room generation job to Redis queue
         │
         ▼
Workers generate rooms for the next day
keeping a rolling 90 day window
```

---

## Migrations

This service uses **Sequelize CLI** for database migrations. All schema changes are versioned with `up` and `down` functions.

### Run migrations

```bash
npm run migrate
```

### Rollback last migration

```bash
npm run rollback
```

### Create a new migration

```bash
npx sequelize-cli migration:generate --name your_migration_name
```

### Migration structure

```ts
module.exports = {
    async up(queryInterface) {
        // Apply change
        await queryInterface.addColumn('hotels', 'new_column', {
            type: DataTypes.STRING,
            allowNull: true
        });
    },
    async down(queryInterface) {
        // Revert change
        await queryInterface.removeColumn('hotels', 'new_column');
    }
};
```

---

## Environment Variables

```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_NAME=airbnb_dev_mode
DB_USER=root
DB_PASSWORD=your_password
REDIS_HOST=localhost
REDIS_PORT=6379
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
npm run migrate
```

### Start the service

```bash
npm run dev
```

---

## Folder Structure

```
hotel-service/
├── src/
│   ├── config/
│   │   ├── db.config.ts          ← MySQL connection config
│   │   └── redis.config.ts       ← Redis connection
│   ├── db/
│   │   ├── migrations/           ← Sequelize migration files
│   │   ├── models/
│   │   │   ├── hotel.ts          ← Hotel Sequelize model
│   │   │   ├── room.ts           ← Room Sequelize model
│   │   │   └── roomCategory.ts   ← RoomCategory model
│   │   └── seeders/
│   ├── repositories/
│   │   ├── base.repository.ts    ← Shared base repository
│   │   ├── hotel.repository.ts
│   │   ├── room.repository.ts
│   │   └── roomCategory.repository.ts
│   ├── services/
│   │   ├── hotel.service.ts
│   │   ├── room.service.ts
│   │   └── roomGeneration.service.ts
│   ├── controllers/
│   │   ├── hotel.controller.ts
│   │   └── room.controller.ts
│   ├── routers/
│   │   └── v1/
│   │       ├── hotel.router.ts
│   │       └── room.router.ts
│   ├── queues/
│   │   └── roomGeneration.queue.ts
│   ├── producers/
│   │   └── roomGeneration.producer.ts
│   ├── processors/
│   │   └── roomGeneration.processor.ts
│   ├── cron/
│   │   └── roomScheduler.cron.ts
│   ├── dto/
│   │   └── hotel.dto.ts
│   └── utils/
│       └── errors/
└── server.ts
```
