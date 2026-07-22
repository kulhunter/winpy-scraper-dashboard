#!/bin/bash
# Script de arranque para el Raspador y Dashboard de Winpy

echo "============================================="
echo "  WINPYDB: INICIANDO ENTORNO Y SERVIDOR      "
echo "============================================="

# 1. Verificar dependencias de Python
echo "Verificando dependencias de Python..."
python3 -c "import curl_cffi, bs4" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Error: Faltan paquetes de Python necesarios (curl_cffi, beautifulsoup4)."
  echo "Intentando instalar dependencias..."
  pip3 install curl_cffi beautifulsoup4
  if [ $? -ne 0 ]; then
    echo "Error crítico: No se pudieron instalar las dependencias de Python automáticamente."
    echo "Por favor ejecute manualmente: pip3 install curl_cffi beautifulsoup4"
    exit 1
  fi
fi
echo "✓ Dependencias de Python verificadas correctamente."

# 2. Instalar dependencias de Node.js
echo "Instalando dependencias de Node.js..."
npm install
if [ $? -ne 0 ]; then
  echo "Error crítico al instalar las dependencias de Node.js."
  exit 1
fi
echo "✓ Dependencias de Node.js listas."

# 3. Arrancar servidor
echo "Iniciando el servidor Express en el puerto 3000..."
echo "Abra en su navegador la dirección: http://localhost:3000"
echo "============================================="
npm start
