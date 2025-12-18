-- Migration: Adiciona coluna 'plano' na tabela usuarios
-- Valores possíveis: 'mensal', 'trimestral', 'anual', NULL (trial)

ALTER TABLE usuarios ADD COLUMN plano TEXT;

