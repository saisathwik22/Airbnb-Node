## Idempotency in Booking Systems

### Overview:
- Exploring problem of duplicate bookings in transactional systems like hotel/flight reservations
- Introducing Idempotency as reliable backend pattern to avoid inconsistencies

--

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
 
#### Naive Solution : Disable Button on Frontend

##### Idea:
- Use HTML or JavaScript to disable button after first click
  `<button disabled>Book Now</button>`
- Or using JavaScript:
  ```
  button.addEventListener('click', () => {
    button.disabled = true;
    makeBooking();
  });
  ```

##### Why this is not enough ?
1. User can re-enable the button from browser developer tools.
2. Browser might have JS turned off.
3. Someone might hit your API using Postman, curl etc (3rd party clients)

`Conclusion`: Frontend controls can be bypassed. Always validate on server side.

---

### Optimal Solution : Backend-Driven Idempotency

##### Idempotency:
- An operation is idempotent if it can be applied multiple times without changing result beyond the first time.

##### Examples in HTTP:
- `GET/users/123` : Always returns same user -> Idempotent
- `DELETE/users/123` : Deleted the user once -> Further calls have no effect -> Idempotent
- `POST/bookings` : Typically creates new resources -> not idempotent by default

##### Our Goal:
- Make `POST/bookings` idempotent to prevent multiple charges and bookings for the same user action.


#### Implementation Strategy :
