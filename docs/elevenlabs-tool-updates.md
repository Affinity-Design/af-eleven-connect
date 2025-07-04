# UPDATED: ElevenLabs Tool Integration - Phone-Based Discovery

## KEY CHANGES MADE

### 🚨 **IMPORTANT UPDATE** 🚨
**All tool endpoints now use phone-based discovery instead of requiring clientId in the URL path.**

### What Changed:

1. **Endpoint URLs Changed:**
   - ❌ **OLD**: `/tools/get-availability/:clientId` (GET with clientId in URL)
   - ✅ **NEW**: `/tools/get-availability` (POST with twilioPhone in body)
   
   - ❌ **OLD**: `/tools/book-appointment/:clientId` (POST with clientId in URL)
   - ✅ **NEW**: `/tools/book-appointment` (POST with twilioPhone in body)
   
   - ❌ **OLD**: `/tools/get-info/:clientId` (GET with clientId in URL)
   - ✅ **NEW**: `/tools/get-info` (POST with twilioPhone in body)

2. **Request Method Changes:**
   - **get-availability**: Changed from GET to POST
   - **book-appointment**: Still POST, but no clientId in URL
   - **get-info**: Changed from GET to POST

3. **Parameter Changes:**
   - All endpoints now accept `twilioPhone` in the request body
   - Client discovery is built into each endpoint
   - No separate discovery call required

## Updated ElevenLabs Tool Definitions

### 1. Get Availability Tool
```json
{
  "name": "get_availability",
  "description": "Get available time slots for booking appointments",
  "parameters": {
    "type": "object",
    "properties": {
      "twilioPhone": {
        "type": "string",
        "description": "The Twilio phone number used by the agent"
      },
      "startDate": {
        "type": "string",
        "description": "Start date in YYYY-MM-DD format"
      },
      "endDate": {
        "type": "string",
        "description": "End date in YYYY-MM-DD format"
      },
      "timezone": {
        "type": "string",
        "description": "Timezone (default: America/New_York)"
      },
      "enableLookBusy": {
        "type": "boolean",
        "description": "Enable look-busy functionality"
      }
    },
    "required": ["twilioPhone"]
  }
}
```

### 2. Book Appointment Tool
```json
{
  "name": "book_appointment",
  "description": "Book an appointment for a customer",
  "parameters": {
    "type": "object",
    "properties": {
      "twilioPhone": {
        "type": "string",
        "description": "The Twilio phone number used by the agent"
      },
      "startTime": {
        "type": "string",
        "description": "Start time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)"
      },
      "endTime": {
        "type": "string",
        "description": "End time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)"
      },
      "phone": {
        "type": "string",
        "description": "Customer's phone number"
      },
      "meeting_title": {
        "type": "string",
        "description": "Title for the meeting"
      },
      "meeting_location": {
        "type": "string",
        "description": "Meeting location (default: Google Meet)"
      }
    },
    "required": ["twilioPhone", "startTime", "endTime", "phone"]
  }
}
```

### 3. Get Client Info Tool
```json
{
  "name": "get_client_info",
  "description": "Get information about the client and optionally search for a contact",
  "parameters": {
    "type": "object",
    "properties": {
      "twilioPhone": {
        "type": "string",
        "description": "The Twilio phone number used by the agent"
      },
      "phone": {
        "type": "string",
        "description": "Customer's phone number to search for (optional)"
      }
    },
    "required": ["twilioPhone"]
  }
}
```

### 4. Discover Client Tool (Still Available)
```json
{
  "name": "discover_client",
  "description": "Find client information using phone number or agent ID",
  "parameters": {
    "type": "object",
    "properties": {
      "twilioPhone": {
        "type": "string",
        "description": "The Twilio phone number used by the agent"
      },
      "agentId": {
        "type": "string",
        "description": "The agent ID if known"
      }
    },
    "required": ["twilioPhone"]
  }
}
```

## Updated cURL Commands

### Get Availability
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

### Book Appointment
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

### Get Client Info
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "phone": "+19058363456"
  }'
```

## Benefits of This Update

1. **Simplified ElevenLabs Integration**: No need to store or manage clientId
2. **Single Parameter Required**: Only `twilioPhone` is needed for all operations
3. **Automatic Discovery**: Each endpoint performs client discovery internally
4. **Backwards Compatible**: Still accepts `clientId` and `agentId` as alternatives
5. **Multi-Agent Aware**: Handles both primary and additional agents seamlessly

## Migration for Existing ElevenLabs Agents

1. **Update tool definitions** in ElevenLabs dashboard
2. **Change HTTP methods** from GET to POST where applicable
3. **Update request bodies** to include `twilioPhone` instead of using URL parameters
4. **Test each tool** with the new format

## Response Format

All responses now include:
- `foundBy`: How the client was discovered
- `matchedAgent`: Details of the agent that was matched
- `clientId`: The discovered client ID (for reference)
- All existing response data

## Error Handling

If client cannot be found by `twilioPhone`, the response will be:
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

This update makes the ElevenLabs integration much more straightforward and eliminates the need for separate discovery calls!
