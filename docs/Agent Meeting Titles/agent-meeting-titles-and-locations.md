# Agent Meeting Titles & Locations Feature

## Overview

Each agent (both primary and additional agents) can now have default meeting titles and meeting locations configured. This eliminates the dependency on API calls to provide these values and allows for agent-specific customization.

## Database Schema Changes

### Primary Agent

The main client record now includes `meetingTitle` and `meetingLocation` fields:

```javascript
{
  agentId: "agent_01jxxp5senerprmm60n0fnmf49",
  twilioPhoneNumber: "+16473606807",
  meetingTitle: "Legal Consultation", // New field
  meetingLocation: "Downtown Office", // New field
  // ... other fields
}
```

### Additional Agents

Each additional agent now includes `meetingTitle` and `meetingLocation` fields:

```javascript
{
  additionalAgents: [
    {
      agentId: "agent_01jza2askhfeb89s7abjmasemr",
      twilioPhoneNumber: "+16473607616",
      agentName: "Legal Matters",
      agentType: "inbound",
      meetingTitle: "Legal Matters Consultation", // New field
      meetingLocation: "Zoom Meeting", // New field
      isEnabled: true,
      inboundEnabled: true,
      outboundEnabled: true,
    },
  ];
}
```

## API Changes

### Book Appointment Endpoint

The `/tools/book-appointment` endpoint now uses the following priority for both meeting titles and locations:

#### Meeting Title Priority:

1. **API Override**: If `meeting_title` is provided in the request body, it takes highest priority
2. **Agent Default**: If no API override, uses the matched agent's `meetingTitle` field
3. **System Fallback**: If no agent title configured, falls back to "Consultation"

#### Meeting Location Priority:

1. **API Override**: If `meeting_location` is provided in the request body, it takes highest priority
2. **Agent Default**: If no API override, uses the matched agent's `meetingLocation` field
3. **System Fallback**: If no agent location configured, falls back to "Google Meet"

#### Example Request

```json
{
  "twilioPhone": "+16473606807",
  "startTime": "2025-07-23T14:00:00.000Z",
  "endTime": "2025-07-23T14:30:00.000Z",
  "phone": "+14379959529",
  "name": "John Doe",
  "meeting_title": "Emergency Legal Matter", // Optional override
  "meeting_location": "Conference Room A" // Optional override
}
```

#### Title & Location Generation Logic

```javascript
// With API overrides
Title: "John x YLAW - Emergency Legal Matter";
Location: "Conference Room A";

// Using agent defaults
Title: "John x YLAW - Legal Consultation";
Location: "Downtown Office";

// Using system fallbacks
Title: "John x YLAW - Consultation";
Location: "Google Meet";
```

## Agent Manager Updates

### Adding Additional Agents

When adding additional agents, you can now specify both `meetingTitle` and `meetingLocation`:

```javascript
const agentData = {
  agentId: "agent_01jza2askhfeb89s7abjmasemr",
  twilioPhoneNumber: "+16473607616",
  agentName: "Legal Matters",
  agentType: "inbound",
  meetingTitle: "Legal Matters Consultation", // New field
  meetingLocation: "Zoom Meeting", // New field
  inboundEnabled: true,
  outboundEnabled: true,
};

const result = await addAdditionalAgent(clientId, agentData);
```

### Updating Additional Agents

You can update both meeting title and location for existing additional agents:

```javascript
const updateData = {
  meetingTitle: "Updated Legal Consultation",
  meetingLocation: "New Conference Room",
};

const result = await updateAdditionalAgent(clientId, agentId, updateData);
```

## Migration Guide

### For Existing Clients

Existing clients will automatically get the default values:

- **Meeting Title**: "Consultation" for both primary and additional agents
- **Meeting Location**: "Google Meet" for both primary and additional agents

You can update these values as needed after migration.

### Updating Primary Agent Settings

To update the primary agent's meeting title and location, update the client record directly:

```javascript
await Client.findOneAndUpdate(
  { clientId: "IQUPST2vTUl67YUYZYDy" },
  {
    meetingTitle: "Legal Consultation",
    meetingLocation: "Downtown Office",
  },
  { new: true }
);
```

### Updating Additional Agent Settings

Use the agent manager utility:

```javascript
const result = await updateAdditionalAgent(
  "IQUPST2vTUl67YUYZYDy",
  "agent_01jza2askhfeb89s7abjmasemr",
  {
    meetingTitle: "Legal Matters Consultation",
    meetingLocation: "Zoom Meeting",
  }
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
  "meetingLocation": "Downtown Office",
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
      "meetingLocation": "Zoom Meeting",
      "isEnabled": true,
      "inboundEnabled": true,
      "outboundEnabled": true
    }
  ]
}
```

## Benefits

1. **Reduced API Dependency**: No need to always provide meeting_title and meeting_location in API calls
2. **Agent-Specific Settings**: Different agents can have different default titles and locations
3. **Backward Compatibility**: Existing API calls with these parameters still work and take priority
4. **Fallback Protection**: System always has fallback values if none configured
5. **Easy Management**: Simple to update through agent manager utilities
6. **Business Context**: Titles and locations can reflect specific services and venues

## Common Use Cases

### Legal Firm Example

- **Primary Agent**: "Legal Consultation" at "Downtown Office"
- **Phone Agent**: "Phone Consultation" at "Zoom Meeting"
- **Emergency Agent**: "Emergency Legal Matter" at "24/7 Hotline"

### Medical Practice Example

- **Primary Agent**: "Medical Consultation" at "Main Clinic"
- **Telehealth Agent**: "Telehealth Consultation" at "Video Call"
- **Specialist Agent**: "Specialist Consultation" at "Specialist Wing"

### Business Consulting Example

- **Primary Agent**: "Business Consultation" at "Conference Room A"
- **Remote Agent**: "Remote Consultation" at "Google Meet"
- **Workshop Agent**: "Strategy Workshop" at "Training Center"

## Testing

### Test Cases

1. Test booking with both API overrides (should use provided values)
2. Test booking without API overrides (should use agent's defaults)
3. Test booking with agent that has no configured values (should use system fallbacks)
4. Test with primary agent vs additional agent
5. Test agent discovery and settings retrieval
6. Test mixed scenarios (title override but no location override, etc.)

## Migration Script

Run the migration to add default values to existing clients:

```bash
node utils/migrate-meeting-titles.js
```

This script will:

- Add default meeting titles and locations to primary agents
- Add default meeting titles and locations to additional agents
- Update only clients that don't already have these values configured
- Provide detailed logging of all changes made
