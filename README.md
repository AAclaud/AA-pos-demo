# AA POS

Sistema de punto de venta genérico, listo para personalizar por cliente.
Multi-sucursal · Multi-dispositivo · Login por PIN · Tiempo real (SSE) · Modo Mostrador (toma express) · Reportes con PDF

Desarrollado por **AA Projects**.

## Personalización por cliente

El branding (nombre comercial, moneda, etc.) se configura vía variables de entorno:

| Variable          | Default        | Ejemplo                    |
| ----------------- | -------------- | -------------------------- |
| `BRAND_NAME`      | `AA POS`       | `Taquería Nueva Orden`     |
| `BRAND_TAGLINE`   | (vacío)        | `Taquería`                 |
| `BRAND_CURRENCY`  | `Q`            | `$`, `€`, `MXN`            |
| `BRAND_CREDIT`    | `AA Projects`  | `AA Projects`              |
| `DATA_FILE`       | `./data.json`  | `/data/data.json` (Railway volume) |
| `PORT`            | `3000`         | (Railway lo inyecta)       |

El nombre y ciudad de cada sucursal se editan desde el panel **Admin** en la app.

---

## Archivos

```
.
├── server.js    ← Servidor Node.js
├── index.html   ← App web (React + Jost/Futura)
├── data.json    ← Base de datos (auto-generada)
└── README.md
```

---

## Iniciar (red local)

```bash
node server.js
```

Accede desde:
- Esta PC: `http://localhost:3000`
- Otros dispositivos (celular / tablet / caja) en el mismo WiFi: `http://[IP-local]:3000`

La terminal imprime la IP de red al iniciar.

---

## Multi-dispositivo

Cualquier dispositivo (celular, tablet, laptop, caja) en la misma red puede abrir la URL `http://[IP]:3000` y trabajar en simultáneo: lo que uno cambia se sincroniza en los demás en tiempo real (Server-Sent Events). No hace falta instalar nada, solo un navegador.

Vistas optimizadas:

| Dispositivo | Experiencia |
|-------------|-------------|
| Celular     | Navegación inferior, vista compacta |
| Tablet      | **Modo Mostrador** ideal — botones grandes, toma express |
| Desktop     | Navegación superior, orden + separar cuentas |

---

## Modo Mostrador (tablet / caja)

Pestaña **Mostrador**: optimizada para toma de pedidos express (típico de caja o ventanilla).
- Grid grande de productos táctil
- Ticket numerado automáticamente
- Cobro directo sin asignar mesa
- Historial rápido de últimos tickets

---

## Login por PIN

| Rol    | PIN por defecto | Acceso |
|--------|-----------------|--------|
| Cajero | `0000`          | Mesas, Mostrador, Caja, Inventario |
| Admin  | `1234`          | Todo lo anterior + Menú, Reportes, Admin |

**Cambiar PINs:** entra como Admin → pestaña Admin → Seguridad.

---

## Reportes contables

Pestaña **Reportes** (solo admin):
- Selector **Diario / Semanal / Mensual**
- KPIs: total, N° ventas, venta promedio, top producto
- Desglose mesas vs. mostrador
- Gráficas: ventas por hora (diario) o por día (semanal/mensual), mix de productos (dona)
- Botón **📄 Descargar PDF**: genera informe formateado con portada, KPIs, gráfica, tabla de ventas por producto y detalle de transacciones.

---

## Publicar a la web (acceso desde internet)

Para que las sucursales / dispositivos se conecten desde cualquier lugar con internet, sube el proyecto a un servidor en la nube. Recomendado:

### Opción A — Railway (gratis para empezar, más simple)

1. Crea cuenta en [railway.app](https://railway.app)
2. `New Project` → `Deploy from GitHub` (sube primero el repo) o `Empty Project` y arrastra los archivos
3. Railway detecta Node automáticamente. Agrega la variable de entorno:
   - `PORT = 3000`
4. En `Settings` → `Networking` → `Generate Domain`. Obtienes una URL tipo `nueva-orden.up.railway.app`
5. Abre esa URL en cualquier dispositivo. Listo.

**Importante:** Railway borra el disco en cada redeploy. Para que `data.json` persista, agrega un **Volume** montado en `/app` (Settings → Volumes → `+ New Volume` → Mount path `/app`).

### Opción B — Render (gratis con sleep)

1. [render.com](https://render.com) → `New Web Service`
2. Conecta repo o sube archivos
3. `Build Command`: (vacío)
4. `Start Command`: `node server.js`
5. Plan Free (se duerme tras 15 min sin uso; despierta en 30 seg)
6. Para persistencia, agrega `Disk` de 1 GB montado en `/opt/render/project/src`

### Opción C — VPS (control total, ~$6/mes)

```bash
# En el VPS (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
# sube los archivos (scp / git clone)
cd aa-nueva-orden
sudo npm install -g pm2
pm2 start server.js --name nueva-orden
pm2 startup && pm2 save
# abre puerto 80/443 en el firewall, configura Nginx + HTTPS si quieres
```

### Opción D — Fly.io (globalmente distribuido, gratis)

1. Instala `flyctl`
2. `fly launch` en la carpeta del proyecto (detecta Node, pregunta nombre y región)
3. `fly volumes create data --size 1` (para persistir data.json)
4. Edita `fly.toml` y monta el volumen en `/app`
5. `fly deploy`

---

## Respaldo de datos

```bash
# En el servidor
cp data.json data-backup-$(date +%Y%m%d).json
```

Para **reiniciar todos los datos**: elimina `data.json` y reinicia el servidor (se recrea con valores por defecto).

---

## Cambiar puerto

```bash
PORT=8080 node server.js
```

---

## Créditos

**AA Projects** — Sistema de toma de pedidos.
