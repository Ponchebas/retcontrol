import React, { useState, useEffect, useCallback, useRef } from "react";

// ╔══════════════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN — Pega tus credenciales aquí                 ║
// ╚══════════════════════════════════════════════════════════════╝
const CONFIG = {
  SPREADSHEET_ID: "1x5vq_fqj7h-_UDXAJ2F974__XqFC1Nk04s6TY7TSMhE",
  API_KEY: "AIzaSyC-kH-LVcuGu5XZHlXQ6I2EFASe5qK_t08",
  // URL del Apps Script (para escritura)
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbyZv-rMY2i2mHXn5MeVpDG-rmyvPK2koogAQfDS-ATuGQjW-C-V7AvtJy8ZQxuLQo0wCA/exec",
  SHEET_CLIENTES: "Clientes",
  SHEET_LOGS: "Bitacora",
};

// ╔══════════════════════════════════════════════════════════════╗
// ║  GOOGLE SHEETS API                                          ║
// ╚══════════════════════════════════════════════════════════════╝
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsRead(range) {
  const url = `${SHEETS_BASE}/${CONFIG.SPREADSHEET_ID}/values/${range}?key=${CONFIG.API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  const d = await r.json();
  return d.values || [];
}

// Apps Script como puente de escritura
async function sheetsWrite(range, values) {
  const r = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "update",
      sheet: range.split("!")[0],
      range,
      row: values[0],
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sheetsAppend(sheet, values) {
  const r = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action: "append", sheet, row: values[0] }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── PARSE ROWS ────────────────────────────────────────────────
// Clientes: ID|Nombre|NIT|Teléfono|Contacto|Correo|Valor|ICA|IVA|Rete|UltimaGestion|Intentos|Fila
function parseClientes(rows) {
  return rows.slice(1).map((r, i) => ({
    id: r[0] || "",
    nombre: r[1] || "",
    nit: r[2] || "",
    telefono: r[3] || "",
    contacto: r[4] || "",
    correo: r[5] || "",
    valor: parseFloat(r[6]) || 0,
    ica: r[7] || "pendiente",
    iva: r[8] || "pendiente",
    rete: r[9] || "pendiente",
    ultimaGestion: r[10] || null,
    intentos: parseInt(r[11]) || 0,
    _row: i + 2, // fila real en sheets (1=header)
  }));
}
// Logs: ID|ClienteID|Cliente|Fecha|Tipo|Resultado|Obs
function parseLogs(rows) {
  return rows.slice(1).map((r) => ({
    id: r[0] || "",
    clienteId: r[1] || "",
    cliente: r[2] || "",
    fecha: r[3] || "",
    tipo: r[4] || "",
    resultado: r[5] || "",
    obs: r[6] || "",
  }));
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  UTILS                                                       ║
// ╚══════════════════════════════════════════════════════════════╝
const getClasif = (v) => (!v ? "—" : v > 800000 ? "A" : v > 300000 ? "B" : "C");
const getDias = (d) =>
  !d ? null : Math.floor((Date.now() - new Date(d)) / 86400000);
const getEstado = (c) => {
  const vals = [c.ica, c.iva, c.rete].filter((v) => v !== "na");
  if (!vals.length) return "na";
  if (vals.every((v) => v === "recibido")) return "completo";
  if (vals.every((v) => v === "pendiente")) return "pendiente";
  return "proceso";
};
const fmtMoney = (v) => (v ? "$" + Number(v).toLocaleString("es-CO") : "—");
const fmtDateTime = (d) =>
  !d
    ? "—"
    : new Date(d).toLocaleString("es-CO", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const C = {
  bg: "#080b12",
  surface: "#0e1220",
  surface2: "#141929",
  border: "#1e2740",
  accent: "#4f7fe8",
  green: "#2dd4a0",
  yellow: "#f5a623",
  red: "#f06060",
  muted: "#4e5a80",
  text: "#d8ddf0",
};

// ── MINI COMPONENTS ───────────────────────────────────────────
const retMap = {
  recibido: { bg: "rgba(45,212,160,.14)", c: "#2dd4a0", icon: "✅" },
  proceso: { bg: "rgba(245,166,35,.14)", c: "#f5a623", icon: "⏳" },
  pendiente: { bg: "rgba(240,96,96,.14)", c: "#f06060", icon: "❌" },
  na: { bg: "rgba(78,90,128,.14)", c: "#4e5a80", icon: "➖" },
};
const Chip = ({ val }) => {
  const s = retMap[val] || retMap.na;
  return (
    <span
      style={{
        background: s.bg,
        color: s.c,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "monospace",
      }}
    >
      {s.icon}
    </span>
  );
};
const estMap = {
  completo: { bg: "rgba(45,212,160,.12)", c: "#2dd4a0", label: "✅ Completo" },
  proceso: { bg: "rgba(245,166,35,.12)", c: "#f5a623", label: "⏳ En proceso" },
  pendiente: {
    bg: "rgba(240,96,96,.12)",
    c: "#f06060",
    label: "❌ Sin iniciar",
  },
  na: { bg: "rgba(78,90,128,.12)", c: "#4e5a80", label: "➖" },
};
const EstBadge = ({ est }) => {
  const s = estMap[est] || estMap.na;
  return (
    <span
      style={{
        background: s.bg,
        color: s.c,
        padding: "3px 10px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {s.label}
    </span>
  );
};
const clsMap = {
  A: ["rgba(240,96,96,.2)", "#f06060"],
  B: ["rgba(245,166,35,.2)", "#f5a623"],
  C: ["rgba(45,212,160,.2)", "#2dd4a0"],
};
const ClsB = ({ v }) => {
  if (!v || v === "—")
    return <span style={{ color: C.muted, fontSize: 12 }}>—</span>;
  const [bg, col] = clsMap[v] || ["rgba(78,90,128,.2)", "#4e5a80"];
  return (
    <span
      style={{
        background: bg,
        color: col,
        width: 22,
        height: 22,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {v}
    </span>
  );
};
const DiasC = ({ d }) => {
  if (d === null)
    return <span style={{ color: C.muted, fontSize: 12 }}>—</span>;
  const col = d <= 2 ? C.green : d <= 5 ? C.yellow : C.red;
  return (
    <span
      style={{
        color: col,
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: d > 5 ? 700 : 400,
      }}
    >
      {d > 5 ? "⚠️ " : ""}
      {d}d
    </span>
  );
};

const inp = {
  background: C.surface2,
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  width: "100%",
  fontFamily: "inherit",
  outline: "none",
};
const lbl = {
  fontSize: 11,
  fontWeight: 700,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: ".06em",
  display: "block",
  marginBottom: 5,
};

// ╔══════════════════════════════════════════════════════════════╗
// ║  SETUP SCREEN                                               ║
// ╚══════════════════════════════════════════════════════════════╝
function SetupScreen({ onSave }) {
  const [cfg, setCfg] = useState({
    spreadsheetId:
      CONFIG.SPREADSHEET_ID === "TU_SPREADSHEET_ID_AQUI"
        ? ""
        : CONFIG.SPREADSHEET_ID,
    apiKey: CONFIG.API_KEY === "TU_API_KEY_AQUI" ? "" : CONFIG.API_KEY,
    serviceAccountJson: "",
  });
  const [step, setStep] = useState(1);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const url = `${SHEETS_BASE}/${cfg.spreadsheetId}/values/Clientes!A1?key=${cfg.apiKey}`;
      const r = await fetch(url);
      if (r.ok)
        setTestResult({
          ok: true,
          msg: "✅ Conexión exitosa. Hoja 'Clientes' encontrada.",
        });
      else {
        const err = await r.json();
        setTestResult({
          ok: false,
          msg: "❌ " + (err.error?.message || "Error de conexión"),
        });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: "❌ " + e.message });
    }
    setTesting(false);
  };

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'DM Sans',sans-serif",
        color: C.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{ width: 560, maxWidth: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".14em",
              color: C.accent,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            RetControl · Google Sheets
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 10px" }}>
            Configuración inicial
          </h1>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
            Conecta la app con tu Google Sheet para que los datos persistan
            <br />y sean accesibles para todo tu equipo.
          </p>
        </div>

        {/* Steps indicator */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 32,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "16%",
              right: "16%",
              height: 2,
              background: C.border,
              zIndex: 0,
            }}
          />
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                textAlign: "center",
                position: "relative",
                zIndex: 1,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  margin: "0 auto 6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 800,
                  background: step >= s ? C.accent : C.surface2,
                  color: step >= s ? "#fff" : C.muted,
                  border: `2px solid ${step >= s ? C.accent : C.border}`,
                  transition: "all .2s",
                }}
              >
                {step > s ? "✓" : s}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: step >= s ? C.text : C.muted,
                  fontWeight: 600,
                }}
              >
                {["Spreadsheet", "Credenciales", "Verificar"][s - 1]}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 28,
              animation: "fadeIn .2s",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              Paso 1 — ID del Google Sheet
            </h3>
            <p
              style={{
                color: C.muted,
                fontSize: 13,
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              Crea un nuevo Google Sheet y asegúrate de tener dos pestañas
              llamadas exactamente:
              <code
                style={{
                  background: C.surface2,
                  padding: "1px 6px",
                  borderRadius: 4,
                  marginLeft: 6,
                  fontFamily: "monospace",
                }}
              >
                Clientes
              </code>{" "}
              y
              <code
                style={{
                  background: C.surface2,
                  padding: "1px 6px",
                  borderRadius: 4,
                  marginLeft: 4,
                  fontFamily: "monospace",
                }}
              >
                Bitacora
              </code>
              .<br />
              <br />
              El ID está en la URL de tu Sheet:
              <br />
              <code
                style={{
                  background: C.surface2,
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  display: "block",
                  marginTop: 6,
                  color: C.accent,
                  fontFamily: "monospace",
                }}
              >
                docs.google.com/spreadsheets/d/
                <b style={{ color: C.yellow }}>ESTE_ES_EL_ID</b>/edit
              </code>
            </p>
            <label style={lbl}>ID del Spreadsheet</label>
            <input
              style={inp}
              value={cfg.spreadsheetId}
              onChange={(e) =>
                setCfg((c) => ({ ...c, spreadsheetId: e.target.value }))
              }
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
            <button
              onClick={() => setStep(2)}
              disabled={!cfg.spreadsheetId.trim()}
              style={{
                marginTop: 20,
                background: cfg.spreadsheetId.trim() ? C.accent : "#2a3148",
                border: "none",
                color: "#fff",
                padding: "10px 24px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: cfg.spreadsheetId.trim() ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                width: "100%",
              }}
            >
              Continuar →
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 28,
              animation: "fadeIn .2s",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              Paso 2 — Credenciales Google Cloud
            </h3>
            <p
              style={{
                color: C.muted,
                fontSize: 13,
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              En{" "}
              <a
                href="https://console.cloud.google.com"
                target="_blank"
                style={{ color: C.accent }}
              >
                console.cloud.google.com
              </a>
              :<br />
              1. Crea un proyecto → activa <b>Google Sheets API</b>
              <br />
              2. Credenciales → <b>Clave de API</b> (para lectura)
              <br />
              3. Credenciales → <b>Cuenta de servicio</b> → descarga JSON (para
              escritura)
              <br />
              4. Comparte tu Sheet con el email de la cuenta de servicio
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={lbl}>API Key</label>
                <input
                  style={inp}
                  type="password"
                  value={cfg.apiKey}
                  onChange={(e) =>
                    setCfg((c) => ({ ...c, apiKey: e.target.value }))
                  }
                  placeholder="AIzaSy..."
                />
              </div>
              <div>
                <label style={lbl}>
                  Service Account JSON (pega el contenido completo del archivo
                  .json)
                </label>
                <textarea
                  style={{
                    ...inp,
                    height: 100,
                    resize: "vertical",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  value={cfg.serviceAccountJson}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      serviceAccountJson: e.target.value,
                    }))
                  }
                  placeholder='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----...","client_email":"..."}'
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.muted,
                  padding: "10px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ← Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!cfg.apiKey.trim()}
                style={{
                  flex: 1,
                  background: cfg.apiKey.trim() ? C.accent : "#2a3148",
                  border: "none",
                  color: "#fff",
                  padding: "10px 24px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: cfg.apiKey.trim() ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                }}
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 28,
              animation: "fadeIn .2s",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              Paso 3 — Verificar conexión
            </h3>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
              Prueba que la app puede leer tu Google Sheet antes de continuar.
            </p>
            <div
              style={{
                background: C.surface2,
                borderRadius: 10,
                padding: 16,
                marginBottom: 20,
                fontSize: 12,
                fontFamily: "monospace",
                color: C.muted,
              }}
            >
              <div>
                📄 Sheet ID:{" "}
                <span style={{ color: C.text }}>
                  {cfg.spreadsheetId.slice(0, 20)}...
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                🔑 API Key:{" "}
                <span style={{ color: C.text }}>
                  {cfg.apiKey.slice(0, 12)}...
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                ⚙️ Service Account:{" "}
                <span
                  style={{ color: cfg.serviceAccountJson ? C.green : C.yellow }}
                >
                  {cfg.serviceAccountJson
                    ? "Configurada"
                    : "Sin configurar (solo lectura)"}
                </span>
              </div>
            </div>
            {testResult && (
              <div
                style={{
                  background: testResult.ok
                    ? "rgba(45,212,160,.1)"
                    : "rgba(240,96,96,.1)",
                  border: `1px solid ${
                    testResult.ok ? "rgba(45,212,160,.3)" : "rgba(240,96,96,.3)"
                  }`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  marginBottom: 16,
                  color: testResult.ok ? C.green : C.red,
                }}
              >
                {testResult.msg}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.muted,
                  padding: "10px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ← Atrás
              </button>
              <button
                onClick={testConnection}
                disabled={testing}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.accent}`,
                  color: C.accent,
                  padding: "10px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: testing ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {testing ? "Probando..." : "🔌 Probar conexión"}
              </button>
              <button
                onClick={() => onSave(cfg)}
                style={{
                  flex: 1,
                  background: C.accent,
                  border: "none",
                  color: "#fff",
                  padding: "10px 24px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ✓ Guardar y continuar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  MODAL CLIENTE                                              ║
// ╚══════════════════════════════════════════════════════════════╝
function ClienteModal({ cliente, logs, onSave, onClose, saving }) {
  const isEdit = !!cliente?.id;
  const [form, setForm] = useState(
    cliente || {
      nombre: "",
      nit: "",
      telefono: "",
      contacto: "",
      correo: "",
      valor: "",
      ica: "pendiente",
      iva: "pendiente",
      rete: "pendiente",
    }
  );
  const [gest, setGest] = useState({
    tipo: "Llamada telefónica",
    resultado: "Sin respuesta",
    obs: "",
  });
  const [showGest, setShowGest] = useState(false);
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const updG = (k, v) => setGest((g) => ({ ...g, [k]: v }));
  const cLogs = (logs || [])
    .filter((l) => l.clienteId === cliente?.id)
    .slice(-3)
    .reverse();

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.8)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          width: 560,
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "slideUp .2s ease",
        }}
      >
        <div
          style={{
            padding: "22px 24px 18px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {isEdit ? form.nombre : "Nuevo cliente"}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              {isEdit
                ? "Actualiza estado · Registra gestión"
                : "Datos del ente retenedor"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontSize: 20,
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "22px 24px" }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
          >
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Razón social *</label>
              <input
                style={inp}
                value={form.nombre || ""}
                onChange={(e) => upd("nombre", e.target.value)}
                placeholder="Nombre completo del cliente"
              />
            </div>
            {[
              ["nit", "NIT", "000.000.000-0"],
              ["telefono", "Teléfono", "601 000 0000"],
              ["contacto", "Contacto", "Nombre del contacto"],
              ["correo", "Correo", "correo@empresa.com"],
            ].map(([k, l, ph]) => (
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input
                  style={inp}
                  value={form[k] || ""}
                  onChange={(e) => upd(k, e.target.value)}
                  placeholder={ph}
                />
              </div>
            ))}
            <div>
              <label style={lbl}>Valor retenido ($)</label>
              <input
                style={inp}
                type="number"
                value={form.valor || ""}
                onChange={(e) => upd("valor", e.target.value)}
                placeholder="0"
              />
              {form.valor > 0 && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  Clasificación:{" "}
                  <b
                    style={{
                      color: clsMap[getClasif(+form.valor)]?.[1] || C.muted,
                    }}
                  >
                    {getClasif(+form.valor)}
                  </b>
                </div>
              )}
            </div>
          </div>

          {/* Retenciones */}
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: 10,
              }}
            >
              Estado de retenciones
            </div>
            {[
              ["ica", "ICA"],
              ["iva", "IVA"],
              ["rete", "Retefuente"],
            ].map(([k, l]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  background: C.surface2,
                  borderRadius: 8,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, width: 90 }}>
                  {l}
                </span>
                <select
                  value={form[k] || "pendiente"}
                  onChange={(e) => upd(k, e.target.value)}
                  style={{
                    ...inp,
                    padding: "6px 10px",
                    width: "auto",
                    flex: 1,
                    cursor: "pointer",
                  }}
                >
                  <option value="pendiente">❌ Pendiente</option>
                  <option value="proceso">⏳ En gestión</option>
                  <option value="recibido">✅ Recibido</option>
                  <option value="na">➖ No aplica</option>
                </select>
              </div>
            ))}
          </div>

          {/* Gestión */}
          {isEdit && (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setShowGest((s) => !s)}
                style={{
                  background: showGest ? "rgba(79,127,232,.15)" : "transparent",
                  border: `1px solid ${showGest ? C.accent : C.border}`,
                  color: showGest ? C.accent : C.muted,
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              >
                📞{" "}
                {showGest
                  ? "Ocultar registro de gestión"
                  : "Registrar gestión de hoy"}
              </button>
              {showGest && (
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    animation: "fadeIn .15s",
                  }}
                >
                  <div>
                    <label style={lbl}>Tipo de gestión</label>
                    <select
                      value={gest.tipo}
                      onChange={(e) => updG("tipo", e.target.value)}
                      style={{ ...inp, cursor: "pointer" }}
                    >
                      {[
                        "Llamada telefónica",
                        "Correo electrónico",
                        "WhatsApp",
                        "Visita presencial",
                      ].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Resultado</label>
                    <select
                      value={gest.resultado}
                      onChange={(e) => updG("resultado", e.target.value)}
                      style={{ ...inp, cursor: "pointer" }}
                    >
                      {[
                        "Sin respuesta",
                        "Buzón de voz",
                        "Prometió enviar",
                        "Enviado por correo",
                        "Rechazó envío",
                        "Número equivocado",
                      ].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={lbl}>Observaciones</label>
                    <input
                      style={inp}
                      value={gest.obs}
                      onChange={(e) => updG("obs", e.target.value)}
                      placeholder="Notas de la gestión..."
                    />
                  </div>
                </div>
              )}
              {cLogs.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.muted,
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      marginBottom: 8,
                    }}
                  >
                    Últimas gestiones
                  </div>
                  {cLogs.map((l, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: C.accent,
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            fontFamily: "monospace",
                          }}
                        >
                          {fmtDateTime(l.fecha)}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          {l.tipo} · {l.resultado}
                          {l.obs ? " — " + l.obs : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.muted,
              padding: "9px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form, showGest ? gest : null)}
            disabled={saving}
            style={{
              background: saving ? "#2a3148" : C.accent,
              border: "none",
              color: "#fff",
              padding: "9px 22px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {saving ? "Guardando…" : isEdit ? "Actualizar" : "Guardar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  MAIN APP                                                    ║
// ╚══════════════════════════════════════════════════════════════╝
export default function App() {
  const [configured, setConfigured] = useState(
    CONFIG.SPREADSHEET_ID !== "TU_SPREADSHEET_ID_AQUI" &&
      CONFIG.API_KEY !== "TU_API_KEY_AQUI"
  );
  const [clientes, setClientes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [view, setView] = useState("operativo");
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [fEst, setFEst] = useState("");
  const [fCls, setFCls] = useState("");
  const [fAlert, setFAlert] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const intervalRef = useRef(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // LOAD from Sheets
  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [cRows, lRows] = await Promise.all([
        sheetsRead(`${CONFIG.SHEET_CLIENTES}!A:L`),
        sheetsRead(`${CONFIG.SHEET_LOGS}!A:G`),
      ]);
      setClientes(
        parseClientes(
          cRows.length
            ? cRows
            : [
                [
                  "ID",
                  "Nombre",
                  "NIT",
                  "Teléfono",
                  "Contacto",
                  "Correo",
                  "Valor",
                  "ICA",
                  "IVA",
                  "Rete",
                  "UltimaGestion",
                  "Intentos",
                ],
              ]
        )
      );
      setLogs(
        parseLogs(
          lRows.length
            ? lRows
            : [
                [
                  "ID",
                  "ClienteID",
                  "Cliente",
                  "Fecha",
                  "Tipo",
                  "Resultado",
                  "Obs",
                ],
              ]
        )
      );
      setLastSync(new Date());
    } catch (e) {
      if (!silent)
        showToast("Error al conectar con Google Sheets: " + e.message, "err");
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    if (configured) {
      loadAll();
      intervalRef.current = setInterval(() => loadAll(true), 30000); // refresh cada 30s
      return () => clearInterval(intervalRef.current);
    }
  }, [configured, loadAll]);

  // SAVE cliente
  const handleSave = useCallback(
    async (form, gestData) => {
      if (!form.nombre?.trim()) {
        showToast("El nombre es obligatorio", "err");
        return;
      }
      setSaving(true);
      const now = new Date().toISOString();
      try {
        if (form.id) {
          // UPDATE — encuentra la fila y reescribe
          const idx = clientes.findIndex((c) => c.id === form.id);
          if (idx === -1) throw new Error("Cliente no encontrado");
          const c = clientes[idx];
          const newIntents = gestData ? (c.intentos || 0) + 1 : c.intentos || 0;
          const row = [
            form.id,
            form.nombre,
            form.nit,
            form.telefono,
            form.contacto,
            form.correo,
            +form.valor || 0,
            form.ica,
            form.iva,
            form.rete,
            now,
            newIntents,
          ];
          await sheetsWrite(`${CONFIG.SHEET_CLIENTES}!A${c._row}:L${c._row}`, [
            row,
          ]);

          if (gestData) {
            await sheetsAppend(CONFIG.SHEET_LOGS, [
              [
                uid(),
                form.id,
                form.nombre,
                now,
                gestData.tipo,
                gestData.resultado,
                gestData.obs,
              ],
            ]);
          }
          showToast("Cliente actualizado ✓");
        } else {
          // NEW
          const newId = uid();
          await sheetsAppend(CONFIG.SHEET_CLIENTES, [
            [
              newId,
              form.nombre,
              form.nit,
              form.telefono,
              form.contacto,
              form.correo,
              +form.valor || 0,
              form.ica || "pendiente",
              form.iva || "pendiente",
              form.rete || "pendiente",
              "",
              0,
            ],
          ]);
          showToast("Cliente agregado ✓");
        }
        await loadAll(true);
        setModal(null);
      } catch (e) {
        showToast("Error al guardar: " + e.message, "err");
      }
      setSaving(false);
    },
    [clientes, loadAll]
  );

  // KPIs
  const total = clientes.length;
  const completos = clientes.filter((c) => getEstado(c) === "completo").length;
  const proceso = clientes.filter((c) => getEstado(c) === "proceso").length;
  const pendientes = clientes.filter(
    (c) => getEstado(c) === "pendiente"
  ).length;
  const rcvICA = clientes.filter((c) => c.ica === "recibido").length;
  const rcvIVA = clientes.filter((c) => c.iva === "recibido").length;
  const rcvRete = clientes.filter((c) => c.rete === "recibido").length;
  const naICA = clientes.filter((c) => c.ica === "na").length,
    naIVA = clientes.filter((c) => c.iva === "na").length,
    naRete = clientes.filter((c) => c.rete === "na").length;
  const posibles = total - naICA + (total - naIVA) + (total - naRete);
  const totalRcv = rcvICA + rcvIVA + rcvRete;
  const gpPct = posibles ? Math.round((totalRcv / posibles) * 100) : 0;
  const alertas = clientes.filter(
    (c) => getDias(c.ultimaGestion) > 5 && getEstado(c) !== "completo"
  ).length;
  const aPend = clientes.filter(
    (c) => getClasif(c.valor) === "A" && getEstado(c) !== "completo"
  ).length;

  const filtered = clientes
    .filter((c) => {
      const s = search.toLowerCase();
      return (
        (!s || c.nombre?.toLowerCase().includes(s) || c.nit?.includes(s)) &&
        (!fEst || getEstado(c) === fEst) &&
        (!fCls || getClasif(c.valor) === fCls) &&
        (!fAlert ||
          (getDias(c.ultimaGestion) > 5 && getEstado(c) !== "completo"))
      );
    })
    .sort((a, b) => {
      const o = { A: 0, B: 1, C: 2, "—": 3 };
      const d = (o[getClasif(a.valor)] ?? 3) - (o[getClasif(b.valor)] ?? 3);
      return d !== 0
        ? d
        : (getDias(b.ultimaGestion) || 0) - (getDias(a.ultimaGestion) || 0);
    });

  if (!configured)
    return (
      <SetupScreen
        onSave={(cfg) => {
          CONFIG.SPREADSHEET_ID = cfg.spreadsheetId;
          CONFIG.API_KEY = cfg.apiKey;

          setConfigured(true);
        }}
      />
    );

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'DM Sans',sans-serif",
        color: C.text,
        display: "flex",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1e2740;border-radius:99px}
        @keyframes slideUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* SIDEBAR */}
      <aside
        style={{
          width: 210,
          minWidth: 210,
          background: "#0a0d16",
          borderRight: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          padding: "20px 0",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div
          style={{
            padding: "0 18px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: ".1em",
              color: C.accent,
              textTransform: "uppercase",
            }}
          >
            RetControl
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
            Google Sheets · 2026
          </div>
        </div>
        <nav style={{ padding: "14px 10px", flex: 1 }}>
          {[
            ["operativo", "📋", "Tablero", null],
            ["supervisor", "📊", "Supervisor", alertas > 0 ? alertas : null],
            ["bitacora", "📞", "Bitácora", null],
          ].map(([v, icon, label, badge]) => (
            <div
              key={v}
              onClick={() => setView(v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                marginBottom: 2,
                background: view === v ? "rgba(79,127,232,.12)" : "transparent",
                color: view === v ? C.accent : C.muted,
                fontWeight: view === v ? 700 : 400,
                transition: "all .15s",
              }}
            >
              <span style={{ fontSize: 14 }}>{icon}</span>
              {label}
              {badge && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: C.red,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "1px 7px",
                    borderRadius: 99,
                    fontFamily: "monospace",
                  }}
                >
                  {badge}
                </span>
              )}
            </div>
          ))}
        </nav>
        <div
          style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}` }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: ".06em",
              fontWeight: 700,
            }}
          >
            Avance global
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: C.green,
              fontFamily: "monospace",
            }}
          >
            {gpPct}%
          </div>
          <div
            style={{
              height: 4,
              background: C.border,
              borderRadius: 99,
              marginTop: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: gpPct + "%",
                background: C.green,
                borderRadius: 99,
                transition: "width .6s",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <button
              onClick={() => loadAll()}
              style={{
                background: "transparent",
                border: "none",
                color: C.muted,
                cursor: "pointer",
                fontSize: 10,
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              🔄 Sincronizar
            </button>
            {lastSync && (
              <span>
                {lastSync.toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(8,11,18,.85)",
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
          >
            <div style={{ textAlign: "center", color: C.muted }}>
              <div
                style={{
                  fontSize: 32,
                  marginBottom: 12,
                  animation: "spin 1s linear infinite",
                  display: "inline-block",
                }}
              >
                ⏳
              </div>
              <div style={{ fontSize: 14 }}>
                Cargando datos desde Google Sheets...
              </div>
            </div>
          </div>
        )}

        {/* ── TABLERO ── */}
        {view === "operativo" && (
          <div style={{ animation: "fadeIn .2s" }}>
            <div
              style={{
                padding: "18px 26px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#0a0d16",
                position: "sticky",
                top: 0,
                zIndex: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>
                  Tablero Operativo
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  ICA · IVA · Retefuente · {total} clientes
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => loadAll()}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.muted,
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  🔄 Actualizar
                </button>
                <button
                  onClick={() => setModal({})}
                  style={{
                    background: C.accent,
                    border: "none",
                    color: "#fff",
                    padding: "9px 18px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  + Agregar cliente
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 14,
                padding: "20px 26px 0",
              }}
            >
              {[
                ["Total", total, C.accent, null],
                ["✅ Completos", completos, C.green, total],
                ["⏳ En proceso", proceso, C.yellow, total],
                ["❌ Sin iniciar", pendientes, C.red, total],
              ].map(([l, v, col, t]) => (
                <div
                  key={l}
                  style={{
                    background: "#0a0d16",
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: "16px 18px",
                    borderTop: `3px solid ${col}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: C.muted,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                    }}
                  >
                    {l}
                  </div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 800,
                      color: col,
                      fontFamily: "monospace",
                      margin: "6px 0 4px",
                    }}
                  >
                    {v}
                  </div>
                  {t && (
                    <div
                      style={{
                        height: 3,
                        background: C.border,
                        borderRadius: 99,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: (t ? (v / t) * 100 : 0) + "%",
                          background: col,
                          borderRadius: 99,
                          transition: "width .6s",
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {alertas > 0 && (
              <div
                style={{
                  margin: "14px 26px 0",
                  background: "rgba(240,96,96,.08)",
                  border: "1px solid rgba(240,96,96,.25)",
                  borderRadius: 10,
                  padding: "11px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span>⚠️</span>
                <span style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>
                  {alertas} cliente{alertas > 1 ? "s" : ""} llevan más de 5 días
                  sin gestión.
                </span>
              </div>
            )}

            <div
              style={{
                margin: "14px 26px 0",
                background: "#0a0d16",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "14px 18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                  }}
                >
                  Avance por certificados
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: C.accent,
                    fontFamily: "monospace",
                  }}
                >
                  {gpPct}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  background: C.border,
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: gpPct + "%",
                    background: `linear-gradient(90deg,${C.accent},${C.green})`,
                    borderRadius: 99,
                    transition: "width .8s",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                {[
                  [C.green, "ICA", rcvICA, total - naICA],
                  [C.accent, "IVA", rcvIVA, total - naIVA],
                  ["#a78bfa", "Retefuente", rcvRete, total - naRete],
                ].map(([col, l, r, t]) => (
                  <span
                    key={l}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      color: C.muted,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: col,
                      }}
                    />
                    {l}:{" "}
                    <b style={{ color: col }}>
                      {r}/{t}
                    </b>
                  </span>
                ))}
              </div>
            </div>

            {/* FILTROS */}
            <div
              style={{
                padding: "16px 26px 0",
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: C.muted,
                    fontSize: 13,
                  }}
                >
                  🔍
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente o NIT..."
                  style={{ ...inp, paddingLeft: 34 }}
                />
              </div>
              {[
                [
                  fEst,
                  setFEst,
                  [
                    ["", "Todos los estados"],
                    ["completo", "✅ Completo"],
                    ["proceso", "⏳ En proceso"],
                    ["pendiente", "❌ Sin iniciar"],
                  ],
                ],
                [
                  fCls,
                  setFCls,
                  [
                    ["", "Toda clasificación"],
                    ["A", "A — Alto valor"],
                    ["B", "B — Medio"],
                    ["C", "C — Bajo"],
                  ],
                ],
                [
                  fAlert,
                  setFAlert,
                  [
                    ["", "Sin filtro"],
                    ["alerta", "⚠️ Solo alertas"],
                  ],
                ],
              ].map(([val, set, opts], i) => (
                <select
                  key={i}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  style={{ ...inp, width: "auto", cursor: "pointer" }}
                >
                  {opts.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ))}
            </div>

            {/* TABLE */}
            <div
              style={{
                margin: "14px 26px 26px",
                background: "#0a0d16",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.surface2 }}>
                    {[
                      "CLIENTE",
                      "NIT",
                      "CLASIF",
                      "ICA",
                      "IVA",
                      "RETEFUENTE",
                      "ESTADO",
                      "DÍAS",
                      "INTENTOS",
                      "ACCIÓN",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "11px 14px",
                          textAlign: "left",
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.muted,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                          borderBottom: `1px solid ${C.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        style={{
                          textAlign: "center",
                          padding: "50px 20px",
                          color: C.muted,
                        }}
                      >
                        {total === 0 ? (
                          <div>
                            <div style={{ fontSize: 32, marginBottom: 10 }}>
                              📋
                            </div>
                            Sin clientes aún. Haz clic en{" "}
                            <b>"+ Agregar cliente"</b>.
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 32, marginBottom: 10 }}>
                              🔍
                            </div>
                            Sin resultados.
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c, i) => {
                      const est = getEstado(c),
                        dias = getDias(c.ultimaGestion);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setModal({ cliente: c })}
                          style={{
                            cursor: "pointer",
                            borderTop: `1px solid ${C.border}`,
                            background: i % 2 === 0 ? "transparent" : "#0d1020",
                          }}
                        >
                          <td style={{ padding: "12px 14px" }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 13,
                                maxWidth: 180,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.nombre}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: C.muted,
                                fontFamily: "monospace",
                              }}
                            >
                              {fmtMoney(c.valor)}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "12px 14px",
                              fontSize: 11,
                              fontFamily: "monospace",
                              color: C.muted,
                            }}
                          >
                            {c.nit || "—"}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <ClsB v={getClasif(c.valor)} />
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <Chip val={c.ica} />
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <Chip val={c.iva} />
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <Chip val={c.rete} />
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <EstBadge est={est} />
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <DiasC d={dias} />
                          </td>
                          <td
                            style={{
                              padding: "12px 14px",
                              fontFamily: "monospace",
                              fontSize: 12,
                              color: (c.intentos || 0) >= 3 ? C.red : C.muted,
                            }}
                          >
                            {c.intentos || 0}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setModal({ cliente: c });
                              }}
                              style={{
                                background: "transparent",
                                border: `1px solid ${C.border}`,
                                color: C.muted,
                                padding: "5px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                whiteSpace: "nowrap",
                              }}
                            >
                              📞 Registrar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SUPERVISOR ── */}
        {view === "supervisor" && (
          <div style={{ animation: "fadeIn .2s" }}>
            <div
              style={{
                padding: "18px 26px",
                borderBottom: `1px solid ${C.border}`,
                background: "#0a0d16",
                position: "sticky",
                top: 0,
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 800 }}>
                Panel Supervisor
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                Vista gerencial · Sincronizado{" "}
                {lastSync
                  ? lastSync.toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </div>
            </div>
            <div style={{ padding: 26 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    background: "#0a0d16",
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.muted,
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      marginBottom: 14,
                    }}
                  >
                    Resumen ejecutivo
                  </div>
                  {[
                    ["Total clientes", total, C.text],
                    ["Certificados posibles", posibles, C.text],
                    ["Certificados recibidos", totalRcv, C.green],
                    ["% de avance", gpPct + "%", C.accent],
                    ["Llamadas registradas", logs.length, C.text],
                  ].map(([l, v, col]) => (
                    <div
                      key={l}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderBottom: `1px solid ${C.border}`,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: C.muted }}>{l}</span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: col,
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    background: "#0a0d16",
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.muted,
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      marginBottom: 14,
                    }}
                  >
                    Por tipo de retención
                  </div>
                  {[
                    ["ICA recibidos", `${rcvICA} / ${total - naICA}`, C.green],
                    ["IVA recibidos", `${rcvIVA} / ${total - naIVA}`, C.accent],
                    [
                      "Retefuente recibidos",
                      `${rcvRete} / ${total - naRete}`,
                      "#a78bfa",
                    ],
                    [
                      "⚠️ Alertas activas",
                      alertas,
                      alertas > 0 ? C.red : C.green,
                    ],
                    [
                      "Sin iniciar (Clase A)",
                      aPend,
                      aPend > 0 ? C.red : C.green,
                    ],
                  ].map(([l, v, col]) => (
                    <div
                      key={l}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderBottom: `1px solid ${C.border}`,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: C.muted }}>{l}</span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: col,
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Críticos */}
              <div
                style={{
                  background: "#0a0d16",
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 14,
                  }}
                >
                  Clientes críticos — más de 5 días sin gestión
                </div>
                {clientes.filter(
                  (c) =>
                    getDias(c.ultimaGestion) > 5 && getEstado(c) !== "completo"
                ).length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "30px 0",
                      color: C.muted,
                      fontSize: 13,
                    }}
                  >
                    ✅ Sin casos críticos
                  </div>
                ) : (
                  clientes
                    .filter(
                      (c) =>
                        getDias(c.ultimaGestion) > 5 &&
                        getEstado(c) !== "completo"
                    )
                    .map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>
                            {c.nombre}
                          </span>
                          <span
                            style={{
                              color: C.muted,
                              fontSize: 11,
                              marginLeft: 8,
                              fontFamily: "monospace",
                            }}
                          >
                            {c.nit}
                          </span>
                        </div>
                        <span
                          style={{
                            color: C.red,
                            fontFamily: "monospace",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          ⚠️ {getDias(c.ultimaGestion)}d
                        </span>
                      </div>
                    ))
                )}
              </div>
              {/* Top A */}
              <div
                style={{
                  background: "#0a0d16",
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 14,
                  }}
                >
                  Prioridad A — Pendientes
                </div>
                {clientes.filter(
                  (c) =>
                    getClasif(c.valor) === "A" && getEstado(c) !== "completo"
                ).length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "30px 0",
                      color: C.muted,
                      fontSize: 13,
                    }}
                  >
                    🎯 Sin clientes A pendientes
                  </div>
                ) : (
                  clientes
                    .filter(
                      (c) =>
                        getClasif(c.valor) === "A" &&
                        getEstado(c) !== "completo"
                    )
                    .map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {c.nombre}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              color: C.yellow,
                              fontFamily: "monospace",
                              fontSize: 12,
                            }}
                          >
                            {fmtMoney(c.valor)}
                          </span>
                          <EstBadge est={getEstado(c)} />
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── BITÁCORA ── */}
        {view === "bitacora" && (
          <div style={{ animation: "fadeIn .2s" }}>
            <div
              style={{
                padding: "18px 26px",
                borderBottom: `1px solid ${C.border}`,
                background: "#0a0d16",
                position: "sticky",
                top: 0,
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 800 }}>
                Bitácora de Llamadas
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {logs.length} gestiones registradas en Google Sheets
              </div>
            </div>
            <div style={{ padding: 26 }}>
              <div
                style={{
                  background: "#0a0d16",
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface2 }}>
                      {[
                        "FECHA",
                        "CLIENTE",
                        "TIPO",
                        "RESULTADO",
                        "INTENTO",
                        "COMPROMETIÓ",
                        "NOTAS",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "11px 14px",
                            textAlign: "left",
                            fontSize: 10,
                            fontWeight: 700,
                            color: C.muted,
                            letterSpacing: ".06em",
                            textTransform: "uppercase",
                            borderBottom: `1px solid ${C.border}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            textAlign: "center",
                            padding: "50px 20px",
                            color: C.muted,
                          }}
                        >
                          <div style={{ fontSize: 32, marginBottom: 10 }}>
                            📞
                          </div>
                          Sin gestiones registradas aún.
                        </td>
                      </tr>
                    ) : (
                      [...logs].reverse().map((l, i) => {
                        const intento = [...logs].filter(
                          (x) =>
                            x.clienteId === l.clienteId &&
                            new Date(x.fecha) <= new Date(l.fecha)
                        ).length;
                        return (
                          <tr
                            key={l.id}
                            style={{
                              borderTop: `1px solid ${C.border}`,
                              background:
                                i % 2 === 0 ? "transparent" : "#0d1020",
                            }}
                          >
                            <td
                              style={{
                                padding: "11px 14px",
                                fontSize: 11,
                                fontFamily: "monospace",
                                color: C.muted,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {fmtDateTime(l.fecha)}
                            </td>
                            <td
                              style={{
                                padding: "11px 14px",
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              {l.cliente}
                            </td>
                            <td
                              style={{
                                padding: "11px 14px",
                                fontSize: 12,
                                color: C.muted,
                              }}
                            >
                              {l.tipo}
                            </td>
                            <td style={{ padding: "11px 14px", fontSize: 12 }}>
                              {l.resultado}
                            </td>
                            <td
                              style={{
                                padding: "11px 14px",
                                fontFamily: "monospace",
                                fontSize: 12,
                                textAlign: "center",
                                color: intento >= 3 ? C.red : C.accent,
                                fontWeight: 700,
                              }}
                            >
                              {intento}
                            </td>
                            <td style={{ padding: "11px 14px" }}>
                              {l.resultado === "Prometió enviar" ? (
                                <span
                                  style={{
                                    background: "rgba(245,166,35,.15)",
                                    color: C.yellow,
                                    padding: "2px 8px",
                                    borderRadius: 99,
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  Sí
                                </span>
                              ) : (
                                <span style={{ color: C.muted, fontSize: 11 }}>
                                  No
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: "11px 14px",
                                fontSize: 12,
                                color: C.muted,
                              }}
                            >
                              {l.obs || "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL */}
      {modal && (
        <ClienteModal
          cliente={modal.cliente || null}
          logs={logs}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 999,
            background: toast.type === "err" ? C.red : C.green,
            color: "#fff",
            padding: "11px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 28px rgba(0,0,0,.5)",
            animation: "slideUp .2s ease",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
