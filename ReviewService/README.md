# ⭐ Review Service

The Review Service manages user reviews for hotels and calculates hotel ratings asynchronously in the Distributed Hotel Booking System. Ratings are aggregated periodically using a cron job and synced back to the Hotel Service.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Responsibilities](#responsibilities)
- [How It Works](#how-it-works)
- [Rating Calculation Flow](#rating-calculation-flow)
- [Why Asynchronous Rating Calculation](#why-asynchronous-rating-calculation)
- [Internal API Authentication](#internal-api-authentication)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)

---

## Overview

When users stay at a hotel they can leave a review. Instead of recalculating the hotel's average rating on every new review (which would be expensive at scale), the Review Service uses a **cron job** to periodically aggregate reviews and update ratings in batches.

```
Users submit reviews
         │
         ▼
Reviews stored in Review Service DB
         │
         ▼
Cron job runs periodically
         │
         ▼
Aggregates all new reviews
Calculates average rating per hotel
         │
         ▼
Calls Hotel Service API
Updates hotel rating in Hotel Service DB
```

---

## Responsibilities

- Accept and store user reviews for hotels
- Periodically aggregate reviews using a cron job
- Calculate average hotel ratings
- Update Hotel Service with new ratings
- Authenticate internal API calls through the API Gateway

---

## How It Works

### Step by step flow

```
1. User submits a review for a hotel
   POST /api/v1/reviews
   Body: { hotelId, userId, rating, comment }
         │
         ▼
2. Review is stored in Review Service database
         │
         ▼
3. Cron job runs periodically
         │
         ▼
4. Aggregates all reviews grouped by hotelId
   Calculates: totalRating / totalReviews = averageRating
         │
         ▼
5. For each hotel with new reviews:
   Calls Hotel Service PATCH /hotels/:id/rating
   with { rating, ratingCount }
         │
         ▼
6. Hotel Service updates the hotel record
   with the new average rating
```

---

## Rating Calculation Flow

```
Cron job triggers
         │
         ▼
Query reviews table:
SELECT hotelId,
       AVG(rating) as averageRating,
       COUNT(*) as totalReviews
FROM reviews
GROUP BY hotelId
         │
         ▼
For each hotelId result:
  Call Hotel Service API:
  PATCH /api/v1/hotels/:hotelId/rating
  Body: {
    rating: averageRating,
    ratingCount: totalReviews
  }
         │
         ▼
Hotel Service updates hotel record
Rating is now visible to users searching hotels
```

---

## Why Asynchronous Rating Calculation?

### Synchronous approach (not used)

Calculate and update rating on every new review submission. Simple but has problems:

- Every review triggers a DB aggregation query
- Aggregation query gets slower as reviews grow
- Review submission response time increases at scale

### Asynchronous approach (used)

Batch process reviews periodically using a cron job:

- Review submission is fast — just insert one row
- Aggregation happens in the background on a schedule
- Rating may be slightly delayed but system is far more scalable
- At scale this approach handles millions of reviews efficiently

This is a common pattern in real-world systems like Airbnb, Amazon etc.

---

## Internal API Authentication

When the Review Service calls the Hotel Service to update ratings, this is an **internal service-to-service call**. These calls are authenticated through the API Gateway using JWT tokens.

```
Review Service
      │
      │ Internal API call with JWT token
      ▼
API Gateway
      │
      │ Verifies JWT, checks role
      ▼
Hotel Service
      │
      │ Updates hotel rating
      ▼
Response back to Review Service
```

This ensures that even internal service calls are authenticated and cannot be spoofed.

---

## Database Schema

**Reviews Table**

```
Reviews
├── id          Int       PRIMARY KEY AUTO_INCREMENT
├── hotelId     Int       NOT NULL
├── userId      Int       NOT NULL
├── rating      Int       NOT NULL (1-5)
├── comment     TEXT      DEFAULT NULL
├── createdAt   DATETIME  DEFAULT NOW()
└── updatedAt   DATETIME  AUTO UPDATE
```

---

## Environment Variables

```env
PORT=3004
DATABASE_URL=mysql://user:password@localhost:3306/airbnb_review_dev
HOTEL_SERVICE_URL=http://localhost:3001
JWT_SECRET=your_jwt_secret
CRON_SCHEDULE=0 * * * *
```

**CRON_SCHEDULE options:**

| Value | Runs |
|---|---|
| `* * * * *` | Every minute (testing) |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Every day at midnight |

---

## Getting Started

### Prerequisites

- Node.js v18+
- MySQL

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
review-service/
├── src/
│   ├── config/
│   │   └── db.config.ts          ← MySQL connection config
│   ├── repositories/
│   │   └── review.repository.ts  ← DB operations
│   ├── services/
│   │   └── review.service.ts     ← Business logic
│   ├── controllers/
│   │   └── review.controller.ts
│   ├── routers/
│   │   └── v1/
│   │       └── review.router.ts
│   ├── cron/
│   │   └── ratingCalculation.cron.ts ← Aggregation cron job
│   └── dto/
│       └── review.dto.ts
└── server.ts
```
