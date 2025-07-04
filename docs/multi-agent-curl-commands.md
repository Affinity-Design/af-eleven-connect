# Multi-Agent API Testing with cURL

This document provides comprehensive cURL commands for testing the multi-agent functionality.

## Prerequisites

1. Get an admin token first:
```bash
curl -X POST "https://api.v1.affinitydesign.ca/admin/get-token" \
  -H "Content-Type: application/json" \
  -d '{
    "adminKey": "YOUR_ADMIN_KEY"
  }'
```

2. Set your admin token as an environment variable:
```bash
export ADMIN_TOKEN="your_admin_token_here"
```

## 1. Client Discovery Commands

### Discover Client by Twilio Phone (Primary Agent)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704910"
  }'
```

### Discover Client by Twilio Phone (Additional Agent)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911"
  }'
```

### Discover Client by Agent ID
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456"
  }'
```

### Discover Client by Client ID
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "5C3JSOVVFiVmBoh8mv3I"
  }'
```

### Discover Client by Customer Phone (Fallback)
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

## 2. Agent Management Commands

### Add Additional Agent
```bash
curl -X POST "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456",
    "twilioPhoneNumber": "+18632704911",
    "agentName": "Sales Agent",
    "agentType": "inbound",
    "inboundEnabled": true,
    "outboundEnabled": false
  }'
```

### Add Outbound-Only Agent
```bash
curl -X POST "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_789",
    "twilioPhoneNumber": "+18632704912",
    "agentName": "Marketing Agent",
    "agentType": "outbound",
    "inboundEnabled": false,
    "outboundEnabled": true
  }'
```

### Add Full-Service Agent
```bash
curl -X POST "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_999",
    "twilioPhoneNumber": "+18632704913",
    "agentName": "Support Agent",
    "agentType": "both",
    "inboundEnabled": true,
    "outboundEnabled": true
  }'
```

### Update Additional Agent
```bash
curl -X PUT "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents/agent_456" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "Updated Sales Agent",
    "isEnabled": false,
    "inboundEnabled": false
  }'
```

### Enable/Disable Agent
```bash
curl -X PUT "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents/agent_456" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isEnabled": true
  }'
```

### Remove Additional Agent
```bash
curl -X DELETE "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents/agent_456" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Get All Agents for Client
```bash
curl -X GET "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 3. Tool Usage Commands (Phone-Based Discovery)

### Get Availability (Using Twilio Phone)
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

### Get Availability (Alternative Parameters)
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

### Book Appointment (Using Twilio Phone)
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

### Book Appointment (Alternative Parameters)
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

### Get Client Info (Using Twilio Phone)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "phone": "+19058363456"
  }'
```

### Get Client Info (Alternative Parameters)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "5C3JSOVVFiVmBoh8mv3I",
    "phone": "+19058363456"
  }'
```

### Get Time Utility
```bash
curl -X GET "https://api.v1.affinitydesign.ca/tools/get-time?day=7&week=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 4. Complete ElevenLabs Workflow Example

### Step 1: Agent Discovery (ElevenLabs calls this first)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911"
  }'
```

**Expected Response:**
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

### Step 2: Get Availability (Using twilioPhone - No separate discovery needed!)
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

### Step 3: Book Appointment (Using twilioPhone - No separate discovery needed!)
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

### Step 4: Get Client Info (Using twilioPhone - No separate discovery needed!)
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704911",
    "phone": "+19058363456"
  }'
```

## 5. Testing Error Scenarios

### Test Non-Existent Agent
```bash
curl -X POST "https://api.v1.affinitydesign.ca/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "+18632704999"
  }'
```

### Test Duplicate Agent Addition
```bash
curl -X POST "https://api.v1.affinitydesign.ca/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_456",
    "twilioPhoneNumber": "+18632704914",
    "agentName": "Duplicate Agent"
  }'
```

### Test Invalid Client ID
```bash
curl -X POST "https://api.v1.affinitydesign.ca/admin/clients/INVALID_CLIENT_ID/agents" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_test",
    "twilioPhoneNumber": "+18632704914"
  }'
```

## 6. Batch Testing Script

Create a file `test-multi-agent.sh`:

```bash
#!/bin/bash

# Set your admin token
export ADMIN_TOKEN="your_admin_token_here"
export BASE_URL="https://api.v1.affinitydesign.ca"
export TWILIO_PHONE="+18632704920"

echo "=== Multi-Agent Testing Script ==="

# Test 1: Add additional agent
echo "1. Adding additional agent..."
curl -X POST "$BASE_URL/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test_agent_123",
    "twilioPhoneNumber": "'$TWILIO_PHONE'",
    "agentName": "Test Agent",
    "agentType": "both"
  }'

echo -e "\n\n"

# Test 2: Discover client by new agent
echo "2. Discovering client by new agent..."
curl -X POST "$BASE_URL/tools/discover-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "'$TWILIO_PHONE'"
  }'

echo -e "\n\n"

# Test 3: Get availability using twilioPhone
echo "3. Getting availability using twilioPhone..."
curl -X POST "$BASE_URL/tools/get-availability" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "'$TWILIO_PHONE'",
    "startDate": "2025-07-04",
    "endDate": "2025-07-11",
    "timezone": "America/New_York"
  }'

echo -e "\n\n"

# Test 4: Get client info using twilioPhone
echo "4. Getting client info using twilioPhone..."
curl -X POST "$BASE_URL/tools/get-info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioPhone": "'$TWILIO_PHONE'",
    "phone": "+19058363456"
  }'

echo -e "\n\n"

# Test 5: Remove agent
echo "5. Removing agent..."
curl -X DELETE "$BASE_URL/admin/clients/5C3JSOVVFiVmBoh8mv3I/agents/test_agent_123" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo -e "\n\n=== Testing Complete ==="
```

Make it executable:
```bash
chmod +x test-multi-agent.sh
./test-multi-agent.sh
```

## 7. PowerShell Commands (Windows)

For Windows users, here are PowerShell equivalents:

### Set Admin Token
```powershell
$adminToken = "your_admin_token_here"
$headers = @{ "Authorization" = "Bearer $adminToken"; "Content-Type" = "application/json" }
```

### Get Availability
```powershell
$body = @{
    twilioPhone = "+18632704911"
    startDate = "2025-07-04"
    endDate = "2025-07-11"
    timezone = "America/New_York"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/tools/get-availability" -Method Post -Headers $headers -Body $body
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

Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/tools/book-appointment" -Method Post -Headers $headers -Body $body
```

### Get Client Info
```powershell
$body = @{
    twilioPhone = "+18632704911"
    phone = "+19058363456"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/tools/get-info" -Method Post -Headers $headers -Body $body
```

## 8. Response Examples

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
  "allAgents": [
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

### Error Response Examples
```json
{
  "error": "Client not found",
  "requestId": "abc123",
  "searchedFor": {
    "twilioPhone": "+18632704999"
  },
  "note": "Ensure the Twilio phone number matches a client's twilioPhoneNumber field"
}
```

## Notes

1. **Replace placeholders**: Update `YOUR_ADMIN_KEY`, `your_admin_token_here`, and client IDs with actual values
2. **Server URL**: Change `http://localhost:3000` to your actual server URL
3. **Phone numbers**: Use actual phone numbers from your system
4. **Date formats**: Use ISO 8601 format for dates: `YYYY-MM-DDTHH:MM:SS.sssZ`
5. **Testing**: Always test in a development environment first
6. **Rate limiting**: Be mindful of API rate limits when batch testing
