# Tool Endpoints - cURL Commands

This document provides comprehensive cURL commands for all tool endpoints in the AF Eleven Connect API.

## Prerequisites

1. **Get Admin Token:**
```bash
curl -X POST "https://api.v1.affinitydesign.ca/admin/get-token" \
  -H "Content-Type: application/json" \
  -d '{
    "adminKey": "YOUR_ADMIN_KEY"
  }'
```

2. **Set Environment Variable:**
```bash
export ADMIN_TOKEN="your_admin_token_here"
```

---

## 1. Client Discovery Tool

**Endpoint:** `POST /tools/discover-client`

### Discover by Twilio Phone (Primary Agent)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704910"
  }'
```

### Discover by Twilio Phone (Additional Agent)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911"
  }'
```

### Discover by Client ID
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "5C3JSOVVFiVmBoh8mv3I"
  }'
```

### Discover by Agent ID
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456"
  }'
```

### Discover by Customer Phone (Fallback)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+19058363456"
  }'
```

### Multi-Parameter Discovery (Best Practice)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "agentId": "agent_456",
    "clientId": "5C3JSOVVFiVmBoh8mv3I"
  }'
```

---

## 2. Get Availability Tool

**Endpoint:** `POST /tools/get-availability`

### Basic Availability Request (Using Twilio Phone)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911"
  }'
```

### Availability with Date Range
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startDate": "2025-07-04",
    "endDate": "2025-07-11",
    "timezone": "America/New_York"
  }'
```

### Availability with Custom Timezone
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startDate": "2025-07-04",
    "endDate": "2025-07-11",
    "timezone": "America/Los_Angeles"
  }'
```

### Availability with Look Busy Enabled
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startDate": "2025-07-04",
    "endDate": "2025-07-11",
    "timezone": "America/New_York",
    "enableLookBusy": true
  }'
```

### Availability Using Client ID (Alternative)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "5C3JSOVVFiVmBoh8mv3I",
    "startDate": "2025-07-04",
    "endDate": "2025-07-11",
    "timezone": "America/New_York"
  }'
```

### Availability Using Agent ID (Alternative)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456",
    "startDate": "2025-07-04",
    "endDate": "2025-07-11",
    "timezone": "America/New_York"
  }'
```

---

## 3. Book Appointment Tool

**Endpoint:** `POST /tools/book-appointment`

### Basic Appointment Booking (Using Twilio Phone)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/book-appointment" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startTime": "2025-07-08T14:00:00.000Z",
    "endTime": "2025-07-08T15:00:00.000Z",
    "phone": "+19058363456"
  }'
```

### Appointment with Custom Title and Location
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/book-appointment" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startTime": "2025-07-08T14:00:00.000Z",
    "endTime": "2025-07-08T15:00:00.000Z",
    "phone": "+19058363456",
    "meeting_title": "Sales Consultation",
    "meeting_location": "Google Meet"
  }'
```

### Appointment with Detailed Information
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/book-appointment" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startTime": "2025-07-08T14:00:00.000Z",
    "endTime": "2025-07-08T15:00:00.000Z",
    "phone": "+19058363456",
    "meeting_title": "Initial Strategy Session",
    "meeting_location": "Zoom Meeting Room"
  }'
```

### Appointment Using Client ID (Alternative)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/book-appointment" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "5C3JSOVVFiVmBoh8mv3I",
    "startTime": "2025-07-08T14:00:00.000Z",
    "endTime": "2025-07-08T15:00:00.000Z",
    "phone": "+19058363456",
    "meeting_title": "Sales Consultation",
    "meeting_location": "Google Meet"
  }'
```

### Appointment Using Agent ID (Alternative)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/book-appointment" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456",
    "startTime": "2025-07-08T14:00:00.000Z",
    "endTime": "2025-07-08T15:00:00.000Z",
    "phone": "+19058363456",
    "meeting_title": "Sales Consultation",
    "meeting_location": "Google Meet"
  }'
```

---

## 4. Get Client Info Tool

**Endpoint:** `POST /tools/get-info`

### Basic Client Info (Using Twilio Phone)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911"
  }'
```

### Client Info with Contact Search
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "phone": "+19058363456"
  }'
```

### Client Info Using Client ID (Alternative)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "5C3JSOVVFiVmBoh8mv3I",
    "phone": "+19058363456"
  }'
```

### Client Info Using Agent ID (Alternative)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456",
    "phone": "+19058363456"
  }'
```

---

## 5. Get Time Utility Tool

**Endpoint:** `GET /tools/get-time`

### Current Date
```bash
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-time" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Date Plus 7 Days
```bash
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-time?day=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Date Plus 1 Week
```bash
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-time?week=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Date Plus 1 Week and 3 Days
```bash
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-time?week=1&day=3" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Date Minus 5 Days (Negative Values)
```bash
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-time?day=-5" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Complete ElevenLabs Workflow Example

### Step 1: Discover Client
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911"
  }'
```

### Step 2: Get Availability
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startDate": "2025-07-04",
    "endDate": "2025-07-11",
    "timezone": "America/New_York"
  }'
```

### Step 3: Book Appointment
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/book-appointment" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "startTime": "2025-07-08T14:00:00.000Z",
    "endTime": "2025-07-08T15:00:00.000Z",
    "phone": "+19058363456",
    "meeting_title": "Sales Consultation",
    "meeting_location": "Google Meet"
  }'
```

### Step 4: Get Client Info
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "phone": "+19058363456"
  }'
```

---

## PowerShell Equivalents (Windows)

### Set Variables
```powershell
$adminToken = "your_admin_token_here"
$headers = @{ "Authorization" = "Bearer $adminToken"; "Content-Type" = "application/json" }
$baseUrl = "https://api.v1.affinitydesign.ca"
```

### Discover Client
```powershell
$body = @{
    twilioPhone = "+18632704911"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/tools/discover-client" -Method Post -Headers $headers -Body $body
```

### Get Availability
```powershell
$body = @{
    twilioPhone = "+18632704911"
    startDate = "2025-07-04"
    endDate = "2025-07-11"
    timezone = "America/New_York"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/tools/get-availability" -Method Post -Headers $headers -Body $body
```

### Book Appointment
```powershell
$body = @{
    twilioPhone = "+18632704911"
    startTime = "2025-07-08T14:00:00.000Z"
    endTime = "2025-07-08T15:00:00.000Z"
    phone = "+19058363456"
    meeting_title = "Sales Consultation"
    meeting_location = "Google Meet"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/tools/book-appointment" -Method Post -Headers $headers -Body $body
```

### Get Client Info
```powershell
$body = @{
    twilioPhone = "+18632704911"
    phone = "+19058363456"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/tools/get-info" -Method Post -Headers $headers -Body $body
```

### Get Time
```powershell
Invoke-RestMethod -Uri "$baseUrl/tools/get-time?day=7&week=1" -Method Get -Headers $headers
```

---

## Response Examples

### Successful Discovery Response
```json
{
  "requestId": "abc123",
  "clientId": "5C3JSOVVFiVmBoh8mv3I",
  "clientName": "Paul Giovanatto",
  "businessName": "Affinity Design",
  "twilioPhoneNumber": "+18632704910",
  "status": "Active",
  "hasGhlIntegration": true,
  "hasCalendar": true,
  "foundBy": "additionalTwilioPhone",
  "matchedAgent": {
    "agentId": "agent_456",
    "twilioPhoneNumber": "+18632704911",
    "agentName": "Sales Agent",
    "agentType": "inbound",
    "isEnabled": true,
    "inboundEnabled": true,
    "outboundEnabled": false,
    "isPrimary": false
  },
  "totalAgents": 3,
  "allAgents": [...]
}
```

### Successful Availability Response
```json
{
  "requestId": "def456",
  "clientId": "5C3JSOVVFiVmBoh8mv3I",
  "clientName": "Paul Giovanatto",
  "businessName": "Affinity Design",
  "foundBy": "additionalTwilioPhone",
  "matchedAgent": {...},
  "dateRange": {
    "start": "2025-07-04T00:00:00.000Z",
    "end": "2025-07-11T00:00:00.000Z"
  },
  "timezone": "America/New_York",
  "availability": {...},
  "slots": [...]
}
```

### Successful Booking Response
```json
{
  "requestId": "ghi789",
  "clientId": "5C3JSOVVFiVmBoh8mv3I",
  "clientName": "Paul Giovanatto",
  "businessName": "Affinity Design",
  "foundBy": "additionalTwilioPhone",
  "matchedAgent": {...},
  "status": "success",
  "message": "Appointment booked successfully",
  "appointmentId": "appt_123456",
  "details": {
    "calendarId": "cal_789",
    "locationId": "5C3JSOVVFiVmBoh8mv3I",
    "contactId": "contact_456",
    "startTime": "2025-07-08T14:00:00.000Z",
    "endTime": "2025-07-08T15:00:00.000Z",
    "title": "john x Affinity Design - Sales Consultation",
    "status": "confirmed",
    "address": "Google Meet",
    "isRecurring": false
  },
  "contact": {
    "id": "contact_456",
    "name": "john",
    "phone": "+19058363456"
  }
}
```

### Error Response
```json
{
  "error": "Client not found",
  "requestId": "abc123",
  "searchedFor": {
    "twilioPhone": "+18632704999"
  },
  "note": "Provide twilioPhone, clientId, or agentId to find the client"
}
```

---

## Notes

1. **Replace placeholders**: Update `YOUR_ADMIN_KEY`, `your_admin_token_here`, and phone numbers with actual values
2. **Phone number format**: Use E.164 format (+1234567890)
3. **Date format**: Use ISO 8601 format for dates and times
4. **Timezone**: Use IANA timezone identifiers (e.g., "America/New_York")
5. **Testing**: Always test in a development environment first
6. **Rate limiting**: Be mindful of API rate limits when making multiple requests

## Authentication

All endpoints require admin authentication using the Bearer token in the Authorization header. The token is obtained from the `/admin/get-token` endpoint using your admin key.
