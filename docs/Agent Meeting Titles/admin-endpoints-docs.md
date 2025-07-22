# Admin Endpoints for Meeting Title Management

## Update Primary Agent Meeting Title

**POST** `/admin/clients/{clientId}/meeting-title`

Update the meeting title for a client's primary agent.

### Request Body

```json
{
  "meetingTitle": "Legal Consultation"
}
```

### Response

```json
{
  "success": true,
  "message": "Primary agent meeting title updated successfully",
  "clientId": "IQUPST2vTUl67YUYZYDy",
  "oldTitle": "Consultation",
  "newTitle": "Legal Consultation"
}
```

## Update Additional Agent Meeting Title

**PUT** `/admin/clients/{clientId}/agents/{agentId}/meeting-title`

Update the meeting title for a specific additional agent.

### Request Body

```json
{
  "meetingTitle": "Legal Matters Consultation"
}
```

### Response

```json
{
  "success": true,
  "message": "Additional agent meeting title updated successfully",
  "clientId": "IQUPST2vTUl67YUYZYDy",
  "agentId": "agent_01jza2askhfeb89s7abjmasemr",
  "oldTitle": "Consultation",
  "newTitle": "Legal Matters Consultation"
}
```

## Get All Agent Meeting Titles

**GET** `/admin/clients/{clientId}/meeting-titles`

Retrieve all meeting titles for a client's agents.

### Response

```json
{
  "success": true,
  "clientId": "IQUPST2vTUl67YUYZYDy",
  "businessName": "YLAW",
  "agents": [
    {
      "agentId": "agent_01jxxp5senerprmm60n0fnmf49",
      "twilioPhoneNumber": "+16473606807",
      "agentName": "Primary Agent",
      "meetingTitle": "Legal Consultation",
      "isPrimary": true
    },
    {
      "agentId": "agent_01jza2askhfeb89s7abjmasemr",
      "twilioPhoneNumber": "+16473607616",
      "agentName": "Legal Matters",
      "meetingTitle": "Legal Matters Consultation",
      "isPrimary": false
    }
  ]
}
```

## Bulk Update Meeting Titles

**POST** `/admin/clients/{clientId}/meeting-titles/bulk`

Update multiple agent meeting titles at once.

### Request Body

```json
{
  "primaryMeetingTitle": "Legal Consultation",
  "additionalAgents": [
    {
      "agentId": "agent_01jza2askhfeb89s7abjmasemr",
      "meetingTitle": "Legal Matters Consultation"
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "message": "Bulk meeting titles updated successfully",
  "clientId": "IQUPST2vTUl67YUYZYDy",
  "updatedAgents": [
    {
      "agentId": "agent_01jxxp5senerprmm60n0fnmf49",
      "type": "primary",
      "oldTitle": "Consultation",
      "newTitle": "Legal Consultation"
    },
    {
      "agentId": "agent_01jza2askhfeb89s7abjmasemr",
      "type": "additional",
      "oldTitle": "Consultation",
      "newTitle": "Legal Matters Consultation"
    }
  ]
}
```

## Migration Endpoint

**POST** `/admin/migrate/meeting-titles`

Run the migration to add default meeting titles to all existing clients.

### Request Body

```json
{
  "dryRun": false,
  "customTitles": {
    "legal": "Legal Consultation",
    "medical": "Medical Consultation"
  }
}
```

### Response

```json
{
  "success": true,
  "message": "Migration completed successfully",
  "clientsProcessed": 25,
  "clientsUpdated": 18,
  "details": [
    {
      "clientId": "IQUPST2vTUl67YUYZYDy",
      "businessName": "YLAW",
      "primaryAgentUpdated": true,
      "additionalAgentsUpdated": 1
    }
  ]
}
```

## Error Responses

All endpoints may return these error responses:

### Client Not Found

```json
{
  "success": false,
  "error": "Client not found",
  "clientId": "INVALID_CLIENT_ID"
}
```

### Agent Not Found

```json
{
  "success": false,
  "error": "Additional agent not found",
  "clientId": "IQUPST2vTUl67YUYZYDy",
  "agentId": "INVALID_AGENT_ID"
}
```

### Validation Error

```json
{
  "success": false,
  "error": "Meeting title is required",
  "field": "meetingTitle"
}
```

## Usage Examples

### Update YLAW Primary Agent

```bash
curl -X POST https://your-domain.com/admin/clients/IQUPST2vTUl67YUYZYDy/meeting-title \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"meetingTitle": "Legal Consultation"}'
```

### Update Legal Matters Agent

```bash
curl -X PUT https://your-domain.com/admin/clients/IQUPST2vTUl67YUYZYDy/agents/agent_01jza2askhfeb89s7abjmasemr/meeting-title \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"meetingTitle": "Legal Matters Consultation"}'
```

### Get All Meeting Titles

```bash
curl -X GET https://your-domain.com/admin/clients/IQUPST2vTUl67YUYZYDy/meeting-titles \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```
