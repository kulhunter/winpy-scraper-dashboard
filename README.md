# WinpyDB: Raspador de Precios y Panel de Comparación

Este proyecto es un sistema local completo para rastrear, recopilar, agrupar y comparar productos de la tienda chilena **Winpy.cl**. Integra un raspador resiliente en Python y un servidor Node.js que despliega un dashboard web interactivo con estética moderna y oscura (glassmorphism).

## Características Implementadas

- **Extracción Resiliente (Python):** 
  - Utiliza `curl_cffi` para emular firmas TLS de Chrome y evadir desafíos de seguridad de Cloudflare.
  - Implementación en dos fases (Cola de URLs y Raspado final) que guarda el progreso en SQLite.
  - Soporta interrupciones y reanudaciones limpias.
  - Permite filtrar por categorías específicas (ej: `notebooks`) para realizar pruebas rápidas de scraping en segundos.
- **Historial de Precios:**
  - Guarda un registro de precios históricos (efectivo y tarjeta) y stock para cada producto en cada ejecución.
  - Dibuja curvas de tendencia y variaciones en una gráfica SVG interna en el modal de detalles de cada producto.
- **Catálogo Interactivo de Productos:**
  - Tabla de alto rendimiento con búsqueda instantánea y ordenamiento.
  - Filtros avanzados por Categoría, Marca, Condición (Nuevo / Usado), Rango de Precio y Disponibilidad de Stock.
  - Exportación de la selección completa en formato CSV de un solo clic.
- **Comparador Cara a Cara:**
  - Comparativa de múltiples productos side-by-side en una matriz de especificaciones.
  - **Detección automática de diferencias:** Se marcan en un fondo púrpura resaltado aquellas celdas donde los valores de las especificaciones técnicas difieren entre los productos comparados.
- **Agrupador Estadístico:**
  - Genera resúmenes agregados (cantidad de productos, stock total, rango de precios, precio promedio y descuento promedio) agrupando dinámicamente por **Marca** o **Categoría**.
  - Dibuja un gráfico de barras interactivo en SVG.

## Requisitos de Sistema

- **Node.js** v18 o superior.
- **Python 3.9** o superior.
- Paquetes de Python: `curl_cffi` y `beautifulsoup4`.
- Conexión a Internet.

## Instrucciones de Inicio Rápido

1. **Dar permisos e iniciar el script automático:**
   ```bash
   chmod +x run.sh
   ./run.sh
   ```
   *(Este script verificará/instalará las dependencias de Node.js y Python y arrancará el servidor en el puerto 3000).*

2. **Abrir el Dashboard:**
   Abra en su navegador la dirección: [http://localhost:3000](http://localhost:3000).

3. **Prueba rápida de Raspado:**
   - Vaya a la pestaña **Control de Sincronización**.
   - Ingrese `notebooks` (o cualquier palabra clave) en el campo "Filtrar por Categoría".
   - Presione **Iniciar Sincronización** para ver en tiempo real cómo se carga el sitemap, se encolan los productos y se extrae su información detallada.
   - Una vez finalizado, los productos aparecerán automáticamente en el **Catálogo Completo**.
