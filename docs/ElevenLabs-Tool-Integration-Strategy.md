# ElevenLabs Tool Integration Strategy

## Problem Analysis

Your current architecture requires each ElevenLabs agent to authenticate with individual client tokens, creating a bottleneck for multi-client deployments. This limits scalability and complicates agent setup.

## Solution: Admin-Authenticated Tool Routes

### New Architecture Overview

1. **Admin-Only Tool Routes**: Create new endpoints under `/tools/` that:
   - Use admin authentication (single token)
   - Accept `clientId` as a parameter
   - Handle all client-specific operations internally

2. **Single ElevenLabs Agent**: Configure one agent with admin credentials that can access all client tools

3. **Backwards Compatibility**: Keep existing client-authenticated routes for direct client access

### Implementation

#### New Tool Endpoints

```
GET  /tools/get-availability/:clientId    - Get calendar availability for any client
POST /tools/book-appointment/:clientId    - Book appointment for any client  
GET  /tools/get-info/:clientId            - Get client/contact info for any client
```

#### ElevenLabs Agent Configuration

Configure your ElevenLabs agent with these tool definitions:

```json
{
  "tools": [
    {
      "name": "get_availability",
      "description": "Get available time slots for a client's calendar",
      "parameters": {
        "type": "object",
        "properties": {
          "clientId": {
            "type": "string",
            "description": "The client ID to get availability for"
          },
          "startDate": {
            "type": "string",
            "description": "Start date (YYYY-MM-DD format)"
          },
          "endDate": {
            "type": "string", 
            "description": "End date (YYYY-MM-DD format)"
          },
          "timezone": {
            "type": "string",
            "description": "Timezone (e.g., America/New_York)"
          }
        },
        "required": ["clientId"]
      },
      "url": "https://api.v1.affinitydesign.ca/tools/get-availability/{clientId}",
      "method": "GET",
      "headers": {
        "Authorization": "Bearer YOUR_ADMIN_TOKEN"
      }
    },
    {
      "name": "book_appointment",
      "description": "Book an appointment for a client",
      "parameters": {
        "type": "object",
        "properties": {
          "clientId": {
            "type": "string",
            "description": "The client ID to book appointment for"
          },
          "startTime": {
            "type": "string",
            "description": "Appointment start time (ISO 8601 format)"
          },
          "endTime": {
            "type": "string",
            "description": "Appointment end time (ISO 8601 format)"
          },
          "phone": {
            "type": "string",
            "description": "Phone number of the contact"
          },
          "meeting_title": {
            "type": "string",
            "description": "Title for the meeting"
          }
        },
        "required": ["clientId", "startTime", "endTime", "phone"]
      },
      "url": "https://api.v1.affinitydesign.ca/tools/book-appointment/{clientId}",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer YOUR_ADMIN_TOKEN",
        "Content-Type": "application/json"
      }
    },
    {
      "name": "get_client_info",
      "description": "Get information about a client and optionally search for a contact",
      "parameters": {
        "type": "object",
        "properties": {
          "clientId": {
            "type": "string",
            "description": "The client ID to get info for"
          },
          "phone": {
            "type": "string",
            "description": "Phone number to search for contact (optional)"
          }
        },
        "required": ["clientId"]
      },
      "url": "https://api.v1.affinitydesign.ca/tools/get-info/{clientId}",
      "method": "GET",
      "headers": {
        "Authorization": "Bearer YOUR_ADMIN_TOKEN"
      }
    }
  ]
}
```

### Benefits

1. **Single Token Management**: One admin token for all clients
2. **Simplified Agent Setup**: One ElevenLabs agent handles all clients
3. **Scalability**: Easy to add new clients without agent reconfiguration
4. **Security**: Admin token provides controlled access to all client operations
5. **Flexibility**: Can still use client-specific tokens for direct client access

### Implementation Steps

1. ✅ **Create Tool Routes**: New `/tools/` endpoints with admin auth
2. **Generate Admin Token**: Create a long-lived admin token for ElevenLabs
3. **Configure ElevenLabs Agent**: Add tool definitions with admin token
4. **Test Integration**: Verify tools work across different clients
5. **Update Documentation**: Document new tool endpoints

### Client ID Resolution

For your current webhook flow, you'll need to modify how the `clientId` is passed to ElevenLabs:

#### Option A: Pass clientId in webhook parameters
```javascript
// In outbound-call-twiml endpoint
if (clientId) {
  twimlResponse += `\n          <Parameter name="clientId" value="${clientId}" />`;
}
```

#### Option B: Lookup clientId by phone number
```javascript
// In tools, add a lookup function
async function findClientByPhone(phone) {
  // Search for client with matching twilioPhoneNumber
  const client = await Client.findOne({ twilioPhoneNumber: phone });
  return client?.clientId;
}
```

### Security Considerations

1. **Admin Token Security**: Store admin token securely in ElevenLabs
2. **Rate Limiting**: Consider implementing rate limits on tool endpoints
3. **Audit Logging**: Log all tool usage for security monitoring
4. **Client Validation**: Always verify client exists and is active

### Migration Strategy

1. **Phase 1**: Deploy new tool routes alongside existing endpoints
2. **Phase 2**: Configure ElevenLabs agent with new tools
3. **Phase 3**: Test with select clients
4. **Phase 4**: Migrate all clients to new system
5. **Phase 5**: Deprecate old client-specific authentication (optional)

This solution eliminates the bottleneck while maintaining security and providing a much more scalable architecture.
