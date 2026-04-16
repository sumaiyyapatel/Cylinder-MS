const prisma = require('../lib/prisma');

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('+')) return digits;
  return `+${digits}`;
}

async function sendViaTwilio(toPhone, body, mediaUrl) {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    if (!accountSid || !authToken) {
      console.warn('[WhatsApp] Twilio credentials missing');
      return false;
    }
    const Twilio = require('twilio');
    const client = Twilio(accountSid, authToken);
    const to = toPhone.startsWith('+') ? `whatsapp:${toPhone}` : `whatsapp:${toPhone}`;
    const opts = { body, from, to };
    if (mediaUrl) opts.mediaUrl = [mediaUrl];
    await client.messages.create(opts);
    return true;
  } catch (err) {
    console.error('[WhatsApp] Twilio send failed:', err.message || err);
    return false;
  }
}

async function sendBillNotification(customerId, billNumber, pdfUrl = null) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } });
    if (!customer || !customer.phone) {
      console.warn('[WhatsApp] sendBillNotification: no phone for customer', customerId);
      return false;
    }
    const phone = normalizePhone(customer.phone);
    const message = `Dear ${customer.name || ''}, your bill ${billNumber} is ready. ${pdfUrl ? 'Download: ' + pdfUrl : ''}`;
    const provider = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase();
    if (provider === 'twilio') return await sendViaTwilio(phone, message, pdfUrl);
    // Other providers can be added here (gupshup, etc.)
    console.log('[WhatsApp] Provider not configured, skipping send:', message);
    return false;
  } catch (err) {
    console.error('sendBillNotification failed:', err.message || err);
    return false;
  }
}

async function sendOverdueAlert(customerId, cylinderNumber, holdDays) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } });
    if (!customer || !customer.phone) {
      console.warn('[WhatsApp] sendOverdueAlert: no phone for customer', customerId);
      return false;
    }
    const phone = normalizePhone(customer.phone);
    const message = `Reminder: Cylinder ${cylinderNumber} has been with you for ${holdDays} days. Please return or contact us.`;
    const provider = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase();
    if (provider === 'twilio') return await sendViaTwilio(phone, message, null);
    console.log('[WhatsApp] Provider not configured, skipping overdue alert:', message);
    return false;
  } catch (err) {
    console.error('sendOverdueAlert failed:', err.message || err);
    return false;
  }
}

module.exports = { sendBillNotification, sendOverdueAlert };
