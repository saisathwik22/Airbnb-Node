# 🔐 API Gateway Service

The API Gateway is the **single entry point** for all client requests in the Distributed Hotel Booking System. Built in Golang, it handles authentication, authorization, and request routing before forwarding requests to the appropriate microservice.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Responsibilities](#responsibilities)
- [How It Works](#how-it-works)
- [Authentication Flow](#authentication-flow)
- [Role Based Access Control](#role-based-access-control)
- [Reverse Proxy](#reverse-proxy)
- [Why Golang](#why-golang)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)

---

## Overview

In a microservices architecture, having multiple services directly exposed to the client creates security and management challenges. The API Gateway solves this by acting as a **security checkpoint, traffic manager, and request router** for all incoming traffic.

No microservice is directly accessible from outside. Every request must pass through the gateway first.

```
Client Request
      │
      ▼
┌─────────────────────┐
│     API Gateway     │
│                     │
│  1. Verify JWT      │
│  2. Check Role      │
│  3. Forward Request │
└─────────────────────┘
      │
      ▼
Correct Microservice
```

---

## Responsibilities

- **Authentication** — Verify JWT tokens on every incoming request
- **Authorization** — Enforce role based access control (RBAC)
- **Reverse Proxy** — Forward requests to the correct microservice
- **Security** — Hide internal service endpoints from clients
- **Request Aggregation** — Combine data from multiple services when needed

---

## How It Works

Every request follows this flow:

```
1. Client sends request with JWT token in Authorization header
         │
         ▼
2. Gateway extracts and verifies JWT token
         │
         ├── Invalid token → Return 401 Unauthorized
         │
         └── Valid token → Continue
         │
         ▼
3. Gateway checks user role against required role for route
         │
         ├── Insufficient role → Return 403 Forbidden
         │
         └── Correct role → Continue
         │
         ▼
4. Gateway forwards request to correct microservice
         │
         ▼
5. Microservice processes request and returns response
         │
         ▼
6. Gateway returns response to client
```

---

## Authentication Flow

The gateway uses **JWT (JSON Web Token)** for authentication.

### What is JWT?

JWT is a compact, self-contained token that carries user information (like userId and role) in an encoded format. It has three parts:

```
header.payload.signature

eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJ1c2VyIn0.abc123
```

### How JWT is verified

1. Client sends request with token in header:
```
Authorization: Bearer <jwt_token>
```

2. Gateway extracts the token
3. Verifies the signature using the secret key
4. Extracts userId and role from the payload
5. Attaches user info to the request before forwarding

### Why JWT?

- Stateless — no session storage needed
- Self-contained — user info is inside the token
- Secure — signature prevents tampering

---

## Role Based Access Control

The gateway enforces RBAC to ensure users can only access routes they are authorized for.

### Roles

| Role | Access |
|---|---|
| `user` | Can create bookings, view hotels, confirm bookings |
| `admin` | Full access including hotel management and user management |

### How RBAC works

Each route in the gateway is configured with a required role. When a request comes in:

1. JWT is verified and role is extracted
2. Route's required role is checked
3. If user's role matches or exceeds required role → request is forwarded
4. If not → 403 Forbidden is returned

---

## Reverse Proxy

The gateway acts as a reverse proxy, forwarding requests to the correct microservice based on the route prefix.

### Route Mapping

| Route Prefix | Forwarded To |
|---|---|
| `/api/v1/hotels` | Hotel Service |
| `/api/v1/bookings` | Booking Service |
| `/api/v1/notifications` | Notification Service |
| `/api/v1/reviews` | Review Service |

### Why Reverse Proxy?

- Internal service URLs are never exposed to clients
- Services can be moved or scaled without changing client code
- Single point of entry simplifies client integration

---

## Why Golang?

Golang was chosen for the API Gateway for these reasons:

| Reason | Explanation |
|---|---|
| Performance | Compiled language, extremely fast request handling |
| Concurrency | Built-in goroutines handle thousands of concurrent requests efficiently |
| Low memory | Much lighter than Node.js for a routing layer |
| Strong typing | Catches errors at compile time |
| Standard library | Built-in HTTP server and reverse proxy support |

A gateway handles every single request in the system, so performance is critical. Golang is ideal for this role.

---

## Environment Variables

Create a `.env` file in the root of this service:

```env
PORT=8080
JWT_SECRET=your_jwt_secret_key

# Microservice URLs
HOTEL_SERVICE_URL=http://localhost:3001
BOOKING_SERVICE_URL=http://localhost:3002
NOTIFICATION_SERVICE_URL=http://localhost:3003
REVIEW_SERVICE_URL=http://localhost:3004
```

---

## Getting Started

### Prerequisites

- Golang 1.21+

### Install dependencies

```bash
go mod tidy
```

### Run the gateway

```bash
go run main.go
```

### Build for production

```bash
go build -o api-gateway main.go
./api-gateway
```

---

## Folder Structure

```
api-gateway/
├── main.go               ← Entry point
├── middleware/
│   ├── auth.go           ← JWT verification middleware
│   └── rbac.go           ← Role based access control
├── proxy/
│   └── proxy.go          ← Reverse proxy logic
├── config/
│   └── config.go         ← Environment config
└── go.mod
```

---

## Error Responses

| Status Code | Reason |
|---|---|
| 401 Unauthorized | Missing or invalid JWT token |
| 403 Forbidden | Valid token but insufficient role |
| 502 Bad Gateway | Microservice is unreachable |
| 500 Internal Server Error | Unexpected gateway error |
