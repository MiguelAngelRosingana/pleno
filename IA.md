# Activar la IA de BetIA

La IA (análisis del informe, lectura de capturas y sugerencias de boletos) usa la API de Claude a través de una función de Supabase. La clave de Anthropic vive solo en Supabase: la web nunca la ve. Mientras la función no esté desplegada, estas funciones no aparecen en la app.

## 1. Clave de Anthropic
1. Entra en https://console.anthropic.com → **Settings → API keys** → crea una clave.
2. En **Billing / Limits**, fija un **límite de gasto mensual** (p. ej. 5 €) para que nunca pueda salirse de presupuesto.

## 2. Secretos en Supabase
**Edge Functions → Secrets** (o *Project Settings → Edge Functions*), añade:

| Nombre | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | tu clave de Anthropic |
| `ALLOWED_EMAIL` | tu email (opcional: solo esa cuenta podrá usar la IA) |
| `ANTHROPIC_MODEL` | opcional; por defecto `claude-opus-5-5`. Con `claude-sonnet-5-5` cuesta aproximadamente la mitad |

## 3. Desplegar la función
**Opción A, desde el panel:** Edge Functions → *Deploy a new function* → *Via Editor* → nombre exacto **`ai`** → pega el contenido de `supabase/functions/ai/index.ts` → *Deploy*. Deja activada la opción *Verify JWT*.

**Opción B, con la CLI** (tú ejecutas los comandos con tu sesión):
```bash
npx supabase login
npx supabase functions deploy ai --project-ref mykcbfifhwfyoahikdjy
```

Recarga la web: aparecerán **Pedir análisis** (Informe), **Leer captura** (nuevo boleto) y **Sugerencias de BetIA** (Panel).

## Notas
- Cada petición gasta unos céntimos. Las sugerencias son lo más caro porque buscan partidos en la web.
- Las cuotas y probabilidades que propone la IA son estimaciones: confírmalas siempre en la casa.
- La función rechaza a cualquiera sin sesión iniciada en tu proyecto.
