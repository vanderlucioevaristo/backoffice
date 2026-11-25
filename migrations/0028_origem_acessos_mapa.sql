-- Origem geográfica dos acessos (Países, Cidades/Países e Coordenadas para Mapa no Dashboard)
ALTER TABLE loja_visitas_metricas ADD COLUMN pais_codigo TEXT;
ALTER TABLE loja_visitas_metricas ADD COLUMN pais_nome TEXT;
ALTER TABLE loja_visitas_metricas ADD COLUMN cidade TEXT;
ALTER TABLE loja_visitas_metricas ADD COLUMN regiao TEXT;
ALTER TABLE loja_visitas_metricas ADD COLUMN latitude REAL;
ALTER TABLE loja_visitas_metricas ADD COLUMN longitude REAL;
