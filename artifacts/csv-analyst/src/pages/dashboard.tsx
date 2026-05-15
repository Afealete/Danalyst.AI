import React, { useState } from "react";
import { useLocation } from "wouter";
import { 
  useGetDatasetSummary, 
  getGetDatasetSummaryQueryKey,
  useGetQueryHistory,
  useGetSampleDatasets,
  useLoadSampleDataset,
  useRunQuery,
  useExportResults,
  QueryResult,
  QueryHistoryItem,
  UploadResult
} from "@workspace/api-client-react";
import { 
  Upload, FileType, Play, Database, History, Download, AlignLeft, BarChart2, 
  MessageSquare, Loader2, Code, FileCode, CheckCircle2, AlertCircle, Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Plot from "react-plotly.js";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";

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
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [activeResult, setActiveResult] = useState<QueryResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Queries
  const { data: datasetSummary } = useGetDatasetSummary(
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
      toast({ title: "Dataset connected", description: result.message });
    } catch (err) {
      toast({ title: "Connection Error", description: "Failed to upload file", variant: "destructive" });
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
        toast({ title: "Dataset loaded", description: res.message });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to load sample dataset", variant: "destructive" });
      }
    });
  };

  const handleRunQuery = (questionText: string) => {
    if (!sessionId || !questionText.trim()) return;
    const q = questionText.trim();
    setCurrentQuery("");
    setActiveResult(null); // clear for loading state
    
    runQueryMutation.mutate({ data: { question: q, session_id: sessionId } }, {
      onSuccess: (res) => {
        setActiveResult(res);
        refetchHistory();
      },
      onError: () => {
        toast({ title: "Query failed", description: "Could not execute analysis", variant: "destructive" });
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
        a.download = `datalens-export-${activeResult.query_id}.csv`; 
        a.click();
      }
    });
  };

  const handleHistoryClick = (item: QueryHistoryItem) => {
    handleRunQuery(item.question);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans selection:bg-primary/30">
      
      {/* Sidebar Navigation */}
      <div className="w-16 border-r border-border bg-card flex flex-col items-center py-4 justify-between z-20">
        <div className="space-y-6 flex flex-col items-center">
          <button onClick={() => setLocation('/')} className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
            <Database className="w-5 h-5" />
          </button>
          
          <div className="w-8 h-px bg-border" />
          
          <button className="w-10 h-10 rounded-lg bg-secondary text-foreground flex items-center justify-center hover:bg-secondary/80 transition-colors" title="Workspace">
            <Activity className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 flex flex-col items-center">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
        {!sessionId ? (
          // NO DATASET LOADED
          <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background -z-10" />
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="max-w-4xl w-full space-y-12"
            >
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary/50 border border-border mb-4">
                  <Database className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight">Initialize Workspace</h1>
                <p className="text-lg text-muted-foreground">Upload a dataset to begin natural language analysis</p>
              </div>

              <div 
                {...getRootProps()} 
                className={`
                  relative overflow-hidden border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer backdrop-blur-sm
                  ${isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border bg-card/40 hover:border-primary/50 hover:bg-secondary/40'}
                  ${isUploading ? 'opacity-50 pointer-events-none' : ''}
                `}
              >
                <input {...getInputProps()} />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-6">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <div className="space-y-1">
                      <p className="text-lg font-medium">Mounting dataset...</p>
                      <p className="text-sm text-muted-foreground">Analyzing schema and building index</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6">
                    <div className="p-5 bg-background rounded-full shadow-xl border border-border">
                      <Upload className="w-10 h-10 text-primary" />
                    </div>
                    <div>
                      <p className="text-xl font-medium">Drag & drop your file</p>
                      <p className="text-sm text-muted-foreground mt-2">CSV or Excel format</p>
                    </div>
                  </div>
                )}
              </div>

              {sampleDatasets && sampleDatasets.length > 0 && (
                <div className="space-y-6 pt-8">
                  <div className="flex items-center gap-4">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Or load a sample</span>
                    <div className="h-px bg-border flex-1" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sampleDatasets.map(ds => (
                      <Card key={ds.id} className="p-5 hover:border-primary/40 cursor-pointer transition-all hover:shadow-lg bg-card/60 backdrop-blur" onClick={() => handleLoadSample(ds.id)}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <FileCode className="w-4 h-4 text-primary" />
                            <h4 className="font-semibold">{ds.name}</h4>
                          </div>
                          <Badge variant="secondary" className="font-mono text-[10px]">{ds.rows.toLocaleString()} rows</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{ds.description}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        ) : (
          // ACTIVE WORKSPACE
          <ResizablePanelGroup direction="horizontal" className="h-full w-full">
            
            {/* Left Panel: Context & Chat */}
            <ResizablePanel defaultSize={30} minSize={25} maxSize={40} className="bg-card border-r border-border flex flex-col z-10">
              
              {/* Dataset Context Header */}
              <div className="p-4 border-b border-border bg-background">
                {datasetSummary ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileType className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-medium text-sm truncate" title={datasetSummary.filename}>
                          {datasetSummary.filename}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => { setSessionId(null); setActiveResult(null); }}>
                        <CloseIcon className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                      <div className="flex items-center gap-1"><AlignLeft className="w-3 h-3" /> {datasetSummary.rows.toLocaleString()}</div>
                      <div className="flex items-center gap-1"><AlignLeft className="w-3 h-3 rotate-90" /> {datasetSummary.columns}</div>
                    </div>
                  </div>
                ) : (
                  <Skeleton className="h-12 w-full" />
                )}
              </div>

              {/* Chat Log & Output */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-6 pb-6">
                  {/* History Context (simplified view) */}
                  {queryHistory && queryHistory.length > 0 && !activeResult && !runQueryMutation.isPending && (
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Previous Queries</h3>
                      {queryHistory.slice(0, 5).map(item => (
                        <div 
                          key={item.query_id} 
                          onClick={() => handleHistoryClick(item)}
                          className="p-3 text-xs border border-border/50 rounded-lg bg-secondary/20 hover:bg-secondary/50 hover:border-border cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 text-foreground/80 mb-1">
                            <MessageSquare className="w-3 h-3 text-muted-foreground" />
                            {item.question}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty/Welcome State */}
                  {!activeResult && !runQueryMutation.isPending && (!queryHistory || queryHistory.length === 0) && (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Sparkles className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">DataLens Engine Ready</h3>
                        <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">Ask a question to generate analysis, charts, and insights.</p>
                      </div>
                    </div>
                  )}

                  {/* Loading State */}
                  {runQueryMutation.isPending && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className="p-4 bg-secondary/40 rounded-xl border border-border/50 text-sm">
                        {runQueryMutation.variables?.data?.question}
                      </div>
                      <div className="flex items-center gap-3 p-4 bg-background border border-border rounded-xl">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Executing query...</p>
                          <p className="text-xs font-mono text-muted-foreground">Synthesizing python code & charts</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Active Result Context */}
                  {activeResult && !runQueryMutation.isPending && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <div className="p-4 bg-secondary/40 rounded-xl border border-border/50 text-sm font-medium">
                        {activeResult.question}
                      </div>

                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="text-sm leading-relaxed text-foreground/90">
                            {activeResult.answer}
                          </div>
                        </div>

                        {activeResult.insights && activeResult.insights.length > 0 && (
                          <div className="ml-9 p-4 bg-primary/5 rounded-xl border border-primary/10">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider mb-3 text-primary flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3" /> Key Insights
                            </h4>
                            <ul className="space-y-2">
                              {activeResult.insights.map((insight, i) => (
                                <li key={i} className="text-xs text-foreground/80 leading-relaxed flex items-start gap-2">
                                  <span className="text-primary/50 mt-0.5">•</span>
                                  <span>{insight}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {activeResult.generated_code && (
                          <div className="ml-9 mt-2">
                            <details className="group">
                              <summary className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5 select-none">
                                <Code className="w-3 h-3" /> View Source Code
                              </summary>
                              <div className="mt-3 relative rounded-lg overflow-hidden border border-border/50 bg-[#0d0d0d]">
                                <div className="absolute top-0 left-0 right-0 h-6 bg-white/5 border-b border-white/5 flex items-center px-3">
                                  <span className="text-[9px] font-mono text-muted-foreground">python</span>
                                </div>
                                <pre className="p-4 pt-8 text-[11px] overflow-x-auto font-mono text-zinc-300 leading-relaxed">
                                  {activeResult.generated_code}
                                </pre>
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-4 border-t border-border bg-background">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRunQuery(currentQuery);
                  }}
                  className="relative group"
                >
                  <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none rounded-full" />
                  <Input
                    placeholder="Ask a question about the data..."
                    className="pr-12 bg-card border-border/50 focus-visible:ring-1 focus-visible:ring-primary shadow-sm rounded-full h-12 relative z-10"
                    value={currentQuery}
                    onChange={(e) => setCurrentQuery(e.target.value)}
                    disabled={runQueryMutation.isPending}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="absolute right-1.5 top-1.5 h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground z-10"
                    disabled={!currentQuery.trim() || runQueryMutation.isPending}
                  >
                    <Play className="w-4 h-4 ml-0.5" />
                  </Button>
                </form>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border/50 w-1" />

            {/* Right Panel: Visualization & Data */}
            <ResizablePanel defaultSize={70}>
              <div className="h-full bg-background relative flex flex-col">
                {activeResult ? (
                  <Tabs defaultValue={activeResult.chart && activeResult.chart.type !== 'none' ? "chart" : "data"} className="h-full flex flex-col">
                    
                    {/* Results Toolbar */}
                    <div className="flex items-center justify-between px-4 border-b border-border bg-card h-14 shrink-0">
                      <TabsList className="h-9 bg-secondary/50">
                        {activeResult.chart && activeResult.chart.type !== 'none' && (
                          <TabsTrigger value="chart" className="text-xs">
                            <BarChart2 className="w-3.5 h-3.5 mr-2" /> Visual
                          </TabsTrigger>
                        )}
                        <TabsTrigger value="data" className="text-xs">
                          <Database className="w-3.5 h-3.5 mr-2" /> Data Table
                        </TabsTrigger>
                      </TabsList>
                      
                      <div className="flex items-center gap-4">
                        {activeResult.execution_time_ms && (
                          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
                            <Activity className="w-3 h-3" />
                            {(activeResult.execution_time_ms / 1000).toFixed(2)}s
                          </span>
                        )}
                        {activeResult.result_table && (
                          <Button variant="secondary" size="sm" className="h-8 text-xs font-medium" onClick={handleExport} disabled={exportMutation.isPending}>
                            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 overflow-hidden relative bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-repeat bg-fixed" style={{ backgroundSize: '400px' }}>
                      <div className="absolute inset-0 bg-background/95 backdrop-blur-[1px] pointer-events-none" />
                      
                      <div className="absolute inset-4 bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm flex flex-col">
                        
                        {activeResult.chart && activeResult.chart.type !== 'none' && activeResult.chart.plotly_json && (
                          <TabsContent value="chart" className="flex-1 m-0 p-2 data-[state=inactive]:hidden outline-none">
                            <div className="w-full h-full">
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
                                config={{ displayModeBar: false, responsive: true }}
                              />
                            </div>
                          </TabsContent>
                        )}

                        <TabsContent value="data" className="flex-1 m-0 data-[state=inactive]:hidden flex flex-col outline-none">
                          {activeResult.result_table && activeResult.result_table.columns ? (
                            <>
                              <div className="px-4 py-2 border-b border-border/50 bg-secondary/20 flex justify-between items-center shrink-0">
                                <span className="text-xs font-medium">Result Set</span>
                                <Badge variant="outline" className="text-[10px] font-mono">{activeResult.result_table.rows.length.toLocaleString()} rows</Badge>
                              </div>
                              <ScrollArea className="flex-1">
                                <Table>
                                  <TableHeader className="bg-secondary/40 sticky top-0 backdrop-blur-md z-10">
                                    <TableRow className="border-border/50">
                                      {activeResult.result_table.columns.map((col, i) => (
                                        <TableHead key={i} className="h-8 py-1 text-xs whitespace-nowrap text-foreground font-semibold">{col}</TableHead>
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {activeResult.result_table.rows.map((row, i) => (
                                      <TableRow key={i} className="border-border/20 hover:bg-secondary/20">
                                        {row.map((cell: any, j) => (
                                          <TableCell key={j} className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                                            {cell === null ? <span className="text-muted-foreground/50 italic">null</span> : String(cell)}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </ScrollArea>
                            </>
                          ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm gap-2">
                              <AlertCircle className="w-4 h-4" /> No tabular data generated for this query.
                            </div>
                          )}
                        </TabsContent>

                      </div>
                    </div>
                  </Tabs>
                ) : (
                  <div className="h-full flex items-center justify-center bg-card/30">
                    <div className="text-center space-y-4 max-w-sm opacity-50">
                      <BarChart2 className="w-16 h-16 mx-auto text-muted-foreground" />
                      <p className="text-sm font-medium">No active visual</p>
                      <p className="text-xs text-muted-foreground">Execute a query from the left panel to generate charts and tables here.</p>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>

          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

function Sun({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
}

function Moon({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>;
}

function CloseIcon({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
}

function Activity({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}
