import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetDatasetSummary,
  getGetDatasetSummaryQueryKey,
  useGetSampleDatasets,
  useLoadSampleDataset,
  useRunQuery,
  useExportResults,
  QueryResult,
  UploadResult,
  DatasetSummary,
} from "@workspace/api-client-react";
import {
  Upload, FileType, Play, Database, Download, BarChart2,
  MessageSquare, Loader2, Code, FileCode, CheckCircle2, AlertCircle,
  Sparkles, RefreshCw, Table2, Wand2, X, ChevronDown, ChevronUp,
  LayoutDashboard, FlaskConical, Wrench, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Plot from "react-plotly.js";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTheme } from "@/components/theme-provider";

// ─── Cleaning Code Generator ─────────────────────────────────────────────────

function generateCleaningCode(summary: DatasetSummary): string {
  const cols = summary.columns_info || [];
  const nullCols = cols.filter((c) => c.null_count > 0);
  const numericCols = cols.filter((c) => /float|int/.test(c.dtype));
  const objectCols = cols.filter((c) => c.dtype === "object");
  const dateLikeCols = objectCols.filter((c) =>
    /date|time|created|updated|timestamp/i.test(c.name)
  );

  const lines: string[] = [
    `import pandas as pd`,
    `import numpy as np`,
    ``,
    `# ─── 1. LOAD DATASET ────────────────────────────────────────────────────────`,
    `df = pd.read_csv("${summary.filename}")  # adjust path as needed`,
    ``,
    `# ─── 2. INSPECT ─────────────────────────────────────────────────────────────`,
    `print("Shape:", df.shape)`,
    `print("\\nColumn types:")`,
    `print(df.dtypes)`,
    `print("\\nMissing values:")`,
    `print(df.isnull().sum())`,
    `print("\\nDuplicate rows:", df.duplicated().sum())`,
    ``,
    `# ─── 3. HANDLE MISSING VALUES ────────────────────────────────────────────────`,
  ];

  if (nullCols.length === 0) {
    lines.push(`# No missing values detected — dataset is complete`);
  } else {
    for (const col of nullCols) {
      const isNumeric = numericCols.find((c) => c.name === col.name);
      if (isNumeric) {
        lines.push(
          `df["${col.name}"].fillna(df["${col.name}"].median(), inplace=True)  # ${col.null_pct.toFixed(1)}% missing → fill with median`
        );
      } else {
        lines.push(
          `df["${col.name}"].fillna("Unknown", inplace=True)  # ${col.null_pct.toFixed(1)}% missing → fill with placeholder`
        );
      }
    }
  }

  lines.push(
    ``,
    `# ─── 4. REMOVE DUPLICATES ────────────────────────────────────────────────────`,
    `before = len(df)`,
    `df = df.drop_duplicates()`,
    `print(f"Removed {before - len(df)} duplicate rows. Shape now: {df.shape}")`,
    ``,
    `# ─── 5. FIX DATA TYPES ───────────────────────────────────────────────────────`,
  );

  if (dateLikeCols.length > 0) {
    for (const col of dateLikeCols) {
      lines.push(
        `df["${col.name}"] = pd.to_datetime(df["${col.name}"], errors="coerce")  # parse date column`
      );
    }
  } else {
    lines.push(`# No obvious date columns detected — review dtypes above if needed`);
  }

  if (objectCols.length > 0) {
    lines.push(
      ``,
      `# ─── 6. STRIP WHITESPACE FROM STRING COLUMNS ─────────────────────────────────`,
      `str_cols = df.select_dtypes(include="object").columns`,
      `df[str_cols] = df[str_cols].apply(lambda x: x.str.strip())`,
    );
  }

  if (numericCols.length > 0) {
    lines.push(
      ``,
      `# ─── 7. DETECT & CLIP OUTLIERS (IQR METHOD) ──────────────────────────────────`,
      `# Uncomment columns you want to clip — review distributions first`,
    );
    for (const col of numericCols.slice(0, 4)) {
      lines.push(
        `# Q1, Q3 = df["${col.name}"].quantile([0.25, 0.75])`,
        `# IQR = Q3 - Q1`,
        `# df["${col.name}"] = df["${col.name}"].clip(Q1 - 1.5*IQR, Q3 + 1.5*IQR)`,
      );
    }
  }

  lines.push(
    ``,
    `# ─── 8. RESET INDEX ──────────────────────────────────────────────────────────`,
    `df = df.reset_index(drop=True)`,
    ``,
    `# ─── 9. FINAL VALIDATION ─────────────────────────────────────────────────────`,
    `print("\\nCleaned shape:", df.shape)`,
    `print("Remaining nulls:", df.isnull().sum().sum())`,
    `print(df.head())`,
    ``,
    `# ─── 10. EXPORT ──────────────────────────────────────────────────────────────`,
    `df.to_csv("cleaned_${summary.filename}", index=False)`,
    `print("\\nSaved: cleaned_${summary.filename}")`,
  );

  return lines.join("\n");
}

// ─── Result Card (chart + table + insights inline) ───────────────────────────

function ResultCard({
  result,
  theme,
  onExport,
  isExporting,
}: {
  result: QueryResult;
  theme: string;
  onExport: (id: string) => void;
  isExporting: boolean;
}) {
  const [showCode, setShowCode] = useState(false);
  const [showTable, setShowTable] = useState(true);
  const hasChart =
    result.chart != null &&
    result.chart.type !== "none" &&
    result.chart.plotly_json != null;
  const hasTable = result.result_table && result.result_table.columns?.length > 0;

  const plotData = hasChart ? JSON.parse(result.chart!.plotly_json!) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-3"
    >
      {/* Answer */}
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed text-foreground/90">{result.answer}</p>
        </div>
      </div>

      {/* Chart — fixed height so Plotly always has room to render */}
      {hasChart && plotData && (
        <div
          className="rounded-xl border border-border bg-card overflow-hidden"
          style={{ height: 380 }}
        >
          <Plot
            data={plotData.data}
            layout={{
              ...plotData.layout,
              autosize: true,
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: {
                family: "Inter, sans-serif",
                color: theme === "dark" ? "#c9d1d9" : "#24292f",
                size: 11,
              },
              margin: { t: 40, r: 24, l: 56, b: 48 },
              legend: { bgcolor: "transparent", font: { size: 10 } },
            }}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            config={{ displayModeBar: true, modeBarButtonsToRemove: ["lasso2d", "select2d"], responsive: true }}
          />
        </div>
      )}

      {/* Insights */}
      {result.insights && result.insights.length > 0 && (
        <div className="ml-9 p-3 bg-primary/5 rounded-lg border border-primary/10">
          <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 text-primary flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Insights
          </h4>
          <ul className="space-y-1.5">
            {result.insights.map((ins, i) => (
              <li key={i} className="text-xs text-foreground/75 flex items-start gap-1.5">
                <span className="text-primary/40 mt-0.5 shrink-0">•</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Table toggle */}
      {hasTable && (
        <div className="ml-9 rounded-lg border border-border overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-secondary/40 hover:bg-secondary/60 transition-colors"
            onClick={() => setShowTable((v) => !v)}
          >
            <span className="flex items-center gap-1.5">
              <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
              Result Table
              <Badge variant="outline" className="text-[9px] font-mono ml-1">
                {result.result_table!.rows.length} rows
              </Badge>
            </span>
            <span className="flex items-center gap-2">
              {result.result_table && (
                <button
                  className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  onClick={(e) => { e.stopPropagation(); onExport(result.query_id); }}
                  disabled={isExporting}
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              )}
              {showTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>
          {showTable && (
            <div className="overflow-auto max-h-56">
              <Table>
                <TableHeader className="bg-secondary/30 sticky top-0">
                  <TableRow>
                    {result.result_table!.columns.map((col, i) => (
                      <TableHead key={i} className="h-7 py-1 text-[11px] whitespace-nowrap font-semibold">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.result_table!.rows.map((row, i) => (
                    <TableRow key={i} className="hover:bg-secondary/20">
                      {row.map((cell: unknown, j: number) => (
                        <TableCell key={j} className="py-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                          {cell === null || cell === undefined ? (
                            <span className="italic text-muted-foreground/40">null</span>
                          ) : (
                            String(cell)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Code toggle */}
      {result.generated_code && (
        <div className="ml-9">
          <button
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            onClick={() => setShowCode((v) => !v)}
          >
            <Code className="w-3 h-3" />
            {showCode ? "Hide" : "View"} generated Python code
          </button>
          {showCode && (
            <div className="mt-2 rounded-lg overflow-hidden border border-border bg-[#0d1117]">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border-b border-white/5">
                <span className="text-[9px] font-mono text-muted-foreground">python</span>
                <span className="text-[9px] text-muted-foreground/50 ml-auto">
                  {(result.execution_time_ms ?? 0).toFixed(0)}ms
                </span>
              </div>
              <pre className="p-4 text-[11px] overflow-x-auto font-mono text-[#e6edf3] leading-relaxed">
                {result.generated_code}
              </pre>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  summary,
  onSuggestedQuery,
}: {
  summary: DatasetSummary;
  onSuggestedQuery: (q: string) => void;
}) {
  const totalNulls = summary.columns_info?.reduce((s, c) => s + c.null_count, 0) ?? 0;
  const numericCols = summary.columns_info?.filter((c) => /float|int/.test(c.dtype)) ?? [];
  const categoricalCols = summary.columns_info?.filter((c) => c.dtype === "object") ?? [];

  const suggestions = [
    `Bar chart of top 10 ${categoricalCols[0]?.name ?? "categories"} by count`,
    `Distribution of ${numericCols[0]?.name ?? "numeric column"} as a histogram`,
    `Show missing values heatmap across all columns`,
    `Scatter plot of ${numericCols[0]?.name ?? "col1"} vs ${numericCols[1]?.name ?? "col2"}`,
    `Pie chart of ${categoricalCols[0]?.name ?? "category"} breakdown`,
    `Find outliers in ${numericCols[0]?.name ?? "numeric column"}`,
  ].filter(Boolean);

  return (
    <div className="p-5 space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Rows", value: summary.rows.toLocaleString(), color: "text-primary" },
          { label: "Columns", value: String(summary.columns), color: "text-primary" },
          { label: "Missing Values", value: totalNulls.toLocaleString(), color: totalNulls > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Numeric Cols", value: String(numericCols.length), color: "text-primary" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Column schema table */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Info className="w-3.5 h-3.5" /> Column Schema
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-auto max-h-64">
            <Table>
              <TableHeader className="bg-secondary/40 sticky top-0">
                <TableRow>
                  <TableHead className="text-[11px] h-8">#</TableHead>
                  <TableHead className="text-[11px] h-8">Column</TableHead>
                  <TableHead className="text-[11px] h-8">Type</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Null Count</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Null %</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.columns_info?.map((col, i) => (
                  <TableRow key={col.name} className="hover:bg-secondary/20">
                    <TableCell className="text-[11px] text-muted-foreground/50 py-1.5 font-mono">{i + 1}</TableCell>
                    <TableCell className="text-[11px] font-medium py-1.5">{col.name}</TableCell>
                    <TableCell className="text-[11px] py-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono text-[10px]">
                        {col.dtype}
                      </span>
                    </TableCell>
                    <TableCell className="text-[11px] text-right py-1.5 font-mono">
                      {col.null_count > 0 ? (
                        <span className="text-yellow-400">{col.null_count.toLocaleString()}</span>
                      ) : (
                        <span className="text-green-400">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-right py-1.5 font-mono">
                      {col.null_pct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${100 - col.null_pct}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Numeric summary */}
      {summary.numeric_summary && Object.keys(summary.numeric_summary).length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5" /> Numeric Summary
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto">
              <Table>
                <TableHeader className="bg-secondary/40 sticky top-0">
                  <TableRow>
                    <TableHead className="text-[11px] h-8">Column</TableHead>
                    {["count", "mean", "std", "min", "25%", "50%", "75%", "max"].map((h) => (
                      <TableHead key={h} className="text-[11px] h-8 text-right font-mono">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(summary.numeric_summary).map(([col, statsRaw]) => {
                    const stats = statsRaw as Record<string, number | null>;
                    return (
                    <TableRow key={col} className="hover:bg-secondary/20">
                      <TableCell className="text-[11px] font-medium py-1.5">{col}</TableCell>
                      {["count", "mean", "std", "min", "25%", "50%", "75%", "max"].map((k) => (
                        <TableCell key={k} className="text-[11px] text-right py-1.5 font-mono text-muted-foreground">
                          {stats[k] != null
                            ? typeof stats[k] === "number"
                              ? Math.abs(stats[k] as number) >= 1000
                                ? (stats[k] as number).toLocaleString(undefined, { maximumFractionDigits: 0 })
                                : (stats[k] as number).toFixed(2)
                              : String(stats[k])
                            : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Suggested queries */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Wand2 className="w-3.5 h-3.5" /> Suggested Analysis
        </h3>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((q) => (
            <button
              key={q}
              onClick={() => onSuggestedQuery(q)}
              className="px-3 py-1.5 rounded-full border border-border bg-secondary/30 hover:bg-secondary hover:border-primary/40 text-xs font-medium transition-colors text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Clean Tab ────────────────────────────────────────────────────────────────

function CleanTab({ summary }: { summary: DatasetSummary }) {
  const code = generateCleaningCode(summary);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Dataset Cleaning Script</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-generated Python code to clean <strong>{summary.filename}</strong> — review and adapt before running.
          </p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0 h-8 text-xs" onClick={handleCopy}>
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-400" /> : <Code className="w-3.5 h-3.5 mr-1.5" />}
          {copied ? "Copied!" : "Copy code"}
        </Button>
      </div>

      <div className="rounded-xl overflow-hidden border border-border bg-[#0d1117]">
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <span className="text-[10px] font-mono text-muted-foreground ml-2">
            cleaning_script.py
          </span>
        </div>
        <ScrollArea className="h-[520px]">
          <pre className="p-5 text-[12px] font-mono text-[#e6edf3] leading-[1.7] whitespace-pre">
            {code}
          </pre>
        </ScrollArea>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Run this script locally with pandas installed. Adjust column-specific logic to match your domain knowledge before applying to production data.
      </p>
    </div>
  );
}

// ─── Upload / Empty State ─────────────────────────────────────────────────────

function UploadState({
  onDrop,
  isDragActive,
  isUploading,
  sampleDatasets,
  onLoadSample,
  loadingId,
  getInputProps,
  getRootProps,
}: {
  onDrop: (files: File[]) => void;
  isDragActive: boolean;
  isUploading: boolean;
  sampleDatasets: { id: string; name: string; description: string; rows: number }[] | undefined;
  onLoadSample: (id: string) => void;
  loadingId: string | null;
  getInputProps: () => React.InputHTMLAttributes<HTMLInputElement>;
  getRootProps: () => React.HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 max-w-2xl w-full space-y-8"
      >
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-secondary border border-border mb-3">
            <Database className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Connect a dataset</h1>
          <p className="text-muted-foreground">Upload a CSV or Excel file to begin AI-powered analysis</p>
        </div>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
            ${isDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-border bg-card/40 hover:border-primary/40 hover:bg-secondary/30"}
            ${isUploading ? "opacity-50 pointer-events-none" : ""}
          `}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="font-medium">Processing dataset...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-background rounded-full border border-border shadow-lg">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-medium">Drag & drop your file here</p>
                <p className="text-sm text-muted-foreground mt-1">Supports .csv, .xls, .xlsx — up to any size</p>
              </div>
              <span className="px-4 py-1.5 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                or click to browse
              </span>
            </div>
          )}
        </div>

        {sampleDatasets && sampleDatasets.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px bg-border flex-1" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                or try a sample
              </span>
              <div className="h-px bg-border flex-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sampleDatasets.map((ds) => (
                <button
                  key={ds.id}
                  onClick={() => onLoadSample(ds.id)}
                  disabled={loadingId !== null}
                  className="text-left p-4 rounded-xl border border-border bg-card/60 hover:border-primary/40 hover:bg-card transition-all disabled:opacity-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm">{ds.name}</span>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {ds.rows.toLocaleString()} rows
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{ds.description}</p>
                  {loadingId === ds.id && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-primary">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "analyze" | "clean">("overview");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: datasetSummary, isLoading: isSummaryLoading } = useGetDatasetSummary(
    { session_id: sessionId || undefined },
    { query: { enabled: !!sessionId, queryKey: getGetDatasetSummaryQueryKey({ session_id: sessionId || undefined }) } }
  );

  const { data: sampleDatasets } = useGetSampleDatasets();
  const loadSampleMutation = useLoadSampleDataset();
  const runQueryMutation = useRunQuery();
  const exportMutation = useExportResults();

  // Scroll to bottom of chat when new result arrives
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [queryResults, runQueryMutation.isPending]);

  // File upload via dropzone
  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", acceptedFiles[0]);
    try {
      const resp = await fetch("/api/upload", { method: "POST", body: formData });
      if (!resp.ok) throw new Error("Upload failed");
      const result: UploadResult = await resp.json();
      setSessionId(result.session_id);
      setQueryResults([]);
      setActiveTab("overview");
      toast({ title: "Dataset connected", description: result.message });
    } catch {
      toast({ title: "Upload failed", description: "Could not process the file", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
  });

  const handleLoadSample = (id: string) => {
    setLoadingId(id);
    loadSampleMutation.mutate(
      { data: { dataset_id: id } },
      {
        onSuccess: (res) => {
          setSessionId(res.session_id);
          setQueryResults([]);
          setActiveTab("overview");
          toast({ title: "Sample loaded", description: res.message });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to load sample", variant: "destructive" });
        },
        onSettled: () => setLoadingId(null),
      }
    );
  };

  const handleRunQuery = (question: string) => {
    const q = question.trim();
    if (!sessionId || !q || runQueryMutation.isPending) return;
    setCurrentQuery("");
    setActiveTab("analyze");
    runQueryMutation.mutate(
      { data: { question: q, session_id: sessionId } },
      {
        onSuccess: (res) => {
          setQueryResults((prev) => [...prev, res]);
        },
        onError: () => {
          toast({ title: "Query failed", description: "Could not execute analysis", variant: "destructive" });
        },
      }
    );
    // Focus input back after submission
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleExport = (queryId: string) => {
    exportMutation.mutate(
      { data: { query_id: queryId } },
      {
        onSuccess: (csvText) => {
          const blob = new Blob([csvText], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `datalens-${queryId}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        },
      }
    );
  };

  const handleDisconnect = () => {
    setSessionId(null);
    setQueryResults([]);
    setActiveTab("overview");
  };

  const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "analyze", label: "Analyze", icon: FlaskConical },
    { id: "clean", label: "Clean Data", icon: Wrench },
  ] as const;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ── Icon sidebar ── */}
      <div className="w-14 border-r border-border bg-card flex flex-col items-center py-3 gap-3 z-20 shrink-0">
        <button
          onClick={() => setLocation("/")}
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20 hover:scale-105 transition-transform"
          title="Back to home"
        >
          <Database className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-border" />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-9 h-9 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center transition-colors mt-auto mb-1"
          title="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {/* ── Main workspace ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!sessionId ? (
          <UploadState
            onDrop={onDrop}
            isDragActive={isDragActive}
            isUploading={isUploading}
            sampleDatasets={sampleDatasets}
            onLoadSample={handleLoadSample}
            loadingId={loadingId}
            getInputProps={getInputProps}
            getRootProps={getRootProps}
          />
        ) : (
          <>
            {/* ── Workspace header ── */}
            <div className="shrink-0 h-12 border-b border-border bg-card/80 flex items-center px-4 gap-4">
              {/* Dataset badge */}
              {isSummaryLoading ? (
                <Skeleton className="h-6 w-40" />
              ) : datasetSummary ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary border border-border">
                    <FileType className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium truncate max-w-[160px]">
                      {datasetSummary.filename}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {datasetSummary.rows.toLocaleString()} rows · {datasetSummary.columns} cols
                  </span>
                </div>
              ) : null}

              {/* Tab bar */}
              <div className="flex items-center gap-0.5 ml-auto">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Disconnect */}
              <button
                onClick={handleDisconnect}
                className="ml-2 w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center transition-colors"
                title="Disconnect dataset"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── Tab content ── */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {/* Overview tab */}
              {activeTab === "overview" && (
                <ScrollArea className="h-full">
                  {datasetSummary ? (
                    <OverviewTab
                      summary={datasetSummary}
                      onSuggestedQuery={(q) => {
                        setCurrentQuery(q);
                        handleRunQuery(q);
                      }}
                    />
                  ) : (
                    <div className="p-5 space-y-4">
                      {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}

              {/* Analyze tab */}
              {activeTab === "analyze" && (
                <div className="flex flex-col h-full">
                  {/* Messages area */}
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="max-w-3xl mx-auto px-4 py-5 space-y-8">
                      {queryResults.length === 0 && !runQueryMutation.isPending && (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <MessageSquare className="w-7 h-7 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-base">Ask anything about your data</h3>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                              Type a question below — the AI generates charts, tables, and insights instantly.
                            </p>
                          </div>
                          {datasetSummary && (
                            <div className="flex flex-wrap justify-center gap-2 pt-2">
                              {[
                                `Show top 10 rows by ${datasetSummary.columns_info?.find(c => /float|int/.test(c.dtype))?.name ?? "value"}`,
                                `Bar chart of ${datasetSummary.columns_info?.find(c => c.dtype === "object")?.name ?? "category"} distribution`,
                                "Show missing values across all columns",
                                "What is the average of each numeric column",
                              ].map((q) => (
                                <button
                                  key={q}
                                  onClick={() => handleRunQuery(q)}
                                  className="px-3 py-1.5 rounded-full border border-border bg-secondary/30 hover:bg-secondary text-xs font-medium transition-colors"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {queryResults.map((result) => (
                        <div key={result.query_id} className="space-y-3">
                          {/* User question bubble */}
                          <div className="flex justify-end">
                            <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm font-medium">
                              {result.question}
                            </div>
                          </div>
                          {/* AI result */}
                          <ResultCard
                            result={result}
                            theme={theme}
                            onExport={handleExport}
                            isExporting={exportMutation.isPending}
                          />
                        </div>
                      ))}

                      {/* Pending state */}
                      {runQueryMutation.isPending && (
                        <div className="space-y-3">
                          <div className="flex justify-end">
                            <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm font-medium">
                              {runQueryMutation.variables?.data?.question}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                            <div>
                              <p className="text-sm font-medium">Analyzing...</p>
                              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                Generating pandas code · executing · building chart
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sentinel for scroll-to-bottom */}
                      <div ref={chatBottomRef} />
                    </div>
                  </ScrollArea>

                  {/* Query input bar */}
                  <div className="shrink-0 border-t border-border bg-card/60 backdrop-blur-sm px-4 py-3">
                    <div className="max-w-3xl mx-auto">
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRunQuery(currentQuery);
                        }}
                      >
                        <div className="flex-1 relative">
                          <input
                            ref={inputRef}
                            type="text"
                            placeholder="Ask a question about the dataset..."
                            className="w-full h-10 px-4 pr-10 rounded-full bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-sm placeholder:text-muted-foreground transition-shadow"
                            value={currentQuery}
                            onChange={(e) => setCurrentQuery(e.target.value)}
                            disabled={runQueryMutation.isPending}
                          />
                          {queryResults.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setQueryResults([])}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                              title="Clear history"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={!currentQuery.trim() || runQueryMutation.isPending}
                          className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          {runQueryMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 ml-0.5" />
                          )}
                        </button>
                      </form>
                      <p className="text-center text-[10px] text-muted-foreground mt-2">
                        AI-generated analysis · verify important results before acting
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Clean tab */}
              {activeTab === "clean" && (
                <ScrollArea className="h-full">
                  {datasetSummary ? (
                    <CleanTab summary={datasetSummary} />
                  ) : (
                    <div className="p-5">
                      <Skeleton className="h-96 w-full" />
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Inline SVG icons (avoids import collisions) ──────────────────────────────

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
