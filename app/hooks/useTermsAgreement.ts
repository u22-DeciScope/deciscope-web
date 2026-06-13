import { useNavigate } from "react-router";
import { WORKSPACE_ROUTE_BASE } from "~/routing/workspacePaths";

export function useTermsAgreement() {
  const navigate = useNavigate();

  function acceptTerms() {
    navigate(WORKSPACE_ROUTE_BASE);
  }

  return { acceptTerms };
}
