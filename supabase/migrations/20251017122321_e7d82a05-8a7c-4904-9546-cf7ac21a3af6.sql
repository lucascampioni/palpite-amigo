-- Update the calculate_football_points function to support the new simplified scoring system
CREATE OR REPLACE FUNCTION public.calculate_football_points(
  predicted_home integer,
  predicted_away integer,
  actual_home integer,
  actual_away integer,
  scoring_system text DEFAULT 'standard'::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  points INTEGER := 0;
  predicted_result TEXT;
  actual_result TEXT;
BEGIN
  -- Exact score handling based on system
  IF predicted_home = actual_home AND predicted_away = actual_away THEN
    IF scoring_system = 'exact_only' THEN
      RETURN 1;  -- exact_only system: 1 point for exact score
    ELSIF scoring_system = 'simplified' THEN
      RETURN 3;  -- simplified system: 3 points for exact score
    ELSE
      RETURN 5;  -- standard system: 5 points for exact score
    END IF;
  END IF;
  
  -- For exact_only system, return 0 if not exact score
  IF scoring_system = 'exact_only' THEN
    RETURN 0;
  END IF;
  
  -- Determine match results
  IF predicted_home > predicted_away THEN
    predicted_result := 'home';
  ELSIF predicted_home < predicted_away THEN
    predicted_result := 'away';
  ELSE
    predicted_result := 'draw';
  END IF;
  
  IF actual_home > actual_away THEN
    actual_result := 'home';
  ELSIF actual_home < actual_away THEN
    actual_result := 'away';
  ELSE
    actual_result := 'draw';
  END IF;
  
  -- Simplified system: only correct result = 1 point
  IF scoring_system = 'simplified' THEN
    IF predicted_result = actual_result THEN
      RETURN 1;
    ELSE
      RETURN 0;
    END IF;
  END IF;
  
  -- Standard system continues with additional points
  -- Correct result: 3 points
  IF predicted_result = actual_result THEN
    points := points + 3;
  END IF;
  
  -- Correct goal difference: 1 point
  IF (predicted_home - predicted_away) = (actual_home - actual_away) THEN
    points := points + 1;
  END IF;
  
  RETURN points;
END;
$function$;