import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/Project/Interview-app/Price-Calc/orviko-pricing-legacy.xlsx";

const blob = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(blob);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,definedName",
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 8,
  tableMaxCellChars: 80
});

const formulas = await Promise.all([
  workbook.inspect({
    kind: "formula",
    sheetId: "Inputs",
    range: "A1:G20",
    maxChars: 4000,
    options: { maxResults: 100 }
  }),
  workbook.inspect({
    kind: "formula",
    sheetId: "Benchmarks",
    range: "A1:G30",
    maxChars: 6000,
    options: { maxResults: 150 }
  }),
  workbook.inspect({
    kind: "formula",
    sheetId: "Packages",
    range: "A1:J20",
    maxChars: 6000,
    options: { maxResults: 150 }
  }),
  workbook.inspect({
    kind: "formula",
    sheetId: "ROI",
    range: "A1:L25",
    maxChars: 6000,
    options: { maxResults: 150 }
  })
]);

process.stdout.write([
  summary.ndjson,
  ...formulas.map((item) => item.ndjson)
].join("\n"));
