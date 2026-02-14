# 📅 Booking Management API Documentation

**Base URL:** `http://localhost:8000`

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Booking Model Schema](#booking-model-schema)
4. [API Endpoints](#api-endpoints)
   - [Public Endpoints](#public-endpoints)
   - [Protected Endpoints](#protected-endpoints)
5. [Permissions](#permissions)
6. [Error Responses](#error-responses)
7. [Examples](#examples)

---

## 🔍 Overview

This API provides comprehensive booking management functionality for both online bookings (from patients) and clinic walk-in bookings (managed by staff). All bookings are sorted by appointment date in ascending order.

### Key Features:
- ✅ Public online booking creation
- ✅ Clinic booking management with payment tracking
- ✅ Unified view of all bookings (online confirmed + clinic)
- ✅ Advanced filtering (type, status, date)
- ✅ Booking updates and cancellation
- ✅ Role-based access control

---

## 🔐 Authentication

Most endpoints require authentication using JWT Bearer tokens. Include the token in the request header:

```
Authorization: Bearer <your_token_here>
```

To obtain a token, use the login endpoint:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your_password"
}
```

---

## 📊 Booking Model Schema

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | INTEGER | Primary key, auto-increment | Auto |
| `customerName` | STRING | Customer's full name | Yes |
| `customerPhone` | STRING | Customer's phone number | Yes |
| `appointmentDate` | DATE | Appointment date and time (ISO 8601) | Yes |
| `bookingType` | ENUM | Type: `online` or `clinic` | Auto |
| `amountPaid` | DECIMAL(10,2) | Amount paid (for clinic bookings) | No |
| `visitType` | ENUM | Visit type: `checkup` (كشف) or `followup` (إعادة) | Auto (default: `checkup`) |
| `status` | ENUM | Status: `pending`, `confirmed`, `cancelled`, `rejected` | Auto |
| `createdAt` | DATE | Timestamp when booking was created | Auto |
| `updatedAt` | DATE | Timestamp when booking was last updated | Auto |

---

## 🌐 API Endpoints

### Public Endpoints

#### 1. Create Online Booking

Allows patients to request an appointment online.

- **Endpoint:** `POST /api/bookings/online`
- **Authentication:** Not required
- **Request Body:**
  ```json
  {
    "name": "John Doe",
    "phone": "01012345678",
    "date": "2026-02-01T14:30:00.000Z"
  }
  ```

- **Success Response (201 Created):**
  ```json
  {
    "message": "Booking request submitted successfully.",
    "booking": {
      "id": 1,
      "customerName": "John Doe",
      "customerPhone": "01012345678",
      "appointmentDate": "2026-02-01T14:30:00.000Z",
      "bookingType": "online",
      "amountPaid": "0.00",
      "status": "pending",
      "createdAt": "2026-01-31T10:00:00.000Z",
      "updatedAt": "2026-01-31T10:00:00.000Z"
    }
  }
  ```

- **Error Response (400 Bad Request):**
  ```json
  {
    "message": "Please provide name, phone, and appointment date."
  }
  ```

- **Error Response (400 Bad Request):**
  ```json
  {
    "message": "Appointment date must be in the future."
  }
  ```

---

### Protected Endpoints

#### 2. Create Clinic Booking

Create a walk-in clinic booking with payment tracking.

- **Endpoint:** `POST /api/bookings/clinic`
- **Authentication:** Required
- **Permission:** `manage_daily_bookings`
- **Request Headers:**
  ```
  Authorization: Bearer <token>
  Content-Type: application/json
  ```

- **Request Body:**
  ```json
  {
    "name": "Ahmed Ali",
    "phone": "01098765432",
    "date": "2026-02-01T10:00:00.000Z",
    "amountPaid": 350.50,
    "visitType": "checkup"
  }
  ```

- **Success Response (201 Created):**
  ```json
  {
    "message": "Clinic booking created successfully.",
    "booking": {
      "id": 2,
      "customerName": "Ahmed Ali",
      "customerPhone": "01098765432",
      "appointmentDate": "2026-02-01T10:00:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "350.50",
      "visitType": "checkup",
      "status": "confirmed",
      "createdAt": "2026-01-31T10:05:00.000Z",
      "updatedAt": "2026-01-31T10:05:00.000Z"
    }
  }
  ```

- **Notes:**
  - Clinic bookings are automatically confirmed (status = 'confirmed')
  - `amountPaid` is optional, defaults to 0 if not provided
  - `visitType` is optional, defaults to 'checkup' (كشف) if not provided
  - Valid `visitType` values: `checkup` (كشف), `followup` (إعادة)

---

#### 3. Get All Bookings (Unified View)

Retrieve all bookings (confirmed online bookings + all clinic bookings) sorted by appointment date.

- **Endpoint:** `GET /api/bookings/all`
- **Authentication:** Required
- **Permission:** `manage_online_bookings` OR `manage_daily_bookings`
- **Request Headers:**
  ```
  Authorization: Bearer <token>
  ```

- **Query Parameters (All Optional):**

  | Parameter | Type | Description | Example |
  |-----------|------|-------------|---------|
  | `type` | string | Filter by booking type | `online` or `clinic` |
  | `status` | string | Filter by status | `pending`, `confirmed`, `cancelled`, `rejected` |
  | `visitType` | string | Filter by visit type | `checkup` (كشف) or `followup` (إعادة) |
  | `date` | string | Filter by specific date | `2026-02-01` (YYYY-MM-DD) |

- **Examples:**
  ```
  GET /api/bookings/all
  GET /api/bookings/all?type=clinic
  GET /api/bookings/all?type=online&status=confirmed
  GET /api/bookings/all?date=2026-02-01
  GET /api/bookings/all?type=clinic&date=2026-02-01
  GET /api/bookings/all?visitType=checkup
  GET /api/bookings/all?visitType=followup&date=2026-02-01
  ```

- **Success Response (200 OK):**
  ```json
  [
    {
      "id": 2,
      "customerName": "Ahmed Ali",
      "customerPhone": "01098765432",
      "appointmentDate": "2026-02-01T10:00:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "350.50",
      "status": "confirmed",
      "createdAt": "2026-01-31T10:05:00.000Z",
      "updatedAt": "2026-01-31T10:05:00.000Z"
    },
    {
      "id": 1,
      "customerName": "John Doe",
      "customerPhone": "01012345678",
      "appointmentDate": "2026-02-01T14:30:00.000Z",
      "bookingType": "online",
      "amountPaid": "0.00",
      "status": "confirmed",
      "createdAt": "2026-01-31T10:00:00.000Z",
      "updatedAt": "2026-01-31T10:10:00.000Z"
    }
  ]
  ```

- **Important Notes:**
  - Without filters, returns confirmed online bookings + all clinic bookings
  - Results are always sorted by `appointmentDate` in ascending order
  - Empty array `[]` if no bookings match the criteria

---

#### 4. Get Online Bookings

Retrieve all online bookings with optional filters.

- **Endpoint:** `GET /api/bookings/online`
- **Authentication:** Required
- **Permission:** `manage_online_bookings`
- **Request Headers:**
  ```
  Authorization: Bearer <token>
  ```

- **Query Parameters (All Optional):**

  | Parameter | Type | Description | Example |
  |-----------|------|-------------|---------|
  | `status` | string | Filter by status | `pending`, `confirmed`, `cancelled`, `rejected` |
  | `date` | string | Filter by specific date | `2026-02-01` (YYYY-MM-DD) |

- **Examples:**
  ```
  GET /api/bookings/online
  GET /api/bookings/online?status=pending
  GET /api/bookings/online?date=2026-02-01
  GET /api/bookings/online?status=pending&date=2026-02-01
  ```

- **Success Response (200 OK):**
  ```json
  [
    {
      "id": 1,
      "customerName": "John Doe",
      "customerPhone": "01012345678",
      "appointmentDate": "2026-02-01T14:30:00.000Z",
      "bookingType": "online",
      "amountPaid": "0.00",
      "status": "pending",
      "createdAt": "2026-01-31T10:00:00.000Z",
      "updatedAt": "2026-01-31T10:00:00.000Z"
    }
  ]
  ```

---

#### 5. Update Booking Status

Confirm, cancel, or reject an online booking.

- **Endpoint:** `PATCH /api/bookings/online/:id/status`
- **Authentication:** Required
- **Permission:** `manage_online_bookings`
- **Request Headers:**
  ```
  Authorization: Bearer <token>
  Content-Type: application/json
  ```

- **URL Parameters:**
  - `id` (required): Booking ID

- **Request Body:**
  ```json
  {
    "status": "confirmed"
  }
  ```
  
  **Valid Status Values:**
  - `confirmed`
  - `cancelled`
  - `rejected`
  - `pending`

- **Success Response (200 OK):**
  ```json
  {
    "message": "Booking confirmed successfully.",
    "booking": {
      "id": 1,
      "customerName": "John Doe",
      "customerPhone": "01012345678",
      "appointmentDate": "2026-02-01T14:30:00.000Z",
      "bookingType": "online",
      "amountPaid": "0.00",
      "status": "confirmed",
      "createdAt": "2026-01-31T10:00:00.000Z",
      "updatedAt": "2026-01-31T10:15:00.000Z"
    }
  }
  ```

- **Error Response (400 Bad Request):**
  ```json
  {
    "message": "Invalid status. Use confirmed, cancelled, rejected, or pending."
  }
  ```

- **Error Response (404 Not Found):**
  ```json
  {
    "message": "Booking not found."
  }
  ```

---

#### 6. Update Booking Details

Update booking information (name, phone, date, amount paid).

- **Endpoint:** `PUT /api/bookings/:id`
- **Authentication:** Required
- **Permission:** `manage_daily_bookings`
- **Request Headers:**
  ```
  Authorization: Bearer <token>
  Content-Type: application/json
  ```

- **URL Parameters:**
  - `id` (required): Booking ID

- **Request Body (All Fields Optional):**
  ```json
  {
    "name": "Ahmed Ali Updated",
    "phone": "01098765432",
    "date": "2026-02-02T10:00:00.000Z",
    "amountPaid": 400.00,
    "visitType": "followup"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
    "message": "Booking updated successfully.",
    "booking": {
      "id": 2,
      "customerName": "Ahmed Ali Updated",
      "customerPhone": "01098765432",
      "appointmentDate": "2026-02-02T10:00:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "400.00",
      "visitType": "followup",
      "status": "confirmed",
      "createdAt": "2026-01-31T10:05:00.000Z",
      "updatedAt": "2026-01-31T10:20:00.000Z"
    }
  }
  ```

- **Error Response (404 Not Found):**
  ```json
  {
    "message": "Booking not found."
  }
  ```

- **Notes:**
  - Only provided fields will be updated
  - Works for both online and clinic bookings
  - Valid `visitType` values: `checkup` (كشف), `followup` (إعادة)

---

#### 7. Cancel Booking

Cancel a booking (sets status to 'cancelled').

- **Endpoint:** `DELETE /api/bookings/:id`
- **Authentication:** Required
- **Permission:** `manage_daily_bookings`
- **Request Headers:**
  ```
  Authorization: Bearer <token>
  ```

- **URL Parameters:**
  - `id` (required): Booking ID

- **Success Response (200 OK):**
  ```json
  {
    "message": "Booking cancelled successfully.",
    "booking": {
      "id": 2,
      "customerName": "Ahmed Ali",
      "customerPhone": "01098765432",
      "appointmentDate": "2026-02-01T10:00:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "350.50",
      "status": "cancelled",
      "createdAt": "2026-01-31T10:05:00.000Z",
      "updatedAt": "2026-01-31T10:25:00.000Z"
    }
  }
  ```

- **Error Response (404 Not Found):**
  ```json
  {
    "message": "Booking not found."
  }
  ```

- **Notes:**
  - This doesn't delete the booking, just changes status to 'cancelled'
  - Works for both online and clinic bookings

---

#### 8. Get Booking Details with Patient History

Retrieve detailed information about a specific booking along with the patient's complete visit history.

- **Endpoint:** `GET /api/bookings/:id/history`
- **Authentication:** Required
- **Permission:** `manage_daily_bookings`
- **Request Headers:**
  ```
  Authorization: Bearer <token>
  ```

- **URL Parameters:**
  - `id` (required): Booking ID

- **Success Response (200 OK):**
  ```json
  {
    "currentBooking": {
      "id": 5,
      "customerName": "أحمد محمد",
      "customerPhone": "01012345678",
      "appointmentDate": "2026-02-05T10:00:00.000Z",
      "bookingType": "clinic",
      "amountPaid": "300.00",
      "visitType": "followup",
      "status": "confirmed",
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-01T10:00:00.000Z"
    },
    "patientHistory": {
      "totalPastVisits": 3,
      "totalAmountPaid": "850.00",
      "lastVisit": {
        "date": "2026-01-15T10:00:00.000Z",
        "visitType": "checkup",
        "amountPaid": "300.00",
        "status": "confirmed"
      },
      "pastBookings": [
        {
          "id": 3,
          "customerName": "أحمد محمد",
          "customerPhone": "01012345678",
          "appointmentDate": "2026-01-15T10:00:00.000Z",
          "bookingType": "clinic",
          "amountPaid": "300.00",
          "visitType": "checkup",
          "status": "confirmed",
          "createdAt": "2026-01-10T10:00:00.000Z",
          "updatedAt": "2026-01-10T10:00:00.000Z"
        },
        {
          "id": 2,
          "customerName": "أحمد محمد",
          "customerPhone": "01012345678",
          "appointmentDate": "2025-12-20T10:00:00.000Z",
          "bookingType": "clinic",
          "amountPaid": "350.00",
          "visitType": "checkup",
          "status": "confirmed",
          "createdAt": "2025-12-15T10:00:00.000Z",
          "updatedAt": "2025-12-15T10:00:00.000Z"
        },
        {
          "id": 1,
          "customerName": "أحمد محمد",
          "customerPhone": "01012345678",
          "appointmentDate": "2025-11-10T10:00:00.000Z",
          "bookingType": "online",
          "amountPaid": "200.00",
          "visitType": "checkup",
          "status": "confirmed",
          "createdAt": "2025-11-05T10:00:00.000Z",
          "updatedAt": "2025-11-05T10:00:00.000Z"
        }
      ]
    }
  }
  ```

- **Error Response (404 Not Found):**
  ```json
  {
    "message": "Booking not found."
  }
  ```

- **Notes:**
  - Returns the current booking details
  - Includes all past bookings for the same phone number
  - Past bookings are sorted by date (most recent first)
  - Provides statistics: total visits and total amount paid
  - Only includes bookings that occurred before the current date
  - Useful for viewing patient history during appointments

---

## 🔐 Permissions

| Permission | Description | Grants Access To |
|------------|-------------|------------------|
| `manage_online_bookings` | Manage online bookings | - Get online bookings<br>- Update booking status<br>- View all bookings (unified) |
| `manage_daily_bookings` | Manage clinic bookings | - Create clinic bookings<br>- Update booking details<br>- Cancel bookings<br>- View all bookings (unified)<br>- Get booking with patient history |

**Note:** Admin users typically have all permissions.

---

## ⚠️ Error Responses

### Common HTTP Status Codes

| Status Code | Description |
|-------------|-------------|
| `200 OK` | Request successful |
| `201 Created` | Resource created successfully |
| `400 Bad Request` | Invalid request data |
| `401 Unauthorized` | Missing or invalid authentication token |
| `403 Forbidden` | Insufficient permissions |
| `404 Not Found` | Resource not found |
| `500 Internal Server Error` | Server error |

### Error Response Format

```json
{
  "message": "Error description here"
}
```

---

## 📚 Examples

### Example 1: Complete Booking Flow

```bash
# 1. Patient creates online booking (no auth required)
POST /api/bookings/online
{
  "name": "Sara Ahmed",
  "phone": "01012345678",
  "date": "2026-02-05T14:00:00.000Z"
}

# 2. Staff logs in
POST /api/auth/login
{
  "email": "staff@example.com",
  "password": "password123"
}

# 3. Staff confirms the booking
PATCH /api/bookings/online/1/status
Authorization: Bearer <token>
{
  "status": "confirmed"
}

# 4. Staff views all bookings
GET /api/bookings/all
Authorization: Bearer <token>
```

### Example 2: Clinic Walk-in Booking

```bash
# 1. Staff creates clinic booking
POST /api/bookings/clinic
Authorization: Bearer <token>
{
  "name": "Mohamed Hassan",
  "phone": "01098765432",
  "date": "2026-02-05T10:00:00.000Z",
  "amountPaid": 500.00
}

# 2. Later, staff updates the amount
PUT /api/bookings/2
Authorization: Bearer <token>
{
  "amountPaid": 550.00
}
```

### Example 3: Filtering Bookings

```bash
# Get all clinic bookings
GET /api/bookings/all?type=clinic
Authorization: Bearer <token>

# Get confirmed online bookings
GET /api/bookings/all?type=online&status=confirmed
Authorization: Bearer <token>

# Get all bookings for a specific date
GET /api/bookings/all?date=2026-02-05
Authorization: Bearer <token>

# Get pending online bookings for a specific date
GET /api/bookings/online?status=pending&date=2026-02-05
Authorization: Bearer <token>
```

---

## 📝 Best Practices

1. **Date Format:** Always use ISO 8601 format for dates: `YYYY-MM-DDTHH:mm:ss.sssZ`
2. **Phone Validation:** Ensure phone numbers are valid before submission
3. **Token Management:** Store tokens securely and refresh when expired
4. **Error Handling:** Always handle error responses appropriately
5. **Filtering:** Use query parameters to reduce data transfer and improve performance
6. **Pagination:** For large datasets, consider implementing pagination (future enhancement)

---

## 🔄 Workflow Diagrams

### Online Booking Workflow
```
Patient → POST /bookings/online (pending)
       ↓
Staff → PATCH /bookings/online/:id/status (confirmed/rejected)
       ↓
Staff → GET /bookings/all (view all confirmed)
```

### Clinic Booking Workflow
```
Staff → POST /bookings/clinic (confirmed)
      ↓
Staff → PUT /bookings/:id (update if needed)
      ↓
Staff → GET /bookings/all (view all bookings)
```

---

## 📞 Support

For issues or questions, please contact the development team or refer to the main API documentation.

**Last Updated:** 2026-01-31
**API Version:** 1.0.0
