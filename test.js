/*!
 * test pdf
 * hentai | 05/27/2017
 */

!(function(root) {

  var previewer = PDFPreviewer.of({
    $container: document.querySelector('#app'),
    pdfPath: 'compressed.tracemonkey-pldi-09.pdf'
  });
  previewer.init().then(function() {
    previewer.toPage(2);
  });

  setTimeout(function() {
    previewer.changeSrc('compressed.tracemonkey-pldi-09.pdf').then(function() {
      previewer.toPage(14);
    });
  }, 4000);

  setTimeout(function () {
    previewer.destroy();

    previewer = null;
  }, 7000);

})(this);
