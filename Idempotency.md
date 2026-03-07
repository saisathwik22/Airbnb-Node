# Idempotency in Booking Systems

### Overview:
- Exploring problem of duplicate bookings in transactional systems like hotel/flight reservations
- Introducing Idempotency as reliable backend pattern to avoid inconsistencies

---

### Problem Statement : Double Bookings

#### What is Double Booking ?
- When a user accidently or intentionally sends same booking request multiple times, the backend might create multiple bookings and charge the user multiple times.

#### Example :
- User clicks a `Book Now` button:
  - First click : Booking 1 created
  - Second click (by mistake or due to lag) : Booking 2 created
- This can cause
  - Frustration due to duplicate charges
  - Poor user experience
  - Revenue loss due to refunds

---
 
### Naive Solution : Disable Button on Frontend

#### Idea:
- Use HTML or JavaScript to disable button after first click
  `<button disabled>Book Now</button>`
- Or using JavaScript:
  ```
  button.addEventListener('click', () => {
    button.disabled = true;
    makeBooking();
  });
  ```

#### Why this is not enough ?
1. User can re-enable the button from browser developer tools.
2. Browser might have JS turned off.
3. Someone might hit your API using Postman, curl etc (3rd party clients)

`Conclusion`: Frontend controls can be bypassed. Always validate on server side.

---

## Optimal Solution : Backend-Driven Idempotency

##### Idempotency:
- An operation is idempotent if it can be applied multiple times without changing result beyond the first time.

##### Examples in HTTP:
- `GET/users/123` : Always returns same user -> Idempotent
- `DELETE/users/123` : Deleted the user once -> Further calls have no effect -> Idempotent
- `POST/bookings` : Typically creates new resources -> not idempotent by default

##### Our Goal:
- Make `POST/bookings` idempotent to prevent multiple charges and bookings for the same user action.


### Implementation Strategy :

#### 1. Generate an Idempotency Key (Client Side)

- Unique identifier for the request is generated.
- Example: UUIDv4 (universally unique identifier)
- It can be generated using libraries:
  ```
  // JavaScript (frontend)
  import { v4 as uuidv4 } from 'uuid';
  const idempotencyKey = uuidv4();
  ```

#### 2. Send it in the API Request

- POST /bookings HTTP/1.1
  ```
  Idempotency-Key: 123e4567-e89b-12d3-a456-426614174000
  Content-Type: application/json

  {
    "userId": 101,
    "roomId": 201,
    "paymentDetails": {...}
  }
  ```

#### 3. Handle it on the server

- Save the key along with response when processing a request for first time.
- If the same key is received again, return stored response instead of processing again.
- Just like Memoization in Dynamic Programming.

#### Pseudo Code (Node.js + Express) :

```
const cache = {}; // can be Redis, DB table, etc.

app.post('/bookings', async (req, res) => {
  const key = req.headers['idempotency-key'];
  if(!key) {
    return res.status(400).send({ error: 'Missing Idempotency Key' });
  }
  if(cache[key]) {
    return res.status(200).send(cache[key]); // return cached response
  }

  const result = await createBooking(req.body); // booking logic
  cache[key] = result; // save response

  res.status(200).send(result);
})
```

- Replace cache with Redis or DB table in production for persistence and scalability.



## Real Life Example : Flipkart Flights via Cleartrip

### Scenario:

- Flipkart allows flight bookings.
- Internally uses Cleartrip's API (their subsidiary).
- When a user clicks `Book`, they are redirected to a URL with a unique itinerary ID.
  `https://www.cleartrip.com/flights/itinerary/abc123xyz`

### What happened behind the scenes ?

- A `temporary booking` (draft) was created.
- You're now on screen to fill traveler and payment info.
- If you refresh or revisit, still same booking session (idempotent behavior)


## Design Considerations

### DB Table for Idempotency (SQL schema example)

```
CREATE TABLE idempotency_keys (
    id VARCHAR(255) PRIMARY KEY,
    user_id INT,
    request_hash TEXT,
    response_body TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

- Use request_hash to ensure content has not changed maliciously.

### TTL Cleanup : Time to Live

- Store `idempotency_keys` with TTL to prevent DB bloat.
- Use Redis or a cron job to clean up old entries.


## FAQs

### 1. Can I use Idempotency for GET APIs?
- Yes, but it's redundant. GET is already idempotent by design.

### 2. Should every POST API be idempotent ?
- Not always. Only those dealing with critical resource creation, money, or booking should.

### 3. What if I get a different payload with same key ?
- Reject the request. Or store a hash of the original request to compare.
