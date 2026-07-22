const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'winpy_products.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

// Scraper state
let scraperProcess = null;
let scraperStatus = {
  running: false,
  phase: 'idle',
  current: 0,
  total: 0,
  message: 'El raspador no está ejecutándose.',
  startTime: null,
  logs: []
};

// Helper to open DB
function getDb() {
  return new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err);
    }
  });
}

// 1. Get products
app.get('/api/products', (req, res) => {
  const db = getDb();
  const query = `
    SELECT p.*, 
      (SELECT group_concat(date || ':' || cash_price || ':' || normal_price || ':' || stock, '|') 
       FROM price_history WHERE sku = p.sku ORDER BY date ASC) as price_history_list
    FROM products p
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al consultar productos' });
    } else {
      // Format response, parse specs and price history
      const formatted = rows.map(r => {
        let detailed = {};
        try {
          detailed = JSON.parse(r.detailed_specs || '{}');
        } catch (e) {}

        let history = [];
        if (r.price_history_list) {
          history = r.price_history_list.split('|').map(h => {
            const [date, cash, normal, stock] = h.split(':');
            return {
              date,
              cash_price: parseInt(cash) || null,
              normal_price: parseInt(normal) || null,
              stock: parseInt(stock) || 0
            };
          });
        }

        return {
          sku: r.sku,
          title: r.title,
          brand: r.brand,
          category: r.category,
          condition: r.condition,
          url: r.url,
          cash_price: r.cash_price,
          normal_price: r.normal_price,
          discount: r.discount,
          stock: r.stock,
          spec_processor: r.spec_processor,
          spec_memory: r.spec_memory,
          spec_storage: r.spec_storage,
          spec_os: r.spec_os,
          detailed_specs: detailed,
          image_url: r.image_url,
          scraped_at: r.scraped_at,
          price_history: history
        };
      });
      res.json(formatted);
    }
    db.close();
  });
});

// 2. Get scraper statistics & status
app.get('/api/scraper/status', (req, res) => {
  const db = getDb();
  
  // We want to query:
  // - Total categories & scraped categories
  // - Total queue, completed queue, failed queue
  const stats = {
    total_categories: 0,
    scraped_categories: 0,
    total_queue: 0,
    completed_queue: 0,
    failed_queue: 0,
    total_products: 0
  };
  
  db.serialize(() => {
    db.get("SELECT COUNT(*) as cnt FROM categories", (err, row) => {
      if (row) stats.total_categories = row.cnt;
    });
    db.get("SELECT COUNT(*) as cnt FROM categories WHERE scraped = 1", (err, row) => {
      if (row) stats.scraped_categories = row.cnt;
    });
    db.get("SELECT COUNT(*) as cnt FROM product_queue", (err, row) => {
      if (row) stats.total_queue = row.cnt;
    });
    db.get("SELECT COUNT(*) as cnt FROM product_queue WHERE status = 'completed'", (err, row) => {
      if (row) stats.completed_queue = row.cnt;
    });
    db.get("SELECT COUNT(*) as cnt FROM product_queue WHERE status = 'failed'", (err, row) => {
      if (row) stats.failed_queue = row.cnt;
    });
    db.get("SELECT COUNT(*) as cnt FROM products", (err, row) => {
      if (row) stats.total_products = row.cnt;
      
      // Send stats combined with active process state
      res.json({
        ...scraperStatus,
        stats
      });
      db.close();
    });
  });
});

// 3. Start scraper
app.post('/api/scraper/start', (req, res) => {
  if (scraperProcess) {
    return res.status(400).json({ error: 'El raspador ya está ejecutándose' });
  }

  const { limitCategory, mode } = req.body;
  const args = ['scraper.py'];

  if (mode === 'crawl-only') {
    args.push('--crawl-only');
  } else if (mode === 'scrape-only') {
    args.push('--scrape-only');
  }

  if (limitCategory) {
    args.push('--limit-category', limitCategory);
  }

  // Force sitemap reload if starting from scratch
  args.push('--sitemap');

  scraperStatus = {
    running: true,
    phase: 'starting',
    current: 0,
    total: 0,
    message: 'Iniciando el script del raspador...',
    startTime: new Date().toISOString(),
    logs: []
  };

  const scriptPath = path.join(__dirname, 'scraper.py');
  
  // Make sure script is executable (failsafe)
  try {
    fs.chmodSync(scriptPath, '755');
  } catch (e) {}

  scraperProcess = spawn('python3', args, { cwd: __dirname });

  scraperProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        // Try parsing JSON progress output
        const parsed = JSON.parse(line);
        if (parsed.type === 'progress') {
          scraperStatus.phase = parsed.phase;
          scraperStatus.current = parsed.current;
          scraperStatus.total = parsed.total;
          scraperStatus.message = parsed.message;
          
          const logMsg = `[${parsed.phase.toUpperCase()}] ${parsed.message}`;
          scraperStatus.logs.push(logMsg);
          console.log(logMsg);
        } else {
          scraperStatus.logs.push(line);
          console.log(line);
        }
      } catch (e) {
        // Fallback for plain text output
        scraperStatus.logs.push(line);
        console.log(line);
      }
      
      // Limit logs memory
      if (scraperStatus.logs.length > 200) {
        scraperStatus.logs.shift();
      }
    }
  });

  scraperProcess.stderr.on('data', (data) => {
    const errText = data.toString().trim();
    if (errText) {
      scraperStatus.logs.push(`[STDERR] ${errText}`);
      console.error(`[Scraper Error] ${errText}`);
    }
  });

  scraperProcess.on('close', (code) => {
    scraperProcess = null;
    scraperStatus.running = false;
    scraperStatus.phase = 'completed';
    scraperStatus.message = `Raspador completado con código de salida ${code}.`;
    scraperStatus.logs.push(`[SISTEMA] El proceso del raspador finalizó con código: ${code}`);
    console.log(`Scraper process finished with code ${code}`);
  });

  res.json({ success: true, message: 'Raspador iniciado en segundo plano' });
});

// 4. Stop scraper
app.post('/api/scraper/stop', (req, res) => {
  if (!scraperProcess) {
    return res.status(400).json({ error: 'El raspador no está en ejecución' });
  }

  scraperProcess.kill('SIGINT');
  res.json({ success: true, message: 'Deteniendo el raspador...' });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
