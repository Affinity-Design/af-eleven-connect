# Phase 5: Historical Data Bootstrap - Implementation Guide

## Overview

Phase 5 implements comprehensive historical data import capabilities, allowing you to backfill agent metrics from existing ElevenLabs conversations and GoHighLevel appointments. This enables you to have complete historical reporting even for data that existed before the metrics tracking system was implemented.

## Key Features

### 1. GoHighLevel Appointments Integration

- **Appointment Fetching**: Retrieve historical appointments from GHL calendars
- **Booking Correlation**: Automatically correlate successful bookings with agent metrics
- **Monthly Aggregation**: Group appointment data by month for consistent reporting
- **Status Filtering**: Only count confirmed/showed appointments as successful bookings

### 2. Comprehensive Import System

- **Batch Processing**: Process multiple months efficiently with configurable batch sizes
- **Parallel Operations**: Import ElevenLabs and GHL data simultaneously when possible
- **Error Recovery**: Continue processing even if individual months fail
- **Progress Tracking**: Detailed logging and progress reporting throughout import

### 3. Data Validation

- **Integrity Checks**: Validate imported data for consistency and realistic ratios
- **Gap Detection**: Identify months with missing data
- **Quality Assurance**: Flag unrealistic booking rates or data anomalies

## API Endpoints

### Bootstrap Endpoints

#### 1. Get Appointment Counts

```http
GET /admin/bootstrap/appointments/counts?clientId=CLIENT_ID&year=2024&month=11
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Response:**

```json
{
  "success": true,
  "message": "Appointment counts retrieved successfully",
  "data": {
    "success": true,
    "clientId": "CLIENT_ID",
    "period": "2024-11",
    "totalBookings": 15,
    "totalAppointments": 18,
    "agentBookings": {
      "agent_1": {
        "agentId": "agent_1",
        "agentName": "John Doe",
        "bookingCount": 15,
        "appointments": [...]
      }
    },
    "dateRange": {
      "start": "2024-11-01T00:00:00.000Z",
      "end": "2024-11-30T23:59:59.000Z"
    }
  }
}
```

#### 2. Sync Appointment Metrics

```http
POST /admin/bootstrap/appointments/sync
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "clientId": "CLIENT_ID",
  "year": 2024,
  "month": 11
}
```

**Response:**

```json
{
  "success": true,
  "message": "Appointment metrics synced for period 2024-11",
  "data": {
    "success": true,
    "period": "2024-11",
    "clientId": "CLIENT_ID",
    "totalAppointments": 18,
    "totalConfirmedBookings": 15,
    "agentUpdates": {
      "agent_1": {
        "agentName": "John Doe",
        "previousBookings": 0,
        "newBookings": 15,
        "appointmentsFound": 15
      }
    }
  }
}
```

#### 3. Get Historical Appointments

```http
GET /admin/bootstrap/appointments/historical?clientId=CLIENT_ID&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer YOUR_ADMIN_TOKEN
```

#### 4. Bulk Sync

```http
POST /admin/bootstrap/bulk-sync
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "clientId": "CLIENT_ID",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "syncElevenLabs": true,
  "syncAppointments": true
}
```

#### 5. Comprehensive Historical Import

```http
POST /admin/bootstrap/import-historical
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "clientId": "CLIENT_ID",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "includeElevenLabs": true,
  "includeAppointments": true,
  "skipExisting": false,
  "batchSize": 3
}
```

**Parameters:**

- `includeElevenLabs`: Whether to import ElevenLabs conversation data
- `includeAppointments`: Whether to import GoHighLevel appointment data
- `skipExisting`: Skip months that already have data (useful for incremental imports)
- `batchSize`: Number of months to process in parallel (1-12, default 3)

#### 6. Validate Historical Data

```http
GET /admin/bootstrap/validate?clientId=CLIENT_ID&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Response:**

```json
{
  "success": true,
  "message": "Validation completed. 8/12 months have data.",
  "data": {
    "clientId": "CLIENT_ID",
    "totalMonths": 12,
    "monthsWithData": 8,
    "monthsWithoutData": 4,
    "dataGaps": ["2024-01", "2024-02", "2024-05", "2024-08"],
    "consistency": {
      "totalChecks": 3,
      "passedChecks": 3,
      "failedChecks": 0,
      "issues": []
    }
  }
}
```

## Implementation Steps

### Step 1: Test Appointment Access

Before importing historical data, verify that the client has proper GHL integration:

```powershell
$token = "YOUR_ADMIN_TOKEN"
$clientId = "YOUR_CLIENT_ID"

# Test appointment access for a recent month
Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/bootstrap/appointments/counts?clientId=$clientId&year=2024&month=11" -Method GET -Headers @{"Authorization"="Bearer $token"} | ConvertTo-Json -Depth 5
```

### Step 2: Validate Data Range

Check what data is available before running a full import:

```powershell
# Validate data for the last 6 months
$startDate = "2024-06-01"
$endDate = "2024-11-30"

Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/bootstrap/validate?clientId=$clientId&startDate=$startDate&endDate=$endDate" -Method GET -Headers @{"Authorization"="Bearer $token"} | ConvertTo-Json -Depth 5
```

### Step 3: Run Historical Import

Execute the comprehensive import for your desired date range:

```powershell
$importBody = @{
    clientId = $clientId
    startDate = "2024-01-01"
    endDate = "2024-11-30"
    includeElevenLabs = $true
    includeAppointments = $true
    skipExisting = $false
    batchSize = 3
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/bootstrap/import-historical" -Method POST -Body $importBody -ContentType "application/json" -Headers @{"Authorization"="Bearer $token"} | ConvertTo-Json -Depth 5
```

### Step 4: Verify Import Results

Check the dashboard to confirm imported data:

```powershell
# Check dashboard summary
Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/reports/dashboard-summary?clientId=$clientId" -Method GET -Headers @{"Authorization"="Bearer $token"} | ConvertTo-Json -Depth 3

# Check combined metrics for specific period
Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/reports/combined-metrics?clientId=$clientId&startYear=2024&startMonth=1&endYear=2024&endMonth=11" -Method GET -Headers @{"Authorization"="Bearer $token"} | ConvertTo-Json -Depth 4
```

## Best Practices

### 1. Incremental Imports

For large date ranges, consider importing in smaller chunks:

```powershell
# Import quarter by quarter
$quarters = @(
    @{ start = "2024-01-01"; end = "2024-03-31" },
    @{ start = "2024-04-01"; end = "2024-06-30" },
    @{ start = "2024-07-01"; end = "2024-09-30" },
    @{ start = "2024-10-01"; end = "2024-12-31" }
)

foreach ($quarter in $quarters) {
    $importBody = @{
        clientId = $clientId
        startDate = $quarter.start
        endDate = $quarter.end
        includeElevenLabs = $true
        includeAppointments = $true
        skipExisting = $true
        batchSize = 3
    } | ConvertTo-Json

    Write-Host "Importing quarter: $($quarter.start) to $($quarter.end)"
    $result = Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/bootstrap/import-historical" -Method POST -Body $importBody -ContentType "application/json" -Headers @{"Authorization"="Bearer $token"}
    Write-Host "Result: $($result.message)"
}
```

### 2. Error Handling

Always check import results and handle partial failures:

```powershell
$result = Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/bootstrap/import-historical" -Method POST -Body $importBody -ContentType "application/json" -Headers @{"Authorization"="Bearer $token"}

if ($result.success) {
    $data = $result.data
    Write-Host "Import completed: $($data.successfulMonths)/$($data.totalMonths) months successful"

    if ($data.errorMonths -gt 0) {
        Write-Host "Errors occurred in $($data.errorMonths) months. Check logs for details."
    }
} else {
    Write-Error "Import failed: $($result.error)"
}
```

### 3. Data Validation

Always validate after importing:

```powershell
$validation = Invoke-RestMethod -Uri "https://api.v1.affinitydesign.ca/admin/bootstrap/validate?clientId=$clientId&startDate=2024-01-01&endDate=2024-11-30" -Method GET -Headers @{"Authorization"="Bearer $token"}

if ($validation.data.consistency.failedChecks -gt 0) {
    Write-Warning "Data consistency issues found:"
    foreach ($issue in $validation.data.consistency.issues) {
        Write-Host "- $($issue.type): Agent $($issue.agentName) ($($issue.agentId))"
    }
}
```

## Integration Points

### 1. GoHighLevel Requirements

- Client must have valid `refreshToken` in database
- Client must have `calId` (calendar ID) configured
- GHL API access must be working (test with `/admin/ghl/test-integration`)

### 2. ElevenLabs Requirements

- Client must have `elevenLabsAgentId` configured
- ElevenLabs API key must be valid
- Conversation history must be accessible via ElevenLabs API

### 3. Database Schema

The import process uses the existing agent metrics schema:

- `agentMetrics`: Current month aggregates
- `agentMetricsHistory`: Historical monthly data
- `callHistory`: Individual call records (if available)

## Troubleshooting

### Common Issues

1. **GHL Integration Not Working**

   - Verify client has `refreshToken` and `calId`
   - Test GHL integration endpoint first
   - Check GHL API quotas and rate limits

2. **ElevenLabs API Errors**

   - Verify `elevenLabsAgentId` is correct
   - Check ElevenLabs API key validity
   - Monitor rate limits (6000 requests per minute)

3. **Partial Import Success**

   - Review error logs for specific month failures
   - Use `skipExisting: true` to retry only failed months
   - Reduce `batchSize` if hitting rate limits

4. **Data Consistency Issues**
   - Review validation results
   - Check for duplicate imports
   - Verify agent ID mappings are correct

### Logging

All import operations are logged with detailed information:

- Progress updates for each batch
- Individual month results
- Error details for failed operations
- Summary statistics

Check application logs for detailed troubleshooting information.

## Phase 5 Completion

With Phase 5 implemented, your metrics tracking system now includes:

✅ **Phase 1**: Database Schema Extensions  
✅ **Phase 2**: Utility Functions  
✅ **Phase 3**: Admin API Endpoints  
✅ **Phase 4**: Real-time Tracking Integration  
✅ **Phase 5**: Historical Data Bootstrap

The system is now complete and can provide comprehensive metrics reporting from both historical data and ongoing real-time tracking.
