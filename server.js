const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// =================== Merge PDFs ===================
app.post('/merge', upload.array('pdfs'), async (req, res) => {
  const mergedPdf = await PDFDocument.create();
  for (const file of req.files) {
    const pdfBytes = fs.readFileSync(file.path);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach(page => mergedPdf.addPage(page));
    fs.unlinkSync(file.path);
  }
  const outputPath = path.join(__dirname, 'output', 'merged.pdf');
  const mergedBytes = await mergedPdf.save();
  fs.writeFileSync(outputPath, mergedBytes);
  res.download(outputPath, 'merged.pdf');
});

// =================== Split PDF ===================
app.post('/split', upload.single('pdf'), async (req, res) => {
  const pdfBytes = fs.readFileSync(req.file.path);
  const pdf = await PDFDocument.load(pdfBytes);
  const outputPath = path.join(__dirname, 'output', 'split.pdf');

  const newPdf = await PDFDocument.create();
  const pagesInput = req.body.pages.split(','); // e.g. "1-3,5"

  for (let part of pagesInput) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(x => parseInt(x)-1);
      const copied = await newPdf.copyPages(pdf, Array.from({length: end-start+1}, (_,i)=>i+start));
      copied.forEach(p => newPdf.addPage(p));
    } else {
      const index = parseInt(part)-1;
      const copied = await newPdf.copyPages(pdf, [index]);
      copied.forEach(p => newPdf.addPage(p));
    }
  }

  const newBytes = await newPdf.save();
  fs.writeFileSync(outputPath, newBytes);
  fs.unlinkSync(req.file.path);
  res.download(outputPath, 'split.pdf');
});

// =================== Compress PDF ===================
// Simple compress: reduce image quality (pdf-lib doesn't natively compress, so we re-save)
app.post('/compress', upload.single('pdf'), async (req, res) => {
  const pdfBytes = fs.readFileSync(req.file.path);
  const pdf = await PDFDocument.load(pdfBytes);
  const outputPath = path.join(__dirname, 'output', 'compressed.pdf');

  // For simplicity: just re-save. For real compression, you'd need more advanced libraries
  const compressedBytes = await pdf.save({ useObjectStreams: true });
  fs.writeFileSync(outputPath, compressedBytes);
  fs.unlinkSync(req.file.path);
  res.download(outputPath, 'compressed.pdf');
});

app.listen(PORT, () => console.log(`PDF Toolkit running on port ${PORT}`));
