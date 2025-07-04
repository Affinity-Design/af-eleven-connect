# Multi-Agent Support Documentation

## Overview

The AF Eleven Connect system now supports multiple agents per client while maintaining full backwards compatibility with existing single-agent implementations. This enables clients to have multiple ElevenLabs AI agents with different phone numbers and capabilities.

## Architecture

### Client Schema Structure

Each client now supports:

- **Primary Agent**: The original agent (backwards compatible)
- **Additional Agents**: Array of additional agents with full configuration

```javascript
// Example client document structure
{
  "clientId": "5C3JSOVVFiVmBoh8mv3I",
  "agentId": "primary_agent_123",           // Primary agent (backwards compatible)
  "twilioPhoneNumber": "+18632704910",      // Primary phone (backwards compatible)
  "additionalAgents": [                     // New: Additional agents array
    {
      "agentId": "agent_456",
      "twilioPhoneNumber": "+18632704911",
      "agentName": "Sales Agent",
      "agentType": "inbound",
      "isEnabled": true,
      "inboundEnabled": true,
      "outboundEnabled": false,
      "createdAt": "2025-07-03T10:00:00.000Z"
    },
    {
      "agentId": "agent_789",
      "twilioPhoneNumber": "+18632704912",
      "agentName": "Support Agent",
      "agentType": "both",
      "isEnabled": true,
      "inboundEnabled": true,
      "outboundEnabled": true,
      "createdAt": "2025-07-03T10:00:00.000Z"
    }
  ],
  // ... rest of client fields
}
```

### Additional Agent Schema

Each additional agent includes:

- `agentId` (required): Unique identifier for the agent
- `twilioPhoneNumber` (required): Phone number for this agent
- `agentName` (optional): Friendly name for the agent
- `agentType`: "inbound", "outbound", or "both"
- `isEnabled`: Boolean to enable/disable the agent
- `inboundEnabled`: Boolean for inbound call capability
- `outboundEnabled`: Boolean for outbound call capability
- `createdAt`: Timestamp when agent was added

## API Endpoints

### 1. Client Discovery (Enhanced)

**Endpoint**: `POST /tools/discover-client`

**Purpose**: Find a client by various parameters, now supports multi-agent lookup

**Priority Order**:

1. `twilioPhone` (primary → additional agents)
2. `clientId` (direct lookup)
3. `agentId` (primary → additional agents)
4. `phone` (customer phone - least reliable)

**Request Body**:

```json
{
  "twilioPhone": "+18632704911", // Most reliable for ElevenLabs
  "agentId": "agent_456", // Agent-specific lookup
  "clientId": "5C3JSOVVFiVmBoh8mv3I", // Direct client lookup
  "phone": "+19058363456" // Customer phone (fallback)
}
```

**Response**:

```json
{
  "requestId": "abc123",
  "clientId": "5C3JSOVVFiVmBoh8mv3I",
  "clientName": "Paul Giovanatto",
  "businessName": "Affinity Design",
  "twilioPhoneNumber": "+18632704910", // Primary phone
  "status": "Active",
  "hasGhlIntegration": true,
  "hasCalendar": true,
  "foundBy": "additionalTwilioPhone",
  "matchedAgent": {
    // NEW: Details of matched agent
    "agentId": "agent_456",
    "twilioPhoneNumber": "+18632704911",
    "agentName": "Sales Agent",
    "agentType": "inbound",
    "isEnabled": true,
    "inboundEnabled": true,
    "outboundEnabled": false,
    "isPrimary": false
  },
  "totalAgents": 3, // NEW: Total agent count
  "allAgents": [
    // NEW: All agents for this client
    {
      "agentId": "primary_agent_123",
      "twilioPhoneNumber": "+18632704910",
      "agentName": "Primary Agent",
      "agentType": "both",
      "isEnabled": true,
      "inboundEnabled": true,
      "outboundEnabled": true,
      "isPrimary": true
    },
    {
      "agentId": "agent_456",
      "twilioPhoneNumber": "+18632704911",
      "agentName": "Sales Agent",
      "agentType": "inbound",
      "isEnabled": true,
      "inboundEnabled": true,
      "outboundEnabled": false,
      "isPrimary": false
    },
    {
      "agentId": "agent_789",
      "twilioPhoneNumber": "+18632704912",
      "agentName": "Support Agent",
      "agentType": "both",
      "isEnabled": true,
      "inboundEnabled": true,
      "outboundEnabled": true,
      "isPrimary": false
    }
  ]
}
```

### 2. Other Tool Endpoints

All other tool endpoints remain unchanged:

- `GET /tools/get-availability/:clientId`
- `POST /tools/book-appointment/:clientId`
- `GET /tools/get-info/:clientId`
- `GET /tools/get-time`

## Client Helper Methods

The client schema includes built-in helper methods:

### `getAllAgents()`

Returns all agents (primary + additional) for a client.

```javascript
const client = await Client.findOne({ clientId: "5C3JSOVVFiVmBoh8mv3I" });
const allAgents = client.getAllAgents();
// Returns array of all agents with isPrimary flag
```

### `findAgentByPhone(phoneNumber)`

Finds a specific agent by phone number.

```javascript
const agent = client.findAgentByPhone("+18632704911");
// Returns agent object or null
```

### `findAgentById(agentId)`

Finds a specific agent by agent ID.

```javascript
const agent = client.findAgentById("agent_456");
// Returns agent object or null
```

## Agent Management Utilities

### Adding Additional Agents

```javascript
import { addAdditionalAgent } from "./utils/agentManager.js";

const newAgent = {
  agentId: "agent_999",
  twilioPhoneNumber: "+18632704913",
  agentName: "Marketing Agent",
  agentType: "outbound",
  inboundEnabled: false,
  outboundEnabled: true,
};

const result = await addAdditionalAgent("5C3JSOVVFiVmBoh8mv3I", newAgent);
```

### Updating Additional Agents

```javascript
import { updateAdditionalAgent } from "./utils/agentManager.js";

const updates = {
  agentName: "Updated Marketing Agent",
  isEnabled: false,
};

const result = await updateAdditionalAgent(
  "5C3JSOVVFiVmBoh8mv3I",
  "agent_999",
  updates
);
```

### Removing Additional Agents

```javascript
import { removeAdditionalAgent } from "./utils/agentManager.js";

const result = await removeAdditionalAgent("5C3JSOVVFiVmBoh8mv3I", "agent_999");
```

### Listing All Additional Agents

```javascript
import { getAdditionalAgents } from "./utils/agentManager.js";

const agents = await getAdditionalAgents("5C3JSOVVFiVmBoh8mv3I");
```

## Database Indexes

The following indexes have been added for optimal performance:

```javascript
// Existing indexes
clientSchema.index({ clientId: 1 });
clientSchema.index({ agentId: 1 });
clientSchema.index({ twilioPhoneNumber: 1 });

// New multi-agent indexes
clientSchema.index({ "additionalAgents.twilioPhoneNumber": 1 });
clientSchema.index({ "additionalAgents.agentId": 1 });
```

## ElevenLabs Integration

### Tool Configuration

Each tool in ElevenLabs should be configured with:

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

### Typical ElevenLabs Flow

1. **Agent receives call** on specific Twilio number
2. **Agent calls discover-client** with `twilioPhone` parameter
3. **System returns client info** and matched agent details
4. **Agent uses clientId** for subsequent tool calls (availability, booking, etc.)

## Backwards Compatibility

The multi-agent system is fully backwards compatible:

1. **Existing clients** work without modification
2. **Primary agent fields** remain unchanged
3. **All existing APIs** continue to work
4. **No breaking changes** to current functionality

## Migration Strategy

### For Existing Clients

No migration is required. Existing clients will:

- Continue using their primary `agentId` and `twilioPhoneNumber`
- Return `totalAgents: 1` in discovery calls
- Have `isPrimary: true` in their agent data

### For New Multi-Agent Clients

1. Create client with primary agent (standard process)
2. Add additional agents using agent management utilities
3. Configure each agent in ElevenLabs with appropriate phone numbers
4. Test discovery and functionality for each agent

## Error Handling

### Common Scenarios

1. **Agent not found**: Returns 404 with search details
2. **Duplicate agent ID**: Prevented by validation
3. **Duplicate phone number**: Prevented by validation
4. **Disabled agent**: Excluded from active lookups

### Validation Rules

- `agentId` must be unique across primary and additional agents
- `twilioPhoneNumber` must be unique across primary and additional agents
- Both `agentId` and `twilioPhoneNumber` are required for additional agents

## Testing

### Test Client Discovery

```bash
# Test primary agent discovery
curl -X POST "http://localhost:3000/tools/discover-client" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"twilioPhone": "+18632704910"}'

# Test additional agent discovery
curl -X POST "http://localhost:3000/tools/discover-client" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"twilioPhone": "+18632704911"}'
```

### Test Agent Management

```bash
# Add additional agent
curl -X POST "http://localhost:3000/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456",
    "twilioPhoneNumber": "+18632704911",
    "agentName": "Sales Agent",
    "agentType": "inbound"
  }'
```

## Security Considerations

1. **Admin Authentication**: All tool routes require admin authentication
2. **Agent Validation**: Duplicate prevention and validation
3. **Status Checking**: Only active clients and enabled agents are used
4. **Phone Number Verification**: Twilio phone numbers are validated

## Performance Considerations

1. **Database Indexes**: Optimized for multi-agent queries
2. **Efficient Lookups**: Priority-based search reduces query overhead
3. **Caching**: Consider implementing client data caching for high-traffic scenarios
4. **Connection Pooling**: Ensure MongoDB connection pooling is configured

## Future Enhancements

Potential future improvements:

1. **Agent-specific configurations**: Different GHL integrations per agent
2. **Agent performance tracking**: Individual agent statistics
3. **Load balancing**: Distribute calls across multiple agents
4. **Agent scheduling**: Time-based agent availability
5. **Agent hierarchy**: Primary/secondary agent relationships

## Support and Troubleshooting

### Common Issues

1. **Agent not found**: Check phone number format and client status
2. **Discovery failures**: Verify admin token and client activity
3. **Database errors**: Check MongoDB connection and indexes
4. **Validation errors**: Ensure unique agent IDs and phone numbers

### Debugging

Enable detailed logging by checking console output with request IDs:

```
[abc123] Tool: Client discovery request
[abc123] Client found by: additionalTwilioPhone -> 5C3JSOVVFiVmBoh8mv3I
```

### Contact

For technical support or questions about the multi-agent system, refer to the main project documentation or contact the development team.
