#!/usr/bin/env node

/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Canvas = require("canvas");
const assert = require("assert").strict;
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");

const WIDTH = 595;
const HEIGHT = 842;

function NodeCanvasFactory() {}
NodeCanvasFactory.prototype = {
  create: function NodeCanvasFactory_create(width, height) {
    assert(width > 0 && height > 0, "Invalid canvas size");
    const canvas = Canvas.createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas,
      context,
    };
  },

  reset: function NodeCanvasFactory_reset(canvasAndContext, width, height) {
    assert(canvasAndContext.canvas, "Canvas is not specified");
    assert(width > 0 && height > 0, "Invalid canvas size");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },

  destroy: function NodeCanvasFactory_destroy(canvasAndContext) {
    assert(canvasAndContext.canvas, "Canvas is not specified");

    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  },
};

const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// Some PDFs need external cmaps.
const CMAP_URL = "../../../node_modules/pdfjs-dist/cmaps/";
const CMAP_PACKED = true;

// Where the standard fonts are located.
const STANDARD_FONT_DATA_URL =
  "../../../node_modules/pdfjs-dist/standard_fonts/";

// PDF
const pdfPath = process.argv[2] || path.join(__dirname, "test-pdf", "test.pdf");
const pdfFileName = pdfPath.replace(/^.*[\\\/]/, "");
let totalPages = 0;

// Image
const imageFolderPath = process.argv[3] || path.join(__dirname, "test-pdf");
const data = new Uint8Array(fs.readFileSync(pdfPath));

const imageFileExtension = process.argv[4] || "jpg";

// Verbosity level
const verbosityLevel = process.argv[5] || pdfjsLib.VerbosityLevel.ERRORS; // { ERRORS: 0, WARNINGS: 1, INFOS: 5 }

// Load the PDF file.
const loadingTask = pdfjsLib.getDocument({
  data,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
  standardFontDataUrl: STANDARD_FONT_DATA_URL,
  verbosity: verbosityLevel,
});

async function pdf2image() {
  const pdf = await loadingTask.promise;
  // get all pages text
  totalPages = pdf.numPages;
  let countPromises = []; // collecting all page promises
  for (let i = 1; i <= totalPages; i++) {
    let page = pdf.getPage(i);

    countPromises.push(
      page.then(function (page) {
        // Render the page on a Node canvas with 100% scale.
        const canvasFactory = new NodeCanvasFactory();
        /* const viewport = page.getViewport({ scale: 1.0 });
        const canvasAndContext = canvasFactory.create(
          viewport.width,
          viewport.height
        ); */
        const viewport = page.getViewport({ scale: 1.0 });
        const canvasAndContext = canvasFactory.create(WIDTH, HEIGHT);
        const renderContext = {
          canvasContext: canvasAndContext.context,
          viewport,
          canvasFactory,
        };

        const renderTask = page.render(renderContext);
        return renderTask.promise.then(async function () {
          // Convert the canvas to an image buffer.
          const image = canvasAndContext.canvas.toBuffer();
          const imageFileName = `${path.parse(pdfFileName).name}-${i}.${imageFileExtension}`;
          const imagePath = path.join(imageFolderPath, imageFileName);
          await fsPromises.writeFile(imagePath, image);
          return { pdfFileName, pageNumber: i, imageFileName };
        });
      })
    );
  }
  return await Promise.all(countPromises);
}

const start = async () => {
  try {
    const result = await pdf2image();
    const stdOut = {
      pdfFileName,
      totalPages,
      images: result,
    };
    console.log(JSON.stringify(stdOut));
  } catch (error) {
    throw error;
  }
};

start();
