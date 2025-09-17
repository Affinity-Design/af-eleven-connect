# Agent Metrics and Reporting System Implementation Proposal

## Overview

This proposal outlines the implementation of a comprehensive agent metrics tracking and reporting system for the AF Eleven Connect platform. The system will track inbound/outbound calls, successful bookings, and provide historical reporting capabilities through ElevenLabs API integration and GoHighLevel appointment data.

## Objectives

- Track agent call metrics (inbound/outbound direction)
- Monitor successful appointment bookings per agent
- Store monthly historical data for reporting
- Create admin endpoints for metrics retrieval
- Integrate with ElevenLabs API for historical data
- Query GoHighLevel for appointment tracking

## Implementation Phases

### Phase 1: Database Schema Extensions ✅

**Estimated Time**: 2-3 hours
**Status**: Completed

#### 1.1 Agent Metrics Schema Integration

- [x] Add `agentMetricsSchema` to client.js
- [x] Add `agentMetricsHistorySchema` to client.js
- [x] Update main `clientSchema` to include `metricsHistory` array
- [x] Add database indexes for metrics queries
- [x] Test schema changes with sample data

#### 1.2 Call History Schema Extensions

- [x] Add `direction` field ("inbound" | "outbound")
- [x] Add `isBookingSuccessful` boolean field
- [x] Add `elevenLabsConversationId` for correlation
- [x] Update existing call tracking to use new fields

**Deliverables**:

- ✅ Updated `client.js` with metrics schemas
- ✅ Database migration compatibility
- ✅ Enhanced call history tracking

---

### Phase 2: Utility Functions ✅

**Estimated Time**: 4-5 hours
**Status**: Completed

#### 2.1 ElevenLabs Integration (`utils/elevenlabs.js`)

- [x] Create conversation fetching functions
- [x] Implement pagination handling
- [x] Add monthly metrics calculation
- [x] Create data format conversion utilities
- [x] Add error handling and retry logic

#### 2.2 Metrics Management (`utils/metrics.js`)

- [x] Implement call count incrementing
- [x] Create booking success tracking
- [x] Add monthly summary calculations
- [x] Build metrics merging functions
- [x] Create period comparison utilities

#### 2.3 GHL Appointments Integration (`utils/ghl-appointments.js`)

- [ ] Implement historical appointment fetching
- [ ] Add agent correlation logic
- [ ] Create booking count calculations
- [ ] Add date range filtering

**Deliverables**:

- ✅ Two utility modules with comprehensive functions (elevenlabs.js, metrics.js)
- [ ] Unit tests for key functions
- [ ] Documentation for utility APIs

---

### Phase 3: Admin API Endpoints ✅

**Estimated Time**: 3-4 hours
**Status**: Completed

#### 3.1 Metrics Collection Endpoints

- [x] `POST /admin/metrics/sync-elevenlabs` - Sync ElevenLabs data
- [x] `POST /admin/metrics/recalculate` - Recalculate metrics from history
- [ ] `POST /admin/metrics/sync-appointments` - Sync GHL appointment data

#### 3.2 Reporting Endpoints

- [x] `GET /admin/reports/agent-metrics/:agentId` - Single agent metrics
- [x] `GET /admin/reports/combined-metrics` - All agents metrics
- [x] `GET /admin/reports/period-comparison` - Period comparisons
- [x] `GET /admin/reports/dashboard-summary` - Dashboard data

**Deliverables**:

- ✅ Admin routes with full CRUD operations
- ✅ Comprehensive error handling
- ✅ API documentation
- ✅ Endpoint testing (all endpoints tested successfully)

---

### Phase 4: Real-time Tracking Integration ✅

**Estimated Time**: 2-3 hours
**Status**: Completed

#### 4.1 Call Flow Modifications

- [x] Update `/get-info` endpoint for inbound call tracking
- [x] Modify `/make-outbound-call` endpoint for outbound tracking
- [x] Enhance `/book-appointment` endpoint for booking success tracking (both main and tools endpoints)
- [x] Add metrics updating to call completion flows

#### 4.2 Metrics Middleware

- [x] Create automatic metrics updating in existing endpoints
- [x] Add call start tracking hooks
- [x] Implement error recovery for metrics updates (non-blocking)

**Deliverables**:

- ✅ Real-time metrics updating
- ✅ Call completion tracking
- ✅ Automated metrics maintenance

---

### Phase 5: Historical Data Bootstrap ⏳

**Estimated Time**: 2-3 hours
**Status**: Pending

#### 5.1 ElevenLabs Historical Import

- [ ] Create bulk import tools for ElevenLabs conversations
- [ ] Add progress tracking for large imports
- [ ] Implement data validation and cleanup
- [ ] Create import scheduling capabilities

#### 5.2 GHL Historical Import

- [ ] Build appointment history import tools
- [ ] Add agent association logic
- [ ] Create data correlation utilities
- [ ] Implement duplicate detection

**Deliverables**:

- Historical data import tools
- Data validation utilities
- Import progress tracking

---

## Technical Specifications

### Database Schema Changes

#### Agent Metrics Schema

```javascript
const agentMetricsSchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    inboundCalls: { type: Number, default: 0 },
    outboundCalls: { type: Number, default: 0 },
    totalCalls: { type: Number, default: 0 },
    successfulBookings: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 }, // in seconds
    averageDuration: { type: Number, default: 0 }, // in seconds
    callsFromElevenlabs: { type: Number, default: 0 },
    elevenlabsSuccessRate: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);
```

#### Call History Extensions

```javascript
// Additional fields to callDataSchema:
direction: {
  type: String,
  enum: ["inbound", "outbound"],
  required: true
},
isBookingSuccessful: { type: Boolean, default: false },
elevenLabsConversationId: { type: String }
```

### API Endpoints

#### Reporting Endpoints

- `GET /admin/reports/agent-metrics/:agentId?year=2025&month=3`
- `GET /admin/reports/combined-metrics?clientId=xxx&year=2025&month=3`
- `GET /admin/reports/period-comparison?agentId=xxx&startPeriod=2025-02&endPeriod=2025-03`

#### Data Sync Endpoints

- `POST /admin/metrics/sync-elevenlabs` - Body: `{agentId, year, month}`
- `POST /admin/metrics/sync-appointments` - Body: `{clientId, year, month}`

### ElevenLabs API Integration

#### Conversation Fetching

```javascript
// Endpoint: https://api.elevenlabs.io/v1/convai/conversations
// Parameters: agent_id, cursor (for pagination)
// Response: conversations[], next_cursor
```

#### Data Processing

- Group conversations by month using `start_time_unix_secs`
- Calculate success rates using `call_successful` field
- Track duration using `call_duration_secs`

### GoHighLevel Integration

#### Appointment Queries

- Use existing GHL integration for calendar access
- Query appointments by date range and calendar ID
- Correlate appointments with agent data through client records

## Success Criteria

### Phase 1 Success Criteria ✅

- [x] Database schema successfully updated
- [x] No breaking changes to existing functionality
- [x] Sample metrics data can be stored and retrieved
- [x] All existing tests pass

### Phase 2 Success Criteria ✅

- [x] ElevenLabs API successfully returns conversation data
- [x] Metrics calculations produce accurate monthly summaries
- [ ] GHL appointment data can be retrieved and processed (pending GHL integration)
- [x] Utility functions handle errors gracefully

### Phase 3 Success Criteria ✅

- [x] All admin endpoints return proper responses
- [x] Metrics data can be queried by agent and period
- [x] Combined metrics show data from multiple sources
- [x] API documentation is complete and accurate

### Phase 4 Success Criteria ✅

- [x] Real-time call tracking increments metrics automatically
- [x] Booking success is tracked when appointments are created
- [x] No performance degradation in call handling (non-blocking metrics updates)
- [x] Metrics are consistently updated

### Phase 5 Success Criteria

- [ ] Historical data can be imported without errors
- [ ] Data correlation works correctly
- [ ] Import tools handle large datasets efficiently
- [ ] Duplicate data is prevented

## Testing Strategy

### Local Testing

- Use local development environment
- Test with sample agent and call data
- Verify database operations
- Test utility functions independently

### Production Testing

- Deploy to https://api.v1.affinitydesign.ca
- Test with real agent data
- Verify ElevenLabs API integration
- Test GHL appointment queries
- Validate metrics calculations

### Test Data Requirements

- Sample agent IDs for testing
- Test conversation data from ElevenLabs
- Sample appointment data from GHL
- Multiple months of data for period comparisons

## Risk Assessment

### Technical Risks

- **Database Migration**: Schema changes could affect existing data
  - _Mitigation_: Careful testing, backwards compatibility
- **ElevenLabs API Limits**: Rate limiting could slow imports
  - _Mitigation_: Implement retry logic, batch processing
- **Data Correlation**: Matching ElevenLabs data to agents could be complex
  - _Mitigation_: Clear mapping strategy, validation tools

### Performance Risks

- **Large Data Sets**: Historical imports could be slow
  - _Mitigation_: Pagination, background processing
- **Real-time Updates**: Metrics updates could slow call processing
  - _Mitigation_: Async processing, database optimization

## Timeline

- **Week 1**: Phase 1 (Database Schema)
- **Week 1-2**: Phase 2 (Utility Functions)
- **Week 2**: Phase 3 (API Endpoints)
- **Week 2-3**: Phase 4 (Real-time Integration)
- **Week 3**: Phase 5 (Historical Import)

**Total Estimated Time**: 14-18 hours across 3 weeks

## Success Metrics

1. **Functionality**: All planned endpoints working correctly
2. **Data Accuracy**: Metrics match actual call and booking data
3. **Performance**: No degradation in existing call handling
4. **Usability**: Clear API documentation and easy-to-use endpoints
5. **Reliability**: Error handling and data validation working properly

---

_This proposal will be updated as implementation progresses, with checkmarks indicating completed tasks._
