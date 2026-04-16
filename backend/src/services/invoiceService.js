const prisma = require('../lib/prisma');
const fs = require('fs');
const path = require('path');

function renderInvoiceHtml(bill) {
  const itemsHtml = (bill.items || []).map(i => `
    <tr>
      <td>${i.cylinderNumber || (i.cylinder && i.cylinder.cylinderNumber) || ''}</td>
      <td style="text-align:right">${i.quantityCum || ''}</td>
      <td style="text-align:right">${bill.unitRate || ''}</td>
      <td style="text-align:right">${((i.quantityCum || 0) * (bill.unitRate || 0)).toFixed(2)}</td>
    </tr>`).join('\n');

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${bill.billNumber}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 20px }
      table { border-collapse: collapse; width: 100% }
      td, th { border: 1px solid #ddd; padding: 8px }
      th { background: #f3f3f3 }
    </style>
  </head>
  <body>
    <h2>Invoice: ${bill.billNumber}</h2>
    <div>Bill Date: ${new Date(bill.billDate).toLocaleDateString()}</div>
    <div>Customer: ${bill.customer?.name || ''} (${bill.customer?.code || ''})</div>
    <hr />
    <table>
      <thead>
        <tr><th>Cylinder</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    <h3>Total: ${bill.totalAmount || ''}</h3>
  </body>
  </html>`;
}

async function generateInvoicePdf(billId) {
  const bill = await prisma.bill.findUnique({ where: { id: billId }, include: { customer: true, items: true } });
  if (!bill) throw new Error('Bill not found');

  const html = renderInvoiceHtml(bill);
  const uploadsDir = path.join(__dirname, '../../uploads/bills');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const safeName = String(bill.billNumber).replace(/[\\/:*?"<>|\s]+/g, '-');
  const pdfPath = path.join(uploadsDir, `${safeName}.pdf`);

  try {
    // Prefer Puppeteer if installed
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();
    return pdfPath;
  } catch (err) {
    // Fallback: save HTML if puppeteer not available
    const htmlPath = pdfPath.replace(/\.pdf$/, '.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    return htmlPath;
  }
}

async function getOrGeneratePdf(billId) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error('Bill not found');
  const uploadsDir = path.join(__dirname, '../../uploads/bills');
  const safeName = String(bill.billNumber).replace(/[\\/:*?"<>|\s]+/g, '-');
  const pdfPath = path.join(uploadsDir, `${safeName}.pdf`);
  if (fs.existsSync(pdfPath)) return pdfPath;
  return await generateInvoicePdf(billId);
}

module.exports = { generateInvoicePdf, getOrGeneratePdf };
