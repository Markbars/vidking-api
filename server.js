const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/merge', upload.array('pdfs'), async (req, res) => {
  const mergedPdf = await PDFDocument.create();

  for (const file of req.files) {
    const pdfBytes = fs.readFileSync(file.path);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
    fs.unlinkSync(file.path); // delete uploaded file
  }

  const mergedBytes = await mergedPdf.save();
  const outputPath = path.join(__dirname, 'output', 'merged.pdf');
  fs.writeFileSync(outputPath, mergedBytes);

  res.download(outputPath, 'merged.pdf');
});

app.listen(3000, () => {
  console.log('PDF Tool running at http://localhost:3000');
});
