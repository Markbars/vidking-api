const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ============ Merge PDFs ============
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
  fs.writeFileSync(outputPath, await mergedPdf.save());
  res.download(outputPath, 'merged.pdf');
});

// ============ Split PDF ============
app.post('/split', upload.single('pdf'), async (req, res) => {
  const pdfBytes = fs.readFileSync(req.file.path);
  const pdf = await PDFDocument.load(pdfBytes);
  const newPdf = await PDFDocument.create();
  const pagesInput = req.body.pages.split(',');

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

  const outputPath = path.join(__dirname, 'output', 'split.pdf');
  fs.writeFileSync(outputPath, await newPdf.save());
  fs.unlinkSync(req.file.path);
  res.download(outputPath, 'split.pdf');
});

// ============ Compress PDF using Ghostscript ============
app.post('/compress', upload.single('pdf'), async (req, res) => {
  const inputPath = req.file.path;
  const outputPath = path.join(__dirname, 'output', 'compressed.pdf');

  // Ghostscript command for medium quality compression
  const cmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

  exec(cmd, (err) => {
    fs.unlinkSync(inputPath); // delete original uploaded file
    if (err) {
      console.error(err);
      return res.status(500).send("Compression failed");
    }
    res.download(outputPath, 'compressed.pdf');
  });
});

app.listen(PORT, () => console.log(`PDF Toolkit running on port ${PORT}`));
