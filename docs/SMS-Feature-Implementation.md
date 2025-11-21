# SMS Feature Implementation

## Overview

This document describes the SMS functionality implemented in AF Eleven Connect, which enables automated appointment confirmations and manual SMS sending through the Twilio integration.

## Implementation Date

November 21, 2025

## Problem Statement

The system needed:

1. A way for clients to manually send SMS messages through their authenticated portal
2. Automatic SMS confirmations when appointments are successfully booked via Go High Level integration
3. Personalized messages using dynamic customer data
4. Non-blocking error handling so SMS failures don't break critical booking operations

## Solution Architecture

### Components Added

#### 1. SMS Utility Module (`utils/sms.js`)

**Purpose**: Centralized SMS functionality using Twilio API

**Functions**:

- **`sendSMS(to, from, body)`**

  - Core SMS sending function
  - Parameters:
    - `to`: Recipient phone (E.164 format)
    - `from`: Sender Twilio number
    - `body`: Message text (max 1600 chars)
  - Returns: Message details with SID and status
  - Handles: Validation, character limits, logging

- **`sendAppointmentConfirmationSMS(clientId, phone, appointmentDetails)`**
  - Specialized function for booking confirmations
  - Parameters:
    - `clientId`: Client ID to fetch business info
    - `phone`: Customer phone number
    - `appointmentDetails`: Object with `contactName`, `startTime`, `endTime`, `title`, `address`
  - Automatically formats message with:
    - Contact's first name (personalized greeting)
    - Business name from `clientMeta.businessName`
    - Formatted date/time
    - Meeting location
  - Returns: SMS send result

**Key Design Decisions**:

- Uses existing Twilio credentials from environment variables
- Fetches client data from MongoDB to get `twilioPhoneNumber` and business name
- Graceful fallbacks for missing data (e.g., "Hi there!" if no contact name)
- Comprehensive logging with `[SMS]` prefix

#### 2. Client SMS Endpoint (`routes/client.js`)

**Endpoint**: `POST /secure/send-sms`

**Authentication**: Client JWT token required (via `authenticateClient` middleware)

**Purpose**: Allow authenticated clients to send custom SMS messages

**Flow**:

1. Validate JWT token → extract `clientId`
2. Validate request body (`to` and `body` required)
3. Fetch client from database
4. Verify client status is "Active"
5. Get client's `twilioPhoneNumber`
6. Send SMS via Twilio
7. Return success/error response

**Security Features**:

- Clients can only send from their own Twilio number
- Must be authenticated
- Must have active status
- Request ID tracking for audit trail

**Response Example**:

```json
{
  "success": true,
  "message": "SMS sent successfully",
  "requestId": "l8k9j7h6g5",
  "messageSid": "SM1234567890abcdef",
  "status": "queued",
  "to": "+19058363456",
  "from": "+18632704910",
  "dateCreated": "2025-11-21T15:30:00.000Z"
}
```

#### 3. Admin SMS Endpoint (`routes/admin.js`)

**Endpoint**: `POST /admin/clients/:clientId/send-sms`

**Authentication**: Admin JWT token required

**Purpose**: Allow admin to send SMS on behalf of any client (matches `/make-call` pattern)

**Flow**:
1. Validate JWT token → extract `adminId`
2. Extract `clientId` from path parameter
3. Validate request body (`to` and `body` required)
4. Fetch client from database
5. Verify client status is "Active"
6. Get client's `twilioPhoneNumber`
7. Send SMS via Twilio
8. Return success/error response with client details

**cURL Example**:
```bash
curl -X POST https://api.v1.affinitydesign.ca/admin/clients/CLIENT_ID/send-sms \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+19058363456", "body": "Your message"}'
```

#### 4. Automatic Booking Confirmations (`routes/tools.js`)

**Integration Point**: `POST /tools/book-appointment` endpoint

**Trigger**: After successful GHL appointment booking

**Flow**:

1. Appointment successfully created in Go High Level
2. Metrics updated for the agent
3. **SMS confirmation sent** (new step)
   - Extracts contact's first name from booking data
   - Calls `sendAppointmentConfirmationSMS()`
   - Wrapped in try/catch - failures logged but don't break booking
4. Success response returned

**Message Format**:

```
Hi [ContactName]! Your appointment with [BusinessName] has been confirmed.

📅 [Weekday, Month Day, Year]
🕒 [Time]
📍 [Location]

We look forward to seeing you!
```

**Example**:

```
Hi John! Your appointment with Affinity Design has been confirmed.

📅 Monday, November 25, 2025
🕒 10:00 AM
📍 Google Meet

We look forward to seeing you!
```

**Error Handling**:

- SMS errors are logged with request ID
- Booking operation continues even if SMS fails
- Error message: `[${requestId}] Failed to send appointment confirmation SMS:`
- Non-blocking design ensures customer gets appointment even if text fails

## Technical Details

### Environment Variables Required

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

### Database Schema Dependencies

**Client Model** (`client.js`) must have:

- `twilioPhoneNumber`: Twilio number for sending SMS
- `clientMeta.businessName`: Used in confirmation messages
- `status`: Must be "Active" for sending

### Phone Number Format

All phone numbers must be in **E.164 format**:

- Format: `+[country code][number]`
- Example: `+19058363456`
- No spaces, dashes, or parentheses

### Character Limits

- Standard SMS: 160 characters
- Twilio limit: 1600 characters (may split into multiple messages)
- Current confirmation message: ~150-200 characters

## Data Flow Diagrams

### Manual SMS Flow

```
Client App
    ↓ [POST /secure/send-sms with JWT]
Client Routes (routes/client.js)
    ↓ [authenticateClient middleware]
    ↓ [validate to, body]
    ↓ [fetch client from MongoDB]
SMS Utility (utils/sms.js)
    ↓ [sendSMS(to, from, body)]
Twilio API
    ↓ [SMS delivery]
Customer Phone
```

### Automatic Confirmation Flow

```
ElevenLabs Agent
    ↓ [POST /tools/book-appointment]
Tool Routes (routes/tools.js)
    ↓ [authenticate admin]
    ↓ [discover client]
    ↓ [refresh GHL token]
    ↓ [search/create contact]
    ↓ [book appointment in GHL]
    ↓ [update metrics]
SMS Utility (utils/sms.js)
    ↓ [sendAppointmentConfirmationSMS()]
    ↓ [fetch client data]
    ↓ [format message with dynamic fields]
    ↓ [sendSMS()]
Twilio API
    ↓ [SMS delivery]
Customer Phone
```

## Dynamic Field Resolution

### Contact Name

Priority order:

1. `name` parameter from API request (parsed to first name)
2. `contactData.firstNameLowerCase` from GHL
3. `contactData.firstName` from GHL
4. Fallback: "there"

### Business Name

Priority order:

1. `client.clientMeta.businessName`
2. Fallback: "our office"

### Meeting Location

Priority order:

1. `meetingLocation` parameter from API
2. `matchedAgent.meetingLocation` (for multi-agent)
3. `client.meetingLocation` (primary agent)
4. Fallback: "TBD"

## Testing

### Test Script

File: `test-sms.js`

**Usage**:

```bash
node test-sms.js
```

**Prerequisites**:

1. Update `CLIENT_TOKEN` with valid JWT
2. Update `TEST_PHONE` with test number
3. Server running on port 8000

### Manual Testing with cURL

**1. Get Client Token**:

```bash
curl -X POST http://localhost:8000/auth/client/login \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }'
```

**2. Send Test SMS**:

```bash
curl -X POST http://localhost:8000/secure/send-sms \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+19058363456",
    "body": "Test message"
  }'
```

**3. Test Booking with Auto-SMS**:

```bash
curl -X POST http://localhost:8000/tools/book-appointment \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "5C3JSOVVFiVmBoh8mv3I",
    "phone": "+19058363456",
    "name": "John Smith",
    "startTime": "2025-11-25T10:00:00-05:00",
    "endTime": "2025-11-25T11:00:00-05:00"
  }'
```

## Error Handling Matrix

| Error Scenario              | HTTP Code | Response                             | Action Taken            |
| --------------------------- | --------- | ------------------------------------ | ----------------------- |
| Missing `to` or `body`      | 400       | "Missing required fields"            | Request rejected        |
| Client not found            | 404       | "Client not found"                   | Request rejected        |
| Client inactive             | 403       | "Client is not active"               | Request rejected        |
| No Twilio number configured | 400       | "No Twilio phone number configured"  | Request rejected        |
| Twilio API error            | 500       | "Failed to send SMS" + error details | SMS failed, logged      |
| SMS fails during booking    | N/A       | Logged only                          | Booking succeeds anyway |

## Logging Strategy

All SMS operations include structured logging:

**Format**: `[SMS] {action} {details}`

**Examples**:

- `[SMS] Sending message to +19058363456 from +18632704910`
- `[SMS] Message sent successfully: SM123456`
- `[SMS] Sending appointment confirmation to +19058363456 (John)`
- `[SMS] Error sending message: Invalid phone number`

**Request ID tracking**:

- Format: `[${requestId}]` prefix
- Generated: `Date.now().toString(36) + Math.random().toString(36).substr(2, 5)`
- Used for: Correlating operations across logs

## Security Considerations

### Authentication

- Manual SMS: Client JWT required
- Automatic SMS: Admin JWT required (for booking endpoint)

### Authorization

- Clients can only use their own Twilio number
- Cannot send from arbitrary numbers
- Must have Active status

### Data Privacy

- Phone numbers logged for debugging
- Message content NOT persisted in database
- Only Twilio message SID stored temporarily in response

### Rate Limiting

**Current State**: Not implemented
**Recommendation**: Add rate limiting in production

- Suggested: 100 SMS per client per hour
- Implementation: Use Fastify rate-limit plugin

## Performance Considerations

### Non-Blocking Design

- SMS operations don't block main business logic
- Booking succeeds even if SMS fails
- Metrics update failures also non-blocking

### Async Operations

- All SMS sends use `await` properly
- No blocking I/O in critical paths
- Twilio API calls timeout naturally

### Database Queries

- Single query to fetch client data
- Uses indexed `clientId` field
- No N+1 query issues

## Monitoring & Observability

### Success Metrics

- Message SID returned in response
- Status: "queued", "sent", "delivered"
- Timestamp of send operation

### Failure Tracking

- Try/catch blocks around all SMS operations
- Detailed error logging with context
- Request ID for correlation

### Recommended Monitoring

1. Track SMS send success/failure rate
2. Monitor Twilio API response times
3. Alert on high failure rates (>10%)
4. Track SMS costs per client

## Documentation Files

1. **`docs/Main Functions/sms-integration-docs.md`**

   - Complete API reference
   - Error codes and responses
   - Usage examples
   - Best practices

2. **`test-sms.js`**

   - Automated test script
   - Manual testing examples
   - cURL command templates

3. **`.github/copilot-instructions.md`**
   - Updated with SMS patterns
   - Added to utility functions reference
   - Included in booking flow documentation

## Future Enhancements

### Short Term

1. Add delivery status webhooks
2. Store SMS history in database
3. Add SMS templates for common messages
4. Implement rate limiting

### Medium Term

1. Two-way SMS handling (incoming messages)
2. MMS support (images, media)
3. SMS opt-out management (STOP/UNSUBSCRIBE)
4. SMS analytics dashboard

### Long Term

1. SMS keyword automation
2. Drip campaigns via SMS
3. Multi-language support
4. A/B testing for message content

## Breaking Changes

**None** - This is a new feature with no breaking changes to existing functionality.

### Backward Compatibility

- Existing booking flow unchanged
- SMS is additional, not replacement
- All previous endpoints continue to work
- No schema migrations required

## Migration Notes

### Deployment Checklist

- [x] Add `utils/sms.js` file
- [x] Update `routes/client.js` with SMS endpoint
- [x] Update `routes/tools.js` with confirmation logic
- [x] Ensure `TWILIO_ACCOUNT_SID` env var set
- [x] Ensure `TWILIO_AUTH_TOKEN` env var set
- [x] Verify all clients have `twilioPhoneNumber` configured
- [x] Test in staging environment
- [ ] Monitor error rates in production
- [ ] Set up SMS cost alerts in Twilio

### Rollback Procedure

If issues arise:

1. Remove SMS import from `routes/client.js`
2. Remove SMS endpoint handler
3. Remove SMS call from booking flow in `routes/tools.js`
4. No database changes needed
5. Feature safely disabled without data loss

## Known Limitations

1. **SMS Delivery**: Not guaranteed (carrier dependent)
2. **Cost**: Each SMS incurs Twilio charges
3. **International**: May require additional Twilio configuration
4. **Rate Limits**: Twilio has per-account limits
5. **Message Length**: Long messages split into multiple SMS (additional cost)

## Support & Troubleshooting

### Common Issues

**"No Twilio phone number configured"**

- Solution: Set `twilioPhoneNumber` in client document
- Command: Update via `/admin/clients/:clientId` endpoint

**"Invalid phone number"**

- Solution: Ensure E.164 format (+country code + number)
- Example: +19058363456 (not 905-836-3456)

**SMS not received**

- Check: Twilio console for delivery status
- Check: Phone number is correct and active
- Check: Carrier hasn't blocked messages

**High costs**

- Monitor: SMS volume per client
- Implement: Rate limiting
- Review: Message length (avoid splits)

## Conclusion

The SMS feature successfully adds automated appointment confirmations and manual SMS capabilities to AF Eleven Connect. The implementation:

- ✅ Uses existing Twilio infrastructure
- ✅ Follows project patterns (ES modules, request IDs, error handling)
- ✅ Non-blocking design (SMS failures don't break bookings)
- ✅ Secure (JWT authentication, client isolation)
- ✅ Well-documented (API docs, tests, examples)
- ✅ Production-ready with proper error handling

The feature enhances customer experience by providing immediate confirmation of booked appointments while maintaining system reliability through defensive programming practices.
