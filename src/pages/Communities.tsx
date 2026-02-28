import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Communities = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Redirect to main page - communities is now a tab there
    navigate("/?tab=comunidades", { replace: true });
  }, [navigate]);

  return null;
};

export default Communities;
