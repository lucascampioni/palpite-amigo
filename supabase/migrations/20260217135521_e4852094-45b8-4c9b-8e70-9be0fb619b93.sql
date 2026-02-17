
ALTER TABLE public.pools ADD COLUMN prize_type text NOT NULL DEFAULT 'fixed';
-- prize_type: 'fixed' (valor fixo em R$) ou 'percentage' (% do total arrecadado)
