-- Fix search_path for calculate_football_points function
CREATE OR REPLACE FUNCTION public.calculate_football_points(
  predicted_home INTEGER,
  predicted_away INTEGER,
  actual_home INTEGER,
  actual_away INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  points INTEGER := 0;
  predicted_result TEXT;
  actual_result TEXT;
BEGIN
  -- Exact score: 5 points
  IF predicted_home = actual_home AND predicted_away = actual_away THEN
    RETURN 5;
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
$$;