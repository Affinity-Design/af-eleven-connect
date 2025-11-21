// utils/sms.js
/**
 * Utility functions for sending SMS messages via Twilio
 */

import Twilio from "twilio";
import Client from "../client.js";

const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send an SMS message
 * @param {string} to - Recipient phone number (E.164 format)
 * @param {string} from - Sender phone number (E.164 format, must be Twilio number)
 * @param {string} body - Message body (max 1600 characters)
 * @returns {Promise<Object>} - Twilio message response
 */
export async function sendSMS(to, from, body) {
  try {
    console.log(`[SMS] Sending message to ${to} from ${from}`);

    // Validate inputs
    if (!to || !from || !body) {
      throw new Error(
        "Missing required parameters: to, from, and body are required"
      );
    }

    if (body.length > 1600) {
      console.warn(
        `[SMS] Message body exceeds 1600 characters, will be split into multiple messages`
      );
    }

    const message = await twilioClient.messages.create({
      to,
      from,
      body,
    });

    console.log(`[SMS] Message sent successfully: ${message.sid}`);

    return {
      success: true,
      messageSid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body,
      dateCreated: message.dateCreated,
    };
  } catch (error) {
    console.error(`[SMS] Error sending message:`, error);
    throw error;
  }
}

/**
 * Send a confirmation SMS for a booked appointment
 * @param {string} clientId - Client ID to get business info
 * @param {string} phone - Customer phone number
 * @param {Object} appointmentDetails - Appointment details
 * @param {string} appointmentDetails.contactName - Contact's first name (optional)
 * @param {string} appointmentDetails.startTime - Appointment start time
 * @param {string} appointmentDetails.endTime - Appointment end time
 * @param {string} appointmentDetails.title - Appointment title
 * @param {string} appointmentDetails.address - Meeting location
 * @returns {Promise<Object>} - SMS send result
 */
export async function sendAppointmentConfirmationSMS(
  clientId,
  phone,
  appointmentDetails
) {
  try {
    const client = await Client.findOne({ clientId });

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Get the from number (use primary Twilio number)
    const fromNumber = client.twilioPhoneNumber;

    if (!fromNumber) {
      throw new Error(
        `No Twilio phone number configured for client: ${clientId}`
      );
    }

    // Format the appointment date/time
    const startTime = new Date(appointmentDetails.startTime);
    const formattedDate = startTime.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = startTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // Build the confirmation message with dynamic fields
    const contactName = appointmentDetails.contactName || "there";
    const businessName = client.clientMeta?.businessName || "our office";
    const title = appointmentDetails.title || "your appointment";
    const location = appointmentDetails.address || "TBD";

    const messageBody = `Hi ${contactName}! Your appointment with ${businessName} has been confirmed.\n\n📅 ${formattedDate}\n🕒 ${formattedTime}\n📍 ${location}\n\nWe look forward to seeing you!`;

    console.log(
      `[SMS] Sending appointment confirmation to ${phone} (${contactName})`
    );

    return await sendSMS(phone, fromNumber, messageBody);
  } catch (error) {
    console.error(`[SMS] Error sending appointment confirmation:`, error);
    throw error;
  }
}
