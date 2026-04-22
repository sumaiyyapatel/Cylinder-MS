const prisma = require('../lib/prisma');

function sanitizeFileName(value, fallback) {
  const text = String(value || fallback || 'document').trim();
  return text.replace(/[\\/:*?"<>|\s]+/g, '-');
}

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatAmount(value) {
  return asNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
}

function buildSettingsMap(settings) {
  return settings.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
}

async function getCompanyProfile() {
  const settings = await prisma.companySetting.findMany({
    where: {
      key: {
        in: [
          'company_name',
          'company_address',
          'company_city',
          'company_phone',
          'company_gstin',
          'company_pan',
        ],
      },
    },
  });

  return buildSettingsMap(settings);
}

function createDocument() {
  const PDFDocument = require('pdfkit');
  return new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
  });
}

function drawHeader(doc, company, title, metaLines = []) {
  doc.font('Helvetica-Bold').fontSize(15).text(company.company_name || 'PATEL & COMPANY', 40, 36);
  doc.font('Helvetica').fontSize(9);

  const addressLine = [company.company_address, company.company_city].filter(Boolean).join(', ');
  if (addressLine) doc.text(addressLine, 40, 56);
  if (company.company_phone) doc.text(`Phone: ${company.company_phone}`, 40, 70);
  if (company.company_gstin) doc.text(`GSTIN: ${company.company_gstin}`, 40, 84);

  doc.font('Helvetica-Bold').fontSize(13).text(title, 360, 36, { width: 160, align: 'right' });
  doc.font('Helvetica').fontSize(9);
  metaLines.forEach((line, index) => {
    doc.text(line, 360, 56 + (index * 14), { width: 160, align: 'right' });
  });

  doc.moveTo(40, 108).lineTo(555, 108).strokeColor('#444444').lineWidth(0.7).stroke();
  return 122;
}

function drawSectionTitle(doc, y, text) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(text, 40, y);
  return y + 16;
}

function drawKeyValueBlock(doc, x, y, width, rows = []) {
  doc.rect(x, y, width, 70).lineWidth(0.5).strokeColor('#888888').stroke();
  let currentY = y + 8;
  rows.forEach(({ label, value }) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(label, x + 8, currentY, { width: 70 });
    doc.font('Helvetica').fontSize(9).text(value || '-', x + 78, currentY, { width: width - 86 });
    currentY += 14;
  });
}

function drawTable(doc, startY, headers, rows, widths, options = {}) {
  const rowHeight = options.rowHeight || 20;
  const left = options.left || 40;
  let y = startY;

  const ensurePage = () => {
    if (y + rowHeight <= 760) return;
    doc.addPage();
    y = 40;
  };

  const drawRow = (cells, header = false) => {
    ensurePage();
    let x = left;
    doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 9 : 8.5);
    cells.forEach((cell, index) => {
      const width = widths[index];
      doc.rect(x, y, width, rowHeight).lineWidth(0.4).strokeColor('#9ca3af').stroke();
      doc.text(String(cell ?? '-'), x + 4, y + 6, {
        width: width - 8,
        align: index >= (options.rightAlignFrom ?? widths.length) ? 'right' : 'left',
      });
      x += width;
    });
    y += rowHeight;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row, false));
  return y;
}

function drawFooter(doc) {
  const pageCount = doc.bufferedPageRange().count;
  for (let index = 0; index < pageCount; index += 1) {
    doc.switchToPage(index);
    const pageNumber = index + 1;
    doc.font('Helvetica').fontSize(8).fillColor('#555555');
    doc.text(`Page ${pageNumber} of ${pageCount}`, 40, 800, { width: 515, align: 'center' });
  }
}

async function sendPdf(res, fileName, render) {
  const doc = createDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(fileName, 'document')}.pdf"`);
  doc.pipe(res);
  render(doc);
  drawFooter(doc);
  doc.end();

  return new Promise((resolve, reject) => {
    res.on('finish', resolve);
    res.on('error', reject);
    doc.on('error', reject);
  });
}

async function getBillPdfData(id) {
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          cylinder: {
            include: { gasType: true },
          },
        },
      },
    },
  });

  if (!bill) return null;

  const company = await getCompanyProfile();
  return { company, bill };
}

async function streamBillPdf(res, id) {
  const data = await getBillPdfData(id);
  if (!data) return false;

  const { company, bill } = data;
  const itemRows = (bill.items || []).map((item, index) => {
    const quantity = asNumber(item.quantityCum);
    const unitRate = asNumber(bill.unitRate);
    const amount = quantity * unitRate;
    const gst = amount * (asNumber(bill.gstRate) / 100);

    return [
      index + 1,
      item.cylinderNumber || item.cylinder?.cylinderNumber || '-',
      item.cylinder?.gasType?.name || bill.gasCode || '-',
      quantity ? quantity.toFixed(2) : '0.00',
      formatAmount(unitRate),
      formatAmount(amount),
      formatAmount(gst),
    ];
  });

  await sendPdf(res, `Bill-${bill.billNumber}`, (doc) => {
    let y = drawHeader(doc, company, 'TAX INVOICE', [
      `Bill No: ${bill.billNumber}`,
      `Date: ${formatDate(bill.billDate)}`,
    ]);

    y = drawSectionTitle(doc, y, 'Bill To');
    drawKeyValueBlock(doc, 40, y, 250, [
      { label: 'Customer', value: `${bill.customer?.code || ''} ${bill.customer?.name || ''}`.trim() },
      { label: 'Address', value: [bill.customer?.address1, bill.customer?.address2, bill.customer?.city].filter(Boolean).join(', ') },
      { label: 'GSTIN', value: bill.customer?.gstin || 'N/A' },
      { label: 'Phone', value: bill.customer?.phone || 'N/A' },
    ]);

    drawKeyValueBlock(doc, 305, y, 250, [
      { label: 'Gas', value: bill.gasCode || '-' },
      { label: 'Owner', value: bill.cylinderOwner || '-' },
      { label: 'Order', value: bill.orderNumber || '-' },
      { label: 'Txn Code', value: bill.transactionCode || '-' },
    ]);

    y += 90;
    y = drawSectionTitle(doc, y, 'Item Details');
    y = drawTable(
      doc,
      y,
      ['Sr', 'Cylinder', 'Gas', 'Qty', 'Rate', 'Amount', 'GST'],
      itemRows.length ? itemRows : [['-', '-', '-', '0.00', '0.00', '0.00', '0.00']],
      [34, 100, 100, 60, 65, 78, 78],
      { rightAlignFrom: 3 }
    );

    y += 18;
    doc.font('Helvetica-Bold').fontSize(10).text('Totals', 330, y);
    doc.font('Helvetica').fontSize(9);
    doc.text('Taxable Amount', 330, y + 18, { width: 120 });
    doc.text(formatAmount(bill.taxableAmount), 460, y + 18, { width: 80, align: 'right' });

    if ((bill.gstMode || 'INTRA') === 'INTER') {
      doc.text(`IGST @ ${formatAmount(bill.gstRate)}%`, 330, y + 34, { width: 120 });
      doc.text(formatAmount(bill.gstAmount), 460, y + 34, { width: 80, align: 'right' });
    } else {
      const halfRate = asNumber(bill.gstRate) / 2;
      const halfGst = asNumber(bill.gstAmount) / 2;
      doc.text(`CGST @ ${formatAmount(halfRate)}%`, 330, y + 34, { width: 120 });
      doc.text(formatAmount(halfGst), 460, y + 34, { width: 80, align: 'right' });
      doc.text(`SGST @ ${formatAmount(halfRate)}%`, 330, y + 50, { width: 120 });
      doc.text(formatAmount(halfGst), 460, y + 50, { width: 80, align: 'right' });
    }

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Total Amount', 330, y + 72, { width: 120 });
    doc.text(`Rs. ${formatAmount(bill.totalAmount)}`, 430, y + 72, { width: 110, align: 'right' });

    doc.font('Helvetica').fontSize(8);
    doc.text('Terms: Payment due within 30 days. Cylinders must be returned in original condition.', 40, 744, {
      width: 320,
    });
    doc.text('Authorised Signatory', 400, 760, { width: 140, align: 'center' });
  });

  return true;
}

async function getEcrPdfData(id) {
  const ecr = await prisma.ecrRecord.findUnique({
    where: { id },
    include: {
      customer: true,
    },
  });

  if (!ecr) return null;

  const company = await getCompanyProfile();
  return { company, ecr };
}

async function streamEcrPdf(res, id) {
  const data = await getEcrPdfData(id);
  if (!data) return false;

  const { company, ecr } = data;

  await sendPdf(res, `ECR-${ecr.ecrNumber}`, (doc) => {
    let y = drawHeader(doc, company, 'EMPTY CYLINDER RETURN', [
      `ECR No: ${ecr.ecrNumber}`,
      `Date: ${formatDate(ecr.ecrDate)}`,
    ]);

    y = drawSectionTitle(doc, y, 'Customer');
    drawKeyValueBlock(doc, 40, y, 250, [
      { label: 'Customer', value: `${ecr.customer?.code || ''} ${ecr.customer?.name || ''}`.trim() },
      { label: 'Address', value: [ecr.customer?.address1, ecr.customer?.address2, ecr.customer?.city].filter(Boolean).join(', ') },
      { label: 'GSTIN', value: ecr.customer?.gstin || 'N/A' },
      { label: 'Phone', value: ecr.customer?.phone || 'N/A' },
    ]);

    drawKeyValueBlock(doc, 305, y, 250, [
      { label: 'Cylinder', value: ecr.cylinderNumber || '-' },
      { label: 'Gas', value: ecr.gasCode || '-' },
      { label: 'Owner', value: ecr.cylinderOwner || '-' },
      { label: 'Issue Bill', value: ecr.issueNumber || '-' },
    ]);

    y += 92;
    y = drawSectionTitle(doc, y, 'Return Details');
    drawTable(
      doc,
      y,
      ['Issue Date', 'Return Date', 'Hold Days', 'Rent Amount', 'Challan', 'Vehicle'],
      [[
        formatDate(ecr.issueDate),
        formatDate(ecr.ecrDate),
        ecr.holdDays ?? '-',
        formatAmount(ecr.rentAmount),
        ecr.challanNumber || '-',
        ecr.vehicleNumber || '-',
      ]],
      [82, 82, 70, 90, 100, 111],
      { rightAlignFrom: 3 }
    );

    doc.font('Helvetica').fontSize(8);
    doc.text('Customer Signature', 40, 760, { width: 160, align: 'center' });
    doc.text('Authorised Signatory', 360, 760, { width: 180, align: 'center' });
  });

  return true;
}

async function getChallanPdfData(id) {
  const challan = await prisma.challan.findUnique({
    where: { id },
    include: {
      customer: true,
      linkedBill: {
        select: {
          id: true,
          billNumber: true,
        },
      },
    },
  });

  if (!challan) return null;

  let cylinders = [];
  if (challan.customerId) {
    cylinders = await prisma.cylinderHolding.findMany({
      where: {
        customerId: challan.customerId,
        status: { in: ['HOLDING', 'BILLED'] },
        issuedAt: {
          gte: new Date(new Date(challan.challanDate).setHours(0, 0, 0, 0)),
          lt: new Date(new Date(challan.challanDate).setHours(24, 0, 0, 0)),
        },
      },
      include: { cylinder: true },
      orderBy: { issuedAt: 'asc' },
    });
  }

  const company = await getCompanyProfile();
  return { company, challan, cylinders };
}

async function streamChallanPdf(res, id) {
  const data = await getChallanPdfData(id);
  if (!data) return false;

  const { company, challan, cylinders } = data;
  const rows = cylinders.map((holding, index) => [
    index + 1,
    holding.cylinder?.cylinderNumber || '-',
    holding.cylinder?.gasCode || challan.gasCode || '-',
    holding.cylinder?.ownerCode || challan.cylinderOwner || '-',
    formatDate(holding.issuedAt),
  ]);

  await sendPdf(res, `Challan-${challan.challanNumber}`, (doc) => {
    let y = drawHeader(doc, company, 'DELIVERY CHALLAN', [
      `Challan No: ${challan.challanNumber}`,
      `Date: ${formatDate(challan.challanDate)}`,
    ]);

    y = drawSectionTitle(doc, y, 'Dispatch To');
    drawKeyValueBlock(doc, 40, y, 250, [
      { label: 'Customer', value: `${challan.customer?.code || ''} ${challan.customer?.name || ''}`.trim() },
      { label: 'Address', value: [challan.customer?.address1, challan.customer?.address2, challan.customer?.city].filter(Boolean).join(', ') },
      { label: 'Vehicle', value: challan.vehicleNumber || 'N/A' },
      { label: 'Type', value: challan.transactionType || '-' },
    ]);

    drawKeyValueBlock(doc, 305, y, 250, [
      { label: 'Owner', value: challan.cylinderOwner || '-' },
      { label: 'Gas', value: challan.gasCode || '-' },
      { label: 'Cylinders', value: String(challan.cylindersCount || rows.length || 0) },
      { label: 'Linked Bill', value: challan.linkedBill?.billNumber || '-' },
    ]);

    y += 92;
    y = drawSectionTitle(doc, y, 'Cylinder Details');
    drawTable(
      doc,
      y,
      ['Sr', 'Cylinder', 'Gas', 'Owner', 'Issued At'],
      rows.length ? rows : [['-', '-', '-', '-', '-']],
      [34, 150, 100, 90, 141]
    );

    doc.font('Helvetica').fontSize(8);
    doc.text('Receiver Signature', 40, 760, { width: 160, align: 'center' });
    doc.text('Authorised Signatory', 360, 760, { width: 180, align: 'center' });
  });

  return true;
}

module.exports = {
  streamBillPdf,
  streamEcrPdf,
  streamChallanPdf,
};
