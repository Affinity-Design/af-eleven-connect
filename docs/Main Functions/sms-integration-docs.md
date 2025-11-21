# SMS Integration Documentation

## Overview

AF Eleven Connect now supports SMS messaging through Twilio integration. This feature allows clients to send text messages and automatically sends appointment confirmation texts when bookings are made through the Go High Level integration.

## Features

1. **Manual SMS Sending**: Client-authenticated endpoint for sending custom SMS messages
2. **Automatic Appointment Confirmations**: SMS confirmations sent automatically after successful bookings
3. **Twilio Integration**: Leverages existing Twilio infrastructure for reliable message delivery

## API Endpoints

### Send SMS (Client-Authenticated)

Send a custom SMS message using your Twilio number.

**Endpoint**: `POST /secure/send-sms`

**Authentication**: Client JWT token required

**Request Headers**:

```
Authorization: Bearer <client_jwt_token>
Content-Type: application/json
```

**Request Body**:

```json
{
  "to": "+19058363456",
  "body": "Your custom message text here"
}
```

**Parameters**:

- `to` (required): Recipient phone number in E.164 format (e.g., +1234567890)
- `body` (required): Message text (max 1600 characters, will be split if longer)

**Success Response** (200):

```json
{
  "success": true,
  "message": "SMS sent successfully",
  "requestId": "abc123xyz",
  "messageSid": "SM1234567890abcdef",
  "status": "queued",
  "to": "+19058363456",
  "from": "+18632704910",
  "dateCreated": "2025-11-21T10:30:00.000Z"
}
```

**Error Responses**:

400 - Missing required fields:

```json
{
  "error": "Missing required fields",
  "message": "Both 'to' and 'body' are required",
  "requestId": "abc123xyz"
}
```

400 - No Twilio number configured:

```json
{
  "error": "No Twilio phone number configured for your account",
  "message": "Please contact support to set up SMS capabilities",
  "requestId": "abc123xyz"
}
```

403 - Inactive client:

```json
{
  "error": "Client is not active (status: Inactive)",
  "requestId": "abc123xyz"
}
```

404 - Client not found:

```json
{
  "error": "Client not found",
  "requestId": "abc123xyz"
}
```

500 - Send failure:

```json
{
  "error": "Failed to send SMS",
  "message": "Error details from Twilio",
  "requestId": "abc123xyz"
}
```

## Automatic Appointment Confirmation SMS

When an appointment is successfully booked through the `/tools/book-appointment` endpoint, an SMS confirmation is automatically sent to the customer.

### Confirmation Message Format

```
Hi! Your appointment with [Business Name] has been confirmed.

📅 [Weekday, Month Day, Year]
🕒 [Time]
📍 [Location/Address]

We look forward to seeing you!
```

### Example Message

```
Hi! Your appointment with Affinity Design has been confirmed.

📅 Monday, November 25, 2025
🕒 10:00 AM
📍 Google Meet

We look forward to seeing you!
```

### Appointment Booking Flow

1. ElevenLabs agent or admin calls `POST /tools/book-appointment`
2. System validates client and refreshes GHL token
3. Contact is searched/created in Go High Level
4. Appointment is booked in GHL calendar
5. **SMS confirmation is automatically sent** (does not fail booking if SMS fails)
6. Call metrics are updated
7. Success response is returned

### Error Handling

- SMS failures are logged but **do not fail the appointment booking**
- If SMS cannot be sent, the appointment is still confirmed in GHL
- Errors are logged with detailed context: `[${requestId}] Failed to send appointment confirmation SMS`

## Utility Functions

### `utils/sms.js`

The SMS utility module provides two main functions:

#### `sendSMS(to, from, body)`

Send a raw SMS message via Twilio.

**Parameters**:

- `to` (string): Recipient phone in E.164 format
- `from` (string): Sender Twilio phone number
- `body` (string): Message text (max 1600 chars)

**Returns**: Promise resolving to message details object

**Usage**:

```javascript
import { sendSMS } from "./utils/sms.js";

const result = await sendSMS(
  "+19058363456",
  "+18632704910",
  "Your message here"
);

console.log("Message SID:", result.messageSid);
```

#### `sendAppointmentConfirmationSMS(clientId, phone, appointmentDetails)`

Send formatted appointment confirmation SMS.

**Parameters**:

- `clientId` (string): Client ID to retrieve business info and from number
- `phone` (string): Customer phone number
- `appointmentDetails` (object):
  - `startTime` (string/Date): Appointment start time
  - `endTime` (string/Date): Appointment end time
  - `title` (string): Appointment title
  - `address` (string): Meeting location/address

**Returns**: Promise resolving to message details object

**Usage**:

```javascript
import { sendAppointmentConfirmationSMS } from "./utils/sms.js";

await sendAppointmentConfirmationSMS("5C3JSOVVFiVmBoh8mv3I", "+19058363456", {
  startTime: "2025-11-25T10:00:00-05:00",
  endTime: "2025-11-25T11:00:00-05:00",
  title: "Consultation",
  address: "Google Meet",
});
```

## Testing

### Manual Testing with cURL

1. Get client authentication token:

```bash
curl -X POST http://localhost:8000/auth/client/login \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }'
```

2. Send test SMS:

```bash
curl -X POST http://localhost:8000/secure/send-sms \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+19058363456",
    "body": "Test message from AF Eleven Connect"
  }'
```

### Using Test Script

Run the provided test script:

```bash
node test-sms.js
```

**Before running**, update these values in `test-sms.js`:

- `CLIENT_TOKEN`: Your client JWT token
- `TEST_PHONE`: Valid phone number for testing

## Requirements

### Environment Variables

The following Twilio credentials must be set:

```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
```

### Client Configuration

Each client must have:

- `twilioPhoneNumber`: A valid Twilio phone number configured for SMS
- `status`: "Active"
- `clientMeta.businessName`: Used in appointment confirmation messages

## Best Practices

1. **Phone Number Format**: Always use E.164 format (+country code + number)
2. **Message Length**: Keep messages under 1600 characters to avoid splitting
3. **Error Handling**: Wrap SMS calls in try/catch blocks
4. **Non-Blocking**: Don't fail main operations if SMS fails (especially in booking flow)
5. **Logging**: Use request IDs for tracking: `[${requestId}]` prefix

## Common Issues

### "No Twilio phone number configured"

- Ensure client has `twilioPhoneNumber` field populated
- Verify phone number is SMS-capable in Twilio console

### "Invalid phone number"

- Check phone number is in E.164 format (+1234567890)
- Verify country code is included
- Confirm number doesn't have spaces or special characters

### SMS not received

- Check Twilio console for delivery status
- Verify recipient number is correct
- Check for carrier filtering/blocking
- Confirm Twilio account has sufficient balance

### Message split into multiple texts

- Keep message under 160 characters (standard SMS)
- Or under 1600 characters (Twilio concatenation limit)

## Security Considerations

- SMS endpoint requires client authentication (JWT)
- Each client can only send from their own Twilio number
- Client status must be "Active" to send messages
- Rate limiting should be considered for production use
- Phone numbers are logged but message content is not persisted in database

## Future Enhancements

Potential improvements for SMS functionality:

1. **Message Templates**: Pre-defined templates for common messages
2. **SMS History**: Store sent messages in MongoDB
3. **Delivery Webhooks**: Track delivery status in real-time
4. **Rate Limiting**: Prevent abuse with per-client rate limits
5. **MMS Support**: Send images and media files
6. **Two-Way SMS**: Handle incoming SMS messages
7. **SMS Keywords**: Auto-respond to specific keywords
8. **Opt-Out Management**: Handle STOP/UNSUBSCRIBE requests
