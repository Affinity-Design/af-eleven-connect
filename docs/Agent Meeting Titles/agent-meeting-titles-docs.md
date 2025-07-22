# Agent Meeting Titles Feature

## Overview

Each agent (both primary and additional agents) can now have a default meeting title configured. This eliminates the dependency on API calls to provide meeting titles and allows for agent-specific customization.

## Database Schema Changes

### Primary Agent

The main client record now includes a `meetingTitle` field:

```javascript
{
  agentId: "agent_01jxxp5senerprmm60n0fnmf49",
  twilioPhoneNumber: "+16473606807",
  meetingTitle: "Legal Consultation", // New field
  // ... other fields
}
```

### Additional Agents

Each additional agent now includes a `meetingTitle` field:

```javascript
{
  additionalAgents: [
    {
      agentId: "agent_01jza2askhfeb89s7abjmasemr",
      twilioPhoneNumber: "+16473607616",
      agentName: "Legal Matters",
      agentType: "inbound",
      meetingTitle: "Legal Matters Consultation", // New field
      isEnabled: true,
      inboundEnabled: true,
      outboundEnabled: true,
    },
  ];
}
```

## API Changes

### Book Appointment Endpoint

The `/tools/book-appointment` endpoint now uses the following priority for meeting titles:

1. **API Override**: If `meeting_title` is provided in the request body, it takes highest priority
2. **Agent Default**: If no API override, uses the matched agent's `meetingTitle` field
3. **System Fallback**: If no agent title configured, falls back to "Consultation"

#### Example Request

```json
{
  "twilioPhone": "+16473606807",
  "startTime": "2025-07-23T14:00:00.000Z",
  "endTime": "2025-07-23T14:30:00.000Z",
  "phone": "+14379959529",
  "name": "John Doe",
  "meeting_title": "Emergency Legal Matter" // Optional override
}
```

#### Title Generation Logic

```javascript
// If API provides meeting_title
"John x YLAW - Emergency Legal Matter";

// If using agent's default meetingTitle
"John x YLAW - Legal Consultation";

// If no agent title configured (fallback)
"John x YLAW - Consultation";
```

## Agent Manager Updates

### Adding Additional Agents

When adding additional agents, you can now specify a `meetingTitle`:

```javascript
const agentData = {
  agentId: "agent_01jza2askhfeb89s7abjmasemr",
  twilioPhoneNumber: "+16473607616",
  agentName: "Legal Matters",
  agentType: "inbound",
  meetingTitle: "Legal Matters Consultation", // New field
  inboundEnabled: true,
  outboundEnabled: true,
};

const result = await addAdditionalAgent(clientId, agentData);
```

### Updating Additional Agents

You can update the meeting title for existing additional agents:

```javascript
const updateData = {
  meetingTitle: "Updated Legal Consultation",
};

const result = await updateAdditionalAgent(clientId, agentId, updateData);
```

## Migration Guide

### For Existing Clients

Existing clients will automatically get the default value "Consultation" for both primary and additional agents. You can update these values as needed.

### Updating Primary Agent Meeting Title

To update the primary agent's meeting title, update the client record directly:

```javascript
await Client.findOneAndUpdate(
  { clientId: "IQUPST2vTUl67YUYZYDy" },
  { meetingTitle: "Legal Consultation" },
  { new: true }
);
```

### Updating Additional Agent Meeting Title

Use the agent manager utility:

```javascript
const result = await updateAdditionalAgent(
  "IQUPST2vTUl67YUYZYDy",
  "agent_01jza2askhfeb89s7abjmasemr",
  { meetingTitle: "Legal Matters Consultation" }
);
```

## Example Complete Client Record

```json
{
  "_id": "6866f12a27576f5a8f40424f",
  "clientId": "IQUPST2vTUl67YUYZYDy",
  "calId": "0ecyqLVUze2zkuQlDOHz",
  "agentId": "agent_01jxxp5senerprmm60n0fnmf49",
  "twilioPhoneNumber": "+16473606807",
  "meetingTitle": "Legal Consultation",
  "status": "Active",
  "clientMeta": {
    "fullName": "Daniel English",
    "businessName": "YLAW",
    "email": "danielenglishlegal@gmail.com"
  },
  "additionalAgents": [
    {
      "agentId": "agent_01jza2askhfeb89s7abjmasemr",
      "twilioPhoneNumber": "+16473607616",
      "agentName": "Legal Matters",
      "agentType": "inbound",
      "meetingTitle": "Legal Matters Consultation",
      "isEnabled": true,
      "inboundEnabled": true,
      "outboundEnabled": true
    }
  ]
}
```

## Benefits

1. **Reduced API Dependency**: No need to always provide meeting_title in API calls
2. **Agent-Specific Titles**: Different agents can have different default meeting titles
3. **Backward Compatibility**: Existing API calls with meeting_title still work and take priority
4. **Fallback Protection**: System always has a fallback title if none configured
5. **Easy Management**: Simple to update titles through agent manager utilities

## Testing

### Test Cases

1. Test booking with API override (should use provided title)
2. Test booking without API override (should use agent's default title)
3. Test booking with agent that has no configured title (should use "Consultation")
4. Test with primary agent vs additional agent
5. Test agent discovery and title retrieval
