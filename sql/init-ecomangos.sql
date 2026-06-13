-- ============================================================
-- Glamping Eco Mangos — Supabase init
-- Slug: ecomangos
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- Fecha: 2026-06-13
-- ============================================================

-- 1. Tabla de leads
CREATE TABLE IF NOT EXISTS leads_ecomangos (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    session_id      TEXT,
    nombre          TEXT,
    telefono        TEXT,
    email           TEXT,
    mensaje         TEXT,
    fecha_visita    TEXT,
    num_personas    TEXT,
    canal           TEXT DEFAULT 'web',
    manychat_id     TEXT
);

-- 2. Tabla de documentos para RAG (vector 3072 dims — gemini-embedding-001)
-- IMPORTANTE: NO crear índice ivfflat/hnsw — pgvector no soporta para >2000 dims
CREATE TABLE IF NOT EXISTS documents_ecomangos (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    content     TEXT,
    metadata    JSONB,
    embedding   vector(3072)
);

-- 3. RPC para búsqueda vectorial (RAG)
CREATE OR REPLACE FUNCTION match_documents_ecomangos(
    query_embedding vector(3072),
    match_count     INT     DEFAULT 10,
    match_threshold FLOAT   DEFAULT 0.3
)
RETURNS TABLE (
    id          BIGINT,
    content     TEXT,
    metadata    JSONB,
    similarity  FLOAT
)
LANGUAGE SQL STABLE
AS $$
    SELECT
        id,
        content,
        metadata,
        1 - (embedding <=> query_embedding) AS similarity
    FROM documents_ecomangos
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Verificación rápida
SELECT 'leads_ecomangos'     AS tabla, COUNT(*) FROM leads_ecomangos
UNION ALL
SELECT 'documents_ecomangos' AS tabla, COUNT(*) FROM documents_ecomangos;
