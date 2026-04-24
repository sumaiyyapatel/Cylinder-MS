const PDFDocument = require('pdfkit');
const prisma = require('../lib/prisma');

function sanitizeFileName(value, fallback) {
  const text = String(value || fallback || 'report').trim();
  return text.replace(/[\\/:*?"<>|\s]+/g, '-');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
}

function formatAmount(value) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return safeAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function createDocument(layout = 'portrait') {
  return new PDFDocument({
    size: 'A4',
    layout,
    margin: 36,
    bufferPages: true,
  });
}

async function getCompanyProfile() {
  const settings = await prisma.companySetting.findMany({
    where: {
      key: {
        in: ['company_name', 'company_address', 'company_city', 'company_phone', 'company_gstin'],
      },
    },
  });

  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {});
}

function pageWidthFor(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function drawHeader(doc, company, title, subtitle) {
  const left = doc.page.margins.left;
  const width = pageWidthFor(doc);

  doc.font('Helvetica-Bold').fontSize(15).text(company.company_name || 'PATEL & COMPANY', left, 28, { width, align: 'center' });
  doc.font('Helvetica').fontSize(9);
  const addressLine = [company.company_address, company.company_city].filter(Boolean).join(', ');
  if (addressLine) doc.text(addressLine, left, 48, { width, align: 'center' });
  if (company.company_gstin) doc.text(`GSTIN: ${company.company_gstin}`, left, 62, { width, align: 'center' });
  if (company.company_phone) doc.text(`Phone: ${company.company_phone}`, left, 76, { width, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(13).text(title, left, 96, { width, align: 'center' });
  if (subtitle) {
    doc.font('Helvetica').fontSize(9).text(subtitle, left, 112, { width, align: 'center' });
  }
  doc.moveTo(left, subtitle ? 128 : 118).lineTo(left + width, subtitle ? 128 : 118).strokeColor('#6b7280').lineWidth(0.7).stroke();
  return subtitle ? 140 : 130;
}

function getColumnWidths(totalWidth, count) {
  const base = Math.floor(totalWidth / count);
  const widths = Array.from({ length: count }, () => base);
  widths[count - 1] += totalWidth - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}

function drawTable(doc, startY, headers, rows) {
  const left = doc.page.margins.left;
  const totalWidth = pageWidthFor(doc);
  const widths = getColumnWidths(totalWidth, headers.length);
  const rowHeight = 20;
  let y = startY;

  const ensurePage = () => {
    if (y + rowHeight <= doc.page.height - 48) return;
    doc.addPage();
    y = 36;
  };

  const drawRow = (cells, isHeader = false) => {
    ensurePage();
    let x = left;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 9 : 8.2);
    cells.forEach((cell, index) => {
      const width = widths[index];
      doc.rect(x, y, width, rowHeight).lineWidth(0.4).strokeColor('#9ca3af').stroke();
      doc.text(String(cell ?? '-'), x + 4, y + 6, {
        width: width - 8,
        align: index >= Math.max(headers.length - 2, 1) ? 'right' : 'left',
      });
      x += width;
    });
    y += rowHeight;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row));
  return y;
}

function drawFooter(doc) {
  const pageCount = doc.bufferedPageRange().count;
  for (let index = 0; index < pageCount; index += 1) {
    doc.switchToPage(index);
    doc.font('Helvetica').fontSize(8).fillColor('#4b5563');
    doc.text(`Page ${index + 1} of ${pageCount}`, doc.page.margins.left, doc.page.height - 24, {
      width: pageWidthFor(doc),
      align: 'center',
    });
  }
}

async function renderPdfBuffer({ title, subtitle, sections, layout }) {
  const company = await getCompanyProfile();
  const doc = createDocument(layout);

  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      let y = drawHeader(doc, company, title, subtitle);
      sections.forEach((section, index) => {
        const sectionTitle = section.title || `Section ${index + 1}`;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(sectionTitle, doc.page.margins.left, y);
        y += 14;
        y = drawTable(doc, y, section.headers, section.rows.length ? section.rows : [Array(section.headers.length).fill('-')]);
        y += 18;
      });
      drawFooter(doc);
      doc.end();
    } catch (error) {
      doc.destroy(error);
      reject(error);
    }
  });
}

async function sendReportPdf(res, { title, subtitle, sections, fileName, layout = 'portrait' }) {
  const safeName = sanitizeFileName(fileName, title);
  const buffer = await renderPdfBuffer({ title, subtitle, sections, layout });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
}

module.exports = {
  formatAmount,
  formatDate,
  sendReportPdf,
};
