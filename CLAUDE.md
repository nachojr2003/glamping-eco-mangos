# CLAUDE.md — Glamping Eco Mangos

## Identidad del cliente

| Campo | Valor |
|---|---|
| **Nombre** | Glamping Eco Mangos |
| **Slug** | `ecomangos` |
| **Sector** | Turismo / Hospitalidad (glamping) |
| **Ubicación** | Cieneguilla, Lima, Perú |
| **Instagram** | @ecomangospe |
| **Teléfono reservas** | 929 790 568 |
| **Horario** | 9:00 a.m. – 8:00 p.m. |
| **Email cliente** | Pendiente de confirmar |
| **Sitio web** | Sin sitio web propio (solo redes sociales) |

## Identidad visual

| Campo | Valor |
|---|---|
| **Primario** | `#F5A21C` (naranja/dorado — color de la carpa del logo) |
| **Secundario** | `#2D6B27` (verde oscuro — follaje) |
| **Logo** | `Gampling Eco Mangos logo.jpg` (1080×1080, cuadrado) |
| **Logo URL pública** | Pendiente (sin web) |
| **Fuente** | Bold black, estilo outdoor/aventura |

## Stack técnico

| Campo | Valor |
|---|---|
| **n8n webhook base** | `https://n8n-jcg4epwgyztosnmbxghhwvdv.34.133.34.116.sslip.io` |
| **Supabase proyecto** | Pendiente confirmar con Nacho |
| **Tabla leads** | `leads_ecomangos` |
| **Tabla docs** | `documents_ecomangos` (vector 3072) |
| **RPC RAG** | `match_documents_ecomangos` |
| **DataTable logs** | `chat_logs_ecomangos` |
| **DataTable insights** | `conversation_insights_ecomangos` |
| **Modelo chat** | Gemini 2.5 Flash |
| **Embedding** | gemini-embedding-001 (3072 dims) |

## Workflows n8n

| Workflow | Estado |
|---|---|
| `Agent - Chat Eco Mangos` | ACTIVO |
| `Agent - Leads Eco Mangos` | ACTIVO |
| `_oneshot_ecomangos_kb_ingest` | Ejecutado y desactivado |
| `Insights - Daily Eco Mangos` | INACTIVO (activar tras 3-5 días) |
| `Insights - Quincenal Eco Mangos` | INACTIVO (activar tras 15 días) |

## Repo GitHub

Pendiente de crear — cliente sin web propia. Usar repo público para widget via jsDelivr CDN.

## Persona del agente

- **Nombre:** Asistente de Eco Mangos (o "Mango" si el cliente lo aprueba)
- **Tono:** Cálido, aventurero, accesible — como un guía de camping amigable
- **Idioma:** Español peruano, tuteo, NUNCA voseo argentino
- **Objetivo principal:** Informar sobre glampings, precios y amenidades; capturar leads para reservas; derivar a WhatsApp 929 790 568

## Información pendiente de confirmar con cliente

- Email de contacto para notificaciones de leads
- Email de contacto del cliente para reportes
- ¿Aceptan mascotas?
- ¿Incluyen desayuno?
- ¿Política de cancelación?
- ¿Precios exactos para glampings 3, 4 y 6 personas?
- ¿Tienen dominio/web propio?
- ¿URL pública del logo para emails?

## Historial de cambios

- 2026-06-13: Build inicial — KB (5 archivos), SQL, workflows n8n, widget test page.
