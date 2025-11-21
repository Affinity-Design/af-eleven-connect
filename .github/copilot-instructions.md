# AF Eleven Connect - AI Agent Instructions

## Project Overview

This is a **Fastify-based telephony integration server** that connects **ElevenLabs Conversational AI** with **Twilio** for inbound/outbound calls and **Go High Level (GHL)** for CRM/calendar operations. It supports multi-tenant architecture where each "client" represents a business with one or more AI agents.

**Core Tech Stack:** Node.js (ES modules), Fastify, MongoDB (mongoose), Twilio SDK, WebSockets, JWT auth

## Architecture Overview

### Multi-Tenant Client Model

- **Client** = A business using the platform (stored in MongoDB via `client.js` schema)
- Each client can have:
  - Primary agent (backwards compatible legacy field: `agentId`, `twilioPhoneNumber`)
  - Additional agents array (`additionalAgents[]`) for multi-agent support
  - GHL OAuth integration (`accessToken`, `refreshToken`, `locationId`, `calId`)
  - Call history with metrics tracking (`callHistory[]`, `agentMetrics[]`)

### Agent Discovery Priority (Critical for ElevenLabs tools)

When tools receive calls, client lookup follows this priority:

1. **twilioPhone** (most reliable) → checks primary + additional agents
2. **clientId** (direct lookup)
3. **agentId** → checks primary + additional agents
4. **phone** (customer phone - least reliable)

See `routes/tools.js` `/discover-client` endpoint and `utils/ghl.js` `findClientForTool()`.

### Route Organization

```
/                       - Health check
/status                 - Server status + MongoDB connection
/auth/*                 - Login endpoints (admin/client) [routes/auth.js]
/admin/*                - Admin-only operations (client CRUD, metrics, reports) [routes/admin.js]
/secure/*               - Client-authenticated endpoints [routes/client.js]
/tools/*                - Admin-authenticated tools for ElevenLabs agents [routes/tools.js]
/integrations/*         - GHL OAuth flows [routes/integrations.js]
/media-stream           - Inbound WebSocket (ElevenLabs ↔ Twilio) [index.js]
/outbound-media-stream  - Outbound WebSocket with call tracking [index.js]
/inbound/*              - Inbound call routing with transfer support [inbound-call-with-forwarding.js]
```

## Key Patterns & Conventions

### Authentication Flow

- **JWT-based** with non-expiring tokens (see `auth.js`)
- Two token types: `"admin"` and `"client"` (stored in JWT payload `type` field)
- Admin routes use `authenticateAdmin` preHandler
- Client routes use `authenticateClient` preHandler
- Fallback: Some client endpoints also check legacy `clientToken` field in DB

### GHL Token Management (Critical!)

- GHL tokens expire → **always** use `checkAndRefreshToken(clientId)` before GHL API calls
- Returns: `{accessToken, locationId}` after auto-refreshing if needed
- Implementation: `utils/ghl.js` - handles token expiry buffer (5 min default)
- Failure modes: Throws error if no refresh token → client must re-authorize

### Agent Metrics Tracking

- Auto-tracked on call events via `utils/metrics.js`
- Schema: `agentMetricsSchema` in `client.js` (monthly aggregates per agent)
- Updated by: `incrementCallMetrics(clientId, agentId, direction, duration, isBookingSuccessful)`
- Reports: `GET /admin/reports/agent-metrics/:agentId` and dashboard endpoints

### Call History Pattern

- All calls logged to `client.callHistory[]` via `crud.js` `addCallToHistory()`
- Schema: `callDataSchema` includes `direction`, `callSid`, `agentId`, `status`, `recordingUrl`
- Statuses: `"booked_appointment"`, `"follow_up"`, `"hang_up"`, `"dnc"`, `"no_call_match"`

## Critical Functions & Utilities

### `utils/agentManager.js` - Multi-Agent Operations

```javascript
addAdditionalAgent(clientId, agentData); // Add new agent to client
removeAdditionalAgent(clientId, agentId); // Remove agent
updateAdditionalAgent(clientId, agentId, updates); // Update agent config
incrementAgentCallMetrics(clientId, agentId, metrics); // Update call stats
```

### `utils/ghl.js` - GHL Integration

```javascript
checkAndRefreshToken(clientId); // ALWAYS call before GHL API requests
refreshGhlToken(clientId); // Force token refresh
searchGhlContactByPhone(accessToken, locationId, phone); // Find contact in GHL
findClientForTool(params); // Client discovery for ElevenLabs tools
```

### `utils/elevenlabs.js` - ElevenLabs API

```javascript
fetchElevenLabsHistory(apiKey, options); // Get call history from ElevenLabs
// Tries multiple endpoint patterns (convai/conversations, call-logs, etc.)
```

### `utils/sms.js` - SMS Integration

```javascript
sendSMS(to, from, body); // Send SMS via Twilio (max 1600 chars)
sendAppointmentConfirmationSMS(clientId, phone, appointmentDetails); // Auto-send booking confirmation
```

### Mongoose Schema Helper Methods (`client.js`)

```javascript
client.getAllAgents(); // Returns array of all agents (primary + additional)
client.findAgentById(agentId); // Find specific agent across primary/additional
client.findAgentByPhone(phone); // Find agent by Twilio phone
client.getAgentMetrics(agentId, year, month); // Get metrics for agent/period
client.incrementCallMetrics(agentId, direction, duration, isBooking); // Update metrics
```

## Environment Variables (Required)

```bash
# Core
MONGODB_URI                 # MongoDB connection string
PORT                        # Server port (default: 8000)
SERVER_SECRET               # JWT signing secret

# Twilio
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN

# ElevenLabs
ELEVENLABS_API_KEY

# Go High Level OAuth
GHL_CLIENT_ID
GHL_CLIENT_SECRET
GHL_REDIRECT_URI

# Admin Auth
ADMIN_USERNAME             # Default: 'admin'
ADMIN_PASSWORD             # Default: 'admin123'
```

## Development Workflows

### Running the Server

```bash
npm install
node index.js              # ES modules, no build step
```

### Testing Endpoints

- See `test-api-endpoints.js`, `test-fixes.js`, `test-sync-logic.js` for API testing patterns
- Admin auth: `POST /auth/admin/login` → returns JWT token
- Use in headers: `Authorization: Bearer <token>`

### Adding a New ElevenLabs Tool

1. Add admin-authenticated route in `routes/tools.js`
2. Accept `clientId` in request body (not path param for POST)
3. Use `findClientForTool()` or manual client lookup
4. Call `checkAndRefreshToken(clientId)` before GHL operations
5. Update tool documentation in `docs/`

### WebSocket Call Flow (Outbound)

1. ElevenLabs agent initiates outbound call
2. Server receives WebSocket connection on `/outbound-media-stream`
3. Creates Twilio call with TwiML pointing back to WebSocket
4. Bidirectional audio streaming: Twilio ↔ Server ↔ ElevenLabs
5. Call end: Logs to `callHistory`, updates metrics, sends outcome to GHL/ElevenLabs

### Appointment Booking Flow

1. ElevenLabs agent calls `POST /tools/book-appointment`
2. Client discovery via `findClientForTool()` (twilioPhone → clientId → agentId)
3. GHL token refresh via `checkAndRefreshToken(clientId)`
4. Contact search/creation in GHL via `searchGhlContactByPhone()`
5. Appointment booking to GHL calendar
6. **SMS confirmation automatically sent** via `sendAppointmentConfirmationSMS()`
7. Metrics updated via `updateCallMetrics()`

## Common Pitfalls

1. **Token Expiry**: Never use `client.accessToken` directly for GHL - always call `checkAndRefreshToken()`
2. **Agent Lookup**: When matching by `agentId`/`twilioPhoneNumber`, check both primary AND `additionalAgents[]`
3. **ES Modules**: Use `import`/`export`, not `require()` - file has `"type": "module"` in package.json
4. **Fastify Hooks**: `preHandler` runs before route handler - don't skip auth middleware
5. **Metrics Updates**: Failures in metrics shouldn't fail the main operation - wrap in try/catch
6. **SMS Failures**: SMS errors in booking flow are logged but don't fail the booking
7. **Client Status**: Always filter by `status: "Active"` unless intentionally querying inactive clients

## Documentation References

Key docs in `docs/`:

- `multi-agent-support.md` - Multi-agent architecture & API
- `ElevenLabs-Tool-Integration-Strategy.md` - Tool auth patterns
- `Agent Metrics Implementation Proposal.md` - Metrics schema & endpoints
- `docs/App Functions/crud-endpoints-docs.md` - Client CRUD operations
- `docs/Main Functions/book-appointment-docs.md` - Booking flow

## Code Style Notes

- Logging: Use `console.log()` with prefixes like `[GHL]`, `[ElevenLabs]`, `[${requestId}]`
- Error handling: Return `{error: string, message: string}` with appropriate HTTP codes
- Async/await: Preferred over promises chains
- Request IDs: Generate for tracking: `Date.now().toString(36) + Math.random().toString(36).substr(2, 5)`
