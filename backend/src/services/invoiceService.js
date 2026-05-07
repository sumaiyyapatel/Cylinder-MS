const prisma = require('../lib/prisma');

function renderInvoiceHtml(bill) {
  const itemsHtml = (bill.items || []).map((item) => `
    <tr>
      <td>${item.cylinderNumber || item.cylinder?.cylinderNumber || ''}</td>
      <td>${item.hsnCode || item.cylinder?.gasType?.hsnCode || ''}</td>
      <td style="text-align:right">${item.quantityCum || ''}</td>
      <td style="text-align:right">${item.unitRate || bill.unitRate || ''}</td>
      <td style="text-align:right">${item.taxableAmount || ''}</td>
      <td style="text-align:right">${item.gstRate || bill.gstRate || ''}</td>
      <td style="text-align:right">${item.gstAmount || ''}</td>
    </tr>`).join('\n');

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${bill.billNumber}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #111827; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #d1d5db; padding: 8px; }
      th { background: #f3f4f6; }
    </style>
  </head>
  <body>
    <h2>Invoice: ${bill.billNumber}</h2>
    <div>Bill Date: ${new Date(bill.billDate).toLocaleDateString('en-IN')}</div>
    <div>Customer: ${bill.customer?.name || ''} (${bill.customer?.code || ''})</div>
    <hr />
    <table>
      <thead>
        <tr>
          <th>Cylinder</th>
          <th>HSN</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Rate</th>
          <th style="text-align:right">Taxable</th>
          <th style="text-align:right">GST %</th>
          <th style="text-align:right">GST</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <h3>Total: ${bill.totalAmount || ''}</h3>
  </body>
  </html>`;
}

async function getInvoiceData(billId) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      customer: true,
      items: { include: { cylinder: { include: { gasType: true } } } },
    },
  });
  if (!bill) throw new Error('Bill not found');
  return bill;
}

module.exports = {
  getInvoiceData,
  renderInvoiceHtml,
};
