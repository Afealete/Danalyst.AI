import React from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Database, Zap, Shield, BarChart3, ChevronRight, Terminal, Network, Activity } from "lucide-react";
import { SiPython, SiPandas, SiOpenai } from "react-icons/si";

const FADE_UP = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }
};

const STAGGER = {
  visible: { transition: { staggerChildren: 0.1 } }
};

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-2 text-primary font-bold tracking-tight">
          <Database className="w-5 h-5" />
          DataLens
        </div>
        <button 
          onClick={() => setLocation('/app')}
          className="text-sm font-medium hover:text-primary transition-colors px-4 py-2"
        >
          Enter Workspace
        </button>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10" />
          
          <motion.div 
            className="max-w-5xl mx-auto text-center space-y-8"
            initial="hidden" animate="visible" variants={STAGGER}
          >
            <motion.div variants={FADE_UP} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono mb-4">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              v2.0 Engine Live
            </motion.div>
            
            <motion.h1 variants={FADE_UP} className="text-5xl md:text-7xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/70 leading-tight">
              Interrogate your data. <br/> Without the syntax.
            </motion.h1>
            
            <motion.p variants={FADE_UP} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Upload spreadsheets, ask questions in plain English, and get instant charts, insights, and executable Python code. The precision of a senior data scientist, the speed of a machine.
            </motion.p>
            
            <motion.div variants={FADE_UP} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button 
                onClick={() => setLocation('/app')}
                className="group relative px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-md overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto flex items-center justify-center gap-2"
              >
                <span className="relative z-10">Start Analyzing</span>
                <ChevronRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
              <button className="px-8 py-3.5 border border-border hover:bg-secondary text-foreground font-medium rounded-md transition-colors w-full sm:w-auto">
                View Documentation
              </button>
            </motion.div>
          </motion.div>
        </section>

        {/* Console Preview */}
        <section className="py-12 px-6">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-5xl mx-auto rounded-xl border border-border bg-card/50 shadow-2xl overflow-hidden backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-black/40">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="mx-auto text-xs text-muted-foreground font-mono">session_id: a7f8-92bc</div>
            </div>
            <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8 items-center bg-black/20">
              <div className="space-y-4">
                <div className="p-3 bg-secondary/30 rounded border border-border/50 text-sm font-mono text-muted-foreground">
                  {">"} Load dataset: Q4_Revenue.csv
                  <br />
                  <span className="text-green-400">✓ Loaded 45,210 rows, 12 columns</span>
                </div>
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm">"Show me the top 5 regions by total revenue, and plot a bar chart."</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" /> Analyzing distribution...
                  </div>
                  <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-primary" />
                  </div>
                </div>
              </div>
              <div className="border border-border/50 bg-background rounded-lg p-4 h-64 flex items-center justify-center text-muted-foreground text-sm flex-col gap-3">
                <BarChart3 className="w-8 h-8 text-primary/50" />
                <span className="font-mono text-xs">Chart rendered in 1.2s</span>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="py-24 px-6 border-t border-border/50 bg-black/10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl font-bold tracking-tight">Intelligence at scale</h2>
              <p className="text-muted-foreground">Built for datasets that break Excel. Powered by modern analytics stacks.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Terminal, title: "Zero Syntax", desc: "No SQL. No pandas. Just describe what you want to see and let the engine generate the exact transformations." },
                { icon: Zap, title: "Sub-second Execution", desc: "Complex group-bys, aggregations, and statistical summaries executed directly in an optimized backend environment." },
                { icon: Shield, title: "Enterprise Ready", desc: "Your data stays isolated per session. Executed in secure sandboxes with strict memory limits and guardrails." },
                { icon: BarChart3, title: "Publication Quality", desc: "Interactive Plotly visualizations returned instantly. Export as PNG or embed directly into your reports." },
                { icon: Network, title: "Automated Insights", desc: "Every query returns bulleted insights identifying outliers, trends, and correlations you might have missed." },
                { icon: Activity, title: "Transparent Logic", desc: "We don't hide the magic. View the exact Python code generated for every query so you can audit the math." }
              ].map((feature, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="p-6 rounded-xl border border-border bg-card/30 hover:bg-card/80 transition-colors"
                >
                  <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="py-20 px-6 border-t border-border/50">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Powered By</h3>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
              <div className="flex items-center gap-2 text-xl font-bold"><SiPython className="w-8 h-8" /> Python</div>
              <div className="flex items-center gap-2 text-xl font-bold"><SiPandas className="w-8 h-8" /> pandas</div>
              <div className="flex items-center gap-2 text-xl font-bold"><SiOpenai className="w-8 h-8" /> OpenAI</div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-32 px-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 border-t border-primary/10" />
          <div className="max-w-3xl mx-auto relative z-10 space-y-8">
            <h2 className="text-4xl font-bold tracking-tight">Stop writing boilerplate.</h2>
            <p className="text-xl text-muted-foreground">Join data professionals who get answers 10x faster with DataLens.</p>
            <button 
              onClick={() => setLocation('/app')}
              className="px-8 py-4 bg-foreground text-background font-semibold rounded-md hover:bg-foreground/90 transition-colors"
            >
              Open Workspace
            </button>
          </div>
        </section>
      </main>

      <footer className="py-8 text-center text-sm text-muted-foreground border-t border-border/40">
        <p>© {new Date().getFullYear()} DataLens. All rights reserved.</p>
      </footer>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
