import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { 
  useGetDatasetSummary, 
  getGetDatasetSummaryQueryKey,
  useGetDatasetPreview,
  useRunQuery,
  useGetQueryHistory,
  useExportResults,
  useGetSampleDatasets,
  useLoadSampleDataset,
  QueryResult,
  QueryHistoryItem,
  UploadResult,
  DatasetSummary
} from "@workspace/api-client-react";
import { Upload, FileType, Play, Database, History, Download, AlignLeft, BarChart2, MessageSquare, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Plot from "react-plotly.js";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTheme } from "@/components/theme-provider";

export default function Dashboard() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [activeResult, setActiveResult] = useState<QueryResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Queries
  const { data: datasetSummary, isLoading: isLoadingSummary } = useGetDatasetSummary(
    { session_id: sessionId || undefined }, 
    { query: { enabled: !!sessionId, queryKey: getGetDatasetSummaryQueryKey({ session_id: sessionId || undefined }) } }
  );

  const { data: queryHistory, refetch: refetchHistory } = useGetQueryHistory(
    { session_id: sessionId || undefined },
    { query: { enabled: !!sessionId, queryKey: ['queryHistory', sessionId] } }
  );

  const { data: sampleDatasets } = useGetSampleDatasets();

  // Mutations
  const loadSampleMutation = useLoadSampleDataset();
  const runQueryMutation = useRunQuery();
  const exportMutation = useExportResults();

  // File Upload
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const resp = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!resp.ok) throw new Error("Upload failed");
      const result: UploadResult = await resp.json();
      setSessionId(result.session_id);
      setActiveResult(null);
      toast({ title: "Dataset uploaded", description: result.message });
    } catch (err) {
      toast({ title: "Error", description: "Failed to upload file", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  });

  const handleLoadSample = (id: string) => {
    loadSampleMutation.mutate({ data: { dataset_id: id } }, {
      onSuccess: (res) => {
        setSessionId(res.session_id);
        setActiveResult(null);
        toast({ title: "Sample loaded", description: res.message });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to load sample dataset", variant: "destructive" });
      }
    });
  };

  const handleRunQuery = (questionText: string) => {
    if (!sessionId) return;
    runQueryMutation.mutate({ data: { question: questionText, session_id: sessionId } }, {
      onSuccess: (res) => {
        setActiveResult(res);
        refetchHistory();
      },
      onError: () => {
        toast({ title: "Query failed", description: "Could not generate analysis", variant: "destructive" });
      }
    });
  };

  const handleExport = () => {
    if (!activeResult) return;
    exportMutation.mutate({ data: { query_id: activeResult.query_id } }, {
      onSuccess: (csvText) => {
        const blob = new Blob([csvText], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = `export-${activeResult.query_id}.csv`; 
        a.click();
      }
    });
  };

  const handleHistoryClick = (item: QueryHistoryItem) => {
    // We only have the history item overview, so ideally we'd re-fetch the specific result
    // In this basic version we'll just run the same question again to fetch the result
    // Or we could have an API to get query by ID. For now we will run the question again.
    setCurrentQuery(item.question);
    handleRunQuery(item.question);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-bold tracking-tight">
            <Database className="w-5 h-5" />
            DataLens
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <span className="text-xs font-medium">LHT</span> : <span className="text-xs font-medium">DRK</span>}
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            
            {/* Connection Status / Uploads */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Workspace</h3>
              {datasetSummary ? (
                <div className="p-3 bg-secondary rounded-md border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <FileType className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm truncate" title={datasetSummary.filename}>
                      {datasetSummary.filename}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
                    <div>
                      <span className="block text-foreground font-mono">{datasetSummary.rows.toLocaleString()}</span>
                      Rows
                    </div>
                    <div>
                      <span className="block text-foreground font-mono">{datasetSummary.columns}</span>
                      Cols
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-3 h-7 text-xs"
                    onClick={() => {
                      setSessionId(null);
                      setActiveResult(null);
                    }}
                  >
                    Close Dataset
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic px-1">No active dataset</div>
              )}
            </div>

            {/* History */}
            {sessionId && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <History className="w-3.5 h-3.5" /> Recent Queries
                </h3>
                <div className="space-y-1">
                  {queryHistory?.length ? (
                    queryHistory.map(item => (
                      <button
                        key={item.query_id}
                        onClick={() => handleHistoryClick(item)}
                        className="w-full text-left p-2 text-xs rounded-md hover:bg-secondary border border-transparent hover:border-border transition-colors group flex items-start gap-2"
                      >
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground group-hover:text-primary shrink-0" />
                        <span className="line-clamp-2 text-muted-foreground group-hover:text-foreground">
                          {item.question}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground px-1">No history yet</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
        
        {!sessionId ? (
          // Empty State - Upload or select sample
          <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
            <div className="max-w-3xl w-full space-y-8">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Connect your data</h1>
                <p className="text-muted-foreground">Upload a CSV/Excel file to start asking questions</p>
              </div>

              <div 
                {...getRootProps()} 
                className={`
                  border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
                  ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-secondary/50'}
                  ${isUploading ? 'opacity-50 pointer-events-none' : ''}
                `}
              >
                <input {...getInputProps()} />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-sm font-medium">Processing dataset...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-secondary rounded-full">
                      <Upload className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Drag & drop your file here</p>
                      <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xls, .xlsx</p>
                    </div>
                  </div>
                )}
              </div>

              {sampleDatasets && sampleDatasets.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center">Or start with a sample dataset</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sampleDatasets.map(ds => (
                      <Card key={ds.id} className="p-4 hover:border-primary/50 cursor-pointer transition-colors bg-secondary/30" onClick={() => handleLoadSample(ds.id)}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-sm text-primary">{ds.name}</h4>
                          <Badge variant="outline" className="text-[10px] font-mono">{ds.rows} rows</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{ds.description}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Active Workspace
          <ResizablePanelGroup direction="vertical" className="h-full w-full">
            
            {/* Top half: Chat & Charts/Results */}
            <ResizablePanel defaultSize={60} minSize={30}>
              <ResizablePanelGroup direction="horizontal">
                
                {/* Chat Panel */}
                <ResizablePanel defaultSize={35} minSize={25} className="border-r border-border bg-card">
                  <div className="h-full flex flex-col">
                    <div className="p-4 border-b border-border bg-background">
                      <h2 className="font-semibold text-sm flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" /> Copilot
                      </h2>
                    </div>
                    
                    <ScrollArea className="flex-1 p-4">
                      {/* Active Chat Log (Simplified to show just latest query) */}
                      {!activeResult && !runQueryMutation.isPending && (
                        <div className="h-full flex items-center justify-center text-center p-4">
                          <div className="space-y-4 max-w-sm">
                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                              <Play className="w-5 h-5 text-primary ml-1" />
                            </div>
                            <h3 className="font-medium">Ready to analyze</h3>
                            <p className="text-xs text-muted-foreground">Ask a question about the dataset in plain English. The AI will generate code, create charts, and summarize findings.</p>
                            
                            <div className="space-y-2 mt-6">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">Suggestions</p>
                              {['Show me a summary of missing values', 'What is the distribution of the largest numerical column?', 'Plot a bar chart of top categories'].map((q, i) => (
                                <button 
                                  key={i}
                                  onClick={() => {
                                    setCurrentQuery(q);
                                    handleRunQuery(q);
                                  }}
                                  className="block w-full text-left text-xs p-2 rounded border border-border bg-secondary/50 hover:border-primary/50 hover:bg-secondary transition-colors"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {runQueryMutation.isPending && (
                        <div className="space-y-4">
                          <div className="bg-secondary/50 rounded-lg p-3 inline-block max-w-[85%] self-end float-right">
                            <p className="text-sm">{currentQuery}</p>
                          </div>
                          <div className="clear-both" />
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-xs">Analyzing data and generating code...</span>
                          </div>
                        </div>
                      )}

                      {activeResult && !runQueryMutation.isPending && (
                        <div className="space-y-6 flex flex-col pb-4">
                          <div className="bg-secondary/50 border border-border rounded-lg p-3 self-end max-w-[90%]">
                            <p className="text-sm">{activeResult.question}</p>
                          </div>
                          
                          <div className="space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center shrink-0 mt-0.5 border border-primary/30">
                                <Database className="w-3.5 h-3.5 text-primary" />
                              </div>
                              <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed space-y-2" dangerouslySetContent={{__html: activeResult.answer.replace(/\n/g, '<br/>')}}>
                                {activeResult.answer}
                              </div>
                            </div>
                            
                            {activeResult.insights && activeResult.insights.length > 0 && (
                              <div className="ml-9 p-3 bg-secondary/30 rounded border border-border/50">
                                <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 text-primary">Key Insights</h4>
                                <ul className="space-y-1.5 list-disc pl-4 text-xs text-muted-foreground">
                                  {activeResult.insights.map((insight, i) => (
                                    <li key={i}>{insight}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {activeResult.generated_code && (
                              <div className="ml-9">
                                <details className="group">
                                  <summary className="text-xs cursor-pointer text-muted-foreground hover:text-primary transition-colors font-medium">View generated Python code</summary>
                                  <pre className="mt-2 p-3 bg-[#0a0a0a] rounded border border-border text-[10px] overflow-x-auto font-mono text-gray-300">
                                    {activeResult.generated_code}
                                  </pre>
                                </details>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </ScrollArea>
                    
                    {/* Chat Input */}
                    <div className="p-4 border-t border-border bg-background">
                      <form 
                        className="relative"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (currentQuery.trim() && !runQueryMutation.isPending) {
                            handleRunQuery(currentQuery);
                          }
                        }}
                      >
                        <Input
                          placeholder="Ask a question about your data..."
                          className="pr-10 bg-secondary/50 border-border focus-visible:ring-primary"
                          value={currentQuery}
                          onChange={(e) => setCurrentQuery(e.target.value)}
                          disabled={runQueryMutation.isPending}
                        />
                        <Button 
                          type="submit" 
                          size="icon" 
                          variant="ghost" 
                          className="absolute right-1 top-1 h-7 w-7 text-primary hover:bg-primary/10"
                          disabled={!currentQuery.trim() || runQueryMutation.isPending}
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </Button>
                      </form>
                      <div className="text-[10px] text-muted-foreground mt-2 text-center">
                        AI can make mistakes. Verify important results.
                      </div>
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Main Results View */}
                <ResizablePanel defaultSize={65}>
                  <div className="h-full flex flex-col bg-background relative">
                    {activeResult ? (
                      <Tabs defaultValue={activeResult.chart ? "chart" : "data"} className="h-full flex flex-col">
                        <div className="flex items-center justify-between px-4 border-b border-border bg-card">
                          <TabsList className="bg-transparent space-x-2 p-0 h-12">
                            {activeResult.chart && activeResult.chart.type !== 'none' && (
                              <TabsTrigger value="chart" className="data-[state=active]:bg-secondary data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-full px-4 rounded-t-md">
                                <BarChart2 className="w-4 h-4 mr-2" /> Visualization
                              </TabsTrigger>
                            )}
                            <TabsTrigger value="data" className="data-[state=active]:bg-secondary data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-full px-4 rounded-t-md">
                              <AlignLeft className="w-4 h-4 mr-2" /> Results Table
                            </TabsTrigger>
                          </TabsList>
                          
                          <div className="flex items-center gap-2">
                            {activeResult.execution_time_ms && (
                              <span className="text-[10px] text-muted-foreground font-mono mr-2">
                                {(activeResult.execution_time_ms / 1000).toFixed(2)}s
                              </span>
                            )}
                            {activeResult.result_table && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExport} disabled={exportMutation.isPending}>
                                <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 overflow-hidden relative bg-card/30">
                          {activeResult.chart && activeResult.chart.type !== 'none' && activeResult.chart.plotly_json && (
                            <TabsContent value="chart" className="h-full m-0 p-4 data-[state=inactive]:hidden">
                              <div className="w-full h-full border border-border rounded-lg bg-background p-1 flex items-center justify-center">
                                <Plot
                                  data={JSON.parse(activeResult.chart.plotly_json).data}
                                  layout={{ 
                                    ...JSON.parse(activeResult.chart.plotly_json).layout, 
                                    autosize: true, 
                                    paper_bgcolor: 'transparent', 
                                    plot_bgcolor: 'transparent',
                                    font: { family: 'var(--app-font-sans)', color: theme === 'dark' ? '#ececf1' : '#09090b' },
                                    margin: { t: 40, r: 20, l: 60, b: 60 }
                                  }}
                                  useResizeHandler
                                  style={{ width: '100%', height: '100%' }}
                                  config={{ displayModeBar: true, displaylogo: false, responsive: true }}
                                />
                              </div>
                            </TabsContent>
                          )}

                          <TabsContent value="data" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                            {activeResult.result_table ? (
                              <ScrollArea className="h-full border-t border-border">
                                <Table>
                                  <TableHeader className="bg-secondary/80 sticky top-0 z-10 shadow-sm">
                                    <TableRow className="border-b-border">
                                      <TableHead className="w-12 text-center text-xs text-muted-foreground">#</TableHead>
                                      {activeResult.result_table.columns.map((col, i) => (
                                        <TableHead key={i} className="font-mono text-xs whitespace-nowrap">{col}</TableHead>
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {activeResult.result_table.rows.map((row, i) => (
                                      <TableRow key={i} className="border-b border-border/50 hover:bg-secondary/30">
                                        <TableCell className="text-center font-mono text-[10px] text-muted-foreground">{i + 1}</TableCell>
                                        {row.map((cell, j) => (
                                          <TableCell key={j} className="text-sm whitespace-nowrap max-w-[200px] truncate" title={String(cell)}>
                                            {cell === null ? <span className="text-muted-foreground italic">null</span> : String(cell)}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                {activeResult.result_table.total_rows > activeResult.result_table.rows.length && (
                                  <div className="p-2 text-center text-xs text-muted-foreground bg-secondary/30 border-t border-border">
                                    Showing top {activeResult.result_table.rows.length} of {activeResult.result_table.total_rows} rows
                                  </div>
                                )}
                              </ScrollArea>
                            ) : (
                              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                No table data for this query
                              </div>
                            )}
                          </TabsContent>
                        </div>
                      </Tabs>
                    ) : (
                      <div className="h-full flex items-center justify-center p-8 bg-card/30">
                        <div className="text-center max-w-md">
                          <div className="w-16 h-16 border-2 border-dashed border-border rounded-full flex items-center justify-center mx-auto mb-4 bg-secondary/50">
                            <BarChart2 className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <h2 className="text-lg font-semibold mb-2 text-foreground">Analysis Viewer</h2>
                          <p className="text-sm text-muted-foreground">
                            Run a query in the copilot panel to generate charts and extract insights from your dataset.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom half: Dataset Schema / Preview */}
            <ResizablePanel defaultSize={40} minSize={20} className="bg-card border-t border-border">
              <div className="h-full flex flex-col">
                <div className="p-2 px-4 border-b border-border bg-background flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dataset Schema</h3>
                  {isLoadingSummary && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                </div>
                
                <ScrollArea className="flex-1">
                  {datasetSummary ? (
                    <Table>
                      <TableHeader className="bg-secondary/50 sticky top-0 shadow-sm z-10">
                        <TableRow className="border-border">
                          <TableHead className="w-[30%] text-xs">Column Name</TableHead>
                          <TableHead className="w-[15%] text-xs">Type</TableHead>
                          <TableHead className="w-[15%] text-xs">Missing</TableHead>
                          <TableHead className="text-xs">Sample Values</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {datasetSummary.columns_info.map((col, i) => (
                          <TableRow key={i} className="border-border/50">
                            <TableCell className="font-mono text-xs font-medium text-foreground">
                              {col.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px] font-mono rounded-sm px-1.5 py-0">
                                {col.dtype}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-mono ${col.null_count > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {col.null_pct.toFixed(1)}%
                                </span>
                                {col.null_count > 0 && (
                                  <span className="text-[10px] text-muted-foreground">({col.null_count})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {col.sample_values?.slice(0, 3).map((val, idx) => (
                                  <span key={idx} className="inline-block px-1.5 py-0.5 bg-background border border-border rounded text-[10px] text-muted-foreground max-w-[120px] truncate" title={String(val)}>
                                    {val === null ? 'null' : String(val)}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-8 space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex gap-4">
                          <Skeleton className="h-4 w-1/4" />
                          <Skeleton className="h-4 w-1/6" />
                          <Skeleton className="h-4 w-1/6" />
                          <Skeleton className="h-4 w-1/3" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </ResizablePanel>
            
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
