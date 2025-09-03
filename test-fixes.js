// test-fixes.js
// Test script to validate the fixes for ElevenLabs and GHL sync issues

import dotenv from "dotenv";
import {
  fetchElevenLabsHistory,
  aggregateElevenLabsMetrics,
} from "./utils/elevenlabs.js";
import { checkAndRefreshToken } from "./utils/ghl.js";

dotenv.config();

async function testElevenLabsSync() {
  console.log("=== Testing ElevenLabs Sync for August 2025 ===\n");

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY not found in environment");
    return;
  }

  try {
    // Test August 2025 specifically
    const startDate = new Date(2025, 7, 1); // August 1, 2025
    const endDate = new Date(2025, 7, 31, 23, 59, 59, 999); // August 31, 2025

    console.log(`Fetching ElevenLabs data for August 2025:`);
    console.log(`Start: ${startDate.toISOString()}`);
    console.log(`End: ${endDate.toISOString()}`);

    const response = await fetchElevenLabsHistory(apiKey, {
      startDate,
      endDate,
      pageSize: 100, // Smaller page size for testing
    });

    const records = response.history || response.conversations || [];
    console.log(`\nFetched ${records.length} records`);

    if (records.length > 0) {
      console.log("\nSample records:");
      records.slice(0, 3).forEach((record, index) => {
        console.log(`\nRecord ${index + 1}:`, {
          id: record.id,
          created_at: record.created_at,
          direction: record.direction || record.call_direction,
          duration: record.duration || record.call_duration,
          status: record.status || record.call_status,
        });
      });

      // Test aggregation
      console.log("\n=== Testing Aggregation ===");
      const metrics = aggregateElevenLabsMetrics(records);
      console.log("Aggregated metrics:", metrics);

      if (metrics.totalCalls > 0) {
        console.log(
          `✅ SUCCESS: Found ${metrics.totalCalls} calls in August 2025`
        );
        console.log(`   - Inbound: ${metrics.inboundCalls}`);
        console.log(`   - Outbound: ${metrics.outboundCalls}`);
        console.log(`   - Successful: ${metrics.successfulCalls}`);
        console.log(`   - Failed: ${metrics.failedCalls}`);
        console.log(`   - Total Duration: ${metrics.totalDuration}s`);
        console.log(
          `   - Average Duration: ${metrics.averageDuration.toFixed(1)}s`
        );
      } else {
        console.log("⚠️  WARNING: No calls found in aggregation");
      }
    } else {
      console.log("❌ ISSUE: No records returned for August 2025");
      console.log("This suggests either:");
      console.log("1. No data exists for this period");
      console.log("2. Date range is incorrect");
      console.log("3. API endpoint is not returning the expected data");
    }
  } catch (error) {
    console.error("❌ ElevenLabs test failed:", error.message);
  }
}

async function testGHLSync() {
  console.log("\n\n=== Testing GHL Token Check ===\n");

  // Test with the provided client ID
  const testClientId = "IQUPST2vTUl67YUYZYDy";

  try {
    console.log(`Testing GHL token check for client: ${testClientId}`);

    const tokenData = await checkAndRefreshToken(testClientId);

    console.log("✅ SUCCESS: GHL token check passed");
    console.log(
      `   - Access token: ${tokenData.accessToken.substring(0, 20)}...`
    );
    console.log(`   - Location ID: ${tokenData.locationId}`);
    console.log(`   - Client found: ${!!tokenData.clientData}`);
  } catch (error) {
    console.error("❌ GHL token check failed:", error.message);
    console.log("\nThis could be due to:");
    console.log("1. Client ID not found in database");
    console.log("2. No refresh token available");
    console.log("3. Token refresh failed");
    console.log("4. GHL API authentication issues");
  }
}

async function runTests() {
  console.log("🔧 Running fixes validation tests...\n");

  await testElevenLabsSync();
  await testGHLSync();

  console.log("\n✅ Tests completed!");
  console.log("\nNext steps:");
  console.log(
    "1. If ElevenLabs shows 0 calls, check the API endpoint and date range"
  );
  console.log("2. If GHL fails, ensure the client has valid refresh tokens");
  console.log(
    "3. Test the actual sync endpoints after these basic checks pass"
  );
}

// Run the tests
runTests().catch(console.error);
