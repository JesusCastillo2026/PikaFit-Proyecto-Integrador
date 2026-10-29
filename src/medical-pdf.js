const PDFDocument = require('pdfkit');

function generateMedicalPdf({ memberName, evaluations }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Ficha de evaluación médica PikaFit', Author: 'PikaFit' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.font('Helvetica-Bold').fontSize(18).text('PIKAFIT | FICHA MÉDICA', { align: 'center' });
    doc.moveDown(0.4).font('Helvetica').fontSize(9).fillColor('#666666')
      .text('Documento confidencial para uso del profesional médico autorizado', { align: 'center' });
    doc.moveDown().fillColor('#111111').font('Helvetica-Bold').fontSize(12).text(`Socio: ${memberName}`);
    doc.moveDown(0.4).font('Helvetica').fontSize(10).text(`Evaluaciones incluidas: ${evaluations.length}`);
    doc.moveDown();

    for (const [index, evaluation] of evaluations.entries()) {
      if (doc.y > 680) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(12).text(`Evaluación ${index + 1} · ${new Date(evaluation.createdAt).toLocaleString('es-PE')}`);
      doc.moveDown(0.3).font('Helvetica').fontSize(10).text(`Resultado: ${evaluation.result}`);
      doc.moveDown(0.2).font('Helvetica-Bold').text('Restricciones físicas');
      if (!evaluation.restrictions.length) doc.font('Helvetica').text('Sin restricciones registradas.');
      else evaluation.restrictions.forEach(item => doc.font('Helvetica').text(`• ${item.zone}: ${item.movements.join(', ') || 'todos los movimientos'}`));
      doc.moveDown(0.2).font('Helvetica-Bold').text('Diagnóstico');
      doc.font('Helvetica').text(evaluation.diagnosis || 'Sin diagnóstico registrado.', { width: 500 });
      doc.moveDown(0.2).font('Helvetica-Bold').text('Observaciones');
      doc.font('Helvetica').text(evaluation.observations || 'Sin observaciones.', { width: 500 });
      doc.moveDown();
      if (index < evaluations.length - 1) doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#CCCCCC').stroke();
    }
    doc.end();
  });
}

module.exports = { generateMedicalPdf };
