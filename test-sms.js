// test-sms.js
/**
 * Test script for SMS functionality
 * Run with: node test-sms.js
 */

import fetch from "node-fetch";

const BASE_URL = "http://localhost:8000";

// Test configuration - UPDATE THESE VALUES
const CLIENT_TOKEN = "YOUR_CLIENT_JWT_TOKEN"; // Get from /auth/client/login
const TEST_PHONE = "+1234567890"; // Replace with actual phone number

async function testSendSMS() {
  console.log("\n=== Testing SMS Send Endpoint ===\n");

  try {
    const response = await fetch(`${BASE_URL}/secure/send-sms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLIENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: TEST_PHONE,
        body: "This is a test message from AF Eleven Connect. Your SMS integration is working! 🎉",
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ SMS sent successfully!");
      console.log("Message SID:", data.messageSid);
      console.log("Status:", data.status);
      console.log("To:", data.to);
      console.log("From:", data.from);
      console.log("Date Created:", data.dateCreated);
    } else {
      console.log("❌ Error sending SMS:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
  }
}

async function testAppointmentBookingWithSMS() {
  console.log(
    "\n=== Testing Appointment Booking (includes automatic SMS) ===\n"
  );
  console.log(
    "Note: Use the /tools/book-appointment endpoint with admin token"
  );
  console.log(
    "SMS confirmation will be sent automatically after successful booking\n"
  );

  console.log("Example curl command:");
  console.log(`
curl -X POST ${BASE_URL}/tools/book-appointment \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "clientId": "YOUR_CLIENT_ID",
    "phone": "${TEST_PHONE}",
    "startTime": "2025-11-25T10:00:00-05:00",
    "endTime": "2025-11-25T11:00:00-05:00",
    "meeting_title": "Consultation"
  }'
  `);
}

// Run tests
console.log("AF Eleven Connect - SMS Testing");
console.log("================================");
console.log("\nBefore running these tests:");
console.log("1. Update CLIENT_TOKEN with your actual JWT token");
console.log("2. Update TEST_PHONE with a valid phone number");
console.log("3. Ensure server is running on port 8000");
console.log("4. Get client token via: POST /auth/client/login");

if (CLIENT_TOKEN === "YOUR_CLIENT_JWT_TOKEN") {
  console.log(
    "\n⚠️  Please update CLIENT_TOKEN in the script before running tests\n"
  );
  testAppointmentBookingWithSMS();
} else {
  testSendSMS();
  testAppointmentBookingWithSMS();
}
