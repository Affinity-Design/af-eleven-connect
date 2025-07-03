# Implementation Guide: ElevenLabs Admin Tool Integration

## Quick Start

### 1. Generate Admin Token for ElevenLabs

```bash
# Generate a dedicated admin token for ElevenLabs
curl -X POST "https://api.v1.affinitydesign.ca/admin/elevenlabs-token" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "ElevenLabs Agent Integration - Production"
  }'
```

Response:
```json
{
  "message": "ElevenLabs admin token generated successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "description": "ElevenLabs Agent Integration - Production",
  "usage": {
    "baseUrl": "https://api.v1.affinitydesign.ca",
    "toolEndpoints": [
      "GET /tools/get-availability/:clientId",
      "POST /tools/book-appointment/:clientId",
      "GET /tools/get-info/:clientId"
    ],
    "authHeader": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "note": "Store this token securely in your ElevenLabs agent configuration"
  }
}
```

### 2. Configure ElevenLabs Agent Tools

In your ElevenLabs agent configuration, add these tool definitions:

#### Tool 1: Client Discovery
```json
{
  "name": "discover_client",
  "description": "Find client ID by phone number or other identifiers",
  "parameters": {
    "type": "object",
    "properties": {
      "phone": {
        "type": "string",
        "description": "Customer phone number"
      },
      "twilioPhone": {
        "type": "string", 
        "description": "Twilio phone number used for the call"
      },
      "agentId": {
        "type": "string",
        "description": "ElevenLabs agent ID"
      }
    }
  },
  "url": "https://api.v1.affinitydesign.ca/tools/discover-client",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_ELEVENLABS_ADMIN_TOKEN",
    "Content-Type": "application/json"
  }
}
```

#### Tool 2: Get Availability
```json
{
  "name": "get_availability", 
  "description": "Get available time slots for a client's calendar",
  "parameters": {
    "type": "object",
    "properties": {
      "clientId": {
        "type": "string",
        "description": "The client ID (get from discover_client first)"
      },
      "startDate": {
        "type": "string",
        "description": "Start date in YYYY-MM-DD format (optional, defaults to today)"
      },
      "endDate": {
        "type": "string",
        "description": "End date in YYYY-MM-DD format (optional, defaults to +7 days)"
      },
      "timezone": {
        "type": "string",
        "description": "Timezone like America/New_York (optional, defaults to America/New_York)"
      }
    },
    "required": ["clientId"]
  },
  "url": "https://api.v1.affinitydesign.ca/tools/get-availability/{clientId}",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer YOUR_ELEVENLABS_ADMIN_TOKEN"
  }
}
```

#### Tool 3: Book Appointment
```json
{
  "name": "book_appointment",
  "description": "Book an appointment for a client",
  "parameters": {
    "type": "object", 
    "properties": {
      "clientId": {
        "type": "string",
        "description": "The client ID (get from discover_client first)"
      },
      "startTime": {
        "type": "string",
        "description": "Appointment start time in ISO 8601 format (e.g., 2025-04-01T10:00:00-04:00)"
      },
      "endTime": {
        "type": "string",
        "description": "Appointment end time in ISO 8601 format (e.g., 2025-04-01T11:00:00-04:00)"
      },
      "phone": {
        "type": "string",
        "description": "Phone number of the contact to book appointment for"
      },
      "meeting_title": {
        "type": "string",
        "description": "Title for the meeting (optional, defaults to 'Consultation')"
      },
      "meeting_location": {
        "type": "string",
        "description": "Meeting location (optional, defaults to 'Google Meet')"
      }
    },
    "required": ["clientId", "startTime", "endTime", "phone"]
  },
  "url": "https://api.v1.affinitydesign.ca/tools/book-appointment/{clientId}",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_ELEVENLABS_ADMIN_TOKEN",
    "Content-Type": "application/json"
  }
}
```

#### Tool 4: Get Client Info
```json
{
  "name": "get_client_info",
  "description": "Get information about a client and optionally search for a contact",
  "parameters": {
    "type": "object",
    "properties": {
      "clientId": {
        "type": "string",
        "description": "The client ID (get from discover_client first)"
      },
      "phone": {
        "type": "string",
        "description": "Phone number to search for contact info (optional)"
      }
    },
    "required": ["clientId"]
  },
  "url": "https://api.v1.affinitydesign.ca/tools/get-info/{clientId}",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer YOUR_ELEVENLABS_ADMIN_TOKEN"
  }
}
```

### 3. Update Your Agent Prompt

Add this to your ElevenLabs agent prompt:

```
## Available Tools

You have access to the following tools to help customers:

### 1. discover_client
Use this FIRST to find the client ID. You can search by:
- Customer phone number
- Twilio phone number (the number they called)
- Agent ID

### 2. get_availability
Once you have the client ID, use this to check available appointment times.

### 3. book_appointment  
Use this to book appointments after confirming times with the customer.

### 4. get_client_info
Use this to get information about the business and optionally search for existing customer records.

## Workflow Example

1. **Start every call**: Use discover_client to find the client ID
2. **Check availability**: Use get_availability to show available times
3. **Book appointment**: Use book_appointment to confirm the booking
4. **Get info**: Use get_client_info for business details or customer lookup

Always use discover_client first to identify which client you're working with!
```

### 4. Test the Integration

#### Test Client Discovery
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer YOUR_ELEVENLABS_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+19058363456"
  }'
```

#### Test Get Availability
```bash
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-availability/5C3JSOVVFiVmBoh8mv3I" \
  -H "Authorization: Bearer YOUR_ELEVENLABS_ADMIN_TOKEN"
```

#### Test Book Appointment
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/book-appointment/5C3JSOVVFiVmBoh8mv3I" \
  -H "Authorization: Bearer YOUR_ELEVENLABS_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2025-04-01T10:00:00-04:00",
    "endTime": "2025-04-01T11:00:00-04:00", 
    "phone": "+19058363456",
    "meeting_title": "Consultation"
  }'
```

### 5. Benefits of This Approach

✅ **Single Token**: One admin token works for all clients
✅ **Scalable**: Easy to add new clients without reconfiguring ElevenLabs
✅ **Secure**: Admin-level access with proper client validation
✅ **Flexible**: Can discover client by phone, Twilio number, or agent ID
✅ **Backwards Compatible**: Existing client endpoints still work

### 6. Security Notes

- Store the ElevenLabs admin token securely
- The token has admin privileges, so protect it carefully
- All tool calls are logged for auditing
- Client validation ensures only active clients can be accessed

### 7. Troubleshooting

#### Common Issues:

1. **"Client not found"**: Use discover_client first to find the correct client ID
2. **"Client not active"**: Check client status in admin panel
3. **"No GHL integration"**: Client needs to complete GHL OAuth flow
4. **"No calendar ID"**: Client needs calId configured in their record

#### Debug Tools:

```bash
# Check if client exists
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer YOUR_ELEVENLABS_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890"}'

# Get client info
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-info/CLIENT_ID" \
  -H "Authorization: Bearer YOUR_ELEVENLABS_ADMIN_TOKEN"
```

This implementation eliminates your bottleneck while maintaining security and providing a much cleaner architecture for ElevenLabs integration!
