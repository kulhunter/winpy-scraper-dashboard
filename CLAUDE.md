# Guía de Desarrollo de WinpyDB (CLAUDE.md)

## Comandos Clave

- **Instalar y Ejecutar Todo:**
  ```bash
  chmod +x run.sh
  ./run.sh
  ```
- **Arrancar Backend (Desarrollo):**
  ```bash
  npm run dev
  ```
- **Arrancar Backend (Producción):**
  ```bash
  npm start
  ```
- **Ejecutar Raspador desde Consola (Prueba de URL individual):**
  ```bash
  python3 scraper.py --url <URL-del-producto>
  ```
- **Ejecutar Raspador Completo (o filtrar categoría):**
  ```bash
  python3 scraper.py --sitemap --limit-category notebooks
  ```

## Reglas de Codificación y Diseño

- **Backend (Express):**
  - Mantener las rutas limpias bajo `/api`.
  - Usar sqlite3 de Node de forma serializada o con cierres de conexión correctos para evitar bloqueos del archivo de base de datos.
- **Frontend (Vanilla CSS/JS):**
  - Estilos guardados en `styles.css` con variables CSS para el tema oscuro, bordes y fuentes.
  - Interactividad pura y fluida con transiciones de 0.2s en botones y filas.
  - Gráficos estadísticos y curvas de precio usando elementos SVG nativos creados dinámicamente con `document.createElementNS("http://www.w3.org/2000/svg", ...)`.
- **Python (Scraper):**
  - Respetar los tiempos de espera (`time.sleep(0.8)`) para evitar bloqueos de IP o de Cloudflare.
  - El scraper debe devolver logs estructurados en JSON usando `log_progress` para que el servidor Node los procese en vivo.
