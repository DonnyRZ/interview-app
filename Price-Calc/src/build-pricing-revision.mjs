import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const repoRoot = "C:/Project/Interview-app";
const inputPath = path.join(repoRoot, "Price-Calc", "orviko-pricing-legacy.xlsx");
const outputPath = path.join(repoRoot, "Price-Calc", "orviko-pricing-rev.xlsx");

const simulation = {
  runFolders: [
    "live-meeting-simulation-20260618-092505",
    "live-meeting-simulation-20260618-093747",
    "live-meeting-simulation-20260618-094909",
    "live-meeting-simulation-20260618-100054",
    "live-meeting-simulation-20260618-101118",
    "live-meeting-simulation-20260618-110430",
    "live-meeting-simulation-20260618-111526",
    "live-meeting-simulation-20260618-112542",
    "live-meeting-simulation-20260618-113626",
    "live-meeting-simulation-20260618-114641"
  ],
  runDate: "2026-06-18",
  sourceFolder: "token-audit-live-10x-20260618",
  aggregateFolder: "token-usage-audit-10x-20260618",
  sampleMinutes: 8.41186388888889,
  targetMinutes: 45,
  scheduledHelpClicks: 7,
  helpClicksCompletedAvg: 6.7,
  validRuns: 7,
  observedRuns: 10,
  keywordRequestsAvg: 18.3,
  transcriptTurns: 24,
  usageRecords: 48.5,
  transcribeInputTokens: 4075,
  transcribeOutputTokensAvg: 847.6,
  realtimeInputTokensAvg: 271163.6,
  realtimeCachedInputTokensAvg: 248019.2,
  realtimeOutputTokensAvg: 1606.1,
  projected45UsdMin: 0.22505906241548394,
  projected45UsdAvg: 0.26258680230402087,
  projected45UsdMax: 0.30970023224473635,
  projected45IdrMin: 4501.181248309679,
  projected45IdrAvg: 5251.7360460804175,
  projected45IdrMax: 6194.004644894727
};

const preprocessingSimulation = {
  runFolder: "token-audit-preprocessing-10x-20260618",
  aggregateFolder: "token-usage-audit-10x-20260618",
  runCount: 10,
  runDate: "2026-06-18",
  model: "gpt-5-mini",
  profileInputTokensAvg: 2227,
  profileOutputTokensAvg: 4872.9,
  profileTotalTokensAvg: 7099.9,
  meetingInputTokensAvg: 1534.1,
  meetingOutputTokensAvg: 3314.8,
  meetingTotalTokensAvg: 4848.9,
  combinedInputTokensAvg: 3761.1,
  combinedOutputTokensAvg: 8187.7,
  combinedTotalTokensAvg: 11948.8
};

const blob = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(blob);

const inputs = workbook.worksheets.getItem("Inputs");
const benchmarks = workbook.worksheets.getItem("Benchmarks");
const packages = workbook.worksheets.getItem("Packages");
const roi = workbook.worksheets.getItem("ROI");

// Inputs keeps the legacy layout but changes the product semantics to general meeting.
inputs.getRange("A1").values = [["Orviko General Meeting Pricing Model"]];
inputs.getRange("A3:G14").values = [
  ["Commercial Inputs", "Value", "Notes", null, "Policy Inputs", "Value", "Notes"],
  ["VAT included in public price", 0.11, "PPN 11% sudah termasuk harga paket", null, "Operational safety reserve", 0.14, "Cadangan tambahan sebelum menentukan sesi jual"],
  ["Bank fee fixed deduction", 0.14, "Existing package formula subtracts this fixed amount before VAT removal", null, null, null, null],
  ["Target gross margin", 0.3, "Margin target setelah VAT dikeluarkan", null, "Live meeting baseline mode", "Measured observed average billing cost", "Baseline memakai rata-rata 10 full Realtime replay; cached token adalah discount billing input, bukan output kedua"],
  ["AI cost share", null, "Formula = 1 / (1 + target gross margin); dipakai sebagai budget AI dari price ex VAT", null, "Profile / Meeting Context policy", "Measured preprocessing", "Profil dan konteks meeting memakai rata-rata 10 real API preprocessing runs"],
  ["USD to IDR", 20000, "Asumsi kurs tetap", null, "Reference sample duration (minutes)", simulation.sampleMinutes, "Durasi sample audio untuk replay real API"],
  ["Mini public price", 29000, "Harga customer final", null, "Reference scheduled help clicks", simulation.scheduledHelpClicks, "Jumlah klik bantuan yang dijadwalkan merata sepanjang sample; observed completed avg ada di Benchmarks"],
  ["Starter public price", 98000, "Harga customer final", null, "Primary runtime actions", "Jawab/Tanggapi/Follow-up/Explain/Keywords/Ask", "General meeting overlay actions; user tetap memilih kapan bantuan AI muncul"],
  ["Pro public price", 379000, "Harga customer final", null, "Notes", "General meeting assistant", "Berlaku untuk meeting online umum: interview, B2B, internal, sales, planning, review, dan konteks lain"],
  ["Meeting duration (minutes)", simulation.targetMinutes, "Unit sesi utama untuk pricing", null, null, null, null],
  [null, null, null, null, null, null, null],
  ["Core formula drivers below are referenced by every other sheet.", null, null, null, null, null, null]
];
inputs.getRange("B7").formulas = [["=1/(1+B6)"]];

// Benchmarks is the source of truth for measured token usage and pricing formulas.
benchmarks.getRange("A1").values = [["Measured General Meeting Runtime Benchmarks"]];
benchmarks.getRange("A3:G31").values = [
  ["Metric", "Value", "Notes", null, "Pricing Metric", "Value", "Notes"],
  ["Avg transcribe input tokens", simulation.transcribeInputTokens, "Average of 10 full Realtime replays; transcription prompt text + audio input tokens", null, "Transcribe input price per 1M tokens (USD)", 3, "Pricing assumption; update only when pricing source changes"],
  ["Avg transcribe output tokens", simulation.transcribeOutputTokensAvg, "Average of 10 full Realtime replays; transcription output tokens", null, "Transcribe output price per 1M tokens (USD)", 5, "Pricing assumption; update only when pricing source changes"],
  ["Avg realtime total input tokens", simulation.realtimeInputTokensAvg, "Average response.done realtime input tokens from 10 full replays", null, "Realtime regular input price per 1M tokens (USD)", 0.6, "Pricing assumption; applies to regular-priced input tokens"],
  ["Less: avg realtime cached input tokens", simulation.realtimeCachedInputTokensAvg, "Cached input is part of total input, priced at discounted rate", null, "Realtime cached input price per 1M tokens (USD)", 0.06, "Pricing assumption; discounted portion of input tokens"],
  ["Avg realtime regular-priced input tokens", null, "Formula: total input minus cached input", null, "Realtime output price per 1M tokens (USD)", 2.4, "Pricing assumption; generated text output tokens"],
  ["Sample duration (minutes)", null, "Linked from Inputs", null, "gpt-5-mini input price per 1M tokens (USD)", 0.25, "For future profile/context preprocessing measurement"],
  ["45-minute scale factor", null, "Target duration / sample duration", null, "gpt-5-mini output price per 1M tokens (USD)", 2, "For future profile/context preprocessing measurement"],
  ["Observed completed help rate per minute", null, "Completed help actions avg / sample duration", null, "Transcribe sample cost (USD)", null, "Formula from measured transcribe input/output tokens"],
  ["Avg realtime output tokens", simulation.realtimeOutputTokensAvg, "Average response.done realtime text output tokens", null, "Realtime sample measured billing cost (USD)", null, "Formula: regular-priced input + cached input + output"],
  ["Observed completed help actions per 45-minute meeting", null, "Completed help rate scaled to target duration", null, "Total sample measured billing cost (USD)", null, "Transcribe + realtime measured billing"],
  ["User Profile preprocessing input tokens", preprocessingSimulation.profileInputTokensAvg, "Average of 10 real preprocessing API runs", null, "User Profile preprocessing output tokens", preprocessingSimulation.profileOutputTokensAvg, "Average output tokens from profile document preprocessing"],
  ["Meeting Context preprocessing input tokens", preprocessingSimulation.meetingInputTokensAvg, "Average of 10 real preprocessing API runs", null, "Meeting Context preprocessing output tokens", preprocessingSimulation.meetingOutputTokensAvg, "Average output tokens from meeting context preprocessing"],
  ["Profile + Meeting Context input tokens", null, "Formula: profile input + meeting context input", null, "Profile + Meeting Context output tokens", null, "Formula: profile output + meeting context output"],
  [null, null, null, null, null, null, null],
  ["Derived 45-minute meeting costs", "Formula result", "Notes", null, "Preprocessing costs", "Formula result", "Notes"],
  ["45-minute measured avg live runtime cost (USD)", null, "Average measured billing cost x scale factor", null, "User Profile preprocess cost (IDR)", null, "gpt-5-mini input/output tokens x FX"],
  ["45-minute measured avg live runtime cost (IDR)", null, "USD x FX", null, "Meeting Context preprocess cost (IDR)", null, "gpt-5-mini input/output tokens x FX"],
  ["Rounded measured avg live runtime cost (IDR)", null, "Used by Packages as one clear measured baseline", null, "Profile + Meeting Context preprocess cost (IDR)", null, "User Profile + Meeting Context preprocessing"],
  ["Measured 45-min range (IDR)", simulation.projected45IdrMin, "Low observed from 10 full Realtime replays", null, "Measured 45-min high (IDR)", simulation.projected45IdrMax, "High observed from 10 full Realtime replays"],
  ["Real-run audit metrics", "Value", "Notes", null, "Source / Metric", "Value", "Notes"],
  ["Simulation source", simulation.sourceFolder, "10 complete run folders listed in script; one failed partial folder is excluded", null, "Realtime model", "gpt-realtime-mini", "Live response + keyword runtime"],
  ["Transcription model", "gpt-4o-mini-transcribe", "Realtime input transcription model", null, "Usage records avg", simulation.usageRecords, "Average usage records across 10 full replays"],
  ["Transcript turns", simulation.transcriptTurns, "Stable across 10 full replays", null, "Keyword requests avg", simulation.keywordRequestsAvg, "Observed range: 18-19"],
  ["Help clicks completed avg", simulation.helpClicksCompletedAvg, "Observed average completed help actions; scheduled sample clicks = 7", null, "Preprocessing source", `${preprocessingSimulation.runCount} real API runs`, preprocessingSimulation.runFolder],
  ["Avg measured API tokens", null, "Formula: transcribe input + transcribe output + realtime input + realtime output; cached tokens are subset of realtime input", null, "Projected 45-min tokens", null, "Avg measured tokens x scale factor"],
  ["Preprocessing measured tokens", null, "Formula: profile + meeting context preprocessing total tokens", null, "Preprocessing model", preprocessingSimulation.model, "Backend non-live preprocessing model"],
  ["Live run validation", `${simulation.validRuns}/${simulation.observedRuns} full-valid`, "7 runs completed all 7 help actions; 3 observed runs completed 6/7 and are included as observed reality", null, "Aggregate source", simulation.aggregateFolder, "summary.json + README.md"],
  ["Pricing token basis", "Observed average", "Uses all 10 completed replays, not valid-only subset, to represent actual runtime behavior", null, "Preprocessing aggregate", preprocessingSimulation.aggregateFolder, "Combined 10x preprocessing + 10x live usage audit"]
];

benchmarks.getRange("B8:B11").formulas = [
  ["=B6-B7"],
  ["=Inputs!F8"],
  ["=Inputs!B12/B9"],
  ["=B27/B9"]
];
benchmarks.getRange("B13").formulas = [["=B11*Inputs!B12"]];
benchmarks.getRange("B16").formulas = [["=B14+B15"]];
benchmarks.getRange("F16").formulas = [["=F14+F15"]];
benchmarks.getRange("F11:F15").formulas = [
  ["=(B4/1000000)*F4 + (B5/1000000)*F5"],
  ["=(B8/1000000)*F6 + (B7/1000000)*F7 + (B12/1000000)*F8"],
  ["=F11+F12"],
  [null],
  [null]
];
benchmarks.getRange("B19:B23").formulas = [
  ["=F13*B10"],
  ["=B19*Inputs!B8"],
  ["=ROUND(B20,0)"],
  [null],
  [null]
];
benchmarks.getRange("F19:F21").formulas = [
  ["=ROUND(((B14/1000000)*F9 + (F14/1000000)*F10)*Inputs!B8,0)"],
  ["=ROUND(((B15/1000000)*F9 + (F15/1000000)*F10)*Inputs!B8,0)"],
  ["=F19+F20"]
];
benchmarks.getRange("B28").formulas = [["=B4+B5+B6+B12"]];
benchmarks.getRange("F28").formulas = [["=B28*B10"]];
benchmarks.getRange("B29").formulas = [["=B16+F16"]];

// Packages keeps the same model and now uses measured preprocessing costs from Benchmarks.
packages.getRange("A3:J12").values = [
  ["Package", "Public Price", "Price ex VAT", "AI Budget", "Measured Avg Live Runtime Cost", "Theoretical Max Meetings", "Recommended Meetings", "Live Cost Used", "Remaining Preprocessing Buffer", "Buffer Status"],
  ["Mini", null, null, null, null, null, null, null, null, null],
  ["Starter", null, null, null, null, null, null, null, null, null],
  ["Pro", null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null],
  ["Preprocessing capacity from remaining buffer", "Mini", "Starter", "Pro", "Formula", "Notes", null, null, null, null],
  ["User Profile preprocessing capacity", null, null, null, "Buffer / profile cost", "Uses 10-run measured User Profile preprocessing cost", null, null, null, null],
  ["Meeting Context preprocessing capacity", null, null, null, "Buffer / meeting context cost", "Uses 10-run measured Meeting Context preprocessing cost", null, null, null, null],
  ["Profile + Meeting Context capacity", null, null, null, "Buffer / combined preprocessing cost", "One profile + one meeting context pair capacity", null, null, null, null],
  ["Implied target reserve % kept", null, null, null, 1, "Checks policy reserve actually preserved", null, null, null, null]
];
packages.getRange("B4:I6").formulas = [
  ["=Inputs!B9", "=(B4-Inputs!$B$5)/(1+Inputs!$B$4)", "=C4*Inputs!$B$7", "=Benchmarks!$B$21", "=D4/E4", "=ROUNDDOWN((D4*(1-Inputs!$F$4))/E4,0)", "=G4*E4", "=D4-H4"],
  ["=Inputs!B10", "=(B5-Inputs!$B$5)/(1+Inputs!$B$4)", "=C5*Inputs!$B$7", "=Benchmarks!$B$21", "=D5/E5", "=ROUNDDOWN((D5*(1-Inputs!$F$4))/E5,0)", "=G5*E5", "=D5-H5"],
  ["=Inputs!B11", "=(B6-Inputs!$B$5)/(1+Inputs!$B$4)", "=C6*Inputs!$B$7", "=Benchmarks!$B$21", "=D6/E6", "=ROUNDDOWN((D6*(1-Inputs!$F$4))/E6,0)", "=G6*E6", "=D6-H6"]
];
packages.getRange("J4:J6").values = [["Live + preprocessing measured"], ["Live + preprocessing measured"], ["Live + preprocessing measured"]];
packages.getRange("B9:D11").formulas = [
  ["=ROUNDDOWN($I$4/Benchmarks!$F$19,0)", "=ROUNDDOWN($I$5/Benchmarks!$F$19,0)", "=ROUNDDOWN($I$6/Benchmarks!$F$19,0)"],
  ["=ROUNDDOWN($I$4/Benchmarks!$F$20,0)", "=ROUNDDOWN($I$5/Benchmarks!$F$20,0)", "=ROUNDDOWN($I$6/Benchmarks!$F$20,0)"],
  ["=ROUNDDOWN($I$4/Benchmarks!$F$21,0)", "=ROUNDDOWN($I$5/Benchmarks!$F$21,0)", "=ROUNDDOWN($I$6/Benchmarks!$F$21,0)"]
];
packages.getRange("B12:D12").formulas = [
  ["=I4/D4", "=I5/D5", "=I6/D6"]
];

// ROI structure remains the same, with formulas refreshed to point at the revised package model.
roi.getRange("B2:E2").values = [["Package", "AI Budget incl. VAT", "Target Price at Margin", "Margin"]];
roi.getRange("B4:E6").values = [
  ["Mini", null, null, null],
  ["Starter", null, null, null],
  ["Pro", null, null, null]
];
roi.getRange("C4:E6").formulas = [
  ["=Packages!D4*(1+Inputs!$B$4)", "=C4*(1+Inputs!$B$6)", "=D4-C4"],
  ["=Packages!D5*(1+Inputs!$B$4)", "=C5*(1+Inputs!$B$6)", "=D5-C5"],
  ["=Packages!D6*(1+Inputs!$B$4)", "=C6*(1+Inputs!$B$6)", "=D6-C6"]
];
roi.getRange("B8:C8").values = [["Package", "User Count"]];
roi.getRange("B14:E14").values = [["Note", "Simplified ROI view based on AI budget and target margin only; not a full P&L.", null, null]];
roi.getRange("C9:L9").values = [[10, 20, 50, 75, 100, 300, 500, 1000, 3500, 70000]];
roi.getRange("J18:J19").values = [[null], [null]];
roi.getRange("C10:L12").formulas = [
  ["=E4*C$9", "=E4*D$9", "=E4*E$9", "=E4*F$9", "=E4*G$9", "=E4*H$9", "=E4*I$9", "=E4*J$9", "=E4*K$9", "=E4*L$9"],
  ["=E5*C$9", "=E5*D$9", "=E5*E$9", "=E5*F$9", "=E5*G$9", "=E5*H$9", "=E5*I$9", "=E5*J$9", "=E5*K$9", "=E5*L$9"],
  ["=E6*C$9", "=E6*D$9", "=E6*E$9", "=E6*F$9", "=E6*G$9", "=E6*H$9", "=E6*I$9", "=E6*J$9", "=E6*K$9", "=E6*L$9"]
];

formatWorkbook({ inputs, benchmarks, packages, roi });
workbook.recalculate();

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan"
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

process.stdout.write(JSON.stringify({
  outputPath,
  formulaErrorScan: errors.ndjson
}, null, 2));

function formatWorkbook({ inputs, benchmarks, packages, roi }) {
  for (const sheet of [inputs, benchmarks, packages, roi]) {
    sheet.getRange("A:Z").format.font = { name: "Aptos", size: 10 };
  }

  inputs.getRange("A1:G1").format = titleFormat();
  inputs.getRange("A3:G3").format = headerFormat();
  inputs.getRange("A3:G14").format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  inputs.getRange("A:G").format.wrapText = true;
  inputs.getRange("A:A").format.columnWidthPx = 210;
  inputs.getRange("B:B").format.columnWidthPx = 95;
  inputs.getRange("C:C").format.columnWidthPx = 310;
  inputs.getRange("E:E").format.columnWidthPx = 220;
  inputs.getRange("F:F").format.columnWidthPx = 170;
  inputs.getRange("G:G").format.columnWidthPx = 360;
  inputs.getRange("B4:B7").format.numberFormat = "0.0%";
  inputs.getRange("B8:B12").format.numberFormat = "#,##0";
  inputs.getRange("F4").format.numberFormat = "0.0%";
  inputs.getRange("F8").format.numberFormat = "0.000000";
  inputs.getRange("F9").format.numberFormat = "#,##0";

  benchmarks.getRange("A1:G1").format = titleFormat();
  benchmarks.getRange("A3:G3").format = headerFormat();
  benchmarks.getRange("A18:G18").format = sectionFormat();
  benchmarks.getRange("A23:G23").format = sectionFormat();
  benchmarks.getRange("A3:G31").format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  benchmarks.getRange("A:G").format.wrapText = true;
  benchmarks.getRange("A:A").format.columnWidthPx = 250;
  benchmarks.getRange("B:B").format.columnWidthPx = 130;
  benchmarks.getRange("C:C").format.columnWidthPx = 350;
  benchmarks.getRange("E:E").format.columnWidthPx = 260;
  benchmarks.getRange("F:F").format.columnWidthPx = 160;
  benchmarks.getRange("G:G").format.columnWidthPx = 340;
  benchmarks.getRange("B4").format.numberFormat = "#,##0";
  benchmarks.getRange("B5:B8").format.numberFormat = "#,##0.0";
  benchmarks.getRange("B9").format.numberFormat = "0.000000";
  benchmarks.getRange("B10:B11").format.numberFormat = "0.000000";
  benchmarks.getRange("B12:B13").format.numberFormat = "#,##0.0";
  benchmarks.getRange("B13").format.numberFormat = "0.0";
  benchmarks.getRange("B14:B16").format.numberFormat = "#,##0.0";
  benchmarks.getRange("B19").format.numberFormat = "0.000000";
  benchmarks.getRange("B20:B22").format.numberFormat = "#,##0";
  benchmarks.getRange("B26").format.numberFormat = "#,##0";
  benchmarks.getRange("B27").format.numberFormat = "0.0";
  benchmarks.getRange("B28:B29").format.numberFormat = "#,##0.0";
  benchmarks.getRange("F4:F13").format.numberFormat = "0.000000";
  benchmarks.getRange("F14:F16").format.numberFormat = "#,##0.0";
  benchmarks.getRange("F19:F22").format.numberFormat = "#,##0";
  benchmarks.getRange("F25").format.numberFormat = "0.0";
  benchmarks.getRange("F26").format.numberFormat = "0.0";
  benchmarks.getRange("F28").format.numberFormat = "#,##0";

  // Re-apply section/title fills after broad range formatting so render previews keep their headers.
  benchmarks.getRange("A1:G1").format = titleFormat();
  benchmarks.getRange("A3:G3").format = headerFormat();
  benchmarks.getRange("A18:G18").format = sectionFormat();
  benchmarks.getRange("A23:G23").format = sectionFormat();

  packages.getRange("A1:J1").format = titleFormat();
  packages.getRange("A3:J3").format = headerFormat();
  packages.getRange("A8:J8").format = sectionFormat();
  packages.getRange("A3:J12").format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  packages.getRange("A:J").format.wrapText = true;
  packages.getRange("A:A").format.columnWidthPx = 230;
  packages.getRange("B:J").format.columnWidthPx = 135;
  packages.getRange("B4:I6").format.numberFormat = "#,##0";
  packages.getRange("B9:D11").format.numberFormat = "#,##0";
  packages.getRange("F4:F6").format.numberFormat = "0.00";
  packages.getRange("B12:D12").format.numberFormat = "0.0%";

  roi.getRange("B2:E2").format = headerFormat();
  roi.getRange("B8:L9").format = headerFormat();
  roi.getRange("B4:E6").format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  roi.getRange("B8:L12").format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
  roi.getRange("B:L").format.columnWidthPx = 125;
  roi.getRange("C4:L12").format.numberFormat = "#,##0";
}

function titleFormat() {
  return {
    fill: "accent1",
    font: { bold: true, color: "lt1", size: 14 },
    horizontalAlignment: "center",
    verticalAlignment: "center"
  };
}

function headerFormat() {
  return {
    fill: "accent2",
    font: { bold: true, color: "lt1" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true
  };
}

function sectionFormat() {
  return {
    fill: "#E0F2FE",
    font: { bold: true, color: "#0F172A" },
    wrapText: true
  };
}
