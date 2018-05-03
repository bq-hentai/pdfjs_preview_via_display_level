/*!
 * A lib for pdf previewing based on `PDF.js` created by Mozilla
 *
 * @NOTICE: `pdf.js` should be an alias or in the same directory
 * in AMD env., `pdf.worker.js` should be placed in the same directory as `pdf.js`
 * or it can be an alias.
 * i.e., we don't need to load `pdf.worker.js` manually.
 * in `pdf.js`, `util.loadScript` will be used if `fakeWorkerFilesLoader` is `null`
 * and the PDF object will be mounted to something like `window`
 *
 * @NOTICE: 100+ pages maybe ok - - no lazy load now
 *
 * @TODO: bundle with `pdf.js` & `pdf.worker.js`
 * @TODO: support lazy load
 * 
 * hentai | 05/31/2017
 */

!(function(root, factory) {
  // although can't be used in node env.
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory(require('pdf'));
  }
  else if (typeof define === 'function' && define.amd) {
    define([ 'pdf' ], factory);
  }
  else {
    root.PDFPreviewer = factory(root.PDFJS);
  }
})(this || (0, eval)('this'), function factory(pdfjs) {
  // helpers
  var slice = Array.prototype.slice;
  var noop = function() { }

  var shallowExtend = function shallowExtend(tar/*, obj1, obj2, ... */) {
    var objs = slice.call(arguments, 1);

    objs.forEach(function(obj) {
      if (typeof obj !== 'object' && obj !== null) {
        return ;
      }
      Object.keys(obj).forEach(function(prop) {
        tar[prop] = obj[prop];
      });
    });

    return tar;
  }

  var getStyleValue = function($node, styleName) {
    return getComputedStyle($node)[styleName];
  }

  var removePx = function(x) {
    return x.slice(0, -2);
  }

  // simple `finally` pollyfill
  if (!('finally' in Promise.prototype)) {
    Promise.prototype.finally = function(cb) {
      return this.then(cb, cb);
    }
  }

  var loadPdfDocument = function loadPdfDocument(src) {
    return pdfjs.getDocument(src);
  }

  var handlePdfDocument = function handlePdfDocument(doc) {
    return new Promise(function(resolve, reject) {
      var curPage = 1;
      var loadedPageCnt = 0;
      var pdf$ = { info: doc, pages: { } };
      var errors = null;

      while(curPage <= doc.numPages) {
        doc.getPage(curPage)
          .then(function(page) {
            pdf$.pages[page.pageNumber] = page;
          })
          .catch(function(err) {
            if (!Array.isArray(errors)) {
              errors = [ ]
            }
            errors.push(err);
          })
          .finally(function() {
            if (++ loadedPageCnt === doc.numPages) {
              resolve({ errors: errors, pdf$: pdf$ });
            }
          });

        ++ curPage;
      }
    }).then(function(res) {
      if (res.errors) {
        throw res.errors;
      }
      return res.pdf$;
    });
  }

  var getRenderedPdfCore = function getRenderedPdfCore(pdf, isError) {

    var $el = document.createElement('div');
    $el.classList.add('pdf-previewer-wrapper');

    if (isError) {
      return $el;
    }

    var innerHTML = '<ul class="page-list">';
    var curPage = 1;

    while(curPage <= pdf.info.numPages) {
      innerHTML += '<li class="page-list-item" data-page-number="' +
        pdf.pages[curPage].pageNumber +
        '"><canvas></canvas></li>';

      ++ curPage;
    }

    innerHTML += '</ul>';

    $el.innerHTML = innerHTML;

    return $el;
  }

  var throttle = function (func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function () {
      var last = Date.now() - timestamp;

      if (last < wait && last >= 0) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          if (!timeout) context = args = null;
        }
      }
    };

    return function () {
      context = this;
      args = arguments;
      timestamp = Date.now();
      var callNow = immediate && !timeout;
      if (!timeout) timeout = setTimeout(later, wait);
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  /**
   * set up Constructor & its prototype
   */
  var PDFPreviewer = function(opts) {

    var defaults = {
      $container: document.body,
      pdfPath: 'compressed.tracemonkey-pldi-09.pdf',
      boundResize: true,
      onLoadAll: noop,
      onError: noop,
      initialScale: 1
    };


    if (!(this instanceof PDFPreviewer)) {
      return PDFPreviewer.of(opts);
    }
    this.opts = shallowExtend({ }, defaults, opts);
    this.src = this.opts.pdfPath;
    this.scale = this.opts.initialScale;

    this.pdf$ = { };
    if (this.opts.boundResize) {
      this.handleResize = (function(evt) {
        var previewer = this;
        return throttle(function () {
          previewer.refreshPages();
        }, 200);
      }).call(this);

      window.addEventListener('resize', this.handleReisze)
    }

    this.scrollPosition = { };
    this.dragging = false;

    return this;
  }

  PDFPreviewer.of = function(opts) {
    return new PDFPreviewer(opts);
  }

  var proto = PDFPreviewer.prototype = {
    constructor: PDFPreviewer
  }

  proto.init = function() {
    return loadPdfDocument(this.src)
      .then(handlePdfDocument)
      .then(this.onLoadAll.bind(this))
      .catch(this.opts.onError.bind(this));
  }

  proto.onLoadAll = function(pdf$) {
    this.pdf$ = pdf$;
    this.loaded = true;

    this
      .mount()
      .bindEvents()
      .refreshPages()
      .opts.onLoadAll.call(this);
  }

  proto.resetPdf$ = function() {
    this.pdf$ = { };
    return this;
  }

  proto.checkValid = function() {
    return (
      this.loaded &&
      typeof this.pdf$.info === 'object' &&
      typeof this.pdf$.pages === 'object'
    );
  }

  proto.isValidNumPages = function(numPages) {
    numPages = Number(numPages);
    return !Number.isNaN(numPages) && numPages !== 0;
  }

  proto.isValidNumPage = function(numPage) {
    if (!this.checkValid()) {
      return false;
    }
    return this.isValidNumPages(numPage) &&
      numPage <= this.pdf$.info.numPages;
  }

  proto.getRenderedPdf = function() {
    if (
      !this.checkValid() ||
      !this.isValidNumPages(this.pdf$.info.numPages)
    ) {
      return getRenderedPdfCore(this.pdf$, true);
    }

    return getRenderedPdfCore(this.pdf$);
  }

  proto.mount = function(replace) {
    if (replace) {
      this.opts.$container.innerHTML = '';
    }
    var $el = this.$el = this.getRenderedPdf();
    this.opts.$container.appendChild($el);

    return this;
  }

  proto.toPage = function(num) {
    num = Number(num);
    if (!this.isValidNumPage(num)) {
      return this;
    }

    var $selectedEl = this.$el.querySelector(
      '.page-list-item[data-page-number="' + num + '"]'
    );

    if (!$selectedEl) {
      return this;
    }

    // this.opts.$container.scrollTop = $selectedEl.offsetTop;
    this.$el.scrollTop = $selectedEl.offsetTop;
    
    return this;
  }

  proto.refreshPages = function(scale) {
    if (!this.checkValid()) {
      return this;
    }

    slice.call(
      this.$el.querySelectorAll('.page-list .page-list-item')
    )
      .forEach(function handle$page($page) {

        var pageNumber = $page.dataset['pageNumber'];

        this.renderPage(
          this.pdf$.pages[pageNumber],
          $page.querySelector('canvas'),
          scale
        );

      }.bind(this));

    return this;
  }

  proto.renderPage = function(page, $canvas, scale) {
    scale = scale ? scale : this.scale;

    if (scale < .1) {
      scale = .1;
    }
    else if (scale > 10) {
      scale = 10;
    }

    this.scale = scale;

    var width = removePx(getStyleValue(this.opts.$container, 'width'));
    var viewport = page.getViewport(this.scale);

    var viewportWidth = viewport.width;
    var viewportHeight = viewport.height;

    var realScale = this.realScale = (width / viewportWidth).toFixed(2);

    viewport = page.getViewport(realScale);

    var ctx = $canvas.getContext('2d');
    $canvas.width = viewport.width;
    $canvas.height = viewport.height;

    var renderCtx = {
      canvasContext: ctx,
      viewport: viewport
    }

    page.render(renderCtx);

    return this;
  }

  proto.enlarge = function() {
    this.refreshPages(this.scale - .2);
  }

  proto.narrow = function() {
    this.refreshPages(this.scale + .2);
  }

  proto.changeSrc = function(src) {
    this.src = src;

    return loadPdfDocument(this.src)
      .then(handlePdfDocument)
      .then(function(pdf$) {
        if (this.$el) {
          this.opts.$container.removeChild(this.$el);
        }
        this.onLoadAll(pdf$);
      }.bind(this))
      .catch(this.opts.onError.bind(this));
  }

  proto.bindEvents = function() {
    var that = this;

    this.onmousedown = function onmousedown(evt) {
      that.dragging = true;
      var target = evt.currentTarget;
      scrollPosition = that.scrollPosition;

      scrollPosition.x = evt.clientX;
      scrollPosition.y = evt.clientY;
      scrollPosition.top = target.scrollTop;
      scrollPosition.left = target.scrollLeft;

      target.addEventListener('mousemove', onmousemove);

      function onmousemove(evt) {
        var x = scrollPosition.x - evt.clientX;
        var y = scrollPosition.y - evt.clientY;
        if (that.dragging) {
          target.scrollLeft = scrollPosition.left + x;
          target.scrollTop = scrollPosition.top + y;
        }
      }

      target.addEventListener('mouseup', function onmouseup(evt) {
        that.dragging = false;
        target.removeEventListener('mousemove', onmousemove);
        target.removeEventListener('mouseup', onmouseup);
      });
    }

    this.$el && this.$el.addEventListener('mousedown', this.onmousedown);

    return this;
  }

  proto.unbindEvents = function() {
    this.$el && this.$el.removeEventListener('mousedown', this.onmousedown);
    if (this.opts.boundResize) {
      window.removeEventListener('resize', this.handleReisze);
    }
    return this;
  }

  proto.destroy = function() {
    this.unbindEvents();
    this.$el && this.$el.remove();
    return Promise.resolve()
      .then(function() {
        return this.pdf$.info.destroy();
      })
      .finally(function() {
        this.pdf$ = null;
      });
  }

  return PDFPreviewer;
});
