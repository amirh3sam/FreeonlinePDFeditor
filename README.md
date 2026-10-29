# Free Online PDF Editor

**▶ Live: https://freeonlinepdfeditor.vercel.app**

A free PDF editor that runs entirely in the browser. Your files never leave your device: no uploads, no account, no server.

## Features

- **Text**: add text anywhere, in any color or size. Persian and other non-Latin scripts work too.
- **Sign**: draw a signature and drop it on the page.
- **Draw**: freehand pen.
- **Highlight**, **Whiteout** (cover existing content) and **Box** tools.
- **Images**: insert PNG or JPG, then move and resize them.
- **Pages**: rotate, reorder, delete, add blank pages and merge more PDFs.
- **Select & edit**: move, resize, recolor or delete anything you added. Undo and redo.
- Works on desktop and mobile.

## Use it

Go to **https://freeonlinepdfeditor.vercel.app**, or open `index.html` in any browser.

Keyboard shortcuts: `V` select · `T` text · `D` draw · `H` highlight · `W` whiteout · `B` box · `E` eraser · `Ctrl+Z`/`Ctrl+Y` undo/redo · `Delete` removes the selected item.

## How it works

- [PDF.js](https://mozilla.github.io/pdf.js/) renders the pages.
- [pdf-lib](https://pdf-lib.js.org/) writes your edits into the original PDF, so the existing text stays real, selectable text.
- It's a single self-contained `index.html`. The libraries load from cdnjs.

## Limitations

- It doesn't edit the PDF's existing text in place. Use **Whiteout** plus **Text** to replace it.
- Password-protected PDFs can't be opened. Pages from permission-locked PDFs are flattened into images when you save.
- Links and form fields on rotated or flattened pages may not be kept.

---
Built by [AmirHesam Tech](https://amirhesamtech.com)
