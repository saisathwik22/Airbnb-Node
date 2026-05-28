# 📧 Notification Service

The Notification Service handles all email notifications in the Distributed Hotel Booking System. It is completely independent — no direct HTTP calls from other services. Communication happens only through a shared Redis queue, making this service fully decoupled.

---

## 📌 Table of Contents

- [Overview](#overview)
- [Responsibilities](#responsibilities)
- [How It Works](#how-it-works)
- [Queue Architecture](#queue-architecture)
- [Singleton Redis Connection](#singleton-redis-connection)
- [Email Templates](#email-templates)
- [Notification DTO](#notification-dto)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)

---

## Overview

In the booking system, after a booking is created or confirmed, the user needs to receive an email. However, sending an email should not slow down the booking flow. The Notification Service solves this by processing emails **asynchronously** through a Redis queue.

```
Booking Service                    Notification Service
      │                                    │
      │  Push job to Redis queue           │
      │ ─────────────────────────────────► │
      │                                    │
      │ (booking flow continues)           │ Worker picks up job
      │                                    │ Sends email via Nodemailer
      │                                    │
      │                                    ▼
      │                              User receives email
```

The Booking Service does not wait for the email to be sent. It pushes the job and moves on immediately.

---

## Responsibilities

- Listen to Redis queue for incoming notification jobs
- Process email jobs using background workers
- Load appropriate Handlebars email templates
- Send transactional emails via Nodemailer
- Handle job failures with event listeners

---

## How It Works

### Step by step flow

```
1. Booking Service pushes a job to Redis queue "mailer-queue"
   with payload: { to, subject, templateId, params }
         │
         ▼
2. BullMQ Worker in Notification Service
   is always listening on "mailer-queue"
         │
         ▼
3. Worker picks up the job automatically
         │
         ▼
4. Worker validates job name matches EMAIL_PRODUCER
         │
         ▼
5. Load Handlebars template matching templateId
         │
         ▼
6. Compile template with params
         │
         ▼
7. Send email via Nodemailer to payload.to
         │
         ▼
8. Job marked as completed in Redis
```

---

## Queue Architecture

Three key components work together:

### 1. Queue

Defines the queue that both producer and worker connect to. Must use the **same queue name** on both sides.

```ts
export const MAILER_QUEUE = "mailer-queue";

export const mailerQueue = new Queue(MAILER_QUEUE, {
    connection: getRedisConnObject()
});
```

### 2. Producer (in Booking Service)

Adds jobs to the queue with a payload.

```ts
export const EMAIL_PRODUCER = "email-producer";

export const addEmailToQueue = async (payload: NotificationDTO) => {
    await mailerQueue.add(EMAIL_PRODUCER, payload);
};
```

### 3. Worker (in Notification Service)

Listens to the queue and processes jobs as they arrive.

```ts
export const setupEmailWorker = () => {
    const emailProcessor = new Worker<NotificationDTO>(
        MAILER_QUEUE,
        async (job: Job) => {
            if (job.name !== EMAIL_PRODUCER) {
                throw new Error(`Invalid job name: ${job.name}`);
            }
            // process email here
        },
        { connection: getRedisConnObject() }
    );

    emailProcessor.on("failed", () => {
        console.error("Email processing failed");
    });

    emailProcessor.on("completed", (job) => {
        console.log("Email processing completed:", job.name);
    });
};
```

### Why this works

Both services connect to the **same Redis instance** and use the **same queue name**. Redis acts as the bridge between them. They never communicate directly.

---

## Singleton Redis Connection

### The problem with creating new connections

If a new Redis connection is created on every function call:

```ts
// BAD — creates new connection every call
export function connectToRedis() {
    return new Redis({ host, port });
}
```

This causes:
- Multiple TCP connections between Node.js and Redis
- Memory buffer exhaustion
- Redis connection limit being hit
- Race conditions in pub/sub scenarios

### The singleton solution using closures

```ts
export function connectToRedis() {
    let connection: Redis;
    const redisConfig = { host, port, maxRetriesPerRequest: null };

    return () => {
        if (!connection) {
            connection = new Redis(redisConfig);
        }
        return connection;
    };
}

export const getRedisConnObject = connectToRedis();
```

Now `getRedisConnObject()` always returns the **same Redis instance** no matter how many times it is called. The connection is created once and reused throughout the service lifecycle.

---

## Email Templates

Templates are written in **Handlebars** (`.hbs` files) and stored in the `templates/mailer/` folder.

### Why Handlebars?

- Separates email structure from business logic
- Dynamic content via template variables (`{{name}}`, `{{bookingId}}`)
- New email types can be added by creating a new `.hbs` file without touching core logic

### Example template

```hbs
<!DOCTYPE html>
<html>
<body>
    <h1>Booking Confirmed!</h1>
    <p>Hello {{name}},</p>
    <p>Your booking (ID: {{bookingId}}) has been confirmed.</p>
    <p>Check-in: {{checkInDate}}</p>
    <p>Check-out: {{checkOutDate}}</p>
</body>
</html>
```

### Template loading

```ts
// template.handler.ts
export async function loadTemplate(templateId: string, params: Record<string, any>) {
    const templatePath = path.join(__dirname, `../templates/mailer/${templateId}.hbs`);
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);
    return template(params);
}
```

---

## Notification DTO

The shape of every notification job pushed to the queue:

```ts
export interface NotificationDTO {
    to: string;                    // Recipient email address
    subject: string;               // Email subject line
    templateId: string;            // Which template to use
    params: Record<string, any>;   // Dynamic values for the template
}
```

### Example payload

```json
{
    "to": "user@example.com",
    "subject": "Booking Confirmed",
    "templateId": "booking-confirmation",
    "params": {
        "name": "Sai Sathwik",
        "bookingId": 101,
        "checkInDate": "2025-12-25",
        "checkOutDate": "2025-12-28"
    }
}
```

---

## Environment Variables

```env
PORT=3003
REDIS_HOST=localhost
REDIS_PORT=6379
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_email@gmail.com
MAIL_PASSWORD=your_app_password
MAIL_FROM=noreply@hotelapp.com
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- Redis

### Install dependencies

```bash
npm install
```

### Start the service

```bash
npm run dev
```

The worker starts automatically and begins listening to the Redis queue.

---

## Folder Structure

```
notification-service/
├── src/
│   ├── config/
│   │   ├── redis.config.ts       ← Singleton Redis connection
│   │   └── mailer.config.ts      ← Nodemailer transporter setup
│   ├── queues/
│   │   └── mailer.queue.ts       ← BullMQ queue definition
│   ├── producers/
│   │   └── email.producer.ts     ← Adds jobs to queue
│   ├── processors/
│   │   └── email.processor.ts    ← Worker that processes jobs
│   ├── services/
│   │   └── mailer.service.ts     ← Sends email via Nodemailer
│   ├── templates/
│   │   └── mailer/
│   │       ├── booking-confirmation.hbs
│   │       └── booking-expired.hbs
│   ├── template.handler.ts       ← Loads and compiles templates
│   └── dto/
│       └── notification.dto.ts   ← NotificationDTO interface
└── server.ts
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Job processing fails | `failed` event fires, error is logged |
| Redis goes down | Worker stops receiving jobs, jobs may be lost if persistence not enabled |
| Invalid job name | Worker throws error, job moves to failed queue |
| Template not found | Error thrown, job marked as failed |

### Recommendation

Configure Redis persistence (AOF or RDB) so jobs are not lost if Redis restarts. Also configure retry attempts on the queue:

```ts
await mailerQueue.add(EMAIL_PRODUCER, payload, {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000
    }
});
```

This retries failed jobs up to 3 times with exponential backoff.
